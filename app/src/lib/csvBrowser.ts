// csvBrowser.ts — 브라우저에서 업로드 파일을 미리보기/전체파싱하는 파서. CSV뿐 아니라 XLSX(멀티시트)도 받는다 —
// "어떤 형태의 운행·유류 데이터를 던져도 파싱한다"가 이 플랫폼의 전제다. scripts/lib/csv.mjs와는 별개(런타임/브라우저 전용).
// xlsx 라이브러리(~500KB)는 실제로 xlsx 파일을 올릴 때만 동적 import한다.

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

function rowsFromCsvText(text: string): string[][] {
  return text.split(/\r?\n/).filter((l) => l.length > 0).map(parseLine);
}

function isXlsx(fileName: string): boolean {
  return /\.xlsx?$/i.test(fileName);
}

export type SheetData = { name: string; rows: string[][] };

/** 파일 전체를 시트 단위로 읽는다(CSV는 시트 1개짜리로 취급). 큰 파일이라도 전체를 들고 있어야 확정 후 리셰이프가 가능하다. */
export async function loadFileSheets(file: File): Promise<SheetData[]> {
  if (isXlsx(file.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return wb.SheetNames.map((name) => {
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, defval: '', raw: false }) as unknown as string[][];
      return { name, rows: rows.map((r) => r.map((c) => String(c ?? ''))) };
    });
  }
  const text = await file.text();
  return [{ name: file.name, rows: rowsFromCsvText(text) }];
}

export type SheetPreview = { name: string; rowCount: number; rawRows: string[][] };

/** 시트별 미리보기(앞 최대 10행) — LLM에게 "어느 시트가 데이터인지" 직접 판단시킬 근거. */
export function previewSheets(sheets: SheetData[], scanLimit = 10): SheetPreview[] {
  return sheets.map((s) => ({ name: s.name, rowCount: s.rows.length, rawRows: s.rows.slice(0, scanLimit) }));
}

/** 헤더가 1행이라고 이미 알려진 CSV 전체를 객체 배열로 — fetch(url).then(r=>r.text())와 함께 쓴다(고정 스키마 파일 전용). */
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
