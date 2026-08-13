// useSort.ts — 표 헤더 클릭 정렬. Safe·Eco가 같은 동작을 쓰도록 한 곳에 둔다.
// 한 번 누르면 내림차순, 한 번 더 누르면 오름차순, 다른 열을 누르면 그 열 내림차순부터 시작.
import { useMemo, useState } from 'react';

export type SortDir = 'desc' | 'asc';
export type SortState<K extends string> = { key: K; dir: SortDir } | null;

/** null/undefined는 방향과 무관하게 항상 뒤로 — 값이 없는 행이 1등처럼 보이면 안 된다. */
function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const sign = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
  return String(a).localeCompare(String(b), 'ko') * sign;
}

// K는 accessors의 키에서 추론한다 — initial에서 추론하면 그 한 키로 좁혀져 나머지 열을 못 누른다.
export function useSort<T, A extends Record<string, (row: T) => unknown>>(
  rows: T[],
  accessors: A,
  initial: SortState<Extract<keyof A, string>> = null,
) {
  type K = Extract<keyof A, string>;
  const [sort, setSort] = useState<SortState<K>>(initial);

  function toggle(key: K) {
    setSort((cur) => (cur?.key === key ? { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
  }

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = accessors[sort.key];
    if (!get) return rows;
    return [...rows].sort((a, b) => compareValues(get(a), get(b), sort.dir));
    // accessors는 렌더마다 새 객체라 의존성에 넣으면 매번 재정렬된다 — 키 집합은 고정이므로 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  /** 헤더에 붙일 화살표. 정렬 중인 열만 방향을 표시한다. */
  function indicator(key: K): string {
    if (sort?.key !== key) return '';
    return sort.dir === 'desc' ? ' ▼' : ' ▲';
  }

  return { sort, toggle, sorted, indicator };
}
