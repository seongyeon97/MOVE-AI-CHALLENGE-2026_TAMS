// eventStore.ts — useSyncExternalStore 기반 전역 스토어. notices.ts·deviceRequests.ts가 같이 쓴다.
//
// persistKey를 주면 localStorage에 저장하고 다른 탭·다른 페이지의 변경을 storage 이벤트로 받는다.
// 기사뷰(public/driver-app.html)는 React 앱과 별개의 페이지라 메모리 스토어로는 서로를 못 본다 —
// 공지 발송(회사뷰)과 공지 확인(기사뷰)이 오가려면 같은 오리진의 localStorage를 공유해야 한다.
// persistKey가 없으면 예전처럼 세션 전용(새로고침 시 리셋)이다.
import { useSyncExternalStore } from 'react';

export function createStore<T>(persistKey?: string) {
  const listeners = new Set<() => void>();

  function read(): T[] {
    if (!persistKey || typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(persistKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return []; // 손상된 값이면 빈 목록으로 — 화면이 죽는 것보다 낫다
    }
  }

  let items: T[] = read();

  function notify() {
    for (const l of listeners) l();
  }

  function commit(next: T[]) {
    items = next;
    if (persistKey && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(persistKey, JSON.stringify(items));
      } catch {
        // 용량 초과 등 — 저장만 실패하고 화면 상태는 그대로 간다
      }
    }
    notify();
  }

  // 다른 페이지(기사뷰)에서 쓴 변경을 받아 온다. storage 이벤트는 쓴 쪽이 아닌 창에만 뜬다.
  if (persistKey && typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== persistKey) return;
      items = read();
      notify();
    });
  }

  return {
    getAll(): T[] {
      return items;
    },
    add(item: T) {
      commit([...items, item]);
    },
    update(predicate: (item: T) => boolean, updater: (item: T) => T) {
      commit(items.map((item) => (predicate(item) ? updater(item) : item)));
    },
    clear() {
      commit([]);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** 필터 없이 전체를 그대로 반환한다 — items는 불변 재할당이라 참조가 안정적이다. 필터링은 호출부에서 useMemo로. */
    useAll(): T[] {
      return useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => items,
      );
    },
  };
}
