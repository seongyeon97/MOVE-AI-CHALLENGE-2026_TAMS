// build-attribution.mjs — PRD §5.6 지오펜스 구간귀속. 선분교차 판정(scripts/lib/geofence.mjs).
// 승용차는 대상 아님(applicable:false) — 화물만 구간귀속 검증한다.
// leg 단위로 판정한다 — 왕복 트립(공차+적차)은 leg마다 방향(origin/destination)이 다르기 때문.
// 적차(laden) leg가 실제 화주 귀속 대상이므로 증명서 대표 판정은 적차 leg 기준(산출기준서 §3-2).
// certificates.json(build-certificates.mjs 산출)의 attribution 필드를 채워 다시 쓴다.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { readCsvIfExists, writeJson } from './lib/csv.mjs';
import { findCrossing } from './lib/geofence.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const DATA_OUT = join(ROOT, 'public', 'data');

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

function findCorridor(corridors, sites, originName, destName) {
  return corridors.find((c) => {
    const origin = sites.find((s) => s.site_id === c.origin_site_id);
    const dest = sites.find((s) => s.site_id === c.destination_site_id);
    return origin?.name === originName && dest?.name === destName;
  });
}

/** leg 하나의 구간귀속 판정. 매칭 코리도가 없으면 failed + 사유. */
function judgeLeg(leg, points, settings) {
  const corridor = findCorridor(settings.corridors, settings.sites, leg.origin_site, leg.destination_site);
  if (!corridor) {
    return {
      leg_id: leg.leg_id, laden: leg.laden === 'true', corridor_id: null, status: 'failed',
      method: 'none',
      departure: null, arrival: null, note: '등록된 운송구간과 일치하지 않음 — 설정에서 사업장·구간을 먼저 등록하세요.',
    };
  }

  const originSite = settings.sites.find((s) => s.site_id === corridor.origin_site_id);
  const destSite = settings.sites.find((s) => s.site_id === corridor.destination_site_id);

  // 좌표가 없는 원자료(주소만 있는 화물차 운행기록)는 지오펜스 선분교차를 쓸 수 없다.
  // 이때는 출발·도착 주소가 등록된 사업장과 일치하는지로 판정하고, 방법을 method에 남겨
  // 증명서가 "지오펜스"가 아니라 "주소 대조"였다고 밝히게 한다 — 못 한 검증을 한 척하지 않는다.
  const hasCoords = points.length > 0 && Number(originSite?.lat) !== 0 && Number(destSite?.lat) !== 0;
  if (!hasCoords) {
    const departMatch = leg.origin_site === originSite?.name;
    const arriveMatch = leg.destination_site === destSite?.name;
    return {
      leg_id: leg.leg_id,
      laden: leg.laden === 'true',
      corridor_id: corridor.corridor_id,
      method: 'address',
      status: departMatch && arriveMatch ? 'verified' : departMatch || arriveMatch ? 'partial' : 'failed',
      departure: departMatch ? { ts: leg.start_ts, error_sec: null } : null,
      arrival: arriveMatch ? { ts: leg.end_ts, error_sec: null } : null,
      note: '좌표 미보유 — 출발·도착 주소 대조로 판정(지오펜스 아님)',
    };
  }

  const legStart = new Date(leg.start_ts).getTime();
  const legEnd = new Date(leg.end_ts).getTime();
  const legPoints = points.filter((p) => {
    const t = new Date(p.ts).getTime();
    return t >= legStart && t <= legEnd;
  });

  const departure = findCrossing(legPoints, originSite, { want: 'exit' });
  const arrival = findCrossing(legPoints, destSite, {
    want: 'enter',
    after: departure ? new Date(departure.ts).getTime() : -Infinity,
  });

  let status;
  if (departure && arrival) status = 'verified';
  else if (departure || arrival) status = 'partial';
  else status = 'failed';

  return { leg_id: leg.leg_id, laden: leg.laden === 'true', corridor_id: corridor.corridor_id, method: 'geofence', status, departure, arrival };
}

function main() {
  // settings.json 시드는 없앴다(더미 데이터 정리) — 설정 화면에서 실제 등록한 것만 쓴다. 빌드 시점엔
  // 아직 아무것도 없을 수 있으므로 빈 값으로 시작해도 죽지 않게 한다(구간귀속은 전부 failed 처리됨).
  let settings = { sites: [], corridors: [] };
  try {
    settings = JSON.parse(readFileSync(join(ROOT, 'public', 'fixtures', 'settings.json'), 'utf-8'));
  } catch {
    // 파일 없으면 빈 설정 그대로 — 정상 동작.
  }

  const legs = readCsvIfExists(join(FILES2, 'leg.csv'));
  const legsByTrip = groupBy(legs, 'trip_id');

  const dtgTrack = readCsvIfExists(join(FILES2, 'dtg_track.csv'));
  const pointsByTrip = groupBy(dtgTrack, 'trip_id');
  for (const [tripId, rows] of pointsByTrip) {
    const sorted = rows
      .map((p) => ({ lat: Number(p.lat), lon: Number(p.lon), ts: p.ts }))
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    pointsByTrip.set(tripId, sorted);
  }

  const certificatesPath = join(DATA_OUT, 'certificates.json');
  const certificates = JSON.parse(readFileSync(certificatesPath, 'utf-8'));

  for (const cert of certificates) {
    if (cert.vehicle_class === 'car') {
      cert.attribution = { applicable: false, note: '승용차는 구간귀속 검증 대상이 아님(고정 운송구간 없음)' };
      continue;
    }

    const tripLegs = legsByTrip.get(cert.trip_id) ?? [];
    const points = pointsByTrip.get(cert.trip_id) ?? [];
    const legJudgements = tripLegs.map((leg) => judgeLeg(leg, points, settings));

    // 대표 판정 = 적차(laden) leg → 없으면 실제로 사업장 간을 오간 leg → 그것도 없으면 첫 leg.
    // 첫 leg를 그냥 쓰면 구내 이동(같은 사업장 안에서 맴도는 leg)이 대표가 돼 전부 failed로 나온다.
    const primary =
      legJudgements.find((j) => j.laden) ??
      legJudgements.find((j) => j.status === 'verified') ??
      legJudgements.find((j) => j.status === 'partial') ??
      legJudgements[0] ?? null;

    cert.attribution = primary
      ? { applicable: true, corridor_id: primary.corridor_id, status: primary.status, method: primary.method, departure: primary.departure, arrival: primary.arrival, legs: legJudgements }
      : { applicable: true, corridor_id: null, status: 'failed', method: 'none', departure: null, arrival: null, legs: [] };
  }

  writeJson(certificatesPath, certificates);

  const counts = certificates.reduce((acc, c) => {
    const key = c.attribution.applicable === false ? 'n/a(승용)' : c.attribution.status;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.log('attribution:', counts);
}

main();
