// build-routes.mjs — 노선 기준선 폴리라인 생성 (수동 실행 전용, 네트워크 필요).
// 기본 build:data 파이프라인에 넣지 않는다 — 키 없는 환경에서 빌드가 깨지면 안 된다.
//
//   node scripts/build-routes.mjs        → public/data/routes.json (커밋 대상)
//
// 노선 목록: files2/leg.csv 의 OUT 방향 origin_site→destination_site 쌍에서 자동 도출.
//            leg.csv 없으면 routes.config.json 의 routes 배열 사용.
// 기준선:    1차 카카오모빌리티 길찾기 REST(실제 도로 경로).
//            실패 시 dtg_track.csv 의 OUT 방향 GPS 궤적으로 폴백.
// 좌표 조회: routes.config.json sites override → 카카오 키워드 검색 1위.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { writeJson } from './lib/csv.mjs';
import {
  loadEnv,
  loadLegIndex,
  loadTracks,
  cumulativeKm,
  downsamplePolyline,
  r2,
} from './lib/corridorShared.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const OUT_PATH = join(ROOT, 'public', 'data', 'routes.json');

const env = loadEnv(ROOT);
const REST_KEY = env.get('KAKAO_REST_API_KEY');

async function kakaoGet(url) {
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${REST_KEY}` } });
  if (!res.ok) throw new Error(`kakao ${res.status}: ${await res.text()}`);
  return res.json();
}

/** 사업장명 → 좌표. config override 우선, 없으면 키워드 검색 1위. */
async function resolveSite(name, overrides) {
  const o = overrides[name];
  if (o && Number.isFinite(o.lat) && Number.isFinite(o.lon)) {
    return { name, lat: o.lat, lon: o.lon, source: 'config' };
  }
  const data = await kakaoGet(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(name)}&size=1`,
  );
  const doc = data.documents?.[0];
  if (!doc) throw new Error(`사업장 좌표 못 찾음: "${name}" — routes.config.json sites에 좌표를 직접 넣어라`);
  return { name, lat: Number(doc.y), lon: Number(doc.x), source: `kakao_keyword(${doc.place_name})` };
}

/** 카카오모빌리티 길찾기 → [[lat,lon],…] */
async function fetchDirections(origin, dest) {
  const url =
    `https://apis-navi.kakaomobility.com/v1/directions` +
    `?origin=${origin.lon},${origin.lat}&destination=${dest.lon},${dest.lat}` +
    `&priority=RECOMMEND&car_type=4`; // car_type 4 = 대형화물
  const data = await kakaoGet(url);
  const route = data.routes?.[0];
  if (!route || route.result_code !== 0) {
    throw new Error(`길찾기 실패: ${route?.result_msg ?? 'no route'}`);
  }
  const pts = [];
  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      const v = road.vertexes ?? []; // [x,y,x,y,…] = [lon,lat,…]
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i + 1], v[i]]);
    }
  }
  if (pts.length < 2) throw new Error('길찾기 응답에 vertexes 없음');
  return pts;
}

/** 폴백: dtg_track.csv 의 OUT 방향 궤적 중 가장 점이 많은 레그 1개 */
async function fallbackFromTrack(routeKey, legIndex) {
  const tracks = await loadTracks(FILES2, null);
  if (!tracks || !legIndex) return null;
  let best = null;
  for (const [tripId, key] of legIndex.routeKeyByTrip) {
    if (key !== routeKey) continue;
    for (const [legKey, meta] of legIndex.legByKey) {
      if (!legKey.startsWith(`${tripId}|`) || meta.direction !== 'OUT') continue;
      const track = tracks.perLeg ? tracks.byKey.get(legKey) : tracks.byKey.get(tripId);
      const pts = (track ?? []).filter((p) => p.lat !== 0 && p.lon !== 0).map((p) => [p.lat, p.lon]);
      if (pts.length >= 2 && (!best || pts.length > best.length)) best = pts;
    }
  }
  return best;
}

async function main() {
  const config = JSON.parse(readFileSync(join(__dirname, 'routes.config.json'), 'utf-8'));
  const legIndex = loadLegIndex(FILES2);

  // 노선 목록 도출: leg.csv 우선, 없으면 config
  let pairs = [];
  if (legIndex) {
    pairs = [...new Set(legIndex.routeKeyByTrip.values())].sort();
    console.log(`leg.csv에서 노선 ${pairs.length}개 도출: ${pairs.join(', ')}`);
  } else if (config.routes?.length) {
    pairs = config.routes.map((r) => `${r.origin_site}|${r.destination_site}`);
    console.log(`routes.config.json에서 노선 ${pairs.length}개 사용`);
  } else {
    console.log('노선 원천 없음(files2/leg.csv 도, routes.config.json routes 도 비어 있음) — 건너뜀.');
    console.log('실측 CSV를 files2/에 넣은 뒤 다시 실행: node scripts/build-routes.mjs');
    return;
  }

  if (!REST_KEY) {
    console.error('KAKAO_REST_API_KEY 없음 — app/.env 확인.');
    process.exitCode = 1;
    return;
  }

  const routes = [];
  for (let i = 0; i < pairs.length; i += 1) {
    const [originName, destName] = pairs[i].split('|');
    const routeId = `R${String(i + 1).padStart(2, '0')}`;
    try {
      const origin = await resolveSite(originName, config.sites ?? {});
      const dest = await resolveSite(destName, config.sites ?? {});
      console.log(`\n${routeId} ${originName} — ${destName}`);
      console.log(`  기점 ${origin.lat},${origin.lon} (${origin.source}) / 종점 ${dest.lat},${dest.lon} (${dest.source})`);

      let polyline;
      let source = 'kakao_directions';
      try {
        polyline = await fetchDirections(origin, dest);
      } catch (err) {
        console.warn(`  길찾기 실패(${err.message}) → OUT 방향 GPS 궤적 폴백 시도`);
        polyline = await fallbackFromTrack(pairs[i], legIndex);
        source = 'gps_track_out';
        if (!polyline) throw new Error('길찾기·GPS 궤적 둘 다 실패');
      }

      // 30m 간격 다운샘플 + 소수 5자리(≈1m) 반올림 — JSON 크기 억제
      polyline = downsamplePolyline(polyline, 0.03)
        .map(([lat, lon]) => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]);
      const km = cumulativeKm(polyline);
      routes.push({
        route_id: routeId,
        route_name: `${originName} — ${destName}`,
        origin_site: originName,
        destination_site: destName,
        origin: { lat: origin.lat, lon: origin.lon },
        destination: { lat: dest.lat, lon: dest.lon },
        total_km: r2(km[km.length - 1]),
        source,
        polyline,
      });
      console.log(`  기준선 ${polyline.length}점 · ${r2(km[km.length - 1])}km · 출처 ${source}`);
    } catch (err) {
      console.error(`  ${routeId} 실패: ${err.message}`);
    }
  }

  if (routes.length === 0) {
    console.error('\n생성된 노선 0개 — routes.json 안 씀(기존 파일 보존).');
    process.exitCode = 1;
    return;
  }
  writeJson(OUT_PATH, {
    meta: {
      note: '노선 기준선. 카카오모빌리티 길찾기(실제 도로 경로) 기반, 실패 시 OUT 방향 GPS 궤적 폴백.',
      generated_at: new Date().toISOString().slice(0, 10),
    },
    routes,
  });
  console.log(`\n→ ${OUT_PATH} (노선 ${routes.length}개)`);
}

main();
