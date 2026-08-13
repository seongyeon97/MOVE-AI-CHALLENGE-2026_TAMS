// csvBrowser.ts — 브라우저에서 업로드 파일 미리보기용 초경량 CSV 파서. scripts/lib/csv.mjs와 별개(런타임/브라우저 전용).

export function parseLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

export type ParsedPreview = {
  fileName: string;
  headerRowIndex: number;
  header: string[];
  sampleRows: string[][];
  totalRows: number;
  rawRows: string[][]; // 헤더 위치를 모델이 스스로 찾도록 보내는 원본 앞부분(가정 없음)
};

/** 헤더 행이 1행이 아닐 수 있다고 가정 — 셀 개수가 가장 많은 초반 행을 헤더로 추정한다(모델이 최종 확정). */
export async function previewCsvFile(file: File, sampleSize = 5): Promise<ParsedPreview> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);

  let headerRowIndex = 0;
  let bestCellCount = 0;
  const scanLimit = Math.min(lines.length, 10);
  for (let i = 0; i < scanLimit; i++) {
    const count = parseLine(lines[i]).length;
    if (count > bestCellCount) { bestCellCount = count; headerRowIndex = i; }
  }

  const header = parseLine(lines[headerRowIndex]);
  const sampleRows = lines.slice(headerRowIndex + 1, headerRowIndex + 1 + sampleSize).map(parseLine);
  const rawRows = lines.slice(0, scanLimit).map(parseLine);

  return { fileName: file.name, headerRowIndex, header, sampleRows, totalRows: lines.length - headerRowIndex - 1, rawRows };
}

/** 헤더가 1행이라고 이미 알려진 CSV 전체를 객체 배열로 — fetch(url).then(r=>r.text())와 함께 쓴다. */
export function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const obj: Record<string, string> = {};
    header.forEach((key, i) => { obj[key] = cells[i] ?? ''; });
    return obj;
  });
}
