// fuelSource.ts — 기준연비 출처 배지. PRD §4.3, 색 의미(§8): teal=출처등급A, amber=AI추정/설정값.
import type { FuelSource, Tone } from '../types';

export const FUEL_SOURCE_META: Record<FuelSource, { label: string; tone: Tone }> = {
  registration: { label: '등록증', tone: 'ok' },
  public_api: { label: '공공API', tone: 'ok' },
  ai_estimate: { label: 'AI추정', tone: 'warn' },
  fixture: { label: '픽스처', tone: 'warn' },
};
