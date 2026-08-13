// runIntegrityCheck.ts — R2~R5 물리 정합성 검사. §산출기준서 1-4, §PRD 5.4.
// 샘플링 간격 120초 이상이면 R3·R4는 "판정 보류"로 표기하고 통과 처리하지 않는다 — 검출 못 한 걸 검출한 척하지 않는다.
import {
  R2_MAX_AVG_SPEED_KMH,
  R3_MAX_INTEGRAL_DEVIATION,
  R4_MIN_DUPLICATE_RUN,
  R5_MAX_ODO_JUMP_SPEED_KMH,
  R5_MIN_ODO_REGRESSION,
  SAMPLING_INTERVAL_HOLD_SEC,
} from '../../scripts/lib/constants.mjs';

export type LogPoint = { ts: string; lat: number; lon: number; speed_kmh: number; rpm: number; odo_km: number };

export type CheckVerdict = 'pass' | 'fail' | 'hold';

export type IntegrityResult = {
  sampling_interval_sec: number;
  r2: { verdict: CheckVerdict; avg_speed_kmh: number };
  r3: { verdict: CheckVerdict; deviation_pct: number | null };
  r4: { verdict: CheckVerdict; duplicate_run_found: boolean | null };
  r5: { verdict: CheckVerdict; regression_found: boolean; jump_found: boolean };
};

function medianSamplingIntervalSec(points: LogPoint[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i++) {
    deltas.push((new Date(points[i].ts).getTime() - new Date(points[i - 1].ts).getTime()) / 1000);
  }
  if (deltas.length === 0) return 0;
  const sorted = [...deltas].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function runIntegrityCheck(points: LogPoint[]): IntegrityResult {
  const sampling_interval_sec = medianSamplingIntervalSec(points);
  const canResolveFineGrained = sampling_interval_sec > 0 && sampling_interval_sec < SAMPLING_INTERVAL_HOLD_SEC;

  // R2 — 이동구간(간격>600초는 정차로 skip) 평균속도
  let movingSpeedSum = 0;
  let movingCount = 0;
  for (let i = 1; i < points.length; i++) {
    const dtSec = (new Date(points[i].ts).getTime() - new Date(points[i - 1].ts).getTime()) / 1000;
    if (dtSec > 600) continue;
    movingSpeedSum += points[i].speed_kmh;
    movingCount += 1;
  }
  const avg_speed_kmh = movingCount > 0 ? movingSpeedSum / movingCount : 0;
  const r2: IntegrityResult['r2'] = { verdict: avg_speed_kmh > R2_MAX_AVG_SPEED_KMH ? 'fail' : 'pass', avg_speed_kmh };

  // R3 — 속도적분 vs 누적거리 괴리
  let r3: IntegrityResult['r3'];
  if (!canResolveFineGrained) {
    r3 = { verdict: 'hold', deviation_pct: null };
  } else {
    let integralKm = 0;
    for (let i = 1; i < points.length; i++) {
      const dtHour = (new Date(points[i].ts).getTime() - new Date(points[i - 1].ts).getTime()) / 3_600_000;
      integralKm += ((points[i - 1].speed_kmh + points[i].speed_kmh) / 2) * dtHour;
    }
    const totalOdoKm = points.length > 0 ? points[points.length - 1].odo_km - points[0].odo_km : 0;
    const deviation_pct = totalOdoKm > 0 ? (Math.abs(integralKm - totalOdoKm) / totalOdoKm) * 100 : 0;
    r3 = { verdict: deviation_pct / 100 > R3_MAX_INTEGRAL_DEVIATION ? 'fail' : 'pass', deviation_pct };
  }

  // R4 — (위도,경도,속도,회전수) 완전 일치 시퀀스 5행 이상 연속
  let r4: IntegrityResult['r4'];
  if (!canResolveFineGrained) {
    r4 = { verdict: 'hold', duplicate_run_found: null };
  } else {
    let runLen = 1;
    let found = false;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const same = a.lat === b.lat && a.lon === b.lon && a.speed_kmh === b.speed_kmh && a.rpm === b.rpm;
      runLen = same ? runLen + 1 : 1;
      if (runLen >= R4_MIN_DUPLICATE_RUN) { found = true; break; }
    }
    r4 = { verdict: found ? 'fail' : 'pass', duplicate_run_found: found };
  }

  // R5 — 누적거리 역행 또는 순간환산속도 비정상 점프
  let regression_found = false;
  let jump_found = false;
  for (let i = 1; i < points.length; i++) {
    const dOdo = points[i].odo_km - points[i - 1].odo_km;
    if (dOdo < R5_MIN_ODO_REGRESSION) regression_found = true;
    const dtHour = (new Date(points[i].ts).getTime() - new Date(points[i - 1].ts).getTime()) / 3_600_000;
    const impliedSpeed = dtHour > 0 ? dOdo / dtHour : 0;
    if (impliedSpeed > R5_MAX_ODO_JUMP_SPEED_KMH) jump_found = true;
  }
  const r5: IntegrityResult['r5'] = { verdict: regression_found || jump_found ? 'fail' : 'pass', regression_found, jump_found };

  return { sampling_interval_sec, r2, r3, r4, r5 };
}
