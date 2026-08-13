// build-vehicles.mjs — PRD §5.1~5.3 그대로. 등급판정 if/else 순서: D→A→C→B→정상.
// v2.1: 더미 212대 없음. vehicle_master.csv의 23대(트랙터13+승용10)가 전부다.
// monthly[] 5개월(2026-04~08)은 이 스크립트가 직접 채운다 — build-fleet.mjs는 만들지 않는다.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, writeJson, num } from './lib/csv.mjs';
import { resolveBaselineFuel } from './lib/baselineFuel.mjs';
import { GRADE_META } from './lib/constants.mjs';
import { computeMetrics, judge, blankSplit, addRowToSplit } from './lib/judge.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const DATA_OUT = join(ROOT, 'public', 'data');
const FUEL_CACHE = join(ROOT, 'public', 'fixtures', 'fuel_economy_cache.json');

function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}

/** daily_summary.csv에 실제로 있는 월 중 최근 5개(부족하면 있는 만큼) — 실측 데이터 기간에 맞춘다. */
function deriveMonths(dailySummary) {
  const months = [...new Set(dailySummary.map((r) => monthOf(r.date)))].sort();
  return months.slice(-5);
}

/** daily_summary 행들을 vehicle_id → month → laden 으로 묶어 합산한다. */
function aggregateDailySummary(rows) {
  const byVehicleMonth = new Map(); // vehicle_id -> month -> { empty, laden } accumulators

  for (const row of rows) {
    const vehicleId = row.vehicle_id;
    const month = monthOf(row.date);
    if (!byVehicleMonth.has(vehicleId)) byVehicleMonth.set(vehicleId, new Map());
    const byMonth = byVehicleMonth.get(vehicleId);
    if (!byMonth.has(month)) byMonth.set(month, blankSplit());
    addRowToSplit(byMonth.get(month), row);
  }

  return byVehicleMonth;
}


async function main() {
  const vehicleMaster = readCsv(join(FILES2, 'vehicle_master.csv'));
  const dailySummary = readCsv(join(FILES2, 'daily_summary.csv'));

  const baselineFuel = await resolveBaselineFuel(vehicleMaster, { cachePath: FUEL_CACHE });
  writeJson(join(DATA_OUT, 'baseline_fuel.json'), baselineFuel);

  const byVehicleMonth = aggregateDailySummary(dailySummary);
  const MONTHS = deriveMonths(dailySummary);
  if (MONTHS.length === 0) throw new Error('daily_summary.csv에 유효한 날짜가 없습니다.');

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
      const metrics = computeMetrics(bucket, baseline);
      metricsByMonth.get(month).set(vehicle.vehicle_id, metrics);
    }
  }

  for (const month of MONTHS) judge(metricsByMonth.get(month));

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
        has_fuel_data: m.has_fuel_data,
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
      has_fuel_data: latest.has_fuel_data,
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

  // daily.json — 화면에서 조회 기간을 바꿔 다시 집계할 수 있게 일자별 원자료를 그대로 내보낸다.
  // 차량마다 데이터 보유 기간이 3일~154일로 제각각이라, 전체 기간 한 덩어리로만 보여주면
  // 짧게 찍힌 차량과 길게 찍힌 차량이 같은 표에서 비교돼버린다.
  // 행이 1만 줄대라 배열 튜플로 압축해서 낸다(키 반복 제거).
  const dailyRows = dailySummary
    .filter((r) => r.date)
    .map((r) => [
      r.vehicle_id,
      r.date,
      String(r.laden).toLowerCase() === 'true' ? 1 : 0,
      num(r.reported_km),
      num(r.event_accel),
      num(r.event_start),
      num(r.event_decel),
      num(r.event_stop),
      num(r.fuel_l),
      num(r.idle_sec),
    ]);
  const dates = dailyRows.map((r) => r[1]).sort();

  writeJson(join(DATA_OUT, 'daily.json'), {
    meta: {
      columns: ['vehicle_id', 'date', 'laden', 'reported_km', 'event_accel', 'event_start', 'event_decel', 'event_stop', 'fuel_l', 'idle_sec'],
      date_min: dates[0] ?? null,
      date_max: dates[dates.length - 1] ?? null,
      row_count: dailyRows.length,
    },
    vehicles: vehicleMaster.map((v) => ({
      vehicle_id: v.vehicle_id,
      vehicle_class: v.vehicle_class,
      device_model: v.device_model,
      maker: v.maker,
      model: v.model,
      year: num(v.year),
      baseline: baselineFuel[v.vehicle_id],
    })),
    rows: dailyRows,
  });

  const gradeCounts = vehicles.reduce((acc, v) => {
    acc[v.grade] = (acc[v.grade] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`vehicles.json: ${vehicles.length}대`, gradeCounts);
  console.log(`daily.json: ${dailyRows.length}행 (${dates[0]} ~ ${dates[dates.length - 1]})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
