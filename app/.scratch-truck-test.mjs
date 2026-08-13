// 실제 8월 화물차 파일(운행 + 유류 두 개)을 화면과 같은 경로로 태워 확인.
import { readFileSync } from 'node:fs';

const port = process.argv[2] ?? '5173';
const DIR = 'C:/Users/USER/Downloads/8월 데이터(실측 기반)_re (1)/files2';
const TRUCK_KEYS = ['vehicle_id','date','distance_km','driving_min','laden','hard_accel','hard_start','hard_decel','hard_stop','speeding_count','fuel_l','idle_sec','driver_id'];

function readCsv(path) {
  const text = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',');
  return { header, rows: lines.slice(1).map((l) => l.split(',')) };
}

async function upload(file, label) {
  const { header, rows } = readCsv(`${DIR}/${file}`);
  const sheets = [{ name: file, rowCount: rows.length + 1, rawRows: [header, ...rows.slice(0, 9)] }];

  const planRes = await fetch(`http://localhost:${port}/api/map-schema`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ standardKeys: TRUCK_KEYS, sheets }),
  });
  const plan = await planRes.json();
  if (plan.error) { console.log(label, 'LLM 실패:', plan.message); return; }

  const colIdx = new Map(header.map((h, i) => [h, i]));
  const targets = plan.mappings
    .filter((m) => m.standard_key && m.standard_key !== 'unmapped' && colIdx.has(m.source_name))
    .map((m) => ({ key: m.standard_key, idx: colIdx.get(m.source_name) }));
  console.log(`\n[${label}] 매핑:`, targets.map((t) => `${header[t.idx]}→${t.key}`).join(', '));

  const mapped = rows.map((r) => {
    const o = {};
    for (const t of targets) o[t.key] = r[t.idx] ?? '';
    return o;
  });

  const res = await fetch(`http://localhost:${port}/api/ingest-commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleClass: 'truck', rows: mapped }),
  });
  const json = await res.json();
  console.log(`[${label}] status ${res.status} | ok:${json.ok} buildOk:${json.buildOk} | 차량 ${json.vehiclesWritten} 일별 ${json.dailySummaryRowsWritten} 건너뜀 ${json.skippedRows}`);
  if (json.buildLog) console.log('   ', String(json.buildLog).trim().split('\n').join(' | '));
  if (!json.ok) console.log('   err:', json.message);
}

await upload('driving_events_2026-08.csv', '운행');
await upload('fuel_2026-08.csv', '유류');

const daily = await fetch(`http://localhost:${port}/data/daily.json`).then((r) => r.json());
const cls = {};
for (const v of daily.vehicles) cls[v.vehicle_class] = (cls[v.vehicle_class] ?? 0) + 1;
console.log('\n=== 최종 daily.json ===');
console.log('기간:', daily.meta.date_min, '~', daily.meta.date_max, '| 차량', daily.vehicles.length, JSON.stringify(cls));

// 화물차 한 대가 이벤트와 연료를 동시에 갖고 있는지(= 두 파일이 합쳐졌는지)
const truck = daily.vehicles.find((v) => v.vehicle_class === 'truck');
if (truck) {
  const rows = daily.rows.filter((r) => r[0] === truck.vehicle_id);
  const events = rows.reduce((s, r) => s + r[4] + r[5] + r[6] + r[7], 0);
  const fuel = rows.reduce((s, r) => s + r[8], 0);
  const km = rows.reduce((s, r) => s + r[3], 0);
  console.log(`병합 확인 ${truck.vehicle_id}: ${rows.length}일 | 거리 ${km.toFixed(0)}km | 이벤트 ${events}건 | 연료 ${fuel.toFixed(1)}L`);
  console.log(events > 0 && fuel > 0 ? '→ OK: 운행·유류 두 파일이 한 행에 합쳐짐' : '→ 확인 필요: 한쪽이 0');
}
