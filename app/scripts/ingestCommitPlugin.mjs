// ingestCommitPlugin.mjs — 트랙9 확정 단계. IngestScreen에서 "확인"까지 끝난 매핑 결과를
// 실제로 files2/vehicle_master.csv · daily_summary.csv에 반영하고 build:data를 다시 돌린다.
// 이게 없으면 업로드 마법사는 매핑 미리보기로 끝나고 Safe 화면엔 아무 변화가 없다.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { rmSync, readFileSync } from 'node:fs';
import { readCsv, readCsvIfExists, writeCsv, num } from './lib/csv.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const DATA_OUT = join(ROOT, 'public', 'data');

/**
 * 빌드 스크립트는 별도 프로세스로 돌아서 Vite가 읽은 .env.local이 자동으로 넘어가지 않는다.
 * 키가 없으면 기준연비 조회가 4계층 전부 실패해 빌드가 죽고, 화면은 업로드했는데도 빈 상태가 된다 —
 * 실제로 그 증상을 겪었다. 여기서 직접 읽어 자식 프로세스 env에 실어 보낸다.
 */
function buildEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(join(ROOT, '.env.local'), 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch {
    // .env.local 없으면 그대로 — 조회는 픽스처 폴백으로 간다.
  }
  return env;
}

const VEHICLE_MASTER_HEADER = ['vehicle_id', 'vehicle_class', 'device_model', 'maker', 'model', 'year', 'gross_weight_kg', 'displacement_cc', 'fuel_type', 'registered_kmpl'];
const DAILY_SUMMARY_HEADER = ['vehicle_id', 'date', 'laden', 'reported_km', 'event_accel', 'event_start', 'event_decel', 'event_stop', 'event_speeding', 'fuel_l', 'idle_sec'];

function extractDate(ts) {
  const m = String(ts ?? '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** 승용차 원천(주행 1건=1행)을 vehicle_master + daily_summary 병합용 행으로 집계한다. */
function aggregateCarRows(rows) {
  const vehicleInfo = new Map(); // vehicle_id -> { model, fuel_type }
  const daily = new Map(); // `${vehicle_id}|${date}` -> accumulator
  const skipped = [];

  for (const row of rows) {
    const vehicle_id = String(row.vehicle_id ?? '').trim();
    const date = extractDate(row.trip_start);
    const distance = num(row.trip_distance_km, NaN);
    if (!vehicle_id || !date || !Number.isFinite(distance)) {
      skipped.push(row);
      continue;
    }

    if (!vehicleInfo.has(vehicle_id)) vehicleInfo.set(vehicle_id, { model: '', fuel_type: '' });
    const info = vehicleInfo.get(vehicle_id);
    if (!info.model && row.model) info.model = row.model;
    if (!info.fuel_type && row.fuel_type) info.fuel_type = row.fuel_type;

    const key = `${vehicle_id}|${date}`;
    if (!daily.has(key)) {
      daily.set(key, { vehicle_id, date, reported_km: 0, event_accel: 0, event_decel: 0, fuel_l: 0, idle_sec: 0 });
    }
    const acc = daily.get(key);
    acc.reported_km += distance;
    acc.event_accel += num(row.harsh_accel_count);
    acc.event_decel += num(row.harsh_decel_count);
    acc.fuel_l += num(row.fuel_used_l);
    acc.idle_sec += num(row.idle_min) * 60;
  }

  const vehicleMasterRows = [...vehicleInfo.entries()].map(([vehicle_id, info]) => ({
    vehicle_id,
    vehicle_class: 'car',
    device_model: '',
    maker: '',
    model: info.model,
    year: '',
    gross_weight_kg: '',
    displacement_cc: '',
    fuel_type: info.fuel_type,
    registered_kmpl: '',
  }));

  const dailySummaryRows = [...daily.values()].map((acc) => ({
    vehicle_id: acc.vehicle_id,
    date: acc.date,
    laden: 'false', // 승용차는 적재상태 구분 없음
    reported_km: acc.reported_km.toFixed(2),
    event_accel: acc.event_accel,
    event_start: 0,
    event_decel: acc.event_decel,
    event_stop: 0,
    event_speeding: 0, // §CLAUDE.md 5-5 — 별도 표기 필요, 코어 발생률에는 안 씀(트랙과 동일 취급)
    fuel_l: acc.fuel_l.toFixed(3),
    idle_sec: Math.round(acc.idle_sec),
  }));

  return { vehicleMasterRows, dailySummaryRows, skippedCount: skipped.length };
}

/**
 * 화물차 원천(일자 1건=1행)을 daily_summary 병합용 행으로 만든다.
 * 2분 간격 DTG 원시 로그가 아니라 승용차와 같은 일자별 집계다 — 운행(driving_events)과
 * 유류(fuel)가 별도 파일로 오므로, 이 함수는 "그 파일에 있는 필드만" 담아 낸다.
 * 없는 필드를 0으로 채우면 나중에 올린 파일이 먼저 올린 값을 0으로 덮어쓴다.
 */
function aggregateTruckRows(rows) {
  const vehicleIds = new Set();
  const daily = new Map(); // `${vehicle_id}|${date}` -> partial row
  const skipped = [];

  for (const row of rows) {
    const vehicle_id = String(row.vehicle_id ?? '').trim();
    const date = extractDate(row.date);
    if (!vehicle_id || !date) {
      skipped.push(row);
      continue;
    }
    vehicleIds.add(vehicle_id);

    const key = `${vehicle_id}|${date}`;
    if (!daily.has(key)) daily.set(key, { vehicle_id, date, laden: 'false' });
    const acc = daily.get(key);

    // 적재상태: 실제 파일은 unknown이 대부분 — 적차로 단정하지 않고 공차(false)로 둔다.
    if (row.laden !== undefined && row.laden !== '') {
      const v = String(row.laden).toLowerCase();
      if (v === 'true' || v === 'laden' || v === '적차') acc.laden = 'true';
    }

    const add = (field, value) => {
      if (value === undefined || value === '') return;
      acc[field] = num(acc[field]) + num(value);
    };
    add('reported_km', row.distance_km);
    add('event_accel', row.hard_accel);
    add('event_start', row.hard_start);
    add('event_decel', row.hard_decel);
    add('event_stop', row.hard_stop);
    add('event_speeding', row.speeding_count);
    add('fuel_l', row.fuel_l);
    add('idle_sec', row.idle_sec);
  }

  const vehicleMasterRows = [...vehicleIds].map((vehicle_id) => ({
    vehicle_id,
    vehicle_class: 'truck',
    device_model: '',
    maker: '',
    model: '',
    year: '',
    gross_weight_kg: '',
    displacement_cc: '',
    fuel_type: '경유',
    registered_kmpl: '',
  }));

  return { vehicleMasterRows, dailySummaryRows: [...daily.values()], skippedCount: skipped.length };
}

/** vehicle_id 기준 병합 — 기존 값이 있으면 유지하고, 새 파일이 채운 필드만 덮어쓴다. */
function upsertByVehicleId(existing, incoming) {
  const byId = new Map(existing.map((r) => [r.vehicle_id, r]));
  for (const r of incoming) {
    const prev = byId.get(r.vehicle_id);
    if (!prev) {
      byId.set(r.vehicle_id, r);
      continue;
    }
    // 빈 값으로 기존 정보를 지우지 않는다 — 운행 파일엔 모델명이 없고 유류 파일엔 있을 수 있다.
    const merged = { ...prev };
    for (const [k, v] of Object.entries(r)) {
      if (v !== undefined && v !== '') merged[k] = v;
    }
    byId.set(r.vehicle_id, merged);
  }
  return [...byId.values()];
}

/**
 * (vehicle_id, date, laden) 기준 병합.
 * 행을 통째로 갈아끼우지 않고 필드 단위로 합친다 — 운행 파일과 유류 파일이 따로 올라오는데
 * 행 교체로 처리하면 나중에 올린 유류 파일이 먼저 올린 이벤트 값을 날려버린다.
 * 같은 필드가 다시 오면 새 값으로 덮어쓴다(같은 파일 재업로드 시 이중 합산 방지).
 */
function mergeByVehicleDateLaden(existing, incoming) {
  const byKey = new Map(existing.map((r) => [`${r.vehicle_id}|${r.date}|${r.laden}`, { ...r }]));
  for (const r of incoming) {
    const key = `${r.vehicle_id}|${r.date}|${r.laden}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }
    for (const [k, v] of Object.entries(r)) {
      if (v !== undefined && v !== '') prev[k] = v;
    }
  }
  return [...byKey.values()];
}

export function ingestCommitPlugin() {
  return {
    name: 'ingest-commit-middleware',
    configureServer(server) {
      // 테스트 재현용 — 업로드 반영분을 전부 지우고 "실제 데이터 없음" 상태로 되돌린다.
      server.middlewares.use('/api/ingest-reset', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        res.setHeader('Content-Type', 'application/json');
        try {
          writeCsv(join(FILES2, 'vehicle_master.csv'), VEHICLE_MASTER_HEADER, []);
          writeCsv(join(FILES2, 'daily_summary.csv'), DAILY_SUMMARY_HEADER, []);
          for (const file of ['vehicles.json', 'eco.json', 'certificates.json', 'baseline_fuel.json', 'daily.json']) {
            rmSync(join(DATA_OUT, file), { force: true });
          }
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'reset_failed', message: String(err) }));
        }
      });

      server.middlewares.use('/api/ingest-commit', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

        res.setHeader('Content-Type', 'application/json');

        try {
          const isTruck = body.vehicleClass === 'truck';
          const { vehicleMasterRows, dailySummaryRows, skippedCount } = isTruck
            ? aggregateTruckRows(body.rows ?? [])
            : aggregateCarRows(body.rows ?? []);
          if (vehicleMasterRows.length === 0) {
            res.statusCode = 400;
            res.end(JSON.stringify({
              error: 'no_valid_rows',
              message: isTruck
                ? 'vehicle_id·일자가 있는 행이 하나도 없습니다 — 매핑 검토표에서 두 필드가 매핑됐는지 확인하세요.'
                : 'vehicle_id·주행시작시각·주행거리가 있는 행이 하나도 없습니다.',
            }));
            return;
          }

          const vehicleMasterPath = join(FILES2, 'vehicle_master.csv');
          const dailySummaryPath = join(FILES2, 'daily_summary.csv');

          const mergedVehicleMaster = upsertByVehicleId(readCsvIfExists(vehicleMasterPath), vehicleMasterRows);
          const mergedDailySummary = mergeByVehicleDateLaden(readCsvIfExists(dailySummaryPath), dailySummaryRows);

          writeCsv(vehicleMasterPath, VEHICLE_MASTER_HEADER, mergedVehicleMaster);
          writeCsv(dailySummaryPath, DAILY_SUMMARY_HEADER, mergedDailySummary);

          let buildLog = '';
          let buildOk = true;
          try {
            // 순서 고정. eco는 vehicles.json을, certificates는 trip/leg를, attribution은 certificates.json을 읽는다.
            // build-attribution을 빠뜨리면 모든 증명서의 corridor_id가 null로 남아 구간 드롭다운이 비어버린다.
            const env = buildEnv();
            const steps = [
              'build-vehicles.mjs',
              'build-eco.mjs',
              'build-truck-trips.mjs', // driving_legs_*.csv → trip/leg/event + 사업장·구간 시드
              'build-certificates.mjs',
              'build-attribution.mjs', // 구간귀속 판정을 certificates.json에 채워 넣는다
            ];
            for (const step of steps) {
              buildLog += execFileSync(process.execPath, [join(__dirname, step)], { cwd: ROOT, encoding: 'utf-8', env });
            }
          } catch (err) {
            buildOk = false;
            buildLog = String(err.stdout ?? '') + String(err.stderr ?? '') + String(err.message ?? '');
          }

          res.end(JSON.stringify({
            ok: true,
            vehiclesWritten: vehicleMasterRows.length,
            dailySummaryRowsWritten: dailySummaryRows.length,
            skippedRows: skippedCount,
            buildOk,
            buildLog,
          }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'commit_failed', message: String(err) }));
        }
      });
    },
  };
}
