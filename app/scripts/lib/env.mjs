// env.mjs — .env.local을 process.env에 실어 준다.
//
// 빌드 스크립트는 두 경로로 실행된다: dev 서버의 업로드 파이프라인(자식 프로세스에 env를 넣어 준다)과
// 셸에서 직접 `node scripts/build-*.mjs`. 후자는 아무도 키를 넣어 주지 않아 공공API·LLM 조회가 통째로
// 실패하고, 그 결과가 기존 결과를 덮어쓴다(승용차 기준연비가 전부 '조회실패'로 바뀐 사고의 원인).
// 이미 들어 있는 값은 덮지 않는다 — 부모가 넘겨준 값이 항상 우선이다.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadEnvLocal() {
  try {
    for (const line of readFileSync(join(APP_ROOT, '.env.local'), 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // .env.local이 없으면 그대로 — 각 조회 계층이 알아서 폴백한다.
  }
}

loadEnvLocal();
