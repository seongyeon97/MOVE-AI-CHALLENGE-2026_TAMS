// settings.ts — Site/Corridor 저장소. localStorage 키 se.settings.v1.
// 더미 시드 픽스처는 없앴다 — 사업장·운송구간은 실제로 화면에서 등록한 것만 쌓인다(빈 상태로 시작).
import type { Corridor, Site } from '../types';

const STORAGE_KEY = 'se.settings.v1';
const EMPTY: Settings = { sites: [], corridors: [] };

export type Settings = { sites: Site[]; corridors: Corridor[] };

let cache: Settings | null = null;

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;

  const stored = localStorage.getItem(STORAGE_KEY);
  cache = stored ? JSON.parse(stored) : EMPTY;
  return cache!;
}

export async function saveSettings(next: Settings): Promise<void> {
  cache = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
