import { useEffect, useMemo, useState } from 'react';
import type { Certificate, Grade, VehicleClass } from '../types';
import { GRADE_META, GRADE_ORDER } from '../lib/grade';
import { aggregateCertificates } from '../lib/certificateAggregate';
import { loadSettings, type Settings } from '../lib/settings';

type GradeFilter = 'all' | Grade;

function ToneBadge({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`tone-${tone}-fg tone-${tone}-bd tone-${tone}-bg inline-flex items-center rounded border px-1.5 py-0.5 text-xs`}>
      {label}
    </span>
  );
}

const ATTRIBUTION_LABEL: Record<string, string> = { verified: '검증됨', partial: '부분 검증', failed: '검증 불가' };
const ATTRIBUTION_TONE: Record<string, string> = { verified: 'ok', partial: 'warn', failed: 'dead' };

export function CertificateScreen() {
  const [certs, setCerts] = useState<Certificate[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('truck');
  const [corridorId, setCorridorId] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [monthFrom, setMonthFrom] = useState<string>('');
  const [monthTo, setMonthTo] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');

  useEffect(() => {
    fetch('/data/certificates.json').then((r) => r.json()).then(setCerts).catch(() => setCerts([]));
    loadSettings().then(setSettings);
  }, []);

  const pool = useMemo(() => (certs ?? []).filter((c) => c.vehicle_class === vehicleClass), [certs, vehicleClass]);

  const corridorOptions = useMemo(() => {
    const ids = new Set(
      pool
        .map((c) => (c.attribution.applicable ? c.attribution.corridor_id : null))
        .filter((id): id is string => !!id),
    );
    return [...ids].map((id) => ({ id, name: settings?.corridors.find((c) => c.corridor_id === id)?.name ?? id }));
  }, [pool, settings]);

  const vehicleOptions = useMemo(() => [...new Set(pool.map((c) => c.vehicle_id))], [pool]);

  const months = useMemo(() => [...new Set((certs ?? []).map((c) => c.month))].sort(), [certs]);

  const selected = vehicleClass === 'truck' ? corridorId : vehicleId;

  const filtered = useMemo(() => {
    if (!selected) return [];
    return pool.filter((c) => {
      if (vehicleClass === 'truck') {
        if (!c.attribution.applicable || c.attribution.corridor_id !== corridorId) return false;
      } else if (c.vehicle_id !== vehicleId) {
        return false;
      }
      if (monthFrom && c.month < monthFrom) return false;
      if (monthTo && c.month > monthTo) return false;
      if (gradeFilter !== 'all' && c.grade !== gradeFilter) return false;
      return true;
    });
  }, [pool, vehicleClass, corridorId, vehicleId, monthFrom, monthTo, gradeFilter, selected]);

  const aggregate = useMemo(() => aggregateCertificates(filtered), [filtered]);

  if (!certs) {
    return <div className="p-6 text-sm" style={{ color: 'var(--color-dim)' }}>불러오는 중…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>증명서 발급</h1>
      <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
        데이터가 업로드된 차량은 화물·승용 구분 없이 전부 발급 대상입니다. 화물차는 지오펜스 구간귀속이 있고, 승용차는 없습니다.
      </p>

      <div className="flex gap-2 text-xs">
        {(['truck', 'car'] as const).map((cls) => (
          <button
            key={cls}
            type="button"
            onClick={() => { setVehicleClass(cls); setCorridorId(''); setVehicleId(''); }}
            className="rounded-md border px-3 py-1.5"
            style={{
              borderColor: vehicleClass === cls ? 'var(--color-teal)' : 'var(--color-line)',
              color: 'var(--color-paper)',
              background: vehicleClass === cls ? 'var(--color-panel-2)' : 'transparent',
            }}
          >
            {cls === 'truck' ? '화물차' : '승용차'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 text-xs">
        {vehicleClass === 'truck' ? (
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-slate)' }}>운송구간</span>
            <select value={corridorId} onChange={(e) => setCorridorId(e.target.value)} className="rounded-md border px-2 py-1" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}>
              <option value="">선택</option>
              {corridorOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--color-slate)' }}>차량번호</span>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="rounded-md border px-2 py-1" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}>
              <option value="">선택</option>
              {vehicleOptions.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span style={{ color: 'var(--color-slate)' }}>기간(부터)</span>
          <select value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} className="rounded-md border px-2 py-1" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}>
            <option value="">전체</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ color: 'var(--color-slate)' }}>기간(까지)</span>
          <select value={monthTo} onChange={(e) => setMonthTo(e.target.value)} className="rounded-md border px-2 py-1" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}>
            <option value="">전체</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ color: 'var(--color-slate)' }}>신뢰등급</span>
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value as GradeFilter)} className="rounded-md border px-2 py-1" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}>
            <option value="all">전체</option>
            {GRADE_ORDER.map((g) => <option key={g} value={g}>{GRADE_META[g].label}</option>)}
          </select>
        </label>
      </div>

      {!selected && (
        <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
          {vehicleClass === 'truck' ? '운송구간을' : '차량번호를'} 먼저 선택하세요.
        </p>
      )}

      {selected && filtered.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--color-dim)' }}>선택한 조건에 해당하는 운송건이 없습니다.</p>
      )}

      {aggregate && <CertificateDocument aggregate={aggregate} vehicleClass={vehicleClass} />}
    </div>
  );
}

function CertificateDocument({
  aggregate,
  vehicleClass,
}: {
  aggregate: NonNullable<ReturnType<typeof aggregateCertificates>>;
  vehicleClass: VehicleClass;
}) {
  const { trips, data_tier_counts, attribution_counts, safety, eco } = aggregate;
  const first = trips[0];

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-6" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
      {/* ① 헤더 */}
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>운송 안전·친환경 증명서</p>
        <p className="num mt-1 text-xs" style={{ color: 'var(--color-slate)' }}>
          {first.vehicle_class === 'truck' ? first.origin_site + ' ↔ ' + first.destination_site : first.vehicle_id} ·
          {' '}운송건 {trips.length}건 · 신뢰등급 배지 {[...new Set(trips.map((t) => t.grade))].join('/')}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-dim)' }}>
          데이터 tier — A(교차검증) {data_tier_counts.A}건 · B(단일출처) {data_tier_counts.B}건
          {data_tier_counts.none > 0 && ` · 데이터없음 ${data_tier_counts.none}건`}
        </p>
      </div>

      {/* ② 구간 귀속 검증 — 화물만 */}
      {vehicleClass === 'truck' ? (
        <section>
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>구간 귀속 검증</p>
          {attribution_counts ? (
            <div className="flex gap-3 text-xs">
              {(['verified', 'partial', 'failed'] as const).map((s) => (
                attribution_counts[s] > 0 && (
                  <span key={s}>
                    <ToneBadge tone={ATTRIBUTION_TONE[s]} label={ATTRIBUTION_LABEL[s]} /> {attribution_counts[s]}건
                  </span>
                )
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>구간귀속 판정 없음</p>
          )}
          <p className="mt-1 text-xs" style={{ color: 'var(--color-dim)' }}>
            판정 오차는 ±샘플링간격/2로 함께 표기됩니다. verified는 출발·도착 사업장 모두 지오펜스 교차 검출, partial은 한쪽만, failed는 둘 다 미검출입니다.
          </p>
        </section>
      ) : (
        <section>
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>구간 귀속 검증</p>
          <p className="text-xs" style={{ color: 'var(--color-dim)' }}>승용차는 구간귀속 검증 대상이 아닙니다(고정 운송구간 없음).</p>
        </section>
      )}

      {/* ③ 안전 */}
      <section>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>안전(Safe)</p>
        <ul className="num space-y-0.5 text-xs" style={{ color: 'var(--color-mist)' }}>
          <li className={first.settle === 'block' ? 'line-through' : ''}>
            급가속 {safety.event_counts.accel} · 급출발 {safety.event_counts.start} · 급감속 {safety.event_counts.decel} · 급정지 {safety.event_counts.stop}
            {first.settle === 'block' && ' — 이행검증 불가'}
          </li>
          <li>연속운전 최대 {Math.round(safety.max_block_sec / 60)}분 / 한도 {Math.round(safety.limit_sec / 60)}분 — {safety.all_compliant ? '준수' : '초과'}</li>
          <li>데이터 신뢰등급: {[...new Set(trips.map((t) => t.grade))].map((g) => g && <ToneBadge key={g} tone={GRADE_META[g].tone} label={GRADE_META[g].label} />)}</li>
        </ul>
      </section>

      {/* ④ 친환경 */}
      <section>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>친환경(Eco)</p>
        <ul className="num space-y-0.5 text-xs" style={{ color: 'var(--color-mist)' }}>
          <li>CO₂ {eco.co2_kg.toFixed(1)}kg</li>
          {eco.g_co2_per_tonkm !== null && <li>원단위 {eco.g_co2_per_tonkm.toFixed(1)} gCO₂/ton-km (Scope 1, 트랙터)</li>}
          {eco.g_co2_per_km !== null && <li>원단위 {eco.g_co2_per_km.toFixed(1)} gCO₂/km (Scope 1, 승용 — 톤킬로 산정 불가)</li>}
          <li>공차 구간 비중 {(eco.empty_share * 100).toFixed(0)}%</li>
        </ul>
      </section>

      {/* ⑤ 데이터 신뢰 고지 */}
      <section>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>데이터 신뢰 고지</p>
        <table className="w-full border-collapse text-xs" style={{ color: 'var(--color-mist)' }}>
          <tbody>
            <tr className="border-b" style={{ borderColor: 'var(--color-rule)' }}>
              <td className="py-1 pr-2">운행거리·이벤트</td><td>단말 자동 기록 · A</td>
            </tr>
            <tr className="border-b" style={{ borderColor: 'var(--color-rule)' }}>
              <td className="py-1 pr-2">연료 사용량</td><td>법인 유류카드 전표 · A (데이터 tier B는 미확보)</td>
            </tr>
            <tr>
              <td className="py-1 pr-2">구간 귀속</td><td>지오펜스 선분교차 · 계산값(오차 명시)</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ⑥ 액션 */}
      <div className="flex gap-2">
        <button type="button" className="tone-ok-bg tone-ok-fg rounded-md px-3 py-1.5 text-xs font-medium">증명서 발행</button>
        <button type="button" className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}>PDF 내려받기</button>
      </div>
    </div>
  );
}
