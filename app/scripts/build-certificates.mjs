// build-certificates.mjs — trip/leg/event.csv 조합, CO2 계산, 연속운전 블록 분리.
// vehicles.json(build-vehicles.mjs 산출)의 등급·settle을 그대로 참조한다 — 여기서 새로 판정하지 않는다.
// 이 파일은 "운송건 1개"의 원재료다. 증명서 화면(트랙5)이 구간+기간으로 여러 건을 묶어 1장 발급한다.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { readCsv, writeJson, num } from './lib/csv.mjs';
import { CO2_KG_PER_L, CONTINUOUS_DRIVE_LIMIT_SEC, IDLE_L_PER_HOUR } from './lib/constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const DATA_OUT = join(ROOT, 'public', 'data');

const TONNAGE_BY_CONTAINER = { '40ft': 30.5, '20ft': 21.0 };

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}

function main() {
  const trips = readCsv(join(FILES2, 'trip.csv'));
  const legs = readCsv(join(FILES2, 'leg.csv'));
  const events = readCsv(join(FILES2, 'event.csv'));
  const vehicles = readCsv(join(FILES2, 'vehicle_master.csv'));
  const vehiclesJson = JSON.parse(
    // build-vehicles.mjs가 먼저 실행되어 있어야 한다(build-all.mjs가 순서 보장).
    readCsvJsonSafe(join(DATA_OUT, 'vehicles.json')),
  );
  const vehicleById = new Map(vehiclesJson.map((v) => [v.vehicle_id, v]));
  const vehicleMasterById = new Map(vehicles.map((v) => [v.vehicle_id, v]));

  const legsByTrip = groupBy(legs, 'trip_id');
  const eventsByTrip = groupBy(events, 'trip_id');

  const certificates = trips.map((trip) => {
    const tripLegs = legsByTrip.get(trip.trip_id) ?? [];
    const tripEvents = eventsByTrip.get(trip.trip_id) ?? [];
    const vehicleMaster = vehicleMasterById.get(trip.vehicle_id);
    const vehicle = vehicleById.get(trip.vehicle_id);
    const month = monthOf(trip.date);

    // 안전 — 4종 이벤트 건수 + 연속운전 블록
    const eventCounts = { accel: 0, start: 0, decel: 0, stop: 0 };
    for (const e of tripEvents) {
      if (eventCounts[e.event_type] !== undefined) eventCounts[e.event_type] += 1;
    }
    const core_events = eventCounts.accel + eventCounts.start + eventCounts.decel + eventCounts.stop;

    const legBlocks = tripLegs.map((leg) => {
      const startMs = new Date(leg.start_ts).getTime();
      const endMs = new Date(leg.end_ts).getTime();
      return { leg_id: leg.leg_id, laden: leg.laden === 'true', duration_sec: Math.round((endMs - startMs) / 1000) };
    });
    const max_continuous_block_sec = legBlocks.reduce((max, b) => Math.max(max, b.duration_sec), 0);
    const continuous_drive_compliant = max_continuous_block_sec <= CONTINUOUS_DRIVE_LIMIT_SEC;

    // 친환경 — CO2·원단위·공차비중
    const totalDistanceKm = tripLegs.reduce((sum, l) => sum + num(l.distance_km), 0);
    const totalFuelL = tripLegs.reduce((sum, l) => sum + num(l.fuel_l), 0);
    const totalIdleSec = tripLegs.reduce((sum, l) => sum + num(l.idle_sec), 0);
    const emptyKm = tripLegs.filter((l) => l.laden === 'false').reduce((s, l) => s + num(l.distance_km), 0);
    const emptyShare = totalDistanceKm > 0 ? emptyKm / totalDistanceKm : 0;

    const co2_kg = totalFuelL * CO2_KG_PER_L;
    const tonnage = TONNAGE_BY_CONTAINER[trip.container_type] ?? null;
    const tonKm = tonnage
      ? tripLegs.filter((l) => l.laden === 'true').reduce((s, l) => s + num(l.distance_km) * tonnage, 0)
      : 0;
    const g_co2_per_tonkm = tonKm > 0 ? (co2_kg * 1000) / tonKm : null;
    const g_co2_per_km = vehicleMaster?.vehicle_class === 'car' && totalDistanceKm > 0
      ? (co2_kg * 1000) / totalDistanceKm
      : null;

    // 데이터 tier — "판단"이 아니라 데이터 존재 여부 사실 표시. 신뢰등급(정상/A/B/C/D)과는 별개 축.
    const hasOperationData = totalDistanceKm > 0;
    const hasFuelData = totalFuelL > 0;
    const data_tier = hasOperationData && hasFuelData ? 'A' : hasOperationData || hasFuelData ? 'B' : 'none';
    const data_tier_note =
      data_tier === 'A'
        ? '운행데이터 + 유류데이터 교차검증 완료'
        : data_tier === 'B'
          ? hasOperationData
            ? '운행데이터만 있음 — 유류카드 미연동, 교차검증 불가'
            : '유류데이터만 있음 — 운행기록 미확보, 교차검증 불가'
          : '운행·유류 데이터 모두 없음';

    return {
      trip_id: trip.trip_id,
      vehicle_id: trip.vehicle_id,
      vehicle_class: vehicleMaster?.vehicle_class ?? null,
      date: trip.date,
      month,
      origin_site: trip.origin_site,
      destination_site: trip.destination_site,
      order_no: trip.order_no,
      container_type: trip.container_type,

      grade: vehicle?.grade ?? null,
      verifiable: vehicle?.verifiable ?? false,
      settle: vehicle?.settle ?? 'block',
      data_tier,
      data_tier_note,

      safety: {
        event_counts: eventCounts,
        core_events,
        continuous: { max_block_sec: max_continuous_block_sec, limit_sec: CONTINUOUS_DRIVE_LIMIT_SEC, compliant: continuous_drive_compliant },
      },

      eco: {
        distance_km: totalDistanceKm,
        ton_km: tonKm,
        fuel_l: totalFuelL,
        idle_l: (totalIdleSec / 3600) * IDLE_L_PER_HOUR,
        co2_kg,
        g_co2_per_tonkm,
        g_co2_per_km,
        empty_share: emptyShare,
      },

      // 구간귀속(지오펜스 선분교차)은 build-attribution.mjs(트랙5)가 여기 이어 붙인다.
      attribution: null,
    };
  });

  writeJson(join(DATA_OUT, 'certificates.json'), certificates);
  console.log(`certificates.json: ${certificates.length}건`);
}

function readCsvJsonSafe(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    throw new Error(`vehicles.json not found at ${path} — build-vehicles.mjs를 먼저 실행하세요.`);
  }
}

main();
