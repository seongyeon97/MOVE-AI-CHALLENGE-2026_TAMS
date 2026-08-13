// score.ts — S&E 개인 점수·배지. PRD §5.9 그대로. 여기 하나에서만 계산한다(기사뷰도 이걸 재사용).
import type { Vehicle } from '../types';

export function scoreOf(v: Pick<Vehicle, 'verifiable' | 'rate'>): number | null {
  if (!v.verifiable || v.rate === null) return null;
  return Math.round(100 - Math.min(v.rate, 1) * 70);
}

export type BadgeTier = 'gold' | 'silver' | 'bronze' | 'none';

export function badgeTierOf(score: number | null): BadgeTier {
  if (score === null) return 'none';
  if (score >= 90) return 'gold';
  if (score >= 75) return 'silver';
  if (score >= 60) return 'bronze';
  return 'none';
}
