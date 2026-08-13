// SegmentRoadview.tsx — 구간 중심점의 카카오 로드뷰를 실제 SDK로 띄운다.
// 사용자가 직접 돌려보고 앞뒤로 이동할 수 있어야 "그 자리가 어떤 도로인지"가 전달된다.
// SDK 실패(키 없음·네트워크·6초 타임아웃) 시에만 빌드 타임 캡처 이미지로 내려간다(§CLAUDE.md 4절).

import { useEffect, useRef, useState } from 'react';
import { loadKakaoSdk } from '../lib/kakaoSdk';

type Props = {
  /** 구간 중심점 [lat, lon] */
  center: [number, number];
  /** 진행 방위각(도, 북=0) — 로드뷰 시선을 주행 방향으로 맞춘다 */
  bearing: number;
  /** SDK 실패 시 쓸 빌드 타임 캡처 경로 */
  fallbackImage: string | null;
};

type Mode = 'loading' | 'live' | 'image' | 'none';

/** 로드뷰가 있는 가장 가까운 파노라마를 찾는 반경(m). 고속도로 본선은 좌표가 살짝 빗나간다. */
const SEARCH_RADIUS_M = 150;

export function SegmentRoadview({ center, bearing, fallbackImage }: Props) {
  const [mode, setMode] = useState<Mode>('loading');
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const bearingRef = useRef(bearing);
  bearingRef.current = bearing;

  useEffect(() => {
    let alive = true;
    setMode('loading');

    loadKakaoSdk()
      .then(() => {
        if (!alive || !hostRef.current) return;
        const kakao = window.kakao;
        const position = new kakao.maps.LatLng(center[0], center[1]);
        const client = new kakao.maps.RoadviewClient();

        client.getNearestPanoId(position, SEARCH_RADIUS_M, (panoId: number | null) => {
          if (!alive) return;
          if (!panoId) {
            // 이 좌표에 로드뷰 자체가 없다(사유지·신설 도로 등)
            setMode(fallbackImage ? 'image' : 'none');
            return;
          }
          if (!viewRef.current) {
            viewRef.current = new kakao.maps.Roadview(hostRef.current);
            // 파노라마가 준비된 뒤에야 시선을 돌릴 수 있다.
            // 리스너는 생성 시 한 번만 건다 — 구간을 바꿀 때마다 걸면 계속 쌓인다.
            kakao.maps.event.addListener(viewRef.current, 'init', () => {
              viewRef.current.setViewpoint({ pan: bearingRef.current, tilt: 0, zoom: 0 });
            });
          }
          viewRef.current.setPanoId(panoId, position);
          setMode('live');
        });
      })
      .catch(() => {
        if (alive) setMode(fallbackImage ? 'image' : 'none');
      });

    return () => {
      alive = false;
    };
  }, [center, bearing, fallbackImage]);

  return (
    <figure className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--color-line)' }}>
      <div className="relative aspect-[4/3] w-full">
        {/* 로드뷰 호스트는 항상 DOM에 둔다 — SDK가 크기를 잰 뒤에 붙어야 검은 화면이 안 뜬다 */}
        <div ref={hostRef} className="h-full w-full" style={{ display: mode === 'live' ? 'block' : 'none' }} />
        {mode === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ background: 'var(--color-panel-2)', color: 'var(--color-dim)' }}>
            로드뷰 불러오는 중…
          </div>
        )}
        {mode === 'image' && fallbackImage && (
          <img src={fallbackImage} alt="구간 로드뷰" className="h-full w-full object-cover" />
        )}
        {mode === 'none' && (
          <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ background: 'var(--color-panel-2)', color: 'var(--color-dim)' }}>
            이 지점은 로드뷰가 제공되지 않습니다
          </div>
        )}
      </div>
      <figcaption className="px-2 py-1 text-xs" style={{ color: 'var(--color-dim)', background: 'var(--color-panel)' }}>
        {mode === 'live'
          ? '카카오 로드뷰 — 끌어서 둘러보고 화살표로 이동할 수 있습니다'
          : mode === 'image'
            ? '카카오 로드뷰 정지화면 (실시간 로드뷰 연결 실패)'
            : '카카오 로드뷰'}
      </figcaption>
    </figure>
  );
}
