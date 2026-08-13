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

/** vehicle_id 기준으로 새 행이 기존 행을 덮어쓴다(같은 차량 재업로드 시 최신 매핑으로 갱신). */
function upsertByVehicleId(existing, incoming) {
  const byId = new Map(existing.map((r) => [r.vehicle_id, r]));
  for (const r of incoming) byId.set(r.vehicle_id, r);
  return [...byId.values()];
}

/** (vehicle_id, date, laden) 기준으로 기존 행을 새 집계로 교체한다(같은 파일 재업로드 시 이중 합산 방지). */
function replaceByVehicleDateLaden(existing, incoming) {
  const incomingKeys = new Set(incoming.map((r) => `${r.vehicle_id}|${r.date}|${r.laden}`));
  const kept = existing.filter((r) => !incomingKeys.has(`${r.vehicle_id}|${r.date}|${r.laden}`));
  return [...kept, ...incoming];
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

        if (body.vehicleClass !== 'car') {
          res.statusCode = 501;
          res.end(JSON.stringify({ error: 'truck_not_supported', message: '화물차 원시 로그(2분 간격 DTG) 반영은 아직 구현되지 않았습니다.' }));
          return;
        }

        try {
          const { vehicleMasterRows, dailySummaryRows, skippedCount } = aggregateCarRows(body.rows ?? []);
          if (vehicleMasterRows.length === 0) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'no_valid_rows', message: 'vehicle_id·주행시작시각·주행거리가 있는 행이 하나도 없습니다.' }));
            return;
          }

          const vehicleMasterPath = join(FILES2, 'vehicle_master.csv');
          const dailySummaryPath = join(FILES2, 'daily_summary.csv');

          const mergedVehicleMaster = upsertByVehicleId(readCsvIfExists(vehicleMasterPath), vehicleMasterRows);
          const mergedDailySummary = replaceByVehicleDateLaden(readCsvIfExists(dailySummaryPath), dailySummaryRows);

          writeCsv(vehicleMasterPath, VEHICLE_MASTER_HEADER, mergedVehicleMaster);
          writeCsv(dailySummaryPath, DAILY_SUMMARY_HEADER, mergedDailySummary);

          let buildLog = '';
          let buildOk = true;
          try {
            // build-vehicles → build-eco 순서. eco는 vehicles.json을 읽으므로 순서가 뒤집히면 안 된다.
            const env = buildEnv();
            buildLog = execFileSync(process.execPath, [join(__dirname, 'build-vehicles.mjs')], { cwd: ROOT, encoding: 'utf-8', env });
            buildLog += execFileSync(process.execPath, [join(__dirname, 'build-eco.mjs')], { cwd: ROOT, encoding: 'utf-8', env });
            buildLog += execFileSync(process.execPath, [join(__dirname, 'build-certificates.mjs')], { cwd: ROOT, encoding: 'utf-8', env });
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
