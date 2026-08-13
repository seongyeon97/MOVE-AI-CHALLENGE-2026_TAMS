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
  // 엑셀이 내보낸 CSV는 BOM(﻿)으로 시작한다 — 안 떼면 첫 컬럼명이 "﻿vehicle_id"가 돼
  // row.vehicle_id가 전부 undefined가 되고, 모든 행이 한 덩어리로 뭉친다(실제로 겪은 증상).
  const text = readFileSync(path, 'utf-8').replace(/^﻿/, '');
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

function escCsvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 객체 배열을 CSV로 쓴다(header 순서 그대로). ingest-commit처럼 실제 데이터를 files2/에 반영할 때 쓴다. */
export function writeCsv(path, header, rows) {
  assertNotForbidden(path);
  const text = [header.join(','), ...rows.map((r) => header.map((h) => escCsvCell(r[h])).join(','))].join('\n') + '\n';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf-8');
}

/** 이미 있으면 읽고, 없으면 빈 배열 — ingest-commit이 기존 files2/*.csv에 병합할 때 쓴다. */
export function readCsvIfExists(path) {
  try {
    return readCsv(path);
  } catch {
    return [];
  }
}

/** 문자열/undefined를 숫자로. 빈 값·NaN은 fallback(기본 0). */
export function num(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
