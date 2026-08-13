// report.ts — buildVehicleReport. PRD §5.8: 등급이 정상이 아니면 운전습관 문구를 덮어쓴다.
import type { Vehicle } from '../types';
import { FUEL_SOURCE_META } from './fuelSource';

export function signalRatioOf(v: Pick<Vehicle, 'rate' | 'fuel_implied_rate'>): number {
  if (v.rate === null) return Infinity;
  if (v.fuel_implied_rate === null || v.fuel_implied_rate === 0) return Infinity;
  return v.rate / v.fuel_implied_rate;
}

export function buildVehicleReport(v: Vehicle): string {
  const km = v.reported_km.toLocaleString('ko-KR');
  const sourceLabel = FUEL_SOURCE_META[v.baseline.source].label;

  if (v.grade !== '정상') {
    return `${v.vehicle_id} — 단말기 이상으로 판단 어려움. ${v.verdict} (기준연비 출처: ${sourceLabel})`;
  }

  const rate100 = v.rate !== null ? (v.rate * 100).toFixed(1) : '—';
  return `${v.vehicle_id} — 이번 달 ${km}km 주행, 100km당 ${rate100}건. 이벤트·연료 신호가 일치해 신뢰 가능한 운전습관 데이터입니다.`;
}
