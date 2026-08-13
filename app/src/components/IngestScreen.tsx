import { useState } from 'react';
import { previewCsvFile, type ParsedPreview } from '../lib/csvBrowser';
import { STANDARD_SCHEMA } from '../lib/standardSchema';

type MappingRow = { source_name: string; standard_key: string; confidence?: string; reasoning?: string };
type MappingResult = {
  fileName: string;
  header_row_index: number;
  mappings: MappingRow[];
  source: 'llm' | 'manual';
};

const STANDARD_KEYS = STANDARD_SCHEMA.map((f) => f.key);

async function attemptLlmMapping(preview: ParsedPreview, onSlow: () => void): Promise<MappingResult | null> {
  const slowTimer = setTimeout(onSlow, 8000);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch('/api/map-schema', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ standardKeys: STANDARD_KEYS, rawRows: preview.rawRows }),
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    return {
      fileName: preview.fileName,
      header_row_index: json.header_row_index,
      mappings: json.mappings.map((m: MappingRow) => ({ ...m, standard_key: m.standard_key === 'unmapped' ? '' : m.standard_key })),
      source: 'llm',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(slowTimer);
  }
}

function manualFallback(preview: ParsedPreview): MappingResult {
  return {
    fileName: preview.fileName,
    header_row_index: preview.headerRowIndex,
    mappings: preview.header.map((h) => ({ source_name: h, standard_key: '' })),
    source: 'manual',
  };
}

export function IngestScreen({ onBack, onOpenIntegrityDemo }: { onBack: () => void; onOpenIntegrityDemo: () => void }) {
  const [previews, setPreviews] = useState<ParsedPreview[]>([]);
  const [results, setResults] = useState<Record<string, MappingResult>>({});
  const [parseStarted, setParseStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [slowFiles, setSlowFiles] = useState<Record<string, boolean>>({});
  const [confirmed, setConfirmed] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const parsed = await Promise.all([...fileList].map((f) => previewCsvFile(f)));
    setPreviews((prev) => [...prev, ...parsed]);
  }

  async function handleParse() {
    setParseStarted(true);
    setConfirmed(false);
    await Promise.all(
      previews.map(async (p) => {
        const llmResult = await attemptLlmMapping(p, () => setSlowFiles((s) => ({ ...s, [p.fileName]: true })));
        setResults((prev) => ({ ...prev, [p.fileName]: llmResult ?? manualFallback(p) }));
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

  function hasDuplicateMapping(r: MappingResult): boolean {
    const used = r.mappings.map((m) => m.standard_key).filter(Boolean);
    return new Set(used).size !== used.length;
  }

  const allResults = Object.values(results);
  const anyDuplicate = allResults.some(hasDuplicateMapping);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>데이터 업로드</h1>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onOpenIntegrityDemo} className="text-xs" style={{ color: 'var(--color-slate)' }}>조작탐지 데모 →</button>
          <button type="button" onClick={onBack} className="text-xs" style={{ color: 'var(--color-slate)' }}>← Safe로</button>
        </div>
      </div>

      <input
        type="file"
        accept=".csv"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="text-xs"
        style={{ color: 'var(--color-mist)' }}
      />

      {previews.length > 0 && (
        <ul className="text-xs" style={{ color: 'var(--color-mist)' }}>
          {previews.map((p) => (
            <li key={p.fileName}>
              {p.fileName} — {p.totalRows}행, 헤더 추정 {p.headerRowIndex + 1}행
              {slowFiles[p.fileName] && !results[p.fileName] && (
                <span className="tone-warn-fg ml-2">오래 걸리는 중…</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={previews.length === 0}
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
          {allResults.map((r) => (
            <div key={r.fileName} className="rounded-md border p-3" style={{ borderColor: 'var(--color-line)' }}>
              <p className="mb-2 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>
                {r.fileName} — {r.source === 'llm' ? 'AI 매핑' : '수동 매핑'}
              </p>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-slate)' }}>
                    <th className="py-1 pr-2">원본 컬럼</th>
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
                            {STANDARD_SCHEMA.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                        </td>
                        {r.source === 'llm' && <td className="py-1 pr-2">{m.confidence ?? '—'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <UnmappedFields mappedKeys={r.mappings.map((m) => m.standard_key)} />
            </div>
          ))}

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
              매핑 확정 — 전체 파일 재파싱 + 진단(runDiagnosis) + 정합성 검사(runIntegrityCheck)를 동시 실행합니다. (트랙12에서 실제 판정 로직 연결)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function UnmappedFields({ mappedKeys }: { mappedKeys: string[] }) {
  const unmapped = STANDARD_SCHEMA.filter((f) => !mappedKeys.includes(f.key));
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
