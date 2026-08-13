// build-eco.mjs — PRD §3.2/§5.5. Scope 1과 Scope 3을 합산하지 않는다. 승용차 원단위는 gCO2/km(톤킬로 없음).
// tierOf(v) = v.fuel_l > 0 ? 3 : 1 그대로. "감축량"이라는 말은 쓰지 않는다 — 계측 오차 / 감축 여지(상한)만 쓴다.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { readCsv, writeJson, num } from './lib/csv.mjs';
import { computeEco } from './lib/eco.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const DATA_OUT = join(ROOT, 'public', 'data');

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
    const eco = computeEco(t, baseline, vm.vehicle_class);
    const vehicle = vehicleById.get(id);

    return {
      vehicle_id: id,
      vehicle_class: vm.vehicle_class,
      scope: 1, // 전부 자가운송 가정(협력사 위탁 구분 데이터 없음) — Scope 3 Cat.4는 위탁 데이터 확보 시 분리
      grade: vehicle?.grade ?? null,
      tone: vehicle?.tone ?? null,
      baseline,
      ...eco,
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
