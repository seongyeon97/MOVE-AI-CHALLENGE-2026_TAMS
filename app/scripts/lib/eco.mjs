// eco.mjs — 배출량·Tier 산정. **이 로직의 유일한 출처다.**
// 빌드 스크립트(build-eco.mjs)와 브라우저(Eco 화면 기간 필터)가 같은 함수를 쓴다.
//
// 표기 규칙(§CLAUDE.md 5-6) — 기본계수 대비 실측의 차이는 "감축량"이 아니라 계측 오차,
// 기준연비 초과분은 실적이 아니라 감축 여지(상한). Tier와 신뢰등급은 별도 축이며 합산하지 않는다.

import { CO2_KG_PER_L, idleLperHourOf, BASELINE_G_CO2_PER_TONKM } from './constants.mjs';

// 트랙터 컨테이너 규격 가정 — vehicle_master에 규격 필드가 없어 40ft로 고정.
export const TONNAGE_40FT = 30.5;

export function tierOf(fuel_l) {
  return fuel_l > 0 ? 3 : 1;
}

/**
 * 한 차량의 배출 지표. bucket은 { empty:{km,fuel,idle}, laden:{km,fuel,idle} }.
 * 승용차는 톤킬로가 성립하지 않으므로 gCO2/km로 낸다(§3.2 Scope 구분).
 */
export function computeEco(bucket, baseline, vehicleClass) {
  const distance_km = bucket.empty.km + bucket.laden.km;
  const fuel_l = bucket.empty.fuel + bucket.laden.fuel;
  const idle_sec = bucket.empty.idle + bucket.laden.idle;
  const idle_l_per_hour = idleLperHourOf(vehicleClass);
  const idle_fuel_l = (idle_sec / 3600) * idle_l_per_hour;
  const drive_fuel_l = fuel_l - idle_fuel_l;

  const baseline_fuel_l =
    (baseline.kmpl_empty > 0 ? bucket.empty.km / baseline.kmpl_empty : 0) +
    (baseline.kmpl_laden > 0 ? bucket.laden.km / baseline.kmpl_laden : 0);

  const tier = tierOf(fuel_l);
  // Tier 3(실측 있음): 실측 연료로 CO2 산정. Tier 1(실측 없음): 기준연비+공회전 추정으로 대체.
  const fuelForCo2 = tier === 3 ? fuel_l : baseline_fuel_l + idle_fuel_l;
  const co2_kg = fuelForCo2 * CO2_KG_PER_L;

  const isTruck = vehicleClass === 'truck';
  const ton_km = isTruck ? bucket.laden.km * TONNAGE_40FT : 0;
  const g_co2_per_tonkm = isTruck && ton_km > 0 ? (co2_kg * 1000) / ton_km : null;
  const g_co2_per_km = !isTruck && distance_km > 0 ? (co2_kg * 1000) / distance_km : null;

  const baseline_co2_kg = isTruck && ton_km > 0 ? (ton_km * BASELINE_G_CO2_PER_TONKM) / 1000 : null;
  const measurement_gap_kg = baseline_co2_kg !== null ? co2_kg - baseline_co2_kg : null; // 계측 오차

  const excessFuelL = Math.max(0, drive_fuel_l - baseline_fuel_l);
  const reduction_headroom_kg = excessFuelL * CO2_KG_PER_L; // 감축 여지(상한)

  const empty_share = distance_km > 0 ? bucket.empty.km / distance_km : 0;

  return {
    tier,
    distance_km,
    fuel_l,
    co2_kg,
    ton_km: isTruck ? ton_km : null,
    g_co2_per_tonkm,
    g_co2_per_km,
    measurement_gap_kg,
    reduction_headroom_kg,
    empty_share,
    // 증명서 산출근거 표기에 쓰는 중간값 — 어떤 수로 어떻게 나왔는지 화면에서 그대로 보여준다.
    basis: { idle_fuel_l, drive_fuel_l, baseline_fuel_l, baseline_co2_kg, co2_factor: CO2_KG_PER_L, idle_l_per_hour, tonnage: isTruck ? TONNAGE_40FT : null, baseline_g_co2_per_tonkm: BASELINE_G_CO2_PER_TONKM },
  };
}
