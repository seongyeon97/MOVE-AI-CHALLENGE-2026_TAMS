// corridorShared.mjs — 히트맵(트랙7) 공용 유틸.
// build-routes / build-corridor-hotspots / build-segment-insights 셋이 같이 쓴다.
// 핵심: 이벤트 좌표를 쓰지 않는다. 선형 참조(누적 주행거리)로 위치를 복원한다.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { streamCsv, readCsv } from './csv.mjs';

/* ── env ───────────────────────────────────────────────────────────── */

/**
 * app/.env 를 파싱해 반환한다. .env 값이 process.env 를 이긴다 —
 * 셸에 남은 낡은 키가 .env 의 정상 키를 가리는 사고 방지.
 */
export function loadEnv(rootDir) {
  const out = {};
  const path = join(rootDir, '.env');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return {
    get(key) {
      return out[key] || process.env[key] || undefined;
    },
  };
}

/* ── 기하 ──────────────────────────────────────────────────────────── */

const R_EARTH_KM = 6371;

export function haversineKm(a, b) {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(s));
}

/** 북=0, 시계방향 방위각(도) */
export function bearingDeg(a, b) {
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** 폴리라인의 누적거리 배열(km). km[0]=0. */
export function cumulativeKm(ref) {
  const km = [0];
  for (let i = 1; i < ref.length; i += 1) km.push(km[i - 1] + haversineKm(ref[i - 1], ref[i]));
  return km;
}

/** 기준선 위 임의의 km 지점을 좌표로 보간 — 항상 도로 위에 찍힌다. */
export function pointAtKm(ref, km, targetKm) {
  const last = km.length - 1;
  if (targetKm <= km[0]) return ref[0];
  if (targetKm >= km[last]) return ref[last];
  let i = 0;
  while (i < last && km[i + 1] < targetKm) i += 1;
  const span = km[i + 1] - km[i];
  const frac = span > 0 ? (targetKm - km[i]) / span : 0;
  return [
    ref[i][0] + frac * (ref[i + 1][0] - ref[i][0]),
    ref[i][1] + frac * (ref[i + 1][1] - ref[i][1]),
  ];
}

/** 기준선에서 [fromKm, toKm] 구간만 잘라낸 좌표 배열 (양끝은 보간점). */
export function slicePolyline(ref, km, fromKm, toKm) {
  const out = [pointAtKm(ref, km, fromKm)];
  for (let i = 0; i < ref.length; i += 1) {
    if (km[i] > fromKm && km[i] < toKm) out.push(ref[i]);
  }
  out.push(pointAtKm(ref, km, toKm));
  return out;
}

/** 폴리라인을 최소 간격(km)으로 다운샘플. 양끝은 항상 유지. */
export function downsamplePolyline(ref, minGapKm = 0.03) {
  if (ref.length <= 2) return ref;
  const out = [ref[0]];
  let acc = 0;
  for (let i = 1; i < ref.length - 1; i += 1) {
    acc += haversineKm(ref[i - 1], ref[i]);
    if (acc >= minGapKm) {
      out.push(ref[i]);
      acc = 0;
    }
  }
  out.push(ref[ref.length - 1]);
  return out;
}

export const r2 = (v) => Math.round(v * 100) / 100;

/* ── 시간 ──────────────────────────────────────────────────────────── */

export function toEpoch(ts) {
  const t = Date.parse(String(ts).replace(' ', 'T'));
  return Number.isFinite(t) ? t / 1000 : null;
}

/** occurred_at 시각의 누적주행거리를 두 궤적 점 사이 시간 비례로 복원 (선형 참조 ★핵심★) */
export function interpolateOdo(track, eventEpoch) {
  if (track.length === 0 || eventEpoch == null) return null;
  if (eventEpoch <= track[0].t) return track[0].odo;
  const last = track.length - 1;
  if (eventEpoch >= track[last].t) return track[last].odo;
  let i = 0;
  while (i < last && track[i + 1].t < eventEpoch) i += 1;
  const span = track[i + 1].t - track[i].t;
  const frac = span > 0 ? (eventEpoch - track[i].t) / span : 0;
  return track[i].odo + frac * (track[i + 1].odo - track[i].odo);
}

/* ── 원천 데이터 로딩 (A·B 스크립트가 동일 로직 공유 — 같은 자리를 가리켜야 한다) ── */

/**
 * leg.csv 를 읽어 legKey(`trip|leg`) → { direction, origin_site, destination_site } 맵과
 * trip → routeKey(`origin|destination`, OUT 기준) 맵을 만든다.
 */
export function loadLegIndex(files2Dir) {
  const path = join(files2Dir, 'leg.csv');
  if (!existsSync(path)) return null;
  const legs = readCsv(path);
  const legByKey = new Map();
  const routeKeyByTrip = new Map();
  for (const l of legs) {
    const direction = (l.direction || 'OUT').toUpperCase();
    legByKey.set(`${l.trip_id}|${l.leg_no}`, {
      direction,
      origin_site: l.origin_site ?? '',
      destination_site: l.destination_site ?? '',
    });
    // OUT 레그의 기점→종점 쌍이 노선 식별자. IN만 있으면 뒤집어 등록.
    if (!routeKeyByTrip.has(l.trip_id)) {
      routeKeyByTrip.set(
        l.trip_id,
        direction === 'IN'
          ? `${l.destination_site}|${l.origin_site}`
          : `${l.origin_site}|${l.destination_site}`,
      );
    } else if (direction === 'OUT') {
      routeKeyByTrip.set(l.trip_id, `${l.origin_site}|${l.destination_site}`);
    }
  }
  return { legByKey, routeKeyByTrip };
}

/**
 * dtg_track.csv 를 스트리밍으로 읽어 trusted trip 궤적만 메모리에 남긴다.
 * leg_no 컬럼이 있으면 legKey(`trip|leg`) 단위, 없으면 trip 단위로 담는다.
 * 반환: { byKey: Map<key, {t, odo, lat, lon, speed}[]>, perLeg: boolean }
 */
export async function loadTracks(files2Dir, trustedTripIds) {
  const path = join(files2Dir, 'dtg_track.csv');
  if (!existsSync(path)) return null;
  const byKey = new Map();
  let hasLegNo = false;
  let checkedHeader = false;
  await streamCsv(path, (row) => {
    if (!checkedHeader) {
      hasLegNo = row.leg_no !== undefined;
      checkedHeader = true;
    }
    if (trustedTripIds && !trustedTripIds.has(row.trip_id)) return;
    const t = toEpoch(row.ts);
    const odo = Number(row.odo_km);
    if (t == null || !Number.isFinite(odo)) return;
    const key = hasLegNo ? `${row.trip_id}|${row.leg_no}` : row.trip_id;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({
      t,
      odo,
      lat: Number(row.lat) || 0,
      lon: Number(row.lon) || 0,
      speed: Number(row.speed_kmh) || 0,
    });
  });
  for (const arr of byKey.values()) arr.sort((a, b) => a.t - b.t);
  return { byKey, perLeg: hasLegNo };
}

/**
 * 이벤트/궤적점의 노선 기점 기준 누적거리(km)를 계산한다.
 * - perLeg: 레그 시작 odo를 0으로 정규화한 뒤 IN 방향은 뒤집는다.
 * - trip 단위 궤적(레그 구분 없음): 왕복 연속 odo 로 보고 IN 은 2·totalKm − odo 로 환산.
 * 반환 null = 배정 불가.
 */
export function toRouteKm({ tracks, legByKey, tripId, legNo, epoch, totalKm }) {
  const legKey = `${tripId}|${legNo}`;
  const direction = legByKey.get(legKey)?.direction ?? 'OUT';
  const track = tracks.perLeg ? tracks.byKey.get(legKey) : tracks.byKey.get(tripId);
  if (!track || track.length === 0) return null;
  const odoAbs = interpolateOdo(track, epoch);
  if (odoAbs == null) return null;
  const odoRel = odoAbs - track[0].odo; // 궤적 시작점 기준 상대 주행거리

  let routeKm;
  if (tracks.perLeg) {
    routeKm = direction === 'IN' ? totalKm - odoRel : odoRel;
  } else {
    // 왕복 연속 odo: OUT 은 [0,totalKm], IN 은 [totalKm, 2totalKm] 대역
    routeKm = direction === 'IN' ? 2 * totalKm - odoRel : odoRel;
  }
  return Math.min(Math.max(routeKm, 0), totalKm);
}
