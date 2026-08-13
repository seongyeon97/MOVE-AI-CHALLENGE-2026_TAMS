// build-vehicles.mjs — PRD §5.1~5.3 그대로. 등급판정 if/else 순서: D→A→C→B→정상.
// v2.1: 더미 212대 없음. vehicle_master.csv의 23대(트랙터13+승용10)가 전부다.
// monthly[] 5개월(2026-04~08)은 이 스크립트가 직접 채운다 — build-fleet.mjs는 만들지 않는다.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, writeJson, num } from './lib/csv.mjs';
import { resolveBaselineFuel } from './lib/baselineFuel.mjs';
import {
  IDLE_L_PER_HOUR,
  FUEL_PENALTY_MAX,
  FUEL_PENALTY_RATE_SCALE,
  FAINT_RATIO_THRESHOLD,
  RANK_INVERSION_MIN,
  GRADE_META,
} from './lib/constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const DATA_OUT = join(ROOT, 'public', 'data');
const FUEL_CACHE = join(ROOT, 'public', 'fixtures', 'fuel_economy_cache.json');

export const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}

/** daily_summary 행들을 vehicle_id → month → laden 으로 묶어 합산한다. */
function aggregateDailySummary(rows) {
  const byVehicleMonth = new Map(); // vehicle_id -> month -> { empty, laden } accumulators

  const blank = () => ({ km: 0, accel: 0, start: 0, decel: 0, stop: 0, fuel: 0, idle: 0 });

  for (const row of rows) {
    const vehicleId = row.vehicle_id;
    const month = monthOf(row.date);
    if (!byVehicleMonth.has(vehicleId)) byVehicleMonth.set(vehicleId, new Map());
    const byMonth = byVehicleMonth.get(vehicleId);
    if (!byMonth.has(month)) byMonth.set(month, { empty: blank(), laden: blank() });
    const bucket = byMonth.get(month);
    const laden = String(row.laden).toLowerCase() === 'true';
    const target = laden ? bucket.laden : bucket.empty;
    target.km += num(row.reported_km);
    target.accel += num(row.event_accel);
    target.start += num(row.event_start);
    target.decel += num(row.event_decel);
    target.stop += num(row.event_stop);
    target.fuel += num(row.fuel_l);
    target.idle += num(row.idle_sec);
  }

  return byVehicleMonth;
}

/** 한 달치 (empty+laden) 집계에서 §5.1~5.3 지표를 계산한다. baseline 인자 없으면(D 후보 등) 연료 지표는 0. */
function computeMonthMetrics(bucket, baseline) {
  const reported_km = bucket.empty.km + bucket.laden.km;
  const core_events =
    bucket.empty.accel + bucket.empty.start + bucket.empty.decel + bucket.empty.stop +
    bucket.laden.accel + bucket.laden.start + bucket.laden.decel + bucket.laden.stop;
  const fuel_l = bucket.empty.fuel + bucket.laden.fuel;
  const idle_sec = bucket.empty.idle + bucket.laden.idle;

  const rate = reported_km > 0 ? core_events / reported_km : null;

  const baseline_fuel_l =
    (baseline.kmpl_empty > 0 ? bucket.empty.km / baseline.kmpl_empty : 0) +
    (baseline.kmpl_laden > 0 ? bucket.laden.km / baseline.kmpl_laden : 0);
  const idle_fuel_l = (idle_sec / 3600) * IDLE_L_PER_HOUR;
  const drive_fuel_l = fuel_l - idle_fuel_l;

  const fuel_excess = baseline_fuel_l > 0 ? drive_fuel_l / baseline_fuel_l - 1 : 0;
  const fuel_penalty = 1 - 1 / (1 + fuel_excess);
  const fuel_implied_rate = Math.max(0, (fuel_penalty / FUEL_PENALTY_MAX) * FUEL_PENALTY_RATE_SCALE);

  const fuel_per_100km = reported_km > 0 ? (drive_fuel_l / reported_km) * 100 : null;
  const fuel_excess_pct = fuel_excess * 100;

  const events_by_type = {
    accel: bucket.empty.accel + bucket.laden.accel,
    start: bucket.empty.start + bucket.laden.start,
    decel: bucket.empty.decel + bucket.laden.decel,
    stop: bucket.empty.stop + bucket.laden.stop,
  };

  return { reported_km, core_events, events_by_type, rate, fuel_l, fuel_implied_rate, fuel_per_100km, fuel_excess_pct };
}

/** 관측 발생률·연료시사발생률 순위를 매기고 rank_inversion·signal_ratio·grade를 채운다. */
function judgeMonth(metricsByVehicle) {
  // D 후보(주행거리 0)는 순위 계산에서 제외 — §5-2 "D등급은 순위에서 뺀다".
  const pool = [...metricsByVehicle.entries()].filter(([, m]) => m.reported_km > 0);

  const byObserved = [...pool].sort((a, b) => a[1].rate - b[1].rate);
  const byFuel = [...pool].sort((a, b) => a[1].fuel_implied_rate - b[1].fuel_implied_rate);
  const observedRank = new Map(byObserved.map(([id], i) => [id, i + 1]));
  const fuelRank = new Map(byFuel.map(([id], i) => [id, i + 1]));

  for (const [vehicleId, m] of metricsByVehicle) {
    const observed_rank = observedRank.get(vehicleId) ?? null;
    const fuel_rank = fuelRank.get(vehicleId) ?? null;
    const rank_inversion = observed_rank !== null && fuel_rank !== null ? fuel_rank - observed_rank : null;

    let signal_ratio;
    if (m.rate === null) signal_ratio = null;
    else if (m.rate === 0 && m.fuel_implied_rate === 0) signal_ratio = Infinity;
    else if (m.fuel_implied_rate === 0) signal_ratio = Infinity;
    else signal_ratio = m.rate / m.fuel_implied_rate;

    const contradicts =
      signal_ratio !== null &&
      signal_ratio < FAINT_RATIO_THRESHOLD &&
      rank_inversion !== null &&
      rank_inversion >= RANK_INVERSION_MIN;

    // if/else 순서 그대로: D → A → C → B → 정상
    let grade;
    if (m.reported_km === 0 && m.core_events > 0) grade = 'D';
    else if (m.rate !== null && m.rate > 1.0) grade = 'A';
    else if (m.rate === 0 && m.reported_km > 100) grade = 'C';
    else if (contradicts) grade = 'B';
    else grade = '정상';

    Object.assign(m, { observed_rank, fuel_rank, rank_inversion, signal_ratio, grade });
  }
}

async function main() {
  const vehicleMaster = readCsv(join(FILES2, 'vehicle_master.csv'));
  const dailySummary = readCsv(join(FILES2, 'daily_summary.csv'));

  const baselineFuel = await resolveBaselineFuel(vehicleMaster, { cachePath: FUEL_CACHE });
  writeJson(join(DATA_OUT, 'baseline_fuel.json'), baselineFuel);

  const byVehicleMonth = aggregateDailySummary(dailySummary);

  // 월별로 전체 차량 지표를 먼저 계산해야 그 달의 순위(관측↔연료)를 매길 수 있다.
  const metricsByMonth = new Map(); // month -> Map<vehicle_id, metrics>
  for (const month of MONTHS) metricsByMonth.set(month, new Map());

  for (const vehicle of vehicleMaster) {
    const baseline = baselineFuel[vehicle.vehicle_id];
    const byMonth = byVehicleMonth.get(vehicle.vehicle_id) ?? new Map();
    for (const month of MONTHS) {
      const bucket = byMonth.get(month) ?? {
        empty: { km: 0, accel: 0, start: 0, decel: 0, stop: 0, fuel: 0, idle: 0 },
        laden: { km: 0, accel: 0, start: 0, decel: 0, stop: 0, fuel: 0, idle: 0 },
      };
      const metrics = computeMonthMetrics(bucket, baseline);
      metricsByMonth.get(month).set(vehicle.vehicle_id, metrics);
    }
  }

  for (const month of MONTHS) judgeMonth(metricsByMonth.get(month));

  const vehicles = vehicleMaster.map((vehicle) => {
    const id = vehicle.vehicle_id;
    const baseline = baselineFuel[id];
    const monthly = MONTHS.map((month) => {
      const m = metricsByMonth.get(month).get(id);
      return {
        month,
        reported_km: m.reported_km,
        core_events: m.core_events,
        events_by_type: m.events_by_type,
        rate: m.rate,
        fuel_implied_rate: m.fuel_implied_rate,
        grade: m.grade,
        fuel_l: m.fuel_l,
        fuel_per_100km: m.fuel_per_100km,
        fuel_excess_pct: m.fuel_excess_pct,
        observed_rank: m.observed_rank,
        fuel_rank: m.fuel_rank,
      };
    });
    const latest = monthly[monthly.length - 1];
    const meta = GRADE_META[latest.grade];

    return {
      vehicle_id: id,
      vehicle_class: vehicle.vehicle_class,
      device_model: vehicle.device_model,
      maker: vehicle.maker,
      model: vehicle.model,
      year: num(vehicle.year),
      baseline,
      grade: latest.grade,
      grade_label: meta.label,
      tone: meta.tone,
      verifiable: meta.verifiable,
      settle: meta.settle,
      verdict: meta.verdict,
      reported_km: latest.reported_km,
      core_events: latest.core_events,
      events_by_type: latest.events_by_type,
      rate: latest.rate,
      fuel_implied_rate: latest.fuel_implied_rate,
      fuel_l: latest.fuel_l,
      fuel_per_100km: latest.fuel_per_100km,
      fuel_excess_pct: latest.fuel_excess_pct,
      observed_rank: latest.observed_rank,
      fuel_rank: latest.fuel_rank,
      monthly,
    };
  });

  writeJson(join(DATA_OUT, 'vehicles.json'), vehicles);

  const gradeCounts = vehicles.reduce((acc, v) => {
    acc[v.grade] = (acc[v.grade] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`vehicles.json: ${vehicles.length}대`, gradeCounts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
