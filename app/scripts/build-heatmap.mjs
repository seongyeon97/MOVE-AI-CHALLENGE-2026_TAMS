// build-heatmap.mjs — 화물차(트랙터) 실측 운행만으로 구간 위험도를 집계한다.
//
// 원천은 저장소 루트의 운행데이터/ 폴더 하나뿐이다. files2/의 승용 차량(포터·아반떼 등)은
// 화물 노선 히트맵의 대상이 아니므로 읽지 않는다.
//
//   node scripts/build-heatmap.mjs
//     → public/data/routes.json   (노선 기준선 = route_roads_*.json)
//     → public/data/corridor.json (1km 구간 집계)
//
// 원칙:
//  1) 이벤트 좌표를 쓰지 않는다. 누적 주행거리(odo)로 km 위치를 복원한다 — 2분 샘플링 대응.
//  2) 등급은 절대 임계값이 아니라 전 구간 발생률 상대 순위 — 상위 3개 위험, 다음 5개 주의.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from './lib/csv.mjs';
import { cumulativeKm, pointAtKm, slicePolyline, toEpoch, r2 } from './lib/corridorShared.mjs';
import {
  hasSource,
  sourceDir,
  readSrcCsv,
  loadRouteRoads,
  loadTripTracks,
  loadTripRouteIds,
  routeKmAt,
} from './lib/heatmapSource.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_OUT = join(ROOT, 'public', 'data');

const BIN_KM = 1;
const ROSE_TOP_N = 3;
const AMBER_TOP_N = 5;
const LABEL = { dead: '위험', warn: '주의', ok: '양호' };

function main() {
  if (!hasSource(ROOT)) {
    console.error(`원천 폴더 없음: ${sourceDir(ROOT)}`);
    process.exitCode = 1;
    return;
  }

  const roads = loadRouteRoads(ROOT);
  const tripRouteIds = loadTripRouteIds(ROOT);
  const events = readSrcCsv(ROOT, 'event.csv');
  const tracks = loadTripTracks(ROOT);

  // ── 노선 뼈대: 기준선을 1km 단위로 슬라이싱 ──
  const byRoute = new Map();
  for (const [routeId, road] of roads) {
    const km = cumulativeKm(road.polyline);
    const totalKm = km[km.length - 1];
    const nBins = Math.max(1, Math.ceil(totalKm / BIN_KM));
    const segs = [];
    for (let i = 0; i < nBins; i += 1) {
      const kmFrom = i * BIN_KM;
      const kmTo = Math.min((i + 1) * BIN_KM, totalKm);
      segs.push({
        segment_no: i + 1,
        centroid: pointAtKm(road.polyline, km, (kmFrom + kmTo) / 2).map((v) => Math.round(v * 1e5) / 1e5),
        polyline: slicePolyline(road.polyline, km, kmFrom, kmTo).map(([a, b]) => [
          Math.round(a * 1e5) / 1e5,
          Math.round(b * 1e5) / 1e5,
        ]),
        km_from: r2(kmFrom),
        km_to: r2(kmTo),
        event_count: 0,
        events_by_type: {},
      });
    }
    byRoute.set(routeId, {
      route_id: routeId,
      route_name: road.route_name,
      polyline: road.polyline,
      totalKm,
      segs,
      trips: 0,
    });
  }

  // ── 발생률 분모: 노선별 실측 운행 건수 ──
  for (const routeId of tripRouteIds.values()) {
    const route = byRoute.get(routeId);
    if (route) route.trips += 1;
  }

  // ── 이벤트 배정: 선형 참조 ──
  let assigned = 0;
  let skippedNoTrack = 0;
  let skippedNoRoute = 0;

  for (const e of events) {
    const route = byRoute.get(tripRouteIds.get(e.trip_id));
    if (!route) {
      skippedNoRoute += 1;
      continue;
    }
    const routeKm = routeKmAt(tracks.get(e.trip_id), toEpoch(e.occurred_at), route.totalKm);
    if (routeKm == null) {
      skippedNoTrack += 1;
      continue;
    }
    const seg = route.segs[Math.min(Math.floor(routeKm / BIN_KM), route.segs.length - 1)];
    seg.event_count += 1;
    seg.events_by_type[e.event_type] = (seg.events_by_type[e.event_type] ?? 0) + 1;
    assigned += 1;
  }

  // ── 발생률 + 전 노선 통합 상대 순위 ──
  const flat = [];
  for (const route of byRoute.values()) {
    for (const seg of route.segs) {
      flat.push({ route, seg, rate: route.trips > 0 ? seg.event_count / route.trips : 0 });
    }
  }
  flat.sort((a, b) => b.rate - a.rate);

  flat.forEach((f, rank) => {
    let tone = 'ok';
    if (f.rate > 0 && rank < ROSE_TOP_N) tone = 'dead';
    else if (f.rate > 0 && rank < ROSE_TOP_N + AMBER_TOP_N) tone = 'warn';
    const byType = Object.entries(f.seg.events_by_type).sort((a, b) => b[1] - a[1]);
    Object.assign(f.seg, {
      rate_per_trip: r2(f.rate),
      rank_global: rank,
      tone,
      grade_label: LABEL[tone],
      dominant_type: byType[0]?.[0] ?? null,
      // 우세 유형이 전체의 몇 %인지 — 지도·목록에서 "무엇 위주 위험인가"를 한 줄로 보여주는 값
      dominant_share: byType[0] ? r2(byType[0][1] / f.seg.event_count) : 0,
    });
  });

  const rates = flat.map((f) => f.rate).sort((a, b) => a - b);
  const mean = rates.length ? rates.reduce((s, v) => s + v, 0) / rates.length : 0;
  const criteria = {
    total_segments: flat.length,
    segments_with_events: flat.filter((f) => f.seg.event_count > 0).length,
    dead_min_rate: r2(flat[ROSE_TOP_N - 1]?.rate ?? 0),
    warn_min_rate: r2(flat[ROSE_TOP_N + AMBER_TOP_N - 1]?.rate ?? 0),
    rate_mean: r2(mean),
    rate_median: r2(rates.length ? rates[Math.floor(rates.length / 2)] : 0),
    rate_max: r2(rates[rates.length - 1] ?? 0),
    verifiable_trips: [...byRoute.values()].reduce((s, r) => s + r.trips, 0),
  };

  // ── 출력 ──
  writeJson(join(DATA_OUT, 'routes.json'), {
    meta: {
      note: '노선 기준선. 운행데이터/route_roads_*.json (카카오모빌리티 길찾기 실도로 경로) 그대로.',
      generated_at: new Date().toISOString().slice(0, 10),
    },
    routes: [...byRoute.values()].map((r) => ({
      route_id: r.route_id,
      route_name: r.route_name,
      origin: { lat: r.polyline[0][0], lon: r.polyline[0][1] },
      destination: { lat: r.polyline.at(-1)[0], lon: r.polyline.at(-1)[1] },
      total_km: r2(r.totalKm),
      source: 'kakao_directions (route_roads json)',
      polyline: r.polyline,
    })),
  });

  writeJson(join(DATA_OUT, 'corridor.json'), {
    meta: {
      generated_from: [
        '운행데이터/trip.csv',
        '운행데이터/event.csv',
        '운행데이터/dtg_track.csv',
        '운행데이터/route_roads_*.json',
      ],
      note: '화물(트랙터) 실측 운행 전량 집계. 승용 차량은 화물 노선 대상이 아니라 제외. 이벤트 좌표를 쓰지 않고 누적 주행거리로 km 위치를 복원한다.',
      bin_km: BIN_KM,
      rose_top_n: ROSE_TOP_N,
      amber_top_n: AMBER_TOP_N,
      events_assigned: assigned,
      events_skipped_no_track: skippedNoTrack + skippedNoRoute,
      criteria,
    },
    routes: [...byRoute.values()].map((route) => ({
      route_id: route.route_id,
      route_name: route.route_name,
      trips: route.trips,
      segments: route.segs,
    })),
  });

  console.log(
    `이벤트 배정 ${assigned}건 · 궤적 미매칭 ${skippedNoTrack}건 · 노선 미매칭 ${skippedNoRoute}건`,
  );
  for (const route of byRoute.values()) {
    const worst = [...route.segs].sort((a, b) => b.event_count - a.event_count)[0];
    console.log(
      `  ${route.route_id} ${route.route_name}: ${r2(route.totalKm)}km, ${route.segs.length}구간, trips=${route.trips}` +
        `, 최다 구간 #${worst?.segment_no} (${worst?.km_from}~${worst?.km_to}km, ${worst?.event_count}건, ${worst?.grade_label}, ${worst?.dominant_type})`,
    );
  }
}

main();
