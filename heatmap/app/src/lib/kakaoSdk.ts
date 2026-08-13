// kakaoSdk.ts — 카카오맵 SDK 로더. 앱 전체에서 스크립트를 한 번만 붙인다.
// 지도·로드뷰·주소검색이 각자 로더를 들고 있으면 같은 스크립트를 파라미터만 바꿔 두 번 붙여
// 먼저 붙은 쪽 라이브러리가 사라진다.

let sdkLoading: Promise<void> | null = null;

export function kakaoKey(): string | undefined {
  return (import.meta.env.VITE_KAKAO_KEY as string | undefined) || undefined;
}

/** 실패(키 없음·네트워크·6초 타임아웃) 시 reject — 호출부가 폴백으로 넘어간다(§CLAUDE.md 4절). */
export function loadKakaoSdk(): Promise<void> {
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
    setTimeout(() => reject(new Error('kakao sdk load timeout')), 6000);
  });
  return sdkLoading;
}

declare global {
  interface Window {
    kakao: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}
