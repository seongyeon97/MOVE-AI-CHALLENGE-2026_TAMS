// certificateAggregate.ts — 여러 운송건(trip)을 구간+기간 단위로 합쳐 증명서 1건을 만든다.
import type { Certificate, DataTier, AttributionStatus } from '../types';

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
  };
};

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

  for (const t of trips) {
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
  }

  const isCar = trips[0].vehicle_class === 'car';

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
    },
  };
}
