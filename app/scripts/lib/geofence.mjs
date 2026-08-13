// geofence.mjs — 선분-원 교차 판정. 점 포함 판정(dist(point,center)<R) 절대 쓰지 않는다.
// 2분 샘플링 + 시속 80km면 2.7km를 이동해 반경 1km 원을 통째로 건너뛴다(산출기준서 §4).

const EARTH_RADIUS_M = 6371000;

/** center를 원점으로 하는 로컬 평면(m) 좌표로 투영한다 — 근거리 등거리원통 근사. */
function projectToLocalMeters(lat, lon, center) {
  const x = ((lon - center.lon) * Math.PI) / 180 * EARTH_RADIUS_M * Math.cos((center.lat * Math.PI) / 180);
  const y = ((lat - center.lat) * Math.PI) / 180 * EARTH_RADIUS_M;
  return { x, y };
}

/**
 * 선분 p0→p1이 center 반경 radius_m 원과 교차하는 t(0~1) 목록을 반환한다.
 * 각 t에 진입(entering, 원에 가까워짐)/이탈(exiting) 방향도 함께 준다.
 */
export function segmentCircleCrossings(p0, p1, center, radius_m) {
  const a0 = projectToLocalMeters(p0.lat, p0.lon, center);
  const a1 = projectToLocalMeters(p1.lat, p1.lon, center);
  const dx = a1.x - a0.x;
  const dy = a1.y - a0.y;

  const A = dx * dx + dy * dy;
  if (A === 0) return [];
  const B = 2 * (a0.x * dx + a0.y * dy);
  const C = a0.x * a0.x + a0.y * a0.y - radius_m * radius_m;
  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0) return [];

  const sqrtD = Math.sqrt(discriminant);
  const roots = [(-B - sqrtD) / (2 * A), (-B + sqrtD) / (2 * A)].filter((t) => t >= 0 && t <= 1);

  return roots.map((t) => {
    // t 시점 직전·직후 거리 변화로 진입/이탈 판정 — 미분(2At+B)의 부호.
    const derivative = 2 * A * t + B;
    return { t, entering: derivative < 0 };
  });
}

/**
 * 2분 간격 위치 점 폴리라인에서 site 원을 이탈(exit)/진입(enter)한 첫 시각을 찾는다.
 * 오차는 ±샘플링간격/2로 함께 낸다.
 */
export function findCrossing(points, site, { after = -Infinity, want } = {}) {
  if (points.length < 2) return null;

  const intervals = [];
  for (let i = 1; i < points.length; i++) {
    intervals.push((new Date(points[i].ts).getTime() - new Date(points[i - 1].ts).getTime()) / 1000);
  }
  const samplingIntervalSec = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 120;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const crossings = segmentCircleCrossings(p0, p1, site, site.radius_m);
    for (const c of crossings) {
      const wantEntering = want === 'enter';
      if (c.entering !== wantEntering) continue;
      const t0 = new Date(p0.ts).getTime();
      const t1 = new Date(p1.ts).getTime();
      const ts = new Date(t0 + c.t * (t1 - t0));
      if (ts.getTime() <= after) continue;
      return { ts: ts.toISOString(), error_sec: samplingIntervalSec / 2 };
    }
  }
  return null;
}
