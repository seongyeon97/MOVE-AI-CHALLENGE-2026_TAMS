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

/** "급감속 68%" — 이 구간이 무엇 위주의 위험인지 한 조각으로 */
function dominantLabel(seg: CorridorSegment): string | null {
  if (!seg.dominant_type) return null;
  const share = seg.dominant_share;
  return share == null ? seg.dominant_type : `${seg.dominant_type} ${Math.round(share * 100)}%`;
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

/**
 * 위험·주의 구간 마커 DOM. 등급색 점 + "무엇 위주인가" 라벨을 한 덩어리로 만든다.
 * 카카오 CustomOverlay는 CSS 클래스가 아니라 노드를 받으므로 여기서 직접 조립한다.
 */
function markerNode(
  seg: CorridorSegment,
  color: string,
  isSelected: boolean,
  onClick: () => void,
): HTMLElement {
  // 크기 0인 앵커 박스를 구간 좌표에 놓고, 점만 그 위에 정확히 겹치게 한다.
  // flex 한 줄로 만들면 점이 라벨 폭만큼 왼쪽으로 밀려 도로에서 벗어난다.
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:0;height:0;cursor:pointer;white-space:nowrap;';

  const dot = document.createElement('span');
  const size = isSelected ? 18 : 13;
  dot.style.cssText =
    `position:absolute;left:0;top:0;transform:translate(-50%,-50%);` +
    `width:${size}px;height:${size}px;border-radius:9999px;background:${color};` +
    `border:2px solid var(--color-paper);` +
    `box-shadow:0 0 0 4px color-mix(in srgb, ${color} 35%, transparent);`;
  wrap.appendChild(dot);

  const pill = document.createElement('span');
  // 라벨은 점 오른쪽 위로 비켜 세운다 — 도로 위에 겹쳐 앉으면 경로가 가려진다.
  pill.style.cssText =
    `position:absolute;left:${size / 2 + 8}px;top:0;transform:translateY(-140%);` +
    'display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;' +
    `border:1px solid ${color};background:var(--color-panel);color:var(--color-paper);` +
    `font-size:11px;line-height:1.3;box-shadow:0 1px 4px rgb(0 0 0 / 0.4);`;
  const grade = document.createElement('b');
  grade.textContent = seg.grade_label;
  grade.style.color = color;
  pill.appendChild(grade);
  const label = dominantLabel(seg);
  if (label) {
    const t = document.createElement('span');
    t.textContent = `· ${label}`;
    pill.appendChild(t);
  }
  const rate = document.createElement('span');
  rate.textContent = `· ${seg.rate_per_trip.toFixed(2)}건/trip`;
  rate.style.color = 'var(--color-slate)';
  pill.appendChild(rate);
  wrap.appendChild(pill);

  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return wrap;
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
          strokeWeight: seg.tone === 'ok' ? 6 : 12,
          strokeColor: color,
          strokeOpacity: seg.tone === 'ok' ? 0.55 : 0.95,
          strokeStyle: 'solid',
        });
        line.setMap(map);
        overlaysRef.current.push(line);

        if (seg.tone !== 'ok') {
          // Circle은 반지름이 미터 단위라 195km 전체 보기에서 2px로 사라진다.
          // 축척과 무관하게 같은 크기로 보이도록 픽셀 단위 CustomOverlay를 쓴다.
          const marker = new kakao.maps.CustomOverlay({
            position: new kakao.maps.LatLng(seg.centroid[0], seg.centroid[1]),
            content: markerNode(seg, color, isSelected, () =>
              onSelect(isSelected ? null : segKey(route.route_id, seg)),
            ),
            // 콘텐츠가 0x0 앵커 박스이므로 앵커는 0 — 점이 좌표 위에 정확히 놓인다
            yAnchor: 0,
            xAnchor: 0,
            zIndex: isSelected ? 30 : seg.tone === 'dead' ? 20 : 10,
            clickable: true,
          });
          marker.setMap(map);
          overlaysRef.current.push(marker);
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

/**
 * 마커 좌표 계산 + 라벨 겹침 해소.
 * 핫스팟은 상하차지·게이트에 몰려 나오므로 화면에서도 몇 픽셀 안에 붙는다 —
 * 글자를 그대로 두면 서로 덮어써서 둘 다 못 읽는다. 이미 놓은 라벨과 겹치면 아래로 밀어낸다.
 */
function placeMarkers(
  routes: CorridorRoute[],
  px: (pt: [number, number]) => [number, number],
  selectedKey: string | null,
) {
  const LINE_H = 15; // 글자 높이 + 여백
  const NEAR_X = 170; // 이 안에서 x가 겹치면 같은 줄로 본다
  const placed: { x: number; y: number }[] = [];

  return routes.flatMap((route) =>
    route.segments
      .filter((s) => s.tone !== 'ok')
      .map((seg) => {
        const [cx, cy] = px(seg.centroid);
        const key = segKey(route.route_id, seg);
        const isSelected = selectedKey === key;
        const x = cx + (isSelected ? 20 : 15);
        let y = cy + 4;
        while (placed.some((p) => Math.abs(p.y - y) < LINE_H && Math.abs(p.x - x) < NEAR_X)) {
          y += LINE_H;
        }
        placed.push({ x, y });
        return { route, seg, key, cx, cy, labelY: y, isSelected };
      }),
  );
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
              strokeWidth={seg.tone === 'ok' ? 4 : 9}
              strokeOpacity={seg.tone === 'ok' ? 0.5 : 0.95}
              strokeLinecap="round"
            />
          );
        }),
      )}
      {placeMarkers(routes, px, selectedKey).map(({ route, seg, key, cx, cy, labelY, isSelected }) => {
        const label = dominantLabel(seg);
        const labelX = cx + (isSelected ? 20 : 15);
        return (
          <g key={key} style={{ cursor: 'pointer' }} onClick={() => onSelect(isSelected ? null : key)}>
            <circle
              cx={cx}
              cy={cy}
              r={isSelected ? 15 : 10}
              fill={`var(${TONE_VAR[seg.tone]})`}
              fillOpacity={isSelected ? 0.95 : 0.8}
              stroke="var(--color-paper)"
              strokeWidth={2}
            >
              <title>{`${route.route_name} ${seg.km_from}~${seg.km_to}km · ${seg.grade_label} · ${seg.event_count}건`}</title>
            </circle>
            {/* 글자를 밀어냈으면 어느 점의 글자인지 이어 준다 */}
            {Math.abs(labelY - (cy + 4)) > 2 && (
              <line x1={cx} y1={cy} x2={labelX - 3} y2={labelY - 4} stroke="var(--color-line)" strokeWidth={1} />
            )}
            <text
              x={labelX}
              y={labelY}
              fontSize={13}
              fill="var(--color-paper)"
              style={{ paintOrder: 'stroke', stroke: 'var(--color-panel-2)', strokeWidth: 4 }}
            >
              {seg.grade_label}
              {label ? ` · ${label}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
