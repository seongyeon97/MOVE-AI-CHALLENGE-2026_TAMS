import { useState } from 'react';
import { loadFileSheets, previewSheets, type SheetData } from '../lib/csvBrowser';
import { unpivotWideByPeriod, type PeriodGroup } from '../lib/reshape';
import { STANDARD_SCHEMAS, type SchemaVehicleClass, type StandardField } from '../lib/standardSchema';

type MappingRow = { source_name: string; standard_key: string; confidence?: string; reasoning?: string };

type QueuedFile = { fileName: string; sheets: SheetData[]; vehicleClass: SchemaVehicleClass };

type FileState = {
  fileName: string;
  sheets: SheetData[];
  vehicleClass: SchemaVehicleClass;
  targetSheetName: string;
  headerRowIndex: number;
  layout: 'long' | 'wide_by_period';
  reshapeInfo: { originalRows: number; longRows: number; periodGroupCount: number } | null;
  mappings: MappingRow[];
  source: 'llm' | 'manual';
  finalHeader: string[]; // mappings[].source_name과 같은 순서 — 커밋 시 이 헤더로 데이터 행을 객체화한다
  finalRows: string[][];
};

/** 확정된 매핑으로 원본 행 전체를 표준필드 객체로 바꾼다 — 미리보기 10행이 아니라 전체 데이터.
 *  컬럼 위치가 아니라 이름(finalHeader)으로 찾는다 — LLM 응답 mappings 순서가 원본 헤더 순서와
 *  같다고 보장할 수 없다. */
function buildMappedObjects(r: FileState): Record<string, string>[] {
  const colIndexBySourceName = new Map(r.finalHeader.map((name, i) => [name, i]));
  const targets = r.mappings
    .filter((m) => m.standard_key)
    .map((m) => ({ standard_key: m.standard_key, colIndex: colIndexBySourceName.get(m.source_name) }))
    .filter((t): t is { standard_key: string; colIndex: number } => t.colIndex !== undefined);

  return r.finalRows.map((row) => {
    const obj: Record<string, string> = {};
    for (const t of targets) obj[t.standard_key] = row[t.colIndex] ?? '';
    return obj;
  });
}

type LlmPlan = {
  target_sheet_index: number;
  header_row_index: number;
  layout: 'long' | 'wide_by_period';
  id_columns: string[];
  period_groups: PeriodGroup[];
  mappings: MappingRow[];
  unmapped_standard_fields: { key: string; missing_impact: string }[];
};

async function attemptLlmPlan(sheets: SheetData[], standardKeys: string[], onSlow: () => void): Promise<LlmPlan | null> {
  const slowTimer = setTimeout(onSlow, 8000);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch('/api/map-schema', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ standardKeys, sheets: previewSheets(sheets) }),
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(slowTimer);
  }
}

/** 셀 개수가 가장 많은 초반 행을 헤더로 추정 — LLM 없을 때만 쓰는 보조 휴리스틱. */
function guessHeaderRowIndex(rows: string[][]): number {
  let best = 0, bestCount = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].length > bestCount) { bestCount = rows[i].length; best = i; }
  }
  return best;
}

function buildFileState(q: QueuedFile, plan: LlmPlan | null): FileState {
  const { fileName, sheets, vehicleClass } = q;
  const standardKeys = STANDARD_SCHEMAS[vehicleClass].map((f) => f.key);

  if (!plan) {
    // 수동 폴백 — 시트 선택·와이드 리셰이프는 LLM 없이는 못 한다(설계상 한계). 행이 가장 많은 시트를 데이터로 가정.
    const targetSheet = sheets.reduce((a, b) => (b.rows.length > a.rows.length ? b : a), sheets[0]);
    const headerRowIndex = guessHeaderRowIndex(targetSheet.rows);
    const header = targetSheet.rows[headerRowIndex] ?? [];
    return {
      fileName, sheets, vehicleClass,
      targetSheetName: targetSheet.name,
      headerRowIndex,
      layout: 'long',
      reshapeInfo: null,
      mappings: header.map((h) => ({ source_name: h, standard_key: '' })),
      source: 'manual',
      finalHeader: header,
      finalRows: targetSheet.rows.slice(headerRowIndex + 1),
    };
  }

  const targetSheet = sheets[plan.target_sheet_index] ?? sheets[0];

  if (plan.layout === 'wide_by_period' && plan.period_groups.length > 0) {
    const reshaped = unpivotWideByPeriod(targetSheet.rows, {
      header_row_index: plan.header_row_index,
      id_columns: plan.id_columns,
      period_groups: plan.period_groups,
    });
    return {
      fileName, sheets, vehicleClass,
      targetSheetName: targetSheet.name,
      headerRowIndex: plan.header_row_index,
      layout: 'wide_by_period',
      reshapeInfo: {
        originalRows: targetSheet.rows.length - plan.header_row_index - 1,
        longRows: reshaped.rows.length,
        periodGroupCount: plan.period_groups.length,
      },
      mappings: reshaped.header.map((h) => ({ source_name: h, standard_key: standardKeys.includes(h) ? h : '' })),
      source: 'llm',
      finalHeader: reshaped.header,
      finalRows: reshaped.rows,
    };
  }

  const longHeader = targetSheet.rows[plan.header_row_index] ?? [];
  return {
    fileName, sheets, vehicleClass,
    targetSheetName: targetSheet.name,
    headerRowIndex: plan.header_row_index,
    layout: 'long',
    reshapeInfo: null,
    mappings: plan.mappings.map((m) => ({ ...m, standard_key: m.standard_key === 'unmapped' ? '' : m.standard_key })),
    source: 'llm',
    finalHeader: longHeader,
    finalRows: targetSheet.rows.slice(plan.header_row_index + 1),
  };
}

export function IngestScreen({ onBack }: { onBack: () => void }) {
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [results, setResults] = useState<Record<string, FileState>>({});
  const [parseStarted, setParseStarted] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [slowFiles, setSlowFiles] = useState<Record<string, boolean>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [readingFiles, setReadingFiles] = useState<string[]>([]);
  const [committing, setCommitting] = useState(false);
  const [commitResults, setCommitResults] = useState<{ fileName: string; ok: boolean; message: string }[]>([]);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function handleReset() {
    if (!window.confirm('업로드로 반영된 files2/ 데이터를 전부 지웁니다. 계속할까요?')) return;
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await fetch('/api/ingest-reset', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message ?? `HTTP ${res.status}`);
      setResetMessage('초기화 완료 — files2/ 데이터가 비었습니다. 다시 업로드해서 테스트하세요.');
    } catch (err) {
      setResetMessage(`초기화 실패: ${String(err)}`);
    } finally {
      setResetting(false);
      // 화면 상태도 처음으로 — 방금 지운 매핑 결과가 화면에 남아있으면 헷갈린다.
      setQueued([]);
      setResults({});
      setParseStarted(false);
      setConfirmed(false);
      setCommitResults([]);
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const names = [...fileList].map((f) => f.name);
    setReadingFiles((prev) => [...prev, ...names]);
    const loaded = await Promise.all(
      [...fileList].map(async (f) => ({ fileName: f.name, sheets: await loadFileSheets(f), vehicleClass: 'truck' as SchemaVehicleClass })),
    );
    setQueued((prev) => [...prev, ...loaded]);
    setReadingFiles((prev) => prev.filter((n) => !names.includes(n)));
  }

  function setFileVehicleClass(fileName: string, vehicleClass: SchemaVehicleClass) {
    setQueued((prev) => prev.map((q) => (q.fileName === fileName ? { ...q, vehicleClass } : q)));
  }

  async function handleParse() {
    setParseStarted(true);
    setIsParsing(true);
    setConfirmed(false);
    setResults({});
    await Promise.all(
      queued.map(async (q) => {
        const standardKeys = STANDARD_SCHEMAS[q.vehicleClass].map((f) => f.key);
        const plan = await attemptLlmPlan(q.sheets, standardKeys, () => setSlowFiles((s) => ({ ...s, [q.fileName]: true })));
        setResults((prev) => ({ ...prev, [q.fileName]: buildFileState(q, plan) }));
      }),
    );
    setIsParsing(false);
  }

  function updateMapping(fileName: string, sourceName: string, standardKey: string) {
    setResults((prev) => {
      const r = prev[fileName];
      if (!r) return prev;
      return {
        ...prev,
        [fileName]: {
          ...r,
          mappings: r.mappings.map((m) => (m.source_name === sourceName ? { ...m, standard_key: standardKey } : m)),
        },
      };
    });
  }

  async function handleConfirm() {
    setCommitting(true);
    const outcomes: { fileName: string; ok: boolean; message: string }[] = [];
    for (const r of Object.values(results)) {
      if (r.vehicleClass !== 'car') {
        outcomes.push({ fileName: r.fileName, ok: false, message: '화물차 원시 로그 반영은 아직 지원되지 않습니다 — 매핑만 검토했습니다.' });
        continue;
      }
      try {
        const rows = buildMappedObjects(r);
        const res = await fetch('/api/ingest-commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleClass: r.vehicleClass, rows }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          outcomes.push({ fileName: r.fileName, ok: false, message: json.message ?? `반영 실패 (HTTP ${res.status})` });
        } else {
          outcomes.push({
            fileName: r.fileName,
            ok: json.buildOk,
            message: json.buildOk
              ? `차량 ${json.vehiclesWritten}대, 일별 요약 ${json.dailySummaryRowsWritten}행 반영 완료 (건너뜀 ${json.skippedRows}행)`
              : `files2/에는 반영됐지만 build:data가 실패했습니다 — ${json.buildLog?.slice(0, 300) ?? ''}`,
          });
        }
      } catch (err) {
        outcomes.push({ fileName: r.fileName, ok: false, message: String(err) });
      }
    }
    setCommitResults(outcomes);
    setCommitting(false);
    setConfirmed(true);

    // 확인 버튼 클릭 자체가 반영+이동이다 — 성공하면 그 클릭으로 바로 Safe로 넘어간다(별도 지연/버튼 없음).
    if (outcomes.some((o) => o.ok)) {
      onBack();
    }
  }

  function hasDuplicateMapping(r: FileState): boolean {
    const used = r.mappings.map((m) => m.standard_key).filter(Boolean);
    return new Set(used).size !== used.length;
  }

  const allResults = Object.values(results);
  const anyDuplicate = allResults.some(hasDuplicateMapping);

  const allDone = parseStarted && !isParsing && queued.length > 0 && allResults.length === queued.length;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>데이터 업로드</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="tone-dead-fg text-xs disabled:opacity-40"
          >
            {resetting ? '초기화 중…' : '업로드 데이터 초기화'}
          </button>
          <button type="button" onClick={onBack} className="text-xs" style={{ color: 'var(--color-slate)' }}>← Safe로 (저장 없이 나가기)</button>
        </div>
      </div>

      {resetMessage && (
        <p className="text-xs" style={{ color: 'var(--color-dim)' }}>{resetMessage}</p>
      )}

      <StepBar
        step={confirmed ? 4 : allDone ? 3 : parseStarted ? 2 : 1}
      />

      {/* ① 업로드 */}
      <div>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>① 파일 업로드</p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          multiple
          disabled={readingFiles.length > 0}
          onChange={(e) => handleFiles(e.target.files)}
          className="text-xs disabled:opacity-40"
          style={{ color: 'var(--color-mist)' }}
        />
        {readingFiles.length > 0 && (
          <p className="tone-warn-fg mt-1 text-xs">
            파일 읽는 중… ({readingFiles.join(', ')}) — 큰 xlsx는 몇 초~10초 걸립니다. 탭이 멈춘 게 아닙니다.
          </p>
        )}
        {queued.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-xs" style={{ color: 'var(--color-mist)' }}>
            {queued.map((q) => (
              <li key={q.fileName} className="flex items-center gap-2">
                <span className="tone-ok-fg">✓</span>
                <span>업로드됨: {q.fileName} — 시트 {q.sheets.length}개({q.sheets.map((s) => s.name).join(', ')})</span>
                <select
                  value={q.vehicleClass}
                  onChange={(e) => setFileVehicleClass(q.fileName, e.target.value as SchemaVehicleClass)}
                  className="rounded border px-1.5 py-0.5"
                  style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
                >
                  <option value="truck">화물차 스키마</option>
                  <option value="car">승용차 스키마</option>
                </select>
              </li>
            ))}
          </ul>
        )}
        {queued.length === 0 && readingFiles.length === 0 && (
          <p className="mt-1 text-xs" style={{ color: 'var(--color-dim)' }}>파일을 선택하면 자동으로 업로드됩니다. 업로드되면 아래 ② 파싱 버튼이 켜집니다.</p>
        )}
      </div>

      {/* ② 파싱 */}
      <div>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>② 스키마 분석</p>
        <button
          type="button"
          disabled={queued.length === 0 || isParsing}
          onClick={handleParse}
          className="tone-ok-bg tone-ok-fg rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {isParsing ? '분석 중…' : parseStarted ? '다시 분석' : '파싱 시작'}
        </button>
        {isParsing && (
          <span className="ml-2 text-xs" style={{ color: 'var(--color-mist)' }}>
            파일마다 AI가 컬럼을 매핑하고 있습니다. 끝나면 아래에 자동으로 표가 뜹니다.
          </span>
        )}
      </div>

      {parseStarted && (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium" style={{ color: 'var(--color-paper)' }}>③ 매핑 검토{allDone ? ' — 완료' : ' (진행 중)'}</p>
          {queued.map((q) => {
            const r = results[q.fileName];
            if (!r) {
              return (
                <div key={q.fileName} className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--color-line)', color: 'var(--color-dim)' }}>
                  {q.fileName} — {slowFiles[q.fileName] ? '오래 걸리는 중…' : '분석 중…'}
                </div>
              );
            }
            return <FileMappingCard key={q.fileName} r={r} onUpdateMapping={updateMapping} />;
          })}

          {allDone && !confirmed && (
            <>
              <button
                type="button"
                disabled={anyDuplicate || committing}
                onClick={handleConfirm}
                className="tone-ok-bg tone-ok-fg w-fit rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                {committing ? '반영 중…' : '확인 — files2/에 반영'}
              </button>
              {anyDuplicate && (
                <p className="text-xs" style={{ color: 'var(--color-rose)' }}>같은 표준필드에 컬럼 2개 이상 매핑됨 — 중복을 해소하세요.</p>
              )}
            </>
          )}

          {confirmed && (
            <div className="flex flex-col items-start gap-2 rounded-md border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
              <p className="text-xs font-medium" style={{ color: 'var(--color-paper)' }}>④ 반영 결과</p>
              <ul className="flex flex-col gap-1 text-xs">
                {commitResults.map((c) => (
                  <li key={c.fileName} className={c.ok ? 'tone-ok-fg' : 'tone-dead-fg'}>
                    {c.ok ? '✓' : '✗'} {c.fileName} — {c.message}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onBack}
                className="tone-ok-bg tone-ok-fg mt-1 rounded-md px-4 py-2 text-sm font-medium"
              >
                Safe 화면으로 이동 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const labels = ['업로드', '파싱', '매핑검토', '완료'];
  return (
    <div className="flex gap-2 text-xs">
      {labels.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <span
            key={label}
            className={done ? 'tone-ok-fg' : undefined}
            style={{ color: active ? 'var(--color-paper)' : done ? undefined : 'var(--color-dim)', fontWeight: active ? 600 : 400 }}
          >
            {done ? '✓ ' : `${n}. `}{label}{i < labels.length - 1 ? ' →' : ''}
          </span>
        );
      })}
    </div>
  );
}

function FileMappingCard({ r, onUpdateMapping }: { r: FileState; onUpdateMapping: (fileName: string, sourceName: string, standardKey: string) => void }) {
  const schema: StandardField[] = STANDARD_SCHEMAS[r.vehicleClass];
  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--color-line)' }}>
      <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>
        {r.fileName} — {r.vehicleClass === 'truck' ? '화물차' : '승용차'} 스키마 · {r.source === 'llm' ? 'AI 매핑' : '수동 매핑'}
      </p>
      <p className="mb-2 text-xs" style={{ color: 'var(--color-dim)' }}>
        시트 "{r.targetSheetName}" 선택 · 헤더 {r.headerRowIndex + 1}행
        {r.sheets.length > 1 && ` (워크북 내 시트 ${r.sheets.length}개 중 선택)`}
      </p>
      {r.reshapeInfo && (
        <p className="mb-2 text-xs" style={{ color: 'var(--color-mist)' }}>
          와이드(피벗) 포맷 감지 — 기간 컬럼그룹 {r.reshapeInfo.periodGroupCount}개를 롱포맷으로 펼침:
          원본 {r.reshapeInfo.originalRows}행 → {r.reshapeInfo.longRows}행
        </p>
      )}
      {r.source === 'manual' && r.sheets.length > 1 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--color-rose)' }}>
          AI 매핑 실패 — 시트 자동 선택·와이드 포맷 해체는 수동으로 할 수 없습니다. 행이 가장 많은 시트를 임의로 골랐으니 확인하세요.
        </p>
      )}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-slate)' }}>
            <th className="py-1 pr-2">{r.reshapeInfo ? '필드(리셰이프 후)' : '원본 컬럼'}</th>
            <th className="py-1 pr-2">표준 필드</th>
            {r.source === 'llm' && <th className="py-1 pr-2">신뢰도</th>}
          </tr>
        </thead>
        <tbody>
          {r.mappings.map((m) => {
            const isDup = m.standard_key && r.mappings.filter((x) => x.standard_key === m.standard_key).length > 1;
            return (
              <tr key={m.source_name} className="border-b" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-mist)' }}>
                <td className="py-1 pr-2">{m.source_name}</td>
                <td className="py-1 pr-2">
                  <select
                    value={m.standard_key}
                    onChange={(e) => onUpdateMapping(r.fileName, m.source_name, e.target.value)}
                    className="rounded border px-1.5 py-0.5"
                    style={{ borderColor: isDup ? 'var(--color-rose)' : 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
                  >
                    <option value="">미매핑</option>
                    {schema.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </td>
                {r.source === 'llm' && <td className="py-1 pr-2">{m.confidence ?? '—'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      <UnmappedFields schema={schema} mappedKeys={r.mappings.map((m) => m.standard_key)} />
    </div>
  );
}

function UnmappedFields({ schema, mappedKeys }: { schema: StandardField[]; mappedKeys: string[] }) {
  const unmapped = schema.filter((f) => !mappedKeys.includes(f.key));
  if (unmapped.length === 0) return null;
  return (
    <div className="mt-2 text-xs" style={{ color: 'var(--color-dim)' }}>
      미매핑 표준필드:
      <ul className="mt-1 list-disc pl-4">
        {unmapped.map((f) => (
          <li key={f.key}>{f.label} — {f.missing_impact}</li>
        ))}
      </ul>
    </div>
  );
}
