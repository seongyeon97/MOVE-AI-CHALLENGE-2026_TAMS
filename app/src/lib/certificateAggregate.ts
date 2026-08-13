// certificateAggregate.ts — 여러 운송건(trip)을 구간+기간 단위로 합쳐 증명서 1건을 만든다.
import { idleLperHourOf } from '../../scripts/lib/constants.mjs';
import type { Certificate, DataTier, AttributionStatus, AttributionMethod } from '../types';

export type AggregatedCertificate = {
  trips: Certificate[];
  data_tier_counts: Record<DataTier, number>;
  attribution_counts: Record<AttributionStatus, number> | null; // 승용차 그룹이면 null
  attribution_applicable: boolean;
  safety: {
    event_counts: { accel: number; start: number; decel: number; stop: number };
    core_events: number;
    max_block_sec: number;
    limit_sec: number;
    all_compliant: boolean;
  };
  eco: {
    distance_km: number;
    ton_km: number;
    co2_kg: number;
    g_co2_per_tonkm: number | null;
    g_co2_per_km: number | null;
    empty_share: number;
    fuel_l: number;
    idle_l: number;
  };
  /** 산출근거 표기용 — 이 증명서의 숫자가 어떤 값·계수로 나왔는지 문서에 그대로 적기 위한 재료. */
  basis: {
    date_from: string;
    date_to: string;
    baseline_sources: { source: string; kmpl: number; count: number }[];
    tonnage_per_container: number | null;
    /** 구간귀속을 무엇으로 판정했는가 — 증명서가 방법을 밝히게 한다. */
    attribution_method: AttributionMethod;
    /** 공회전 계수는 차종별로 다르다(승용 0.9 / 화물 2.4 L/h) — 문서에 실제 적용값을 적기 위함. */
    idle_l_per_hour: number;
  };
};

const TONNAGE_BY_CONTAINER: Record<string, number> = { '40ft': 30.5, '20ft': 21.0 };

export function aggregateCertificates(trips: Certificate[]): AggregatedCertificate | null {
  if (trips.length === 0) return null;

  const data_tier_counts: Record<DataTier, number> = { A: 0, B: 0, none: 0 };
  const attribution_counts: Record<AttributionStatus, number> = { verified: 0, partial: 0, failed: 0 };
  let attribution_applicable = false;

  const event_counts = { accel: 0, start: 0, decel: 0, stop: 0 };
  let core_events = 0;
  let max_block_sec = 0;
  let all_compliant = true;

  let distance_km = 0;
  let ton_km = 0;
  let co2_kg = 0;
  let empty_km = 0;
  let fuel_l = 0;
  let idle_l = 0;

  // 기준연비 출처별 집계 — 대외 문서에 "이 연비를 어디서 가져왔는지"를 밝히기 위함(§4.3 3계층).
  const baselineByKey = new Map<string, { source: string; kmpl: number; count: number }>();
  const dates: string[] = [];

  for (const t of trips) {
    dates.push(t.date);
    if (t.baseline) {
      const key = `${t.baseline.source}|${t.baseline.kmpl}`;
      const cur = baselineByKey.get(key);
      if (cur) cur.count += 1;
      else baselineByKey.set(key, { source: t.baseline.source, kmpl: t.baseline.kmpl, count: 1 });
    }
    data_tier_counts[t.data_tier] += 1;
    if (t.attribution.applicable) {
      attribution_applicable = true;
      attribution_counts[t.attribution.status] += 1;
    }

    event_counts.accel += t.safety.event_counts.accel;
    event_counts.start += t.safety.event_counts.start;
    event_counts.decel += t.safety.event_counts.decel;
    event_counts.stop += t.safety.event_counts.stop;
    core_events += t.safety.core_events;
    max_block_sec = Math.max(max_block_sec, t.safety.continuous.max_block_sec);
    if (!t.safety.continuous.compliant) all_compliant = false;

    distance_km += t.eco.distance_km;
    ton_km += t.eco.ton_km;
    co2_kg += t.eco.co2_kg;
    empty_km += t.eco.distance_km * t.eco.empty_share;
    fuel_l += t.eco.fuel_l;
    idle_l += t.eco.idle_l;
  }

  const isCar = trips[0].vehicle_class === 'car';
  dates.sort();

  return {
    trips,
    data_tier_counts,
    attribution_counts: attribution_applicable ? attribution_counts : null,
    attribution_applicable,
    safety: {
      event_counts,
      core_events,
      max_block_sec,
      limit_sec: trips[0].safety.continuous.limit_sec,
      all_compliant,
    },
    eco: {
      distance_km,
      ton_km,
      co2_kg,
      g_co2_per_tonkm: !isCar && ton_km > 0 ? (co2_kg * 1000) / ton_km : null,
      g_co2_per_km: isCar && distance_km > 0 ? (co2_kg * 1000) / distance_km : null,
      empty_share: distance_km > 0 ? empty_km / distance_km : 0,
      fuel_l,
      idle_l,
    },
    basis: {
      date_from: dates[0] ?? '',
      date_to: dates[dates.length - 1] ?? '',
      baseline_sources: [...baselineByKey.values()].sort((a, b) => b.count - a.count),
      tonnage_per_container: TONNAGE_BY_CONTAINER[trips[0].container_type] ?? null,
      attribution_method: (trips.find((t) => t.attribution.applicable && t.attribution.method)?.attribution as { method?: AttributionMethod } | undefined)?.method ?? 'none',
      idle_l_per_hour: idleLperHourOf(trips[0].vehicle_class),
    },
  };
}
