// CorridorMap.tsx — 히트맵 지도. 카카오맵 SDK 우선, 실패(키 없음/네트워크/6초 타임아웃) 시
// 오프라인 SVG 지도로 자동 폴백한다(§CLAUDE.md 4절 — 발표장 네트워크가 죽어도 이 화면은 산다).
// 양호 구간 = 도로를 따라가는 옅은 선, 주의·위험 구간 = 등급색 점. 색은 CSS 토큰에서 읽는다.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CorridorRoute, CorridorSegment, CorridorTone } from '../types';

type Props = {
  routes: CorridorRoute[];
  selectedKey: string | null; // `${route_id}-${segment_no}`
  onSelect: (key: string | null) => void;
};

const TONE_VAR: Record<CorridorTone, string> = {
  ok: '--color-teal',
  warn: '--color-amber',
  dead: '--color-rose',
};

/** CSS 토큰 → 실제 색 문자열 (카카오 SDK는 CSS 변수를 못 읽는다) */
function cssColor(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function segKey(routeId: string, seg: CorridorSegment): string {
  return `${routeId}-${seg.segment_no}`;
}

let sdkLoading: Promise<void> | null = null;
function loadKakaoSdk(): Promise<void> {
  const key = (import.meta.env.VITE_KAKAO_KEY as string | undefined) || undefined;
  if (!key) return Promise.reject(new Error('no kakao key'));
  if (window.kakao?.maps) return Promise.resolve();
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error('kakao sdk load failed'));
    document.head.appendChild(script);
    setTimeout(() => reject(new Error('kakao sdk load timeout')), 6000); // §CLAUDE.md 6초
  });
  return sdkLoading;
}

export function CorridorMap({ routes, selectedKey, onSelect }: Props) {
  const [mode, setMode] = useState<'loading' | 'kakao' | 'svg'>('loading');
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<Array<{ setMap: (m: unknown) => void }>>([]);

  useEffect(() => {
    let alive = true;
    loadKakaoSdk()
      .then(() => alive && setMode('kakao'))
      .catch(() => alive && setMode('svg'));
    return () => {
      alive = false;
    };
  }, []);

  // 카카오 지도 생성 + 오버레이 갱신
  useEffect(() => {
    if (mode !== 'kakao' || !mapEl.current || routes.length === 0) return;
    const kakao = window.kakao;

    if (!mapRef.current) {
      mapRef.current = new kakao.maps.Map(mapEl.current, {
        center: new kakao.maps.LatLng(routes[0].segments[0]?.centroid[0] ?? 36.5, routes[0].segments[0]?.centroid[1] ?? 127.8),
        level: 9,
      });
    }
    const map = mapRef.current;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const bounds = new kakao.maps.LatLngBounds();
    for (const route of routes) {
      for (const seg of route.segments) {
        const path = seg.polyline.map(([lat, lon]) => new kakao.maps.LatLng(lat, lon));
        path.forEach((p: unknown) => bounds.extend(p));
        const color = cssColor(TONE_VAR[seg.tone]);
        const isSelected = selectedKey === segKey(route.route_id, seg);

        // 양호: 옅은 선 / 주의·위험: 굵은 선 + 중심점
        const line = new kakao.maps.Polyline({
          path,
          strokeWeight: seg.tone === 'ok' ? 3 : 6,
          strokeColor: color,
          strokeOpacity: seg.tone === 'ok' ? 0.35 : 0.9,
          strokeStyle: 'solid',
        });
        line.setMap(map);
        overlaysRef.current.push(line);

        if (seg.tone !== 'ok') {
          const dot = new kakao.maps.Circle({
            center: new kakao.maps.LatLng(seg.centroid[0], seg.centroid[1]),
            radius: isSelected ? 450 : 300,
            strokeWeight: 2,
            strokeColor: color,
            strokeOpacity: 1,
            fillColor: color,
            fillOpacity: isSelected ? 0.75 : 0.45,
          });
          dot.setMap(map);
          kakao.maps.event.addListener(dot, 'click', () => {
            onSelect(isSelected ? null : segKey(route.route_id, seg));
          });
          overlaysRef.current.push(dot);
        }
      }
    }

    // 구간 선택 시 포커스 이동, 해제 시 전체 보기 복귀
    const selected = findSegment(routes, selectedKey);
    if (selected) {
      map.setLevel(6);
      map.setCenter(new kakao.maps.LatLng(selected.seg.centroid[0], selected.seg.centroid[1]));
    } else if (!bounds.isEmpty()) {
      map.setBounds(bounds, 40, 40, 40, 40);
    }
  }, [mode, routes, selectedKey, onSelect]);

  if (routes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border text-sm" style={{ borderColor: 'var(--color-line)', color: 'var(--color-dim)' }}>
        표시할 노선 없음
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden rounded-md border" style={{ borderColor: 'var(--color-line)' }}>
      {mode === 'kakao' && <div ref={mapEl} className="h-full w-full" />}
      {mode === 'svg' && <SvgFallbackMap routes={routes} selectedKey={selectedKey} onSelect={onSelect} />}
      {mode === 'loading' && (
        <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--color-dim)' }}>
          지도 불러오는 중…
        </div>
      )}
      {mode === 'svg' && (
        <span className="absolute left-2 top-2 rounded border px-1.5 py-0.5 text-xs" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)', color: 'var(--color-slate)' }}>
          오프라인 지도 (카카오맵 로드 실패 폴백)
        </span>
      )}
      <div className="absolute bottom-2 left-2 flex gap-3 rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)', color: 'var(--color-mist)' }}>
        <span className="flex items-center gap-1"><span className="tone-dead-rail inline-block h-2 w-2 rounded-full" />위험</span>
        <span className="flex items-center gap-1"><span className="tone-warn-rail inline-block h-2 w-2 rounded-full" />주의</span>
        <span className="flex items-center gap-1"><span className="tone-ok-rail inline-block h-2 w-2 rounded-full" style={{ opacity: 0.5 }} />양호(노선 기준선)</span>
      </div>
    </div>
  );
}

function findSegment(routes: CorridorRoute[], key: string | null) {
  if (!key) return null;
  for (const route of routes) {
    for (const seg of route.segments) {
      if (segKey(route.route_id, seg) === key) return { route, seg };
    }
  }
  return null;
}

/* ── 오프라인 SVG 폴백 — 등거리 원통 투영, 위경도 종횡비 보정 ── */
function SvgFallbackMap({ routes, selectedKey, onSelect }: Props) {
  const projected = useMemo(() => {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const r of routes) for (const s of r.segments) for (const [lat, lon] of s.polyline) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
    const W = 800, H = 600, PAD = 40;
    const lonScale = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const spanX = (maxLon - minLon) * lonScale || 1;
    const spanY = maxLat - minLat || 1;
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
    const px = ([lat, lon]: [number, number]): [number, number] => [
      PAD + (lon - minLon) * lonScale * scale,
      H - PAD - (lat - minLat) * scale,
    ];
    return { W, H, px };
  }, [routes]);

  const { W, H, px } = projected;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" style={{ background: 'var(--color-panel-2)' }} role="img" aria-label="노선 위험구간 오프라인 지도">
      {routes.map((route) =>
        route.segments.map((seg) => {
          const d = seg.polyline.map((pt, i) => `${i === 0 ? 'M' : 'L'}${px(pt)[0].toFixed(1)},${px(pt)[1].toFixed(1)}`).join(' ');
          return (
            <path
              key={segKey(route.route_id, seg)}
              d={d}
              fill="none"
              stroke={`var(${TONE_VAR[seg.tone]})`}
              strokeWidth={seg.tone === 'ok' ? 2 : 5}
              strokeOpacity={seg.tone === 'ok' ? 0.3 : 0.9}
              strokeLinecap="round"
            />
          );
        }),
      )}
      {routes.map((route) =>
        route.segments
          .filter((s) => s.tone !== 'ok')
          .map((seg) => {
            const key = segKey(route.route_id, seg);
            const [cx, cy] = px(seg.centroid);
            const isSelected = selectedKey === key;
            return (
              <circle
                key={key}
                cx={cx}
                cy={cy}
                r={isSelected ? 11 : 7}
                fill={`var(${TONE_VAR[seg.tone]})`}
                fillOpacity={isSelected ? 0.95 : 0.7}
                stroke="var(--color-paper)"
                strokeWidth={isSelected ? 2 : 0}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(isSelected ? null : key)}
              >
                <title>{`${route.route_name} ${seg.km_from}~${seg.km_to}km · ${seg.grade_label} · ${seg.event_count}건`}</title>
              </circle>
            );
          }),
      )}
    </svg>
  );
}
