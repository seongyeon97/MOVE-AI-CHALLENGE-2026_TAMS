// mapAdapter.ts — 카카오맵 담당자에게 넘길 계약(§PRD 3.5). 이 두 함수만 구현되면 나머지는 붙는다.
// 카카오 키 없으면 호출부가 폴백(좌표 직접입력 / 오프라인 안내)으로 넘어간다 — 여기서 흡수하지 않는다.

export type AddressCandidate = { display_name: string; road_address: string; lat: number; lon: number };

function kakaoKey(): string | undefined {
  return (import.meta.env.VITE_KAKAO_KEY as string | undefined) || undefined;
}

let sdkLoading: Promise<void> | null = null;

function loadKakaoSdk(): Promise<void> {
  const key = kakaoKey();
  if (!key) return Promise.reject(new Error('no kakao key'));
  if (window.kakao?.maps) return Promise.resolve();
  if (sdkLoading) return sdkLoading;

  sdkLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=services`;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error('kakao sdk load failed'));
    document.head.appendChild(script);
    setTimeout(() => reject(new Error('kakao sdk load timeout')), 6000); // §CLAUDE.md 6초 타임아웃
  });
  return sdkLoading;
}

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

declare global {
  interface Window {
    kakao: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}
