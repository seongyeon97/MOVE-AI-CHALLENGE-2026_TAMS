import { useEffect, useMemo, useState } from 'react';
import type { EcoRow } from '../types';
import { GRADE_META } from '../lib/grade';
import { FUEL_SOURCE_META } from '../lib/fuelSource';
import { aggregateEcoRange, type DailyBundle } from '../lib/aggregate';

function ToneBadge({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`tone-${tone}-fg tone-${tone}-bd tone-${tone}-bg inline-flex items-center rounded border px-1.5 py-0.5 text-xs`}>
      {label}
    </span>
  );
}

export function EcoScreen() {
  const [bundle, setBundle] = useState<DailyBundle | null>(null);
  // 조회 기간 — Safe와 같은 이유로 필요하다. 차량마다 데이터 보유 기간이 3일~154일로 제각각이라
  // 전체 기간 한 덩어리로만 합산하면 배출량 비교가 성립하지 않는다.
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeDraft, setRangeDraft] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    fetch('/data/daily.json')
      .then((r) => r.json())
      .then((b: DailyBundle) => {
        setBundle(b);
        const full = { from: b.meta.date_min ?? '', to: b.meta.date_max ?? '' };
        setRange(full);
        setRangeDraft(full);
      })
      .catch(() => setBundle(null));
  }, []);

  const rows = useMemo(() => {
    if (!bundle || !range) return null;
    return aggregateEcoRange(bundle, range.from, range.to);
  }, [bundle, range]);

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

  if (!rows || !summary || !range || !rangeDraft) {
    return <div className="p-6 text-sm" style={{ color: 'var(--color-dim)' }}>불러오는 중…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* 조회 기간 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1" style={{ color: 'var(--color-slate)' }}>
          조회기간
          <input
            type="date"
            value={rangeDraft.from}
            min={bundle?.meta.date_min ?? undefined}
            max={rangeDraft.to}
            onChange={(e) => setRangeDraft({ ...rangeDraft, from: e.target.value })}
            className="num rounded-md border px-2 py-1"
            style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
          />
          ~
          <input
            type="date"
            value={rangeDraft.to}
            min={rangeDraft.from}
            max={bundle?.meta.date_max ?? undefined}
            onChange={(e) => setRangeDraft({ ...rangeDraft, to: e.target.value })}
            className="num rounded-md border px-2 py-1"
            style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
          />
        </label>
        <button
          type="button"
          onClick={() => setRange(rangeDraft)}
          className="tone-ok-bg tone-ok-fg rounded-md px-3 py-1.5 font-medium"
        >
          확인
        </button>
        <button
          type="button"
          onClick={() => {
            const full = { from: bundle?.meta.date_min ?? '', to: bundle?.meta.date_max ?? '' };
            setRangeDraft(full);
            setRange(full);
          }}
          className="rounded-md border px-2 py-1"
          style={{ borderColor: 'var(--color-line)', color: 'var(--color-dim)' }}
        >
          전체기간
        </button>
      </div>

      {/* ① 상단 요약 — Scope 1과 Scope 3은 합산하지 않는다(§3.2). 지금은 전부 자가운송(Scope 1) 가정. */}
      <div className="num flex flex-wrap gap-6 text-sm" style={{ color: 'var(--color-paper)' }}>
        <span>총 배출량 {(summary.totalCo2Kg / 1000).toFixed(2)} tCO₂e</span>
        <span>1차 데이터 비율 {summary.primaryDataPct.toFixed(1)}%</span>
        <span>Tier 분포 · Tier3 {summary.tierCounts[3] ?? 0}대 / Tier1 {summary.tierCounts[1] ?? 0}대</span>
        <span style={{ color: 'var(--color-slate)' }}>({range.from} ~ {range.to} 기준)</span>
      </div>

      {/* ② 차량별 표 — 100대 가까이 되므로 박스 안에서만 스크롤시킨다. */}
      <div className="overflow-auto rounded-md border" style={{ borderColor: 'var(--color-line)', maxHeight: '46vh' }}>
      <table className="num w-full border-collapse text-xs">
        <thead className="sticky top-0" style={{ background: 'var(--color-ink)' }}>
          <tr className="border-b text-left" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-slate)' }}>
            <th className="py-2 pr-2 pl-2">차량</th>
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
                <td className="py-2 pr-2 pl-2">{r.vehicle_id}</td>
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
      </div>

      {/* ③ 전광판 — 차종별로 따로. 승용차는 톤킬로가 없어 gCO₂/km, 화물차는 gCO₂/ton-km로 원단위가 다르다. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <EcoScoreboard title="승용차" rows={rows.filter((r) => r.vehicle_class === 'car')} isTruck={false} />
        <EcoScoreboard title="화물차" rows={rows.filter((r) => r.vehicle_class === 'truck')} isTruck />
      </div>
    </div>
  );
}

/**
 * 차종별 배출 요약 전광판.
 * 원단위는 대수 평균이 아니라 총 CO₂ ÷ 총 톤킬로(또는 총 거리) — 대수 평균은 소형·대형이 같은 무게로 섞인다.
 * 화물차만 기본계수(62.0 gCO₂/ton-km) 대비를 낸다 — 승용차는 톤킬로가 성립하지 않아 비교 대상이 아니다.
 */
function EcoScoreboard({ title, rows, isTruck }: { title: string; rows: EcoRow[]; isTruck: boolean }) {
  const co2Kg = rows.reduce((s, r) => s + r.co2_kg, 0);
  const distanceKm = rows.reduce((s, r) => s + r.distance_km, 0);
  const tonKm = rows.reduce((s, r) => s + (r.ton_km ?? 0), 0);
  const fuelL = rows.reduce((s, r) => s + r.fuel_l, 0);
  const headroomKg = rows.reduce((s, r) => s + r.reduction_headroom_kg, 0);
  const tier3 = rows.filter((r) => r.tier === 3).length;

  const intensity = isTruck
    ? (tonKm > 0 ? (co2Kg * 1000) / tonKm : null)
    : (distanceKm > 0 ? (co2Kg * 1000) / distanceKm : null);
  const baselineCo2Kg = isTruck && tonKm > 0 ? (tonKm * 62.0) / 1000 : null;
  const emptyKm = rows.reduce((s, r) => s + r.distance_km * r.empty_share, 0);

  return (
    <div className="rounded-md border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
      <p className="mb-2 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>
        {title} <span style={{ color: 'var(--color-slate)' }}>{rows.length}대 · Scope 1</span>
      </p>
      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-dim)' }}>해당 차종 데이터 없음</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-slate)' }}>총 배출량</p>
              <p className="num text-xl font-semibold" style={{ color: 'var(--color-paper)' }}>
                {(co2Kg / 1000).toFixed(2)}
                <span className="ml-1 text-[10px]" style={{ color: 'var(--color-slate)' }}>tCO₂e</span>
              </p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-slate)' }}>
                원단위 ({isTruck ? 'gCO₂/ton-km' : 'gCO₂/km'})
              </p>
              <p className="num text-xl font-semibold" style={{ color: 'var(--color-paper)' }}>
                {intensity !== null ? intensity.toFixed(1) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-slate)' }}>연료 · 1차데이터</p>
              <p className="num text-sm" style={{ color: 'var(--color-paper)' }}>
                {Math.round(fuelL).toLocaleString('ko-KR')}L · Tier3 {tier3}/{rows.length}대
              </p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-slate)' }}>감축 여지(상한)</p>
              <p className="num tone-warn-fg text-sm">{headroomKg.toFixed(0)}kg</p>
            </div>
          </div>

          {isTruck && baselineCo2Kg !== null && (
            <p className="num mt-3 border-t pt-2 text-[10px]" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-mist)' }}>
              기본계수 산정 {baselineCo2Kg.toFixed(0)}kg vs 실측 {co2Kg.toFixed(0)}kg — 계측 오차 {(co2Kg - baselineCo2Kg).toFixed(0)}kg
              {' · '}공차 구간 {distanceKm > 0 ? ((emptyKm / distanceKm) * 100).toFixed(0) : '0'}%
            </p>
          )}
          {!isTruck && (
            <p className="mt-3 border-t pt-2 text-[10px]" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-dim)' }}>
              승용차는 화물을 싣지 않아 톤킬로가 성립하지 않는다 — 차량킬로 기준으로 산정하며 화물차 총계와 합산하지 않는다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
