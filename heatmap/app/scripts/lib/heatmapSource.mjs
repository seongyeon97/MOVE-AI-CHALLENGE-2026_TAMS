// heatmapSource.mjs — 히트맵 원천(운행데이터/) 공용 로더.
// build-heatmap.mjs 와 build-segment-insights.mjs 가 같이 쓴다.
// 두 스크립트가 이벤트를 같은 자리에 배정해야 하므로 선형 참조 로직은 여기 하나뿐이다.
//
// 원천은 저장소 루트의 운행데이터/ 폴더뿐이다 — 화물(트랙터) 실측만 들어 있다.
// files2/ 의 승용 차량은 화물 노선을 달리지 않으므로 히트맵 대상이 아니다.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readCsv } from './csv.mjs';
import { downsamplePolyline, toEpoch, interpolateOdo } from './corridorShared.mjs';

/** app/ 기준 원천 폴더 */
export function sourceDir(appRoot) {
  return join(appRoot, '..', '운행데이터');
}

export function hasSource(appRoot) {
  return existsSync(sourceDir(appRoot));
}

/**
 * 운행데이터 CSV 는 BOM 이 붙어 있어 첫 컬럼명이 "﻿trip_id" 로 잡힌다.
 * 공유 파일인 lib/csv.mjs 를 건드리지 않고 여기서 헤더만 정규화한다.
 */
export function readSrcCsv(appRoot, name) {
  const rows = readCsv(join(sourceDir(appRoot), name));
  if (rows.length === 0) return rows;
  const bomKey = Object.keys(rows[0]).find((k) => k.charCodeAt(0) === 0xfeff);
  if (!bomKey) return rows;
  const clean = bomKey.slice(1);
  for (const row of rows) {
    row[clean] = row[bomKey];
    delete row[bomKey];
  }
  return rows;
}

/** route_roads_*.json 전부 → Map<route_id, { route_name, polyline }> (30m 다운샘플) */
export function loadRouteRoads(appRoot) {
  const dir = sourceDir(appRoot);
  const out = new Map();
  for (const f of readdirSync(dir)) {
    const m = f.match(/^route_roads_(.+)\.json$/);
    if (!m) continue;
    const j = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
    const polyline = downsamplePolyline(j.polyline, 0.03).map(([lat, lon]) => [
      Math.round(lat * 1e5) / 1e5,
      Math.round(lon * 1e5) / 1e5,
    ]);
    out.set(j.route_id ?? m[1], { route_name: j.route_name ?? m[1], polyline });
  }
  return out;
}

/**
 * dtg_track.csv 를 trip 단위로 읽는다.
 * 이 데이터의 odo_km 는 레그 경계에서 끊기지 않고 트립 전체로 이어진다(leg1 끝 = leg2 시작).
 * leg 단위로 쪼개면 2번째 레그 위치가 0km 로 되감긴다.
 * 반환: Map<trip_id, {t, odo, lat, lon, speed}[]> (시각 오름차순)
 */
export function loadTripTracks(appRoot) {
  const rows = readSrcCsv(appRoot, 'dtg_track.csv');
  const byTrip = new Map();
  for (const row of rows) {
    const t = toEpoch(row.ts);
    const odo = Number(row.odo_km);
    if (t == null || !Number.isFinite(odo)) continue;
    if (!byTrip.has(row.trip_id)) byTrip.set(row.trip_id, []);
    byTrip.get(row.trip_id).push({
      t,
      odo,
      lat: Number(row.lat) || 0,
      lon: Number(row.lon) || 0,
      speed: Number(row.speed_kmh) || 0,
    });
  }
  for (const arr of byTrip.values()) arr.sort((a, b) => a.t - b.t);
  return byTrip;
}

/**
 * 트립 궤적 위 임의 시각 → 노선 기점 기준 km. ★선형 참조 핵심★
 *
 * 이벤트 좌표를 쓰지 않는다. 발생 시각을 앞뒤 궤적 점 사이에 놓고 누적 주행거리를
 * 시간 비례로 복원한 뒤, 기준선 길이에 비례 환산한다.
 *
 * 축척이 필요한 이유: DTG 누적거리(≈202km)와 기준선 실도로 길이(≈195km)가 같지 않다.
 * 그대로 쓰면 뒤쪽 7km 분의 이벤트가 종점 구간에 뭉친다.
 *
 * @returns {number|null} 배정 불가면 null
 */
export function routeKmAt(track, epoch, totalKm) {
  if (!track || track.length < 2) return null;
  const odoAbs = interpolateOdo(track, epoch);
  if (odoAbs == null) return null;
  const base = track[0].odo;
  const tripKm = track[track.length - 1].odo - base;
  if (!(tripKm > 0)) return null;
  return Math.min(Math.max(((odoAbs - base) / tripKm) * totalKm, 0), totalKm);
}

/** trip.csv → Map<trip_id, route_id> */
export function loadTripRouteIds(appRoot) {
  const out = new Map();
  for (const t of readSrcCsv(appRoot, 'trip.csv')) {
    if (t.trip_id && t.route_id) out.set(t.trip_id, t.route_id);
  }
  return out;
}
