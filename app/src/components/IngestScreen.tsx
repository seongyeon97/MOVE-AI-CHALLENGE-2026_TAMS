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
};

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
    };
  }

  return {
    fileName, sheets, vehicleClass,
    targetSheetName: targetSheet.name,
    headerRowIndex: plan.header_row_index,
    layout: 'long',
    reshapeInfo: null,
    mappings: plan.mappings.map((m) => ({ ...m, standard_key: m.standard_key === 'unmapped' ? '' : m.standard_key })),
    source: 'llm',
  };
}

export function IngestScreen({ onBack }: { onBack: () => void }) {
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [results, setResults] = useState<Record<string, FileState>>({});
  const [parseStarted, setParseStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [slowFiles, setSlowFiles] = useState<Record<string, boolean>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [readingFiles, setReadingFiles] = useState<string[]>([]);

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
    setConfirmed(false);
    await Promise.all(
      queued.map(async (q) => {
        const standardKeys = STANDARD_SCHEMAS[q.vehicleClass].map((f) => f.key);
        const plan = await attemptLlmPlan(q.sheets, standardKeys, () => setSlowFiles((s) => ({ ...s, [q.fileName]: true })));
        setResults((prev) => ({ ...prev, [q.fileName]: buildFileState(q, plan) }));
      }),
    );
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

  function hasDuplicateMapping(r: FileState): boolean {
    const used = r.mappings.map((m) => m.standard_key).filter(Boolean);
    return new Set(used).size !== used.length;
  }

  const allResults = Object.values(results);
  const anyDuplicate = allResults.some(hasDuplicateMapping);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>데이터 업로드</h1>
        <button type="button" onClick={onBack} className="text-xs" style={{ color: 'var(--color-slate)' }}>← Safe로</button>
      </div>

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
        <p className="tone-warn-fg text-xs">
          파일 읽는 중… ({readingFiles.join(', ')}) — 큰 xlsx는 시간이 좀 걸립니다. 탭이 멈춘 게 아닙니다.
        </p>
      )}

      {queued.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-mist)' }}>
          {queued.map((q) => (
            <li key={q.fileName} className="flex items-center gap-2">
              <span>{q.fileName} — 시트 {q.sheets.length}개({q.sheets.map((s) => s.name).join(', ')})</span>
              <select
                value={q.vehicleClass}
                onChange={(e) => setFileVehicleClass(q.fileName, e.target.value as SchemaVehicleClass)}
                className="rounded border px-1.5 py-0.5"
                style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
              >
                <option value="truck">화물차 스키마</option>
                <option value="car">승용차 스키마</option>
              </select>
              {slowFiles[q.fileName] && !results[q.fileName] && (
                <span className="tone-warn-fg">오래 걸리는 중…</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={queued.length === 0}
          onClick={handleParse}
          className="tone-ok-bg tone-ok-fg rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          파싱
        </button>
        <button
          type="button"
          disabled={!parseStarted}
          onClick={() => setShowResults(true)}
          className="rounded-md border px-3 py-1.5 text-xs disabled:opacity-40"
          style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}
        >
          결과
        </button>
      </div>

      {showResults && allResults.length > 0 && (
        <div className="flex flex-col gap-4">
          {allResults.map((r) => {
            const schema: StandardField[] = STANDARD_SCHEMAS[r.vehicleClass];
            return (
              <div key={r.fileName} className="rounded-md border p-3" style={{ borderColor: 'var(--color-line)' }}>
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
                              onChange={(e) => updateMapping(r.fileName, m.source_name, e.target.value)}
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
          })}

          <button
            type="button"
            disabled={anyDuplicate}
            onClick={() => setConfirmed(true)}
            className="tone-ok-bg tone-ok-fg w-fit rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            확인
          </button>
          {anyDuplicate && (
            <p className="text-xs" style={{ color: 'var(--color-rose)' }}>같은 표준필드에 컬럼 2개 이상 매핑됨 — 중복을 해소하세요.</p>
          )}
          {confirmed && (
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
              매핑 확정 — 전체 파일을 이 매핑으로 재파싱해 files2/ 표준 스키마로 반영합니다.
            </p>
          )}
        </div>
      )}
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
