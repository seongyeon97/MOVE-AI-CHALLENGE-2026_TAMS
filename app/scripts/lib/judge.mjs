// judge.mjs — §5.1~5.3 지표 계산과 신뢰등급 판정. **이 로직의 유일한 출처다.**
//
// 빌드 스크립트(build-vehicles.mjs)와 브라우저(Safe·Eco 화면의 기간 필터)가 같은 함수를 쓴다.
// 화면에서 조회 기간을 바꾸면 그 기간만 잘라 다시 판정해야 하는데, 클라이언트가 자기 나름대로
// 등급을 다시 계산하면 "새 판정 체계를 만들지 않는다"(§CLAUDE.md)가 깨진다 — 그래서 한 곳에 둔다.

import {
  idleLperHourOf,
  FUEL_PENALTY_MAX,
  FUEL_PENALTY_RATE_SCALE,
  FAINT_RATIO_THRESHOLD,
  RANK_INVERSION_MIN,
} from './constants.mjs';

export function blankBucket() {
  return { km: 0, accel: 0, start: 0, decel: 0, stop: 0, fuel: 0, idle: 0 };
}

export function blankSplit() {
  return { empty: blankBucket(), laden: blankBucket() };
}

/** daily_summary 한 행을 (empty|laden) 누적기에 더한다. laden 문자열/불리언 둘 다 받는다. */
export function addRowToSplit(split, row) {
  const laden = String(row.laden).toLowerCase() === 'true';
  const t = laden ? split.laden : split.empty;
  t.km += toNum(row.reported_km);
  t.accel += toNum(row.event_accel);
  t.start += toNum(row.event_start);
  t.decel += toNum(row.event_decel);
  t.stop += toNum(row.event_stop);
  t.fuel += toNum(row.fuel_l);
  t.idle += toNum(row.idle_sec);
  return split;
}

function toNum(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * (empty+laden) 집계에서 §5.1~5.3 지표를 계산한다.
 * 유류데이터가 없으면(fuel_l===0) fuel_implied_rate를 0이 아니라 null로 낸다 —
 * "연료로 봐도 문제없음"과 "연료 자체가 없어 대체 신호가 없음"은 다르다.
 */
export function computeMetrics(bucket, baseline, vehicleClass) {
  const reported_km = bucket.empty.km + bucket.laden.km;
  const core_events =
    bucket.empty.accel + bucket.empty.start + bucket.empty.decel + bucket.empty.stop +
    bucket.laden.accel + bucket.laden.start + bucket.laden.decel + bucket.laden.stop;
  const fuel_l = bucket.empty.fuel + bucket.laden.fuel;
  const idle_sec = bucket.empty.idle + bucket.laden.idle;
  const has_fuel_data = fuel_l > 0;

  const rate = reported_km > 0 ? core_events / reported_km : null;

  let fuel_implied_rate = null;
  let fuel_per_100km = null;
  let fuel_excess_pct = null;

  if (has_fuel_data) {
    const baseline_fuel_l =
      (baseline.kmpl_empty > 0 ? bucket.empty.km / baseline.kmpl_empty : 0) +
      (baseline.kmpl_laden > 0 ? bucket.laden.km / baseline.kmpl_laden : 0);
    const idle_fuel_l = (idle_sec / 3600) * idleLperHourOf(vehicleClass);
    const drive_fuel_l = fuel_l - idle_fuel_l;

    const fuel_excess = baseline_fuel_l > 0 ? drive_fuel_l / baseline_fuel_l - 1 : 0;
    const fuel_penalty = 1 - 1 / (1 + fuel_excess);
    fuel_implied_rate = Math.max(0, (fuel_penalty / FUEL_PENALTY_MAX) * FUEL_PENALTY_RATE_SCALE);
    fuel_per_100km = reported_km > 0 ? (drive_fuel_l / reported_km) * 100 : null;
    fuel_excess_pct = fuel_excess * 100;
  }

  const events_by_type = {
    accel: bucket.empty.accel + bucket.laden.accel,
    start: bucket.empty.start + bucket.laden.start,
    decel: bucket.empty.decel + bucket.laden.decel,
    stop: bucket.empty.stop + bucket.laden.stop,
  };

  return { reported_km, core_events, events_by_type, rate, fuel_l, has_fuel_data, fuel_implied_rate, fuel_per_100km, fuel_excess_pct };
}

/**
 * 관측·연료 순위를 매기고 rank_inversion·signal_ratio·grade를 채운다(제자리 수정).
 * metricsByVehicle: Map<vehicle_id, metrics>
 */
export function judge(metricsByVehicle) {
  // D 후보(주행거리 0)는 순위 계산에서 제외 — §5-2 "D등급은 순위에서 뺀다".
  const pool = [...metricsByVehicle.entries()].filter(([, m]) => m.reported_km > 0);
  // 연료 순위는 유류데이터가 있는 차량끼리만 — 없는 차량을 0건인 것처럼 끼워 넣지 않는다.
  const fuelPool = pool.filter(([, m]) => m.has_fuel_data);

  const byObserved = [...pool].sort((a, b) => a[1].rate - b[1].rate);
  const byFuel = [...fuelPool].sort((a, b) => a[1].fuel_implied_rate - b[1].fuel_implied_rate);
  const observedRank = new Map(byObserved.map(([id], i) => [id, i + 1]));
  const fuelRank = new Map(byFuel.map(([id], i) => [id, i + 1]));

  for (const [vehicleId, m] of metricsByVehicle) {
    const observed_rank = observedRank.get(vehicleId) ?? null;
    const fuel_rank = fuelRank.get(vehicleId) ?? null;
    const rank_inversion = observed_rank !== null && fuel_rank !== null ? fuel_rank - observed_rank : null;

    let signal_ratio;
    if (m.rate === null || !m.has_fuel_data) signal_ratio = null;
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
  return metricsByVehicle;
}
