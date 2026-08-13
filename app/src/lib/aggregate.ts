// aggregate.ts — daily.json(일자별 원자료)을 조회 기간으로 잘라 Vehicle[]로 다시 집계한다.
//
// 차량마다 데이터 보유 기간이 3일~154일로 제각각이라, 전체 기간 한 덩어리로만 계산하면
// 짧게 찍힌 차량과 길게 찍힌 차량이 같은 표에서 비교돼버린다. 그래서 화면에서 기간을 고르면
// 그 구간만 다시 집계한다.
//
// 지표·등급 산식은 scripts/lib/judge.mjs 하나만 쓴다 — 여기서 다시 구현하지 않는다(§CLAUDE.md).
import { computeMetrics, judge, blankSplit, addRowToSplit } from '../../scripts/lib/judge.mjs';
import { computeEco } from '../../scripts/lib/eco.mjs';
import { GRADE_META } from './grade';
import type { BaselineFuel, EcoRow, Grade, Vehicle, VehicleClass } from '../types';

/** daily.json 한 행 — [vehicle_id, date, laden, km, accel, start, decel, stop, fuel, idle] */
export type DailyRow = [string, string, number, number, number, number, number, number, number, number];

export type DailyVehicleMaster = {
  vehicle_id: string;
  vehicle_class: VehicleClass;
  device_model: string;
  maker: string;
  model: string;
  year: number;
  baseline: BaselineFuel;
};

export type DailyBundle = {
  meta: { columns: string[]; date_min: string | null; date_max: string | null; row_count: number };
  vehicles: DailyVehicleMaster[];
  rows: DailyRow[];
};

type Metrics = {
  reported_km: number;
  core_events: number;
  events_by_type: { accel: number; start: number; decel: number; stop: number };
  rate: number | null;
  fuel_l: number;
  has_fuel_data: boolean;
  fuel_implied_rate: number | null;
  fuel_per_100km: number | null;
  fuel_excess_pct: number | null;
  observed_rank: number | null;
  fuel_rank: number | null;
  grade: Grade;
};

/** Eco 화면용 — 같은 기간으로 잘라 배출 지표를 다시 낸다. 산식은 scripts/lib/eco.mjs 하나만 쓴다. */
export function aggregateEcoRange(bundle: DailyBundle, from: string, to: string): EcoRow[] {
  const vehicles = aggregateRange(bundle, from, to);
  const gradeByVehicle = new Map(vehicles.map((v) => [v.vehicle_id, v]));

  const buckets = new Map<string, { empty: { km: number; fuel: number; idle: number }; laden: { km: number; fuel: number; idle: number } }>();
  const blank = () => ({ empty: { km: 0, fuel: 0, idle: 0 }, laden: { km: 0, fuel: 0, idle: 0 } });
  for (const row of bundle.rows) {
    if (row[1] < from || row[1] > to) continue;
    if (!buckets.has(row[0])) buckets.set(row[0], blank());
    const b = buckets.get(row[0])!;
    const t = row[2] === 1 ? b.laden : b.empty;
    t.km += row[3];
    t.fuel += row[8];
    t.idle += row[9];
  }

  return bundle.vehicles.map((master) => {
    const eco = computeEco(buckets.get(master.vehicle_id) ?? blank(), master.baseline, master.vehicle_class);
    const v = gradeByVehicle.get(master.vehicle_id);
    return {
      vehicle_id: master.vehicle_id,
      vehicle_class: master.vehicle_class,
      scope: 1,
      grade: v?.grade ?? null,
      tone: v?.tone ?? null,
      baseline: master.baseline,
      ...eco,
    } as EcoRow;
  });
}

/** 차량별 실제 데이터 보유 구간 — 기간 선택 UI가 "이 차는 언제부터 언제까지 있다"를 보여줄 때 쓴다. */
export function coverageByVehicle(bundle: DailyBundle): Map<string, { from: string; to: string; days: number }> {
  const acc = new Map<string, { from: string; to: string; days: Set<string> }>();
  for (const row of bundle.rows) {
    const [vehicleId, date] = row;
    const cur = acc.get(vehicleId);
    if (!cur) {
      acc.set(vehicleId, { from: date, to: date, days: new Set([date]) });
    } else {
      if (date < cur.from) cur.from = date;
      if (date > cur.to) cur.to = date;
      cur.days.add(date);
    }
  }
  return new Map([...acc].map(([id, v]) => [id, { from: v.from, to: v.to, days: v.days.size }]));
}

/** 월 단위 순위 스트립용 — 선택 기간 안에 들어오는 월 목록. */
function monthsInRange(rows: DailyRow[]): string[] {
  return [...new Set(rows.map((r) => r[1].slice(0, 7)))].sort();
}

function toVehicle(master: DailyVehicleMaster, m: Metrics, monthly: Vehicle['monthly']): Vehicle {
  const meta = GRADE_META[m.grade];
  return {
    vehicle_id: master.vehicle_id,
    vehicle_class: master.vehicle_class,
    device_model: master.device_model,
    maker: master.maker,
    model: master.model,
    year: master.year,
    baseline: master.baseline,
    grade: m.grade,
    grade_label: meta.label,
    tone: meta.tone,
    verifiable: meta.verifiable,
    settle: meta.settle,
    verdict: meta.verdict,
    reported_km: m.reported_km,
    core_events: m.core_events,
    events_by_type: m.events_by_type,
    rate: m.rate,
    has_fuel_data: m.has_fuel_data,
    fuel_implied_rate: m.fuel_implied_rate,
    fuel_l: m.fuel_l,
    fuel_per_100km: m.fuel_per_100km,
    fuel_excess_pct: m.fuel_excess_pct,
    observed_rank: m.observed_rank,
    fuel_rank: m.fuel_rank,
    monthly,
  };
}

/**
 * [from, to] 기간(양끝 포함)만 잘라 전체 차량을 다시 집계·판정한다.
 * 순위는 항상 "그 기간의 전체 차량" 기준으로 매긴다 — 화면 필터(차종·등급)는 행만 고를 뿐이다(§5-1).
 */
export function aggregateRange(bundle: DailyBundle, from: string, to: string): Vehicle[] {
  const rows = bundle.rows.filter((r) => r[1] >= from && r[1] <= to);

  const columns = bundle.meta.columns;
  const asRecord = (r: DailyRow) => ({
    laden: r[2] === 1,
    reported_km: r[3],
    event_accel: r[4],
    event_start: r[5],
    event_decel: r[6],
    event_stop: r[7],
    fuel_l: r[8],
    idle_sec: r[9],
  });
  void columns; // meta.columns는 daily.json 스키마 자체 문서화용 — 위 인덱스와 1:1이다.

  // 전체 기간 집계(표 본문) + 월별 집계(5개월 순위 스트립) 둘 다 필요하다.
  const totalSplit = new Map<string, ReturnType<typeof blankSplit>>();
  const monthSplit = new Map<string, Map<string, ReturnType<typeof blankSplit>>>(); // month -> vehicle -> split

  for (const row of rows) {
    const vehicleId = row[0];
    const month = row[1].slice(0, 7);
    if (!totalSplit.has(vehicleId)) totalSplit.set(vehicleId, blankSplit());
    addRowToSplit(totalSplit.get(vehicleId), asRecord(row));

    if (!monthSplit.has(month)) monthSplit.set(month, new Map());
    const byVehicle = monthSplit.get(month)!;
    if (!byVehicle.has(vehicleId)) byVehicle.set(vehicleId, blankSplit());
    addRowToSplit(byVehicle.get(vehicleId), asRecord(row));
  }

  // 전체 기간 지표 — 데이터가 하나도 없는 차량도 0으로 넣어야 "평가 제외"에 잡힌다.
  const totalMetrics = new Map<string, Metrics>();
  for (const master of bundle.vehicles) {
    const split = totalSplit.get(master.vehicle_id) ?? blankSplit();
    totalMetrics.set(master.vehicle_id, computeMetrics(split, master.baseline) as Metrics);
  }
  judge(totalMetrics);

  // 월별 지표 — 그 달에 데이터가 있는 차량끼리만 순위를 매긴다.
  const months = monthsInRange(rows);
  const monthMetrics = new Map<string, Map<string, Metrics>>();
  for (const month of months) {
    const byVehicle = new Map<string, Metrics>();
    for (const master of bundle.vehicles) {
      const split = monthSplit.get(month)?.get(master.vehicle_id) ?? blankSplit();
      byVehicle.set(master.vehicle_id, computeMetrics(split, master.baseline) as Metrics);
    }
    judge(byVehicle);
    monthMetrics.set(month, byVehicle);
  }

  return bundle.vehicles.map((master) => {
    const monthly = months.map((month) => {
      const m = monthMetrics.get(month)!.get(master.vehicle_id)!;
      return {
        month,
        reported_km: m.reported_km,
        core_events: m.core_events,
        events_by_type: m.events_by_type,
        rate: m.rate,
        has_fuel_data: m.has_fuel_data,
        fuel_implied_rate: m.fuel_implied_rate,
        grade: m.grade,
        fuel_l: m.fuel_l,
        fuel_per_100km: m.fuel_per_100km,
        fuel_excess_pct: m.fuel_excess_pct,
        observed_rank: m.observed_rank,
        fuel_rank: m.fuel_rank,
      };
    });
    return toVehicle(master, totalMetrics.get(master.vehicle_id)!, monthly);
  });
}
