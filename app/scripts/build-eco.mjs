// build-eco.mjs — PRD §3.2/§5.5. Scope 1과 Scope 3을 합산하지 않는다. 승용차 원단위는 gCO2/km(톤킬로 없음).
// tierOf(v) = v.fuel_l > 0 ? 3 : 1 그대로. "감축량"이라는 말은 쓰지 않는다 — 계측 오차 / 감축 여지(상한)만 쓴다.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { readCsv, writeJson, num } from './lib/csv.mjs';
import { CO2_KG_PER_L, IDLE_L_PER_HOUR, BASELINE_G_CO2_PER_TONKM } from './lib/constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const DATA_OUT = join(ROOT, 'public', 'data');

const TONNAGE_40FT = 30.5; // 트랙터 컨테이너 규격 가정 — vehicle_master에 규격 필드가 없어 40ft로 고정.

function tierOf(fuel_l) {
  return fuel_l > 0 ? 3 : 1;
}

function main() {
  const vehicleMaster = readCsv(join(FILES2, 'vehicle_master.csv'));
  const dailySummary = readCsv(join(FILES2, 'daily_summary.csv'));
  const baselineFuel = JSON.parse(readFileSync(join(DATA_OUT, 'baseline_fuel.json'), 'utf-8'));
  const vehiclesJson = JSON.parse(readFileSync(join(DATA_OUT, 'vehicles.json'), 'utf-8'));
  const vehicleById = new Map(vehiclesJson.map((v) => [v.vehicle_id, v]));

  // vehicle_id -> { empty:{km,fuel,idle}, laden:{km,fuel,idle} } 전체 5개월 합산
  const totals = new Map();
  const blank = () => ({ km: 0, fuel: 0, idle: 0 });
  for (const row of dailySummary) {
    if (!totals.has(row.vehicle_id)) totals.set(row.vehicle_id, { empty: blank(), laden: blank() });
    const bucket = totals.get(row.vehicle_id);
    const target = String(row.laden).toLowerCase() === 'true' ? bucket.laden : bucket.empty;
    target.km += num(row.reported_km);
    target.fuel += num(row.fuel_l);
    target.idle += num(row.idle_sec);
  }

  const rows = vehicleMaster.map((vm) => {
    const id = vm.vehicle_id;
    const baseline = baselineFuel[id];
    const t = totals.get(id) ?? { empty: blank(), laden: blank() };
    const distance_km = t.empty.km + t.laden.km;
    const fuel_l = t.empty.fuel + t.laden.fuel;
    const idle_sec = t.empty.idle + t.laden.idle;
    const idle_fuel_l = (idle_sec / 3600) * IDLE_L_PER_HOUR;
    const drive_fuel_l = fuel_l - idle_fuel_l;

    const baseline_fuel_l =
      (baseline.kmpl_empty > 0 ? t.empty.km / baseline.kmpl_empty : 0) +
      (baseline.kmpl_laden > 0 ? t.laden.km / baseline.kmpl_laden : 0);

    const tier = tierOf(fuel_l);
    // Tier 3(실측 있음): 실측 연료로 CO2 산정. Tier 1(실측 없음): 기준연비+공회전 추정으로 대체.
    const fuelForCo2 = tier === 3 ? fuel_l : baseline_fuel_l + idle_fuel_l;
    const co2_kg = fuelForCo2 * CO2_KG_PER_L;

    const isTruck = vm.vehicle_class === 'truck';
    const ton_km = isTruck ? t.laden.km * TONNAGE_40FT : 0;
    const g_co2_per_tonkm = isTruck && ton_km > 0 ? (co2_kg * 1000) / ton_km : null;
    const g_co2_per_km = !isTruck && distance_km > 0 ? (co2_kg * 1000) / distance_km : null;

    const baseline_co2_kg = isTruck && ton_km > 0 ? (ton_km * BASELINE_G_CO2_PER_TONKM) / 1000 : null;
    const measurement_gap_kg = baseline_co2_kg !== null ? co2_kg - baseline_co2_kg : null; // "계측 오차" — 감축량 아님

    const excessFuelL = Math.max(0, drive_fuel_l - baseline_fuel_l);
    const reduction_headroom_kg = excessFuelL * CO2_KG_PER_L; // "감축 여지"(상한) — 실적 아님

    const empty_share = distance_km > 0 ? t.empty.km / distance_km : 0;

    const vehicle = vehicleById.get(id);

    return {
      vehicle_id: id,
      vehicle_class: vm.vehicle_class,
      scope: 1, // 전부 자가운송 가정(협력사 위탁 구분 데이터 없음) — Scope 3 Cat.4는 위탁 데이터 확보 시 분리
      grade: vehicle?.grade ?? null,
      tone: vehicle?.tone ?? null,
      tier,
      baseline,
      distance_km,
      fuel_l,
      co2_kg,
      ton_km: isTruck ? ton_km : null,
      g_co2_per_tonkm,
      g_co2_per_km,
      measurement_gap_kg,
      reduction_headroom_kg,
      empty_share,
    };
  });

  writeJson(join(DATA_OUT, 'eco.json'), rows);

  const totalCo2Ton = rows.reduce((s, r) => s + r.co2_kg, 0) / 1000;
  const tier3Co2 = rows.filter((r) => r.tier === 3).reduce((s, r) => s + r.co2_kg, 0);
  const totalCo2 = rows.reduce((s, r) => s + r.co2_kg, 0);
  const primaryDataPct = totalCo2 > 0 ? (tier3Co2 / totalCo2) * 100 : 0;
  console.log(`eco.json: ${rows.length}대, 총 ${totalCo2Ton.toFixed(2)}tCO2e, 1차데이터비율 ${primaryDataPct.toFixed(1)}%`);
}

main();
