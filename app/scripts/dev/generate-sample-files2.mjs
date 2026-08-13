// generate-sample-files2.mjs — 실측 CSV 도착 전 파이프라인 개발/검증용 표본.
// BUILD_SEQUENCE 트랙 목록에 없는 개발 보조 스크립트다. 실제 files2/ CSV(트랙터 13 +
// 승용 10, 총 23대 실측)가 들어오면 이 스크립트는 더 이상 쓰지 않는다 — 스키마만
// 맞으면 build-vehicles.mjs는 그대로 동작한다. v2.1: 더미 212대 생성 없음.
//
// 등급 분포는 PRD 1.6 "13대 실측 분포(과다검출3/미세검출4/무검출4/계측불능2)"를
// 그대로 재현한다 — 트랙터 9대 비정상 + 승용 10대 전부 정상 = "23대 중 9대 신뢰 불가".

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '..', 'files2');

const ORIGIN = { name: '부산신항', lat: 35.0879, lon: 128.7937 };
const DEST = { name: '경주공장', lat: 35.8305, lon: 129.2046 };

// laden=false(공차): 부산신항→경주공장 / laden=true(적차): 경주공장→부산신항
function siteFor(laden) {
  return laden ? { from: DEST, to: ORIGIN } : { from: ORIGIN, to: DEST };
}

const TRUCK_BASE = {
  vehicle_class: 'truck', device_model: 'DTG-100',
  maker: '현대자동차', model: '엑시언트', gross_weight_kg: 40000,
  displacement_cc: 12700, fuel_type: '경유',
};
const CAR_BASE = {
  vehicle_class: 'car', device_model: 'OBD-DONGLE-1',
  gross_weight_kg: 1400, fuel_type: '휘발유',
};

const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

// 대부분 차량은 5개월 내내 같은 패턴(flat)이라고 가정한다 — 실측이면 달마다 다르겠지만
// 표본 목적은 등급 커버리지지, 월별 드리프트 그 자체가 아니다.
function flat(segments) {
  return MONTHS.map(() => segments);
}

const vehicles = [
  // ── 트랙터 13대 ──────────────────────────────────────────────
  // 과다검출(A, 센서 과민) × 3 — 발생률이 물리적 상한(1.0/km)을 크게 넘음
  { vehicle_id: 'GLV-T01', ...TRUCK_BASE, year: 2021, registered_kmpl: 3.6, monthly: flat([
    { laden: false, km: 200, fuel: 60, idle: 400, events: { accel: 65, start: 55, decel: 55, stop: 45 } },
    { laden: true, km: 300, fuel: 130, idle: 500, events: { accel: 105, start: 85, decel: 85, stop: 65 } },
  ]) },
  { vehicle_id: 'GLV-T02', ...TRUCK_BASE, year: 2022, registered_kmpl: 3.6, monthly: flat([
    { laden: false, km: 220, fuel: 65, idle: 420, events: { accel: 70, start: 60, decel: 58, stop: 48 } },
    { laden: true, km: 280, fuel: 125, idle: 480, events: { accel: 100, start: 82, decel: 80, stop: 62 } },
  ]) },
  { vehicle_id: 'GLV-T03', ...TRUCK_BASE, year: 2020, registered_kmpl: 3.6, monthly: flat([
    { laden: false, km: 180, fuel: 55, idle: 380, events: { accel: 60, start: 52, decel: 50, stop: 42 } },
    { laden: true, km: 260, fuel: 120, idle: 460, events: { accel: 95, start: 78, decel: 76, stop: 60 } },
  ]) },

  // 미세검출(정상 출발) × 1 — §BUILD_SEQUENCE "4월 대비 8월 순위 변동 최대" 배너 시연용 드리프트.
  // 4~5월 정상 → 6월 이벤트 급증(A, 센서 과민 의심) → 7~8월 이벤트 소실(C, 센서 침묵)로 악화.
  { vehicle_id: 'GLV-T04', ...TRUCK_BASE, year: 2021, registered_kmpl: 3.6, monthly: [
    [
      { laden: false, km: 800, fuel: 200, idle: 900, events: { accel: 1, start: 1, decel: 1, stop: 1 } },
      { laden: true, km: 800, fuel: 280, idle: 900, events: { accel: 2, start: 1, decel: 2, stop: 1 } },
    ],
    [
      { laden: false, km: 780, fuel: 195, idle: 880, events: { accel: 1, start: 1, decel: 1, stop: 1 } },
      { laden: true, km: 820, fuel: 288, idle: 900, events: { accel: 2, start: 2, decel: 1, stop: 1 } },
    ],
    [
      { laden: false, km: 300, fuel: 90, idle: 500, events: { accel: 80, start: 65, decel: 65, stop: 50 } },
      { laden: true, km: 350, fuel: 150, idle: 500, events: { accel: 110, start: 90, decel: 88, stop: 70 } },
    ],
    [
      { laden: false, km: 900, fuel: 230, idle: 950, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
      { laden: true, km: 900, fuel: 360, idle: 950, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
    ],
    [
      { laden: false, km: 950, fuel: 245, idle: 1000, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
      { laden: true, km: 950, fuel: 385, idle: 1000, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
    ],
  ] },
  // 유류카드 전표가 이 운송건에 아직 매칭 안 된 표본 — 증명서 데이터 tier(B: 단일출처) 시연용.
  // daily_summary(월별 집계, Safe 화면용)는 정상대로 두고 leg.csv(증명서 원자료)만 fuel_l=0으로 낸다.
  { vehicle_id: 'GLV-T05', ...TRUCK_BASE, year: 2022, registered_kmpl: 3.6, fuel_card_linked: false, monthly: flat([
    { laden: false, km: 750, fuel: 185, idle: 800, events: { accel: 2, start: 1, decel: 1, stop: 1 } },
    { laden: true, km: 750, fuel: 260, idle: 800, events: { accel: 3, start: 2, decel: 2, stop: 2 } },
  ]) },
  { vehicle_id: 'GLV-T06', ...TRUCK_BASE, year: 2023, registered_kmpl: 3.6, fuel_card_linked: false, monthly: flat([
    { laden: false, km: 1000, fuel: 250, idle: 1000, events: { accel: 2, start: 2, decel: 1, stop: 2 } },
    { laden: true, km: 1000, fuel: 345, idle: 1000, events: { accel: 4, start: 3, decel: 3, stop: 3 } },
  ]) },
  { // 등록증 연비 없음 — AI추정/픽스처 경로 검증용(화물)
    vehicle_id: 'GLV-T07', vehicle_class: 'truck', device_model: 'DTG-200',
    maker: '볼보트럭', model: 'FH', year: 2020, gross_weight_kg: 40000,
    displacement_cc: 12800, fuel_type: '경유', registered_kmpl: '', monthly: flat([
      { laden: false, km: 850, fuel: 220, idle: 850, events: { accel: 2, start: 1, decel: 1, stop: 1 } },
      { laden: true, km: 850, fuel: 310, idle: 850, events: { accel: 3, start: 2, decel: 2, stop: 2 } },
    ]) },

  // 무검출(C, 센서 침묵) × 4 — 이벤트 0 + 장거리, 연료는 기준연비 초과(산출기준서 §2-5 "8호차")
  { vehicle_id: 'GLV-T08', ...TRUCK_BASE, year: 2021, registered_kmpl: 3.6, monthly: flat([
    { laden: false, km: 1200, fuel: 300, idle: 1200, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
    { laden: true, km: 1200, fuel: 474, idle: 1200, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
  ]) },
  { vehicle_id: 'GLV-T09', ...TRUCK_BASE, year: 2021, registered_kmpl: 3.6, monthly: flat([
    { laden: false, km: 1100, fuel: 285, idle: 1100, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
    { laden: true, km: 1100, fuel: 430, idle: 1100, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
  ]) },
  { vehicle_id: 'GLV-T10', ...TRUCK_BASE, year: 2022, registered_kmpl: 3.6, monthly: flat([
    { laden: false, km: 950, fuel: 245, idle: 950, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
    { laden: true, km: 950, fuel: 375, idle: 950, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
  ]) },
  { vehicle_id: 'GLV-T11', ...TRUCK_BASE, year: 2020, registered_kmpl: 3.6, monthly: flat([
    { laden: false, km: 1300, fuel: 330, idle: 1300, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
    { laden: true, km: 1300, fuel: 505, idle: 1300, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
  ]) },

  // 계측불능(D, 측정 불가) × 2 — 주행거리 0인데 이벤트는 잡힘
  { vehicle_id: 'GLV-T12', ...TRUCK_BASE, year: 2019, registered_kmpl: 3.6, monthly: flat([
    { laden: false, km: 0, fuel: 0, idle: 0, events: { accel: 1, start: 1, decel: 0, stop: 0 } },
    { laden: true, km: 0, fuel: 0, idle: 0, events: { accel: 0, start: 0, decel: 0, stop: 0 } },
  ]) },
  { vehicle_id: 'GLV-T13', ...TRUCK_BASE, year: 2019, registered_kmpl: 3.6, monthly: flat([
    { laden: false, km: 0, fuel: 0, idle: 0, events: { accel: 0, start: 1, decel: 0, stop: 0 } },
    { laden: true, km: 0, fuel: 0, idle: 0, events: { accel: 1, start: 0, decel: 1, stop: 0 } },
  ]) },

  // ── 업무용 승용차 10대(전부 정상, 등록증 없음 → 공공API 우선 경로) ──────────
  { vehicle_id: 'GLV-C01', ...CAR_BASE, maker: '현대자동차', model: '아반떼', year: 2022, displacement_cc: 1600, registered_kmpl: '', monthly: flat([
    { laden: false, km: 600, fuel: 40, idle: 600, events: { accel: 1, start: 1, decel: 1, stop: 1 } },
  ]) },
  { vehicle_id: 'GLV-C02', ...CAR_BASE, maker: '기아', model: 'K5', year: 2021, displacement_cc: 1999, registered_kmpl: '', monthly: flat([
    { laden: false, km: 550, fuel: 38, idle: 500, events: { accel: 1, start: 1, decel: 1, stop: 0 } },
  ]) },
  { vehicle_id: 'GLV-C03', ...CAR_BASE, maker: '현대자동차', model: '쏘나타', year: 2022, displacement_cc: 1999, registered_kmpl: '', monthly: flat([
    { laden: false, km: 580, fuel: 42, idle: 550, events: { accel: 1, start: 1, decel: 1, stop: 1 } },
  ]) },
  { vehicle_id: 'GLV-C04', ...CAR_BASE, maker: '기아', model: '스포티지', year: 2023, displacement_cc: 1600, registered_kmpl: '', monthly: flat([
    { laden: false, km: 500, fuel: 39, idle: 480, events: { accel: 1, start: 0, decel: 1, stop: 1 } },
  ]) },
  { vehicle_id: 'GLV-C05', ...CAR_BASE, maker: '현대자동차', model: '그랜저', year: 2022, displacement_cc: 2497, registered_kmpl: '', monthly: flat([
    { laden: false, km: 620, fuel: 48, idle: 600, events: { accel: 2, start: 1, decel: 1, stop: 1 } },
  ]) },
  { vehicle_id: 'GLV-C06', ...CAR_BASE, maker: '기아', model: '카니발', year: 2021, displacement_cc: 2199, registered_kmpl: '', monthly: flat([
    { laden: false, km: 700, fuel: 60, idle: 650, events: { accel: 2, start: 1, decel: 2, stop: 1 } },
  ]) },
  { vehicle_id: 'GLV-C07', ...CAR_BASE, maker: '현대자동차', model: '투싼', year: 2023, displacement_cc: 1600, registered_kmpl: '', monthly: flat([
    { laden: false, km: 480, fuel: 37, idle: 450, events: { accel: 1, start: 1, decel: 0, stop: 1 } },
  ]) },
  { vehicle_id: 'GLV-C08', ...CAR_BASE, maker: '기아', model: '니로', year: 2022, displacement_cc: 1580, registered_kmpl: '', monthly: flat([
    { laden: false, km: 530, fuel: 30, idle: 500, events: { accel: 1, start: 1, decel: 1, stop: 0 } },
  ]) },
  { vehicle_id: 'GLV-C09', ...CAR_BASE, maker: '현대자동차', model: '아이오닉5', year: 2023, displacement_cc: 0, fuel_type: '전기', registered_kmpl: '', monthly: flat([
    { laden: false, km: 560, fuel: 18, idle: 400, events: { accel: 1, start: 1, decel: 1, stop: 1 } },
  ]) },
  { vehicle_id: 'GLV-C10', ...CAR_BASE, maker: '기아', model: '레이', year: 2021, displacement_cc: 999, registered_kmpl: '', monthly: flat([
    { laden: false, km: 400, fuel: 27, idle: 380, events: { accel: 1, start: 0, decel: 1, stop: 1 } },
  ]) },
];

function toCsv(header, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n') + '\n';
}

const vehicleMasterRows = vehicles.map((v) => ({
  vehicle_id: v.vehicle_id,
  vehicle_class: v.vehicle_class,
  device_model: v.device_model,
  maker: v.maker,
  model: v.model,
  year: v.year,
  gross_weight_kg: v.gross_weight_kg,
  displacement_cc: v.displacement_cc,
  fuel_type: v.fuel_type,
  registered_kmpl: v.registered_kmpl,
}));

const LATEST_MONTH_IDX = MONTHS.length - 1;
const dailySummaryRows = [];
const tripRows = [];
const legRows = [];
const eventRows = [];
const dtgRows = [];

for (const v of vehicles) {
  MONTHS.forEach((month, monthIdx) => {
    const segments = v.monthly[monthIdx];
    const DATE = `${month}-01`;
    segments.forEach((seg) => {
      dailySummaryRows.push({
        vehicle_id: v.vehicle_id,
        date: DATE,
        laden: seg.laden,
        reported_km: seg.km,
        event_accel: seg.events.accel,
        event_start: seg.events.start,
        event_decel: seg.events.decel,
        event_stop: seg.events.stop,
        event_speeding: 0,
        fuel_l: seg.fuel,
        idle_sec: seg.idle,
      });
    });
  });

  // trip/leg/event/dtg_track은 최신 월(8월) 1건만 — 5개월치 궤적까지는 표본 범위 밖.
  const seg0 = v.monthly[LATEST_MONTH_IDX];
  const trip_id = `TRIP-${v.vehicle_id}-01`;
  const DATE = `${MONTHS[LATEST_MONTH_IDX]}-01`;
  tripRows.push({
    trip_id,
    vehicle_id: v.vehicle_id,
    date: DATE,
    origin_site: seg0[0].laden ? DEST.name : ORIGIN.name,
    destination_site: seg0[seg0.length - 1].laden ? ORIGIN.name : DEST.name,
    order_no: `ORD-${v.vehicle_id}`,
    container_type: v.vehicle_class === 'truck' ? '40ft' : '',
  });

  seg0.forEach((seg, segIdx) => {
    const leg_id = `${trip_id}-L${segIdx + 1}`;
    const { from, to } = siteFor(seg.laden);
    const startTs = new Date(`${DATE}T${String(6 + segIdx * 4).padStart(2, '0')}:00:00+09:00`);
    const durationMin = Math.max(20, Math.round((seg.km / 70) * 60)); // 평균 70km/h 가정
    const endTs = new Date(startTs.getTime() + durationMin * 60000);

    legRows.push({
      leg_id,
      trip_id,
      vehicle_id: v.vehicle_id,
      laden: seg.laden,
      origin_site: from.name,
      destination_site: to.name,
      distance_km: seg.km,
      fuel_l: v.fuel_card_linked === false ? 0 : seg.fuel,
      idle_sec: seg.idle,
      start_ts: startTs.toISOString(),
      end_ts: endTs.toISOString(),
    });

    // 이벤트를 leg 구간에 균등 분포
    let n = 0;
    const eventList = [
      ...Array(seg.events.accel).fill('accel'),
      ...Array(seg.events.start).fill('start'),
      ...Array(seg.events.decel).fill('decel'),
      ...Array(seg.events.stop).fill('stop'),
    ];
    for (const type of eventList) {
      n += 1;
      const frac = eventList.length > 1 ? n / (eventList.length + 1) : 0.5;
      const ts = new Date(startTs.getTime() + frac * (endTs.getTime() - startTs.getTime()));
      const lat = from.lat + (to.lat - from.lat) * frac;
      const lon = from.lon + (to.lon - from.lon) * frac;
      eventRows.push({
        event_id: `${leg_id}-E${n}`,
        vehicle_id: v.vehicle_id,
        trip_id,
        leg_id,
        ts: ts.toISOString(),
        lat: lat.toFixed(5),
        lon: lon.toFixed(5),
        event_type: type,
      });
    }

    // 2분 간격 GPS 포인트(실데이터 샘플링 재현)
    if (seg.km > 0) {
      const totalMs = endTs.getTime() - startTs.getTime();
      const stepMs = 2 * 60 * 1000;
      let odo = segIdx === 0 ? 0 : seg0[0].km;
      for (let t = 0; t <= totalMs; t += stepMs) {
        const frac = t / totalMs;
        const ts = new Date(startTs.getTime() + t);
        const lat = from.lat + (to.lat - from.lat) * frac;
        const lon = from.lon + (to.lon - from.lon) * frac;
        dtgRows.push({
          vehicle_id: v.vehicle_id,
          trip_id,
          ts: ts.toISOString(),
          lat: lat.toFixed(5),
          lon: lon.toFixed(5),
          speed_kmh: 68 + Math.round(Math.sin(t / 600000) * 8),
          rpm: 1500,
          odo_km: (odo + seg.km * frac).toFixed(2),
          laden: seg.laden,
          gps_status: 'ok',
        });
      }
    }
  });
}

const truthRows = vehicles.map((v) => ({
  vehicle_id: v.vehicle_id,
  note: '정답표 — 앱/빌드 스크립트 어디서도 로드 금지 (csv.mjs FORBIDDEN 가드 대상)',
}));

mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(join(OUT_DIR, 'vehicle_master.csv'), toCsv(
  ['vehicle_id', 'vehicle_class', 'device_model', 'maker', 'model', 'year', 'gross_weight_kg', 'displacement_cc', 'fuel_type', 'registered_kmpl'],
  vehicleMasterRows,
));
writeFileSync(join(OUT_DIR, 'daily_summary.csv'), toCsv(
  ['vehicle_id', 'date', 'laden', 'reported_km', 'event_accel', 'event_start', 'event_decel', 'event_stop', 'event_speeding', 'fuel_l', 'idle_sec'],
  dailySummaryRows,
));
writeFileSync(join(OUT_DIR, 'trip.csv'), toCsv(
  ['trip_id', 'vehicle_id', 'date', 'origin_site', 'destination_site', 'order_no', 'container_type'],
  tripRows,
));
writeFileSync(join(OUT_DIR, 'leg.csv'), toCsv(
  ['leg_id', 'trip_id', 'vehicle_id', 'laden', 'origin_site', 'destination_site', 'distance_km', 'fuel_l', 'idle_sec', 'start_ts', 'end_ts'],
  legRows,
));
writeFileSync(join(OUT_DIR, 'event.csv'), toCsv(
  ['event_id', 'vehicle_id', 'trip_id', 'leg_id', 'ts', 'lat', 'lon', 'event_type'],
  eventRows,
));
writeFileSync(join(OUT_DIR, 'dtg_track.csv'), toCsv(
  ['vehicle_id', 'trip_id', 'ts', 'lat', 'lon', 'speed_kmh', 'rpm', 'odo_km', 'laden', 'gps_status'],
  dtgRows,
));
writeFileSync(join(OUT_DIR, '_truth.csv'), toCsv(['vehicle_id', 'note'], truthRows));

console.log(`sample files2/ written to ${OUT_DIR} (${vehicles.length} vehicles: 13 truck + 10 car)`);
