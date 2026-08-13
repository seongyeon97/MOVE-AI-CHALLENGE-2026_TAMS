// runFuelDispatchCheck.ts — F1(연료 대비 과다연비)·F2(제출거리 vs 배차거리 괴리). §산출기준서 없음, BUILD_SEQUENCE 트랙12.
import { DISPATCH_DISTANCE_TOLERANCE } from '../../scripts/lib/constants.mjs';

export type FuelDispatchInput = {
  submitted_distance_km: number;
  dispatch_distance_km: number;
  fuel_l: number;
  baseline_kmpl: number;
};

export type FuelDispatchResult = {
  measured_kmpl: number;
  f1_fuel_exceeds_baseline: boolean;
  f2_distance_mismatch: boolean;
  f2_deviation_pct: number;
};

export function runFuelDispatchCheck(input: FuelDispatchInput): FuelDispatchResult {
  const measured_kmpl = input.fuel_l > 0 ? input.submitted_distance_km / input.fuel_l : 0;
  const f1_fuel_exceeds_baseline = measured_kmpl > input.baseline_kmpl;

  const f2_deviation_pct =
    input.dispatch_distance_km > 0
      ? (Math.abs(input.submitted_distance_km - input.dispatch_distance_km) / input.dispatch_distance_km) * 100
      : 0;
  const f2_distance_mismatch = f2_deviation_pct / 100 > DISPATCH_DISTANCE_TOLERANCE;

  return { measured_kmpl, f1_fuel_exceeds_baseline, f2_distance_mismatch, f2_deviation_pct };
}
