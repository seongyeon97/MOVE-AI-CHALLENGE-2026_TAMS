// build-attribution.mjs — PRD §5.6 지오펜스 구간귀속. 선분교차 판정(scripts/lib/geofence.mjs).
// 승용차는 대상 아님(applicable:false) — 화물만 구간귀속 검증한다.
// leg 단위로 판정한다 — 왕복 트립(공차+적차)은 leg마다 방향(origin/destination)이 다르기 때문.
// 적차(laden) leg가 실제 화주 귀속 대상이므로 증명서 대표 판정은 적차 leg 기준(산출기준서 §3-2).
// certificates.json(build-certificates.mjs 산출)의 attribution 필드를 채워 다시 쓴다.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { readCsv, writeJson } from './lib/csv.mjs';
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

/** leg 하나의 지오펜스 판정. 매칭 코리도가 없으면 failed + 사유. */
function judgeLeg(leg, points, settings) {
  const corridor = findCorridor(settings.corridors, settings.sites, leg.origin_site, leg.destination_site);
  if (!corridor) {
    return {
      leg_id: leg.leg_id, laden: leg.laden === 'true', corridor_id: null, status: 'failed',
      departure: null, arrival: null, note: '등록된 운송구간과 일치하지 않음 — 설정에서 사업장·구간을 먼저 등록하세요.',
    };
  }

  const originSite = settings.sites.find((s) => s.site_id === corridor.origin_site_id);
  const destSite = settings.sites.find((s) => s.site_id === corridor.destination_site_id);

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

  return { leg_id: leg.leg_id, laden: leg.laden === 'true', corridor_id: corridor.corridor_id, status, departure, arrival };
}

function main() {
  const settings = JSON.parse(readFileSync(join(ROOT, 'public', 'fixtures', 'settings.json'), 'utf-8'));

  const legs = readCsv(join(FILES2, 'leg.csv'));
  const legsByTrip = groupBy(legs, 'trip_id');

  const dtgTrack = readCsv(join(FILES2, 'dtg_track.csv'));
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

    // 대표 판정 = 적차(laden) leg. 적차 leg가 없으면(승용 단일세그 등) 전체 중 첫 leg로 대체.
    const primary = legJudgements.find((j) => j.laden) ?? legJudgements[0] ?? null;

    cert.attribution = primary
      ? { applicable: true, corridor_id: primary.corridor_id, status: primary.status, departure: primary.departure, arrival: primary.arrival, legs: legJudgements }
      : { applicable: true, corridor_id: null, status: 'failed', departure: null, arrival: null, legs: [] };
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
