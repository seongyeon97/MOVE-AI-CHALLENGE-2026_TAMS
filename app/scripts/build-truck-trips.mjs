// build-truck-trips.mjs — 화물차 운행 원자료(leg 단위)를 증명서용 trip/leg/event로 변환한다.
//
// 실제 받은 화물차 파일은 leg 단위 주행기록(driving_legs_*.csv)이고 좌표가 없다 — 주소 텍스트뿐이다.
// 그래서 구간 귀속은 지오펜스 선분교차가 아니라 **주소 대조**로 판정하고, 증명서에 그 방법을 명시한다.
// 좌표(위경도)가 들어오면 build-attribution.mjs의 선분교차 경로로 승격하면 된다.
//
// 하루치 leg를 차량별로 묶어 "그날의 운송 1건(trip)"으로 본다. 사업장 간 이동만 귀속 대상이고,
// 같은 사업장 안에서 맴도는 leg(구내 이동)는 구간 운송이 아니라 제외한다.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { readCsv, writeCsv, writeJson, num } from './lib/csv.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const FIXTURES = join(ROOT, 'public', 'fixtures');

/** "전라남도 광양시 태인동 1654-7(113m 범위)" → "전라남도 광양시 태인동 1654-7" */
function cleanAddr(addr) {
  return String(addr ?? '').replace(/\(.*?\)/g, '').trim();
}

/** 주소를 사업장 판정에 쓰는 단위(읍면동)까지 자른다 — 번지까지 같아야 같은 사업장은 아니다. */
function addrArea(addr) {
  const clean = cleanAddr(addr);
  const m = clean.match(/^(.*?[시군구])\s+(\S+[동읍면리])/);
  return m ? `${m[1]} ${m[2]}` : clean;
}

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

function main() {
  const legFiles = readdirSync(FILES2).filter((f) => /^driving_legs_.*\.csv$/i.test(f));
  const eventFiles = readdirSync(FILES2).filter((f) => /^driving_events_.*\.csv$/i.test(f));
  const fuelFiles = readdirSync(FILES2).filter((f) => /^fuel_.*\.csv$/i.test(f));

  if (legFiles.length === 0) {
    console.log('driving_legs_*.csv 없음 — 화물차 증명서 원자료 생성을 건너뜁니다.');
    return;
  }

  const legRows = legFiles.flatMap((f) => readCsv(join(FILES2, f)));
  const eventRows = eventFiles.flatMap((f) => readCsv(join(FILES2, f)));
  const fuelRows = fuelFiles.flatMap((f) => readCsv(join(FILES2, f)));

  // (vehicle_id, date) -> 그날의 leg들
  const byTrip = new Map();
  for (const r of legRows) {
    const key = `${r.vehicle_id}|${r.date}`;
    if (!byTrip.has(key)) byTrip.set(key, []);
    byTrip.get(key).push(r);
  }

  const eventByKey = new Map(eventRows.map((r) => [`${r.vehicle_id}|${r.date}`, r]));
  const fuelByKey = new Map(fuelRows.map((r) => [`${r.vehicle_id}|${r.date}`, r]));

  const trips = [];
  const legs = [];
  const events = [];
  const areaCounts = new Map();

  for (const [key, dayLegs] of byTrip) {
    const [vehicle_id, date] = key.split('|');
    dayLegs.sort((a, b) => num(a.seq) - num(b.seq));

    const trip_id = `TRIP-${vehicle_id}-${date.replace(/-/g, '')}`;
    const first = dayLegs[0];
    const last = dayLegs[dayLegs.length - 1];

    // 사업장 간 이동만 구간 운송으로 본다 — 출발·도착 지역이 다른 leg.
    const transferLegs = dayLegs.filter((l) => addrArea(l.depart_addr) !== addrArea(l.arrive_addr));
    for (const l of dayLegs) {
      areaCounts.set(addrArea(l.depart_addr), (areaCounts.get(addrArea(l.depart_addr)) ?? 0) + 1);
    }

    const dayFuel = fuelByKey.get(key);
    const totalDistance = dayLegs.reduce((s, l) => s + num(l.distance_km), 0);

    trips.push({
      trip_id,
      vehicle_id,
      date,
      origin_site: addrArea(first.depart_addr),
      destination_site: addrArea(last.arrive_addr),
      order_no: '',
      container_type: '40ft', // 규격 정보가 원자료에 없어 40ft로 가정(증명서 산출근거에 표기)
    });

    // 연료는 하루 단위로만 오므로 거리 비율로 leg에 배분한다 — 배분 방식도 증명서에 밝힌다.
    const dayFuelL = dayFuel ? num(dayFuel.fuel_l) : 0;
    const ladenFlag = String(dayFuel?.load_state ?? '').toLowerCase() === 'laden';

    for (const l of dayLegs) {
      const distance = num(l.distance_km);
      const share = totalDistance > 0 ? distance / totalDistance : 0;
      legs.push({
        leg_id: `${trip_id}-L${l.seq}`,
        trip_id,
        vehicle_id,
        laden: String(ladenFlag),
        origin_site: addrArea(l.depart_addr),
        destination_site: addrArea(l.arrive_addr),
        distance_km: distance,
        fuel_l: (dayFuelL * share).toFixed(3),
        idle_sec: 0, // 원자료에 공회전 항목이 없다 — 0으로 두고 산출근거에 명시
        start_ts: `${date}T${l.depart_time || '00:00:00'}+09:00`,
        end_ts: `${date}T${l.arrive_time || l.depart_time || '00:00:00'}+09:00`,
      });
    }

    // 이벤트는 일자 합계로만 온다(유형별 건수). 시각·좌표가 없어 leg에 배분하지 않고 trip에 붙인다.
    const ev = eventByKey.get(key);
    if (ev) {
      const kinds = [
        ['accel', num(ev.hard_accel)],
        ['start', num(ev.hard_start)],
        ['decel', num(ev.hard_decel)],
        ['stop', num(ev.hard_stop)],
      ];
      let n = 0;
      for (const [type, count] of kinds) {
        for (let i = 0; i < count; i++) {
          n += 1;
          events.push({
            event_id: `${trip_id}-E${pad(n, 4)}`,
            vehicle_id,
            trip_id,
            leg_id: '',
            ts: `${date}T12:00:00+09:00`, // 시각 미상 — 일자 대표값
            lat: '',
            lon: '',
            event_type: type,
          });
        }
      }
    }

    void transferLegs; // 구간 판정은 build-attribution이 legs의 주소로 다시 본다
  }

  writeCsv(join(FILES2, 'trip.csv'),
    ['trip_id', 'vehicle_id', 'date', 'origin_site', 'destination_site', 'order_no', 'container_type'], trips);
  writeCsv(join(FILES2, 'leg.csv'),
    ['leg_id', 'trip_id', 'vehicle_id', 'laden', 'origin_site', 'destination_site', 'distance_km', 'fuel_l', 'idle_sec', 'start_ts', 'end_ts'], legs);
  writeCsv(join(FILES2, 'event.csv'),
    ['event_id', 'vehicle_id', 'trip_id', 'leg_id', 'ts', 'lat', 'lon', 'event_type'], events);

  // 실제 데이터에 나온 지역을 사업장 후보로 시드한다 — 설정 화면에서 등록한 게 있으면 그쪽이 우선.
  // 단말이 위치를 못 잡은 행("주변에 검색된 지번이 없습니다")은 주소가 아니므로 사업장이 될 수 없다.
  const isRealAddress = (name) => /[시군구]\s/.test(name) && !/없습니다|미상|unknown/i.test(name);
  const topAreas = [...areaCounts.entries()]
    .filter(([name]) => isRealAddress(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const sites = topAreas.map(([name], i) => ({
    site_id: `SITE-${pad(i + 1)}`,
    name,
    address: name,
    lat: 0, // 좌표 미보유 — 지오펜스 대신 주소 대조로 판정한다
    lon: 0,
    radius_m: 1000,
  }));
  const corridors = [];
  for (let i = 0; i < sites.length; i++) {
    for (let j = 0; j < sites.length; j++) {
      if (i === j) continue;
      corridors.push({
        corridor_id: `COR-${sites[i].site_id}-${sites[j].site_id}`,
        name: `${sites[i].name} → ${sites[j].name}`,
        origin_site_id: sites[i].site_id,
        destination_site_id: sites[j].site_id,
      });
    }
  }
  writeJson(join(FIXTURES, 'settings.json'), { sites, corridors });

  console.log(`trip.csv: ${trips.length}건 · leg.csv: ${legs.length}건 · event.csv: ${events.length}건`);
  console.log(`settings.json: 사업장 ${sites.length}곳 · 운송구간 ${corridors.length}개 (주소 기반, 좌표 미보유)`);
  void readFileSync; // (미사용) — 원자료를 추가로 읽어야 할 때를 위해 남겨둔다
}

main();
