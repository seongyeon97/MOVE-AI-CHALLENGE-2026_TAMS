// csv.mjs — files2/ 원천 CSV 입출력 유틸.
// _truth.csv는 정답표다. readCsv/streamCsv 둘 다 파일명으로 로드를 막는다.

import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname } from 'node:path';

const FORBIDDEN_FILENAME = /_?truth\.csv$/i;

function assertNotForbidden(path) {
  if (FORBIDDEN_FILENAME.test(path)) {
    throw new Error(`FORBIDDEN: refusing to read truth file — ${path}`);
  }
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function rowsToObjects(header, rows) {
  return rows.map((cells) => {
    const obj = {};
    header.forEach((key, i) => {
      obj[key] = cells[i] ?? '';
    });
    return obj;
  });
}

/** 전체 CSV를 한 번에 읽어 객체 배열로 반환한다. */
export function readCsv(path) {
  assertNotForbidden(path);
  const text = readFileSync(path, 'utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return rowsToObjects(header, rows);
}

/**
 * 큰 CSV(dtg_track 등)를 스트리밍으로 읽으며 행마다 onRow(obj)를 호출한다.
 * 메모리에 전체를 올리지 않는다.
 */
export async function streamCsv(path, onRow) {
  assertNotForbidden(path);
  const rl = createInterface({
    input: createReadStream(path, 'utf-8'),
    crlfDelay: Infinity,
  });

  let header = null;
  for await (const line of rl) {
    if (line.length === 0) continue;
    const cells = parseCsvLine(line);
    if (!header) {
      header = cells;
      continue;
    }
    const obj = {};
    header.forEach((key, i) => {
      obj[key] = cells[i] ?? '';
    });
    onRow(obj);
  }
}

/** 결과 JSON을 지정 경로에 쓴다. 디렉터리가 없으면 만든다. */
export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

/** 문자열/undefined를 숫자로. 빈 값·NaN은 fallback(기본 0). */
export function num(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
