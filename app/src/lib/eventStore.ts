// eventStore.ts — useSyncExternalStore 기반 세션 전역 스토어. 새로고침하면 리셋된다(의도).
// notices.ts·deviceRequests.ts가 이 팩토리 하나를 같이 쓴다.
import { useSyncExternalStore } from 'react';

export function createStore<T>() {
  let items: T[] = [];
  const listeners = new Set<() => void>();

  function notify() {
    for (const l of listeners) l();
  }

  return {
    getAll(): T[] {
      return items;
    },
    add(item: T) {
      items = [...items, item];
      notify();
    },
    update(predicate: (item: T) => boolean, updater: (item: T) => T) {
      items = items.map((item) => (predicate(item) ? updater(item) : item));
      notify();
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
