// generate-tamper-demo.mjs — 트랙12 조작탐지 데모 픽스처. BUILD_SEQUENCE 트랙 목록 밖의 개발 보조 스크립트.
// SB000214는 SB000213 대비 "주행거리 1.9배 부풀리기 + 이벤트 절반 삭제 + 2개 구간 복제"만 가한다.
// 유류사용내역·배차내역은 손대지 않는다(카드사·화주 발행이라 조작 불가라는 전제).
// R3/R4가 실제로 검출력을 갖도록(§PRD 5.4 경고) 이 데모만 10초 간격으로 낸다 — files2/의 실데이터(2분 간격)와 별개.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = join(__dirname, '..', '..', 'public', 'fixtures');

const ORIGIN = { lat: 35.0879, lon: 128.7937 };
const DEST = { lat: 35.5, lon: 128.95 };
const SPEED_KMH = 70;
const INTERVAL_SEC = 10;
const DISTANCE_KM = 100;
const DURATION_SEC = (DISTANCE_KM / SPEED_KMH) * 3600;
const START = new Date('2026-08-10T06:00:00+09:00').getTime();

function toCsv(header, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n') + '\n';
}

// 213(원본) 운행기록 — 10초 간격, 물리적으로 정상.
const baseLog = [];
for (let t = 0; t <= DURATION_SEC; t += INTERVAL_SEC) {
  const frac = t / DURATION_SEC;
  baseLog.push({
    ts: new Date(START + t * 1000).toISOString(),
    lat: (ORIGIN.lat + (DEST.lat - ORIGIN.lat) * frac).toFixed(6),
    lon: (ORIGIN.lon + (DEST.lon - ORIGIN.lon) * frac).toFixed(6),
    speed_kmh: SPEED_KMH,
    rpm: 1500,
    odo_km: (DISTANCE_KM * frac).toFixed(3),
  });
}

// 213 위험운전기록 — 20건, 트립 구간에 고르게.
const baseEvents = [];
const eventTypes = ['accel', 'start', 'decel', 'stop'];
for (let i = 0; i < 20; i++) {
  const t = Math.floor((DURATION_SEC * (i + 1)) / 21);
  baseEvents.push({ ts: new Date(START + t * 1000).toISOString(), event_type: eventTypes[i % 4] });
}

const FUEL_L = Number((DISTANCE_KM / 3.6).toFixed(2)); // 등록증 공인연비 3.6km/L 기준 실제 사용량(카드사 발행, 조작 불가)

const baseDispatch = [{ trip_id: 'DISPATCH-0001', vehicle_id: 'SB000213', dispatch_distance_km: DISTANCE_KM, origin: '부산신항', destination: '경주공장' }];
const baseFuel = [{ vehicle_id: 'SB000213', date: '2026-08-10', fuel_l: FUEL_L }];
const registrationHtml = (vehicleId) => `<!doctype html>
<html><body>
<h1>자동차등록증</h1>
<table>
<tr><th>차량번호</th><td>${vehicleId}</td></tr>
<tr><th>연료의 종류</th><td>경유</td></tr>
<tr><th>제원관리번호</th><td>KMFHH17KPFC000000</td></tr>
<tr><th>⑫ 공인연비</th><td>3.6 km/L</td></tr>
</table>
</body></html>
`;

// ── 213 파일 출력 ──
function writeVehicleFiles(dir, vehicleId, log, events, dispatch, fuel) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'driving_log.csv'), toCsv(['ts', 'lat', 'lon', 'speed_kmh', 'rpm', 'odo_km'], log));
  writeFileSync(join(dir, 'events.csv'), toCsv(['ts', 'event_type'], events));
  writeFileSync(join(dir, 'dispatch.csv'), toCsv(['trip_id', 'vehicle_id', 'dispatch_distance_km', 'origin', 'destination'], dispatch));
  writeFileSync(join(dir, 'fuel_card.csv'), toCsv(['vehicle_id', 'date', 'fuel_l'], fuel));
  writeFileSync(join(dir, 'registration.html'), registrationHtml(vehicleId));
}

writeVehicleFiles(join(OUT_ROOT, 'demo_SB000213'), 'SB000213', baseLog, baseEvents, baseDispatch, baseFuel);

// ── 214(조작본) 생성 ──
// 1) 주행거리 1.9배 부풀리기 — GPS·시각은 그대로 두고 odo_km만 부풀린다(실제 조작이 그렇듯 손대기 쉬운 값만 편집).
const INFLATE = 1.9;
const inflatedLog = baseLog.map((row) => ({ ...row, odo_km: (Number(row.odo_km) * INFLATE).toFixed(3) }));

// 2) 이벤트 절반 삭제 — 홀수 인덱스만 남긴다.
const halvedEvents = baseEvents.filter((_, i) => i % 2 === 0);

// 3) 2개 구간 복제 — 임의의 두 지점에서 연속 5행을 그대로 복제해 시퀀스 뒤에 끼워 넣는다(R4 시퀀스중복 표적).
function duplicateBlock(log, startIdx, blockLen = 5) {
  const block = log.slice(startIdx, startIdx + blockLen);
  return [...log.slice(0, startIdx + blockLen), ...block, ...log.slice(startIdx + blockLen)];
}
let tamperedLog = duplicateBlock(inflatedLog, Math.floor(inflatedLog.length * 0.3));
tamperedLog = duplicateBlock(tamperedLog, Math.floor(tamperedLog.length * 0.65));

// 배차내역·유류사용내역은 213과 동일 — 카드사·화주 발행이라 조작 대상이 아니다(vehicle_id만 214로 표기).
const dispatch214 = baseDispatch.map((d) => ({ ...d, trip_id: 'DISPATCH-0002', vehicle_id: 'SB000214' }));
const fuel214 = baseFuel.map((f) => ({ ...f, vehicle_id: 'SB000214' }));

writeVehicleFiles(join(OUT_ROOT, 'demo_SB000214'), 'SB000214', tamperedLog, halvedEvents, dispatch214, fuel214);

console.log(`tamper demo fixtures written: ${OUT_ROOT}/demo_SB000213, demo_SB000214`);
console.log(`sampling interval: ${INTERVAL_SEC}s · 213 events: ${baseEvents.length} · 214 events: ${halvedEvents.length}`);
