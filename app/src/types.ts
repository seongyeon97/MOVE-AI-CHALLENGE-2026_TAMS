// types.ts — 공유 타입. 소유자: A. 수정 필요하면 A에게.

export type VehicleClass = 'truck' | 'car';
export type Grade = '정상' | 'A' | 'B' | 'C' | 'D';
export type Tone = 'ok' | 'warn' | 'caution' | 'dead' | 'void';
export type Settle = 'allow' | 'conditional' | 'block';
export type FuelSource = 'registration' | 'public_api' | 'ai_estimate' | 'fixture' | 'unavailable';
export type Trust = 'A' | 'C';

export type BaselineFuel = {
  kmpl: number;
  source: FuelSource;
  trust: Trust;
  kmpl_empty: number;
  kmpl_laden: number;
  reference_models?: string[];
  reasoning?: string;
  confidence?: string;
  fetched_at: string;
};

export type MonthlyMetric = {
  month: string; // 'YYYY-MM'
  reported_km: number;
  core_events: number;
  events_by_type: { accel: number; start: number; decel: number; stop: number };
  rate: number | null;
  has_fuel_data: boolean;
  fuel_implied_rate: number | null;
  grade: Grade;
  fuel_l: number;
  fuel_per_100km: number | null;
  fuel_excess_pct: number | null;
  observed_rank: number | null;
  fuel_rank: number | null;
};

export type Vehicle = {
  vehicle_id: string;
  vehicle_class: VehicleClass;
  device_model: string;
  maker: string;
  model: string;
  year: number;
  baseline: BaselineFuel;

  grade: Grade;
  grade_label: string;
  tone: Tone;
  verifiable: boolean;
  settle: Settle;
  verdict: string;

  reported_km: number;
  core_events: number;
  events_by_type: { accel: number; start: number; decel: number; stop: number };
  rate: number | null;
  has_fuel_data: boolean;
  fuel_implied_rate: number | null;
  fuel_l: number;
  fuel_per_100km: number | null;
  fuel_excess_pct: number | null;
  observed_rank: number | null;
  fuel_rank: number | null;

  monthly: MonthlyMetric[];
};

export type Site = {
  site_id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  radius_m: number;
};

export type Corridor = {
  corridor_id: string;
  name: string;
  origin_site_id: string;
  destination_site_id: string;
};

export type DataTier = 'A' | 'B' | 'none';
export type AttributionStatus = 'verified' | 'partial' | 'failed';

export type CrossingPoint = { ts: string; error_sec: number };

export type LegAttribution = {
  leg_id: string;
  laden: boolean;
  corridor_id: string | null;
  status: AttributionStatus;
  departure: CrossingPoint | null;
  arrival: CrossingPoint | null;
};

export type Attribution =
  | { applicable: false; note: string }
  | {
      applicable: true;
      corridor_id: string | null;
      status: AttributionStatus;
      departure: CrossingPoint | null;
      arrival: CrossingPoint | null;
      legs?: LegAttribution[];
      note?: string;
    };

export type Certificate = {
  trip_id: string;
  vehicle_id: string;
  vehicle_class: VehicleClass;
  date: string;
  month: string;
  origin_site: string;
  destination_site: string;
  order_no: string;
  container_type: string;

  /** 기준연비와 그 출처 — 증명서 산출근거 표기에 쓴다(§4.3 3계층). */
  baseline: BaselineFuel | null;
  grade: Grade | null;
  verifiable: boolean;
  settle: Settle;
  data_tier: DataTier;
  data_tier_note: string;

  safety: {
    event_counts: { accel: number; start: number; decel: number; stop: number };
    core_events: number;
    continuous: { max_block_sec: number; limit_sec: number; compliant: boolean };
  };

  eco: {
    distance_km: number;
    ton_km: number;
    fuel_l: number;
    idle_l: number;
    co2_kg: number;
    g_co2_per_tonkm: number | null;
    g_co2_per_km: number | null;
    empty_share: number;
  };

  attribution: Attribution;
};

export type EcoRow = {
  vehicle_id: string;
  vehicle_class: VehicleClass;
  scope: 1 | 3;
  grade: Grade | null;
  tone: Tone | null;
  tier: 1 | 3;
  baseline: BaselineFuel;
  distance_km: number;
  fuel_l: number;
  co2_kg: number;
  ton_km: number | null;
  g_co2_per_tonkm: number | null;
  g_co2_per_km: number | null;
  measurement_gap_kg: number | null;
  /** 기준연비가 없으면 null — 0은 "초과 없음"이라 뜻이 다르다. */
  reduction_headroom_kg: number | null;
  empty_share: number;
};

export type Role = 'company' | 'driver';

export type Screen = 'safe' | 'eco' | 'heatmap' | 'certificate' | 'settings' | 'ingest';

/* ── Heat-map (트랙7) — corridor.json / segment_insights.json ─────────────
   위험 판정은 100% 결정론적 통계(빌드 타임). AI는 확정된 구간의 도로환경 해설만 한다.
   등급(tone)은 절대 임계값이 아니라 전 구간 발생률 상대 순위 — meta.criteria가 그 산식 공개용. */

export type CorridorTone = 'ok' | 'warn' | 'dead';

export interface CorridorSegment {
  segment_no: number;
  centroid: [number, number];
  polyline: [number, number][];
  km_from: number;
  km_to: number;
  event_count: number;
  /** 유형별 내역 — 판정 근거 화면이 "무엇이 몰렸나"를 보여줄 때 쓴다 */
  events_by_type: Record<string, number>;
  rate_per_trip: number;
  rank_global: number;
  tone: CorridorTone;
  grade_label: string;
  dominant_type: string | null;
}

export interface CorridorRoute {
  route_id: string;
  route_name: string;
  /** verifiable 운행 건수 = 발생률 분모 */
  trips: number;
  segments: CorridorSegment[];
}

export interface CorridorBundle {
  meta: {
    generated_from: string[];
    note: string;
    bin_km: number;
    rose_top_n: number;
    amber_top_n: number;
    events_assigned: number;
    events_skipped_no_track: number;
    /** 등급 판정 산식을 화면에서 그대로 재현하기 위한 값 — 컷 값과 비교 기준 */
    criteria: {
      total_segments: number;
      segments_with_events: number;
      dead_min_rate: number;
      warn_min_rate: number;
      rate_mean: number;
      rate_median: number;
      rate_max: number;
      verifiable_trips: number;
    };
  };
  routes: CorridorRoute[];
}

export interface SegmentInsight {
  key: string;
  route_id: string;
  segment_no: number;
  address: string | null;
  region: string | null;
  pois: { name: string; category: string; distance_m: number }[];
  geometry: { total_turn_deg: number; max_turn_deg: number; shape: string };
  speed: { samples: number; mean_kmh: number; max_kmh: number; min_kmh: number; stdev_kmh: number } | null;
  hours: { total: number; top_hours: { hour: number; count: number }[] } | null;
  captures: string[];
  /** LLM 응답 — 숫자 필드가 하나도 없다(스키마 레벨 강제) */
  report: {
    headline: string;
    causes: { factor: string; evidence: string; confidence: '높음' | '보통' | '낮음' }[];
    driver_advice: string;
    visual_notes: string;
  };
}

export interface DriverReport {
  title: string;
  intro: string;
  key_rules: { rule: string; why: string }[];
  route_notes: { route_id: string; summary: string }[];
  spots: { key: string; nickname: string; when_to_watch: string; action: string }[];
  closing: string;
}

export interface SegmentInsightBundle {
  meta: { model: string; generated_at: string; segment_count: number; note: string };
  insights: SegmentInsight[];
  driver_report: DriverReport | null;
}
