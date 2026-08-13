// mapAdapter.ts — 카카오맵 담당자에게 넘길 계약(§PRD 3.5). 이 두 함수만 구현되면 나머지는 붙는다.
// 카카오 키 없으면 호출부가 폴백(좌표 직접입력 / 오프라인 안내)으로 넘어간다 — 여기서 흡수하지 않는다.

import { loadKakaoSdk } from './kakaoSdk';

export type AddressCandidate = { display_name: string; road_address: string; lat: number; lon: number };

export async function searchAddress(keyword: string): Promise<AddressCandidate[]> {
  await loadKakaoSdk();
  return new Promise((resolve, reject) => {
    const places = new window.kakao.maps.services.Places();
    places.keywordSearch(keyword, (results: unknown[], status: string) => {
      if (status !== window.kakao.maps.services.Status.OK) {
        reject(new Error(`kakao search failed: ${status}`));
        return;
      }
      resolve(
        (results as Array<{ place_name: string; road_address_name: string; y: string; x: string }>).map((r) => ({
          display_name: r.place_name,
          road_address: r.road_address_name,
          lat: Number(r.y),
          lon: Number(r.x),
        })),
      );
    });
  });
}

export function renderMiniMap(
  el: HTMLElement,
  opts: { center: [number, number]; markers: { lat: number; lon: number; label: string }[]; circles: { lat: number; lon: number; radius_m: number }[] },
): { destroy(): void } {
  if (!window.kakao?.maps) {
    throw new Error('kakao not loaded');
  }
  const map = new window.kakao.maps.Map(el, {
    center: new window.kakao.maps.LatLng(opts.center[0], opts.center[1]),
    level: 6,
  });
  const overlays: Array<{ setMap: (m: unknown) => void }> = [];
  for (const m of opts.markers) {
    const marker = new window.kakao.maps.Marker({ position: new window.kakao.maps.LatLng(m.lat, m.lon), map });
    overlays.push(marker);
  }
  for (const c of opts.circles) {
    const circle = new window.kakao.maps.Circle({
      center: new window.kakao.maps.LatLng(c.lat, c.lon),
      radius: c.radius_m,
      map,
    });
    overlays.push(circle);
  }
  return {
    destroy() {
      overlays.forEach((o) => o.setMap(null));
    },
  };
}
