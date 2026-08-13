// settings.ts — Site/Corridor 저장소. localStorage 키 se.settings.v1, 초기값은 fixtures/settings.json 시드.
// 트랙4(SettingsScreen) 전체 UI는 아직 없다 — 지금은 트랙5(증명서) 구간귀속이 읽을 수 있도록 저장소만 먼저 만든다.
import type { Corridor, Site } from '../types';

const STORAGE_KEY = 'se.settings.v1';

export type Settings = { sites: Site[]; corridors: Corridor[] };

let cache: Settings | null = null;

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    cache = JSON.parse(stored);
    return cache!;
  }

  const seed: Settings = await fetch('/fixtures/settings.json').then((r) => r.json());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  cache = seed;
  return seed;
}

export async function saveSettings(next: Settings): Promise<void> {
  cache = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
