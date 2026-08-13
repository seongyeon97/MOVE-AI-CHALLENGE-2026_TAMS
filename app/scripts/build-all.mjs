// build-all.mjs — 데이터 파이프라인 오케스트레이션. 순서 고정: 기준연비→차량→증명서.
// resolveBaselineFuel()은 build-vehicles.mjs 안에서 호출된다(baseline_fuel.json도 같이 나옴).

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(script) {
  console.log(`\n── ${script} ──`);
  execFileSync(process.execPath, [join(__dirname, script)], { stdio: 'inherit' });
}

run('build-vehicles.mjs');
run('build-certificates.mjs');
run('build-attribution.mjs');
