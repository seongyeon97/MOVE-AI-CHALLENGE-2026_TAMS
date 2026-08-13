// build-corridor-hotspots.mjs — 구간 위험도 집계 (A 산출물). 결정론적 통계, AI 미개입.
// 기본 build:data 파이프라인 포함 — 네트워크 불필요, 로컬 파일만 읽는다.
//
// 원칙:
//  1) verifiable(신뢰등급 정상) 차량 이벤트만 집계 — 아니면 "센서 이상 차량이 지나간 자리"가 핫스팟으로 잡힌다.
//  2) 이벤트 좌표를 쓰지 않는다. 누적 주행거리 기반 선형 참조로 km 위치를 복원한다(2분 샘플링 대응).
//  3) 등급은 절대 임계값이 아니라 전 구간 발생률 상대 순위 — 상위 3개 위험(dead), 다음 5개 주의(warn).
//
// 입력이 없으면(실측 CSV 미투입) 빈 corridor.json을 써서 화면이 빈 상태로 뜨게 한다 — 에러 아님.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, writeJson } from './lib/csv.mjs';
import {
  loadLegIndex,
  loadTracks,
  cumulativeKm,
  pointAtKm,
  slicePolyline,
  toEpoch,
  toRouteKm,
  r2,
} from './lib/corridorShared.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const DATA_OUT = join(ROOT, 'public', 'data');
const OUT_PATH = join(DATA_OUT, 'corridor.json');

const BIN_KM = 1; // 구간 폭
const ROSE_TOP_N = 3; // 위험 등급 개수 (전체 기준, 노선별 아님)
const AMBER_TOP_N = 5; // 주의 등급 개수

function emptyBundle(reason) {
  return {
    meta: {
      generated_from: [],
      note: `집계 원천 없음(${reason}) — 실측 CSV 투입 전 빈 상태. 에러 아님.`,
      bin_km: BIN_KM,
      rose_top_n: ROSE_TOP_N,
      amber_top_n: AMBER_TOP_N,
      events_assigned: 0,
      events_skipped_no_track: 0,
      criteria: {
        total_segments: 0,
        segments_with_events: 0,
        dead_min_rate: 0,
        warn_min_rate: 0,
        rate_mean: 0,
        rate_median: 0,
        rate_max: 0,
        verifiable_trips: 0,
      },
    },
    routes: [],
  };
}

async function main() {
  // ── 입력 확인 ──
  const routesPath = join(DATA_OUT, 'routes.json');
  const certsPath = join(DATA_OUT, 'certificates.json');
  const missing = [];
  if (!existsSync(routesPath)) missing.push('public/data/routes.json (node scripts/build-routes.mjs 로 생성)');
  if (!existsSync(certsPath)) missing.push('public/data/certificates.json (build:data 산출)');
  for (const f of ['leg.csv', 'event.csv', 'dtg_track.csv']) {
    if (!existsSync(join(FILES2, f))) missing.push(`files2/${f}`);
  }
  if (missing.length > 0) {
    console.log(`corridor 집계 건너뜀 — 없음: ${missing.join(', ')}`);
    writeJson(OUT_PATH, emptyBundle(missing.join(', ')));
    console.log(`→ ${OUT_PATH} (빈 번들)`);
    return;
  }

  const routesJson = JSON.parse(readFileSync(routesPath, 'utf-8'));
  const certs = JSON.parse(readFileSync(certsPath, 'utf-8'));

  // ── 2-0. 신뢰도 필터: verifiable 운송건만 ──
  const certList = Array.isArray(certs) ? certs : certs.certificates ?? [];
  const trusted = certList.filter((c) => c.verifiable);
  const trustedTripIds = new Set(trusted.map((c) => c.trip_id));

  // ── 2-1. 구간 뼈대: 노선 기준선을 1km 단위 슬라이싱 ──
  const byRoute = new Map(); // routeKey → route 작업객체
  for (const r of routesJson.routes) {
    const ref = r.polyline;
    const km = cumulativeKm(ref);
    const totalKm = km[km.length - 1];
    const nBins = Math.max(1, Math.ceil(totalKm / BIN_KM));
    const segs = [];
    for (let i = 0; i < nBins; i += 1) {
      const kmFrom = i * BIN_KM;
      const kmTo = Math.min((i + 1) * BIN_KM, totalKm);
      segs.push({
        segment_no: i + 1,
        centroid: pointAtKm(ref, km, (kmFrom + kmTo) / 2).map((v) => Math.round(v * 1e5) / 1e5),
        polyline: slicePolyline(ref, km, kmFrom, kmTo).map(([a, b]) => [
          Math.round(a * 1e5) / 1e5,
          Math.round(b * 1e5) / 1e5,
        ]),
        km_from: r2(kmFrom),
        km_to: r2(kmTo),
        event_count: 0,
        events_by_type: {},
      });
    }
    byRoute.set(`${r.origin_site}|${r.destination_site}`, {
      route_id: r.route_id,
      route_name: r.route_name,
      totalKm,
      segs,
      trips: 0,
    });
  }

  // ── trip → 노선 매핑 + 발생률 분모(노선별 verifiable 운행 건수) ──
  const legIndex = loadLegIndex(FILES2);
  for (const c of trusted) {
    const key = legIndex.routeKeyByTrip.get(c.trip_id);
    const route = byRoute.get(key);
    if (route) route.trips += 1;
  }

  // ── 2-2. 선형 참조로 이벤트를 구간에 배정 ──
  const tracks = await loadTracks(FILES2, trustedTripIds);
  const events = readCsv(join(FILES2, 'event.csv'));
  let assigned = 0;
  let skippedNoTrack = 0;
  let skippedUntrusted = 0;

  for (const e of events) {
    if (!trustedTripIds.has(e.trip_id)) {
      skippedUntrusted += 1;
      continue;
    }
    const route = byRoute.get(legIndex.routeKeyByTrip.get(e.trip_id));
    if (!route) {
      skippedNoTrack += 1;
      continue;
    }
    const routeKm = toRouteKm({
      tracks,
      legByKey: legIndex.legByKey,
      tripId: e.trip_id,
      legNo: e.leg_no,
      epoch: toEpoch(e.occurred_at),
      totalKm: route.totalKm,
    });
    if (routeKm == null) {
      skippedNoTrack += 1;
      continue;
    }
    const seg = route.segs[Math.min(Math.floor(routeKm / BIN_KM), route.segs.length - 1)];
    seg.event_count += 1;
    seg.events_by_type[e.event_type] = (seg.events_by_type[e.event_type] ?? 0) + 1;
    assigned += 1;
  }

  // ── 2-3. 발생률 + 전 노선 통합 상대 순위 ──
  const flat = [];
  for (const route of byRoute.values()) {
    for (const seg of route.segs) {
      const rate = route.trips > 0 ? seg.event_count / route.trips : 0;
      flat.push({ route, seg, rate });
    }
  }
  flat.sort((a, b) => b.rate - a.rate);

  const toneOf = (rank, rate) => {
    if (rate <= 0) return 'ok';
    if (rank < ROSE_TOP_N) return 'dead';
    if (rank < ROSE_TOP_N + AMBER_TOP_N) return 'warn';
    return 'ok';
  };
  const LABEL = { dead: '위험', warn: '주의', ok: '양호' };

  flat.forEach((f, rank) => {
    const tone = toneOf(rank, f.rate);
    Object.assign(f.seg, {
      rate_per_trip: r2(f.rate),
      rank_global: rank,
      tone,
      grade_label: LABEL[tone],
      dominant_type:
        Object.entries(f.seg.events_by_type).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    });
  });

  // ── 2-4. 판정 근거 공개용 통계 ──
  const rates = flat.map((f) => f.rate).sort((a, b) => a - b);
  const mean = rates.length ? rates.reduce((s, v) => s + v, 0) / rates.length : 0;
  const median = rates.length ? rates[Math.floor(rates.length / 2)] : 0;
  const criteria = {
    total_segments: flat.length,
    segments_with_events: flat.filter((f) => f.seg.event_count > 0).length,
    dead_min_rate: r2(flat[ROSE_TOP_N - 1]?.rate ?? 0),
    warn_min_rate: r2(flat[ROSE_TOP_N + AMBER_TOP_N - 1]?.rate ?? 0),
    rate_mean: r2(mean),
    rate_median: r2(median),
    rate_max: r2(rates[rates.length - 1] ?? 0),
    verifiable_trips: [...byRoute.values()].reduce((s, r) => s + r.trips, 0),
  };

  // ── 2-5. 출력 ──
  writeJson(OUT_PATH, {
    meta: {
      generated_from: [
        'files2/leg.csv',
        'files2/event.csv',
        'files2/dtg_track.csv',
        'public/data/routes.json',
        'public/data/certificates.json (verifiable 필터)',
      ],
      note: '신뢰등급 정상 차량 이벤트만 집계. 이벤트 좌표를 쓰지 않고 선형 참조로 km 위치를 복원한다.',
      bin_km: BIN_KM,
      rose_top_n: ROSE_TOP_N,
      amber_top_n: AMBER_TOP_N,
      events_assigned: assigned,
      events_skipped_no_track: skippedNoTrack,
      criteria,
    },
    routes: [...byRoute.values()].map((route) => ({
      route_id: route.route_id,
      route_name: route.route_name,
      trips: route.trips,
      segments: route.segs,
    })),
  });

  // 눈검사용 콘솔 출력 (§8-2)
  console.log(
    `이벤트 배정 ${assigned}건 · 궤적 미매칭 제외 ${skippedNoTrack}건 · 비신뢰 제외 ${skippedUntrusted}건`,
  );
  for (const route of byRoute.values()) {
    const worst = [...route.segs].sort((a, b) => b.event_count - a.event_count)[0];
    console.log(
      `  ${route.route_id} ${route.route_name}: trips=${route.trips}, 최고위험 구간 #${worst?.segment_no} (${worst?.km_from}~${worst?.km_to}km, ${worst?.event_count}건, ${worst?.grade_label})`,
    );
  }
  console.log(`→ ${OUT_PATH}`);
}

main();
