import { useEffect, useMemo, useState } from 'react';
import type { EcoRow } from '../types';
import { GRADE_META } from '../lib/grade';
import { FUEL_SOURCE_META } from '../lib/fuelSource';

function ToneBadge({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`tone-${tone}-fg tone-${tone}-bd tone-${tone}-bg inline-flex items-center rounded border px-1.5 py-0.5 text-xs`}>
      {label}
    </span>
  );
}

export function EcoScreen() {
  const [rows, setRows] = useState<EcoRow[] | null>(null);

  useEffect(() => {
    fetch('/data/eco.json').then((r) => r.json()).then(setRows).catch(() => setRows([]));
  }, []);

  const summary = useMemo(() => {
    if (!rows) return null;
    const totalCo2Kg = rows.reduce((s, r) => s + r.co2_kg, 0);
    const tier3Co2 = rows.filter((r) => r.tier === 3).reduce((s, r) => s + r.co2_kg, 0);
    const primaryDataPct = totalCo2Kg > 0 ? (tier3Co2 / totalCo2Kg) * 100 : 0;
    const tierCounts = rows.reduce<Record<number, number>>((acc, r) => {
      acc[r.tier] = (acc[r.tier] ?? 0) + 1;
      return acc;
    }, {});
    const trucks = rows.filter((r) => r.vehicle_class === 'truck');
    const baselineCo2Kg = trucks.reduce((s, r) => s + (r.g_co2_per_tonkm !== null && r.ton_km ? (r.ton_km * 62.0) / 1000 : 0), 0);
    const actualTruckCo2Kg = trucks.reduce((s, r) => s + r.co2_kg, 0);
    return { totalCo2Kg, primaryDataPct, tierCounts, baselineCo2Kg, actualTruckCo2Kg };
  }, [rows]);

  if (!rows || !summary) {
    return <div className="p-6 text-sm" style={{ color: 'var(--color-dim)' }}>불러오는 중…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* ① 상단 요약 */}
      <div className="num flex gap-6 text-sm" style={{ color: 'var(--color-paper)' }}>
        <span>총 배출량 {(summary.totalCo2Kg / 1000).toFixed(2)} tCO₂e</span>
        <span>1차 데이터 비율 {summary.primaryDataPct.toFixed(1)}%</span>
        <span>Tier 분포 · Tier3 {summary.tierCounts[3] ?? 0}대 / Tier1 {summary.tierCounts[1] ?? 0}대</span>
      </div>

      {/* ③ 기본계수 대비 — 트랙터만. 실측과의 차이는 계측 오차로만 표기한다. */}
      <div className="rounded-md border px-4 py-2 text-xs" style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}>
        기본계수 산정(표준 배출원단위 62.0 gCO₂/ton-km 적용 시) {summary.baselineCo2Kg.toFixed(1)}kg vs 실측 산정 {summary.actualTruckCo2Kg.toFixed(1)}kg —{' '}
        <span style={{ color: 'var(--color-paper)' }}>
          계측 오차 {(summary.actualTruckCo2Kg - summary.baselineCo2Kg).toFixed(1)}kg
        </span>
      </div>

      {/* ② 차량별 표 */}
      <table className="num w-full border-collapse text-xs">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-slate)' }}>
            <th className="py-2 pr-2">차량</th>
            <th className="py-2 pr-2">차종</th>
            <th className="py-2 pr-2">Scope</th>
            <th className="py-2 pr-2">Tier</th>
            <th className="py-2 pr-2">신뢰등급</th>
            <th className="py-2 pr-2">기준연비</th>
            <th className="py-2 pr-2">실측연비</th>
            <th className="py-2 pr-2">연료(L)</th>
            <th className="py-2 pr-2">CO₂(kg)</th>
            <th className="py-2 pr-2">원단위</th>
            <th className="py-2 pr-2">감축 여지(kg)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const measuredKmpl = r.fuel_l > 0 ? r.distance_km / r.fuel_l : null;
            const sourceMeta = FUEL_SOURCE_META[r.baseline.source];
            const gradeMeta = r.grade ? GRADE_META[r.grade] : null;
            return (
              <tr key={r.vehicle_id} className="border-b" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-paper)' }}>
                <td className="py-2 pr-2">{r.vehicle_id}</td>
                <td className="py-2 pr-2">{r.vehicle_class === 'truck' ? '화물' : '승용'}</td>
                <td className="py-2 pr-2">Scope {r.scope}</td>
                <td className="py-2 pr-2">Tier {r.tier}</td>
                <td className="py-2 pr-2">{gradeMeta && <ToneBadge tone={gradeMeta.tone} label={gradeMeta.label} />}</td>
                <td className="py-2 pr-2">{r.baseline.kmpl.toFixed(1)}km/L <ToneBadge tone={sourceMeta.tone} label={sourceMeta.label} /></td>
                <td className="py-2 pr-2">{measuredKmpl !== null ? measuredKmpl.toFixed(2) : '—'}km/L</td>
                <td className="py-2 pr-2">{r.fuel_l.toFixed(0)}</td>
                <td className="py-2 pr-2">{r.co2_kg.toFixed(1)}</td>
                <td className="py-2 pr-2">
                  {r.g_co2_per_tonkm !== null && `${r.g_co2_per_tonkm.toFixed(1)} gCO₂/ton-km`}
                  {r.g_co2_per_km !== null && `${r.g_co2_per_km.toFixed(1)} gCO₂/km`}
                  {r.g_co2_per_tonkm === null && r.g_co2_per_km === null && '—'}
                </td>
                <td className="py-2 pr-2">{r.reduction_headroom_kg.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ④ 공차 구간 비중 */}
      <div>
        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>공차 구간 비중 (화물)</p>
        <div className="flex flex-col gap-1">
          {rows.filter((r) => r.vehicle_class === 'truck').map((r) => (
            <div key={r.vehicle_id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-mist)' }}>
              <span className="num w-20">{r.vehicle_id}</span>
              <div className="h-2 flex-1 overflow-hidden rounded" style={{ background: 'var(--color-rule)' }}>
                <div className="tone-warn-rail h-full" style={{ width: `${(r.empty_share * 100).toFixed(0)}%` }} />
              </div>
              <span className="num w-10 text-right">{(r.empty_share * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
