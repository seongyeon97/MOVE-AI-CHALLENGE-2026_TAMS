import { useEffect, useMemo, useState } from 'react';
import type { Certificate, Grade } from '../types';
import { GRADE_META, GRADE_ORDER } from '../lib/grade';
import { FUEL_SOURCE_META } from '../lib/fuelSource';
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

// 증명서는 화물차(트랙터)만 대상이다 — 승용차는 화물 운송을 하지 않으므로 대상 아님(PRD §3.4).
export function CertificateScreen() {
  const [certs, setCerts] = useState<Certificate[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [corridorId, setCorridorId] = useState<string>('');
  // 기간은 일자 단위 — 같은 구간을 그 기간에 몇 번 운송했든 전부 합쳐 증명서 한 장으로 낸다.
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');

  useEffect(() => {
    fetch('/data/certificates.json').then((r) => r.json()).then(setCerts).catch(() => setCerts([]));
    loadSettings().then(setSettings);
  }, []);

  const pool = useMemo(() => (certs ?? []).filter((c) => c.vehicle_class === 'truck'), [certs]);

  const corridorOptions = useMemo(() => {
    const ids = new Set(
      pool
        .map((c) => (c.attribution.applicable ? c.attribution.corridor_id : null))
        .filter((id): id is string => !!id),
    );
    return [...ids].map((id) => ({ id, name: settings?.corridors.find((c) => c.corridor_id === id)?.name ?? id }));
  }, [pool, settings]);

  const dateBounds = useMemo(() => {
    const dates = (certs ?? []).map((c) => c.date).sort();
    return { min: dates[0] ?? '', max: dates[dates.length - 1] ?? '' };
  }, [certs]);

  const filtered = useMemo(() => {
    if (!corridorId) return [];
    return pool.filter((c) => {
      if (!c.attribution.applicable || c.attribution.corridor_id !== corridorId) return false;
      if (dateFrom && c.date < dateFrom) return false;
      if (dateTo && c.date > dateTo) return false;
      if (gradeFilter !== 'all' && c.grade !== gradeFilter) return false;
      return true;
    });
  }, [pool, corridorId, dateFrom, dateTo, gradeFilter]);

  const aggregate = useMemo(() => aggregateCertificates(filtered), [filtered]);

  if (!certs) {
    return <div className="p-6 text-sm" style={{ color: 'var(--color-dim)' }}>불러오는 중…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>증명서 발급</h1>
      <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
        화물차(트랙터)만 발급 대상입니다 — 승용차는 화물 운송을 하지 않으므로 대상이 아닙니다.
      </p>

      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span style={{ color: 'var(--color-slate)' }}>운송구간</span>
          <select value={corridorId} onChange={(e) => setCorridorId(e.target.value)} className="rounded-md border px-2 py-1" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}>
            <option value="">선택</option>
            {corridorOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span style={{ color: 'var(--color-slate)' }}>기간(부터)</span>
          <input
            type="date"
            value={dateFrom}
            min={dateBounds.min || undefined}
            max={dateTo || dateBounds.max || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className="num rounded-md border px-2 py-1"
            style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ color: 'var(--color-slate)' }}>기간(까지)</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || dateBounds.min || undefined}
            max={dateBounds.max || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="num rounded-md border px-2 py-1"
            style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ color: 'var(--color-slate)' }}>신뢰등급</span>
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value as GradeFilter)} className="rounded-md border px-2 py-1" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}>
            <option value="all">전체</option>
            {GRADE_ORDER.map((g) => <option key={g} value={g}>{GRADE_META[g].label}</option>)}
          </select>
        </label>
      </div>

      {!corridorId && (
        <p className="text-xs" style={{ color: 'var(--color-dim)' }}>운송구간을 먼저 선택하세요.</p>
      )}

      {corridorId && filtered.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--color-dim)' }}>선택한 조건에 해당하는 운송건이 없습니다.</p>
      )}

      {aggregate && <CertificateDocument aggregate={aggregate} />}
    </div>
  );
}

function CertificateDocument({ aggregate }: { aggregate: NonNullable<ReturnType<typeof aggregateCertificates>> }) {
  const { trips, data_tier_counts, attribution_counts, safety, eco, basis } = aggregate;
  const first = trips[0];

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-6" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
      {/* ① 헤더 */}
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>운송 안전·친환경 증명서</p>
        <p className="num mt-1 text-xs" style={{ color: 'var(--color-slate)' }}>
          {first.origin_site} ↔ {first.destination_site} ·
          {' '}{basis.date_from} ~ {basis.date_to} ·
          {' '}운송건 {trips.length}건 · 신뢰등급 배지 {[...new Set(trips.map((t) => t.grade))].join('/')}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-dim)' }}>
          데이터 tier — A(교차검증) {data_tier_counts.A}건 · B(단일출처) {data_tier_counts.B}건
          {data_tier_counts.none > 0 && ` · 데이터없음 ${data_tier_counts.none}건`}
        </p>
      </div>

      {/* ② 구간 귀속 검증 */}
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
          {eco.g_co2_per_tonkm !== null && <li>원단위 {eco.g_co2_per_tonkm.toFixed(1)} gCO₂/ton-km (Scope 1)</li>}
          <li>공차 구간 비중 {(eco.empty_share * 100).toFixed(0)}%</li>
        </ul>
      </section>

      {/* ⑤ 산출 근거 — 이 문서의 숫자가 어떤 값·수식·계수로 나왔는지 그대로 밝힌다. */}
      <section>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>산출 근거</p>

        <p className="mt-2 text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>안전(Safe)</p>
        <ul className="num mt-1 space-y-0.5 text-xs" style={{ color: 'var(--color-mist)' }}>
          <li>위험운전 건수 = 급가속+급출발+급감속+급정지 합계 (단말 자동 기록, 출처등급 A)</li>
          <li>발생률 = 건수 ÷ 주행거리(km) × 100 → {eco.distance_km > 0 ? ((safety.core_events / eco.distance_km) * 100).toFixed(1) : '—'}건/100km
            {' '}({safety.core_events}건 ÷ {eco.distance_km.toLocaleString('ko-KR')}km)</li>
          <li>과속은 발생률에서 제외 — 전 차량 0으로만 보고돼 미수집 상태로 판단(산출기준서 §1-1)</li>
          <li>연속운전 한도 {Math.round(safety.limit_sec / 3600)}시간({safety.limit_sec.toLocaleString('ko-KR')}초) — 설정값</li>
          <li>신뢰등급은 발생률과 연료 신호의 대조로 판정 — 0건이라고 만점을 주지 않는다(§5.2)</li>
        </ul>

        <p className="mt-3 text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>친환경(Eco)</p>
        <ul className="num mt-1 space-y-0.5 text-xs" style={{ color: 'var(--color-mist)' }}>
          <li>CO₂(kg) = 연료(L) × 2.606 → {eco.fuel_l.toFixed(1)}L × 2.606 = {eco.co2_kg.toFixed(1)}kg</li>
          <li>경유 CO₂ 배출계수 2.606 kg/L — 출처등급: 설정값(온실가스 배출계수 고시 확정값으로 교체 예정)</li>
          <li>공회전 소모분 {eco.idle_l.toFixed(1)}L는 시간당 2.4 L/h로 환산 — 출처등급: 설정값</li>
          {eco.g_co2_per_tonkm !== null && (
            <li>
              원단위 = CO₂(g) ÷ 톤킬로 → {(eco.co2_kg * 1000).toFixed(0)}g ÷ {eco.ton_km.toLocaleString('ko-KR')}ton-km
              {' '}= {eco.g_co2_per_tonkm.toFixed(1)} gCO₂/ton-km
              {basis.tonnage_per_container !== null && ` (적차거리 × ${basis.tonnage_per_container}t/${first.container_type})`}
            </li>
          )}
          <li>표준 배출원단위 62.0 gCO₂/ton-km 대비 차이는 <b>계측 오차</b>이지 감축량이 아니다(산출기준서 §3-3)</li>
          <li>공차 구간 비중 {(eco.empty_share * 100).toFixed(0)}% — 이 노선 구조상 표준원단위 방식이 어긋나는 근거</li>
        </ul>

        <p className="mt-3 text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>기준연비 출처(§4.3 3계층)</p>
        <ul className="num mt-1 space-y-0.5 text-xs" style={{ color: 'var(--color-mist)' }}>
          {basis.baseline_sources.length > 0 ? (
            basis.baseline_sources.map((b) => {
              const meta = FUEL_SOURCE_META[b.source as keyof typeof FUEL_SOURCE_META];
              return (
                <li key={`${b.source}-${b.kmpl}`}>
                  {b.kmpl.toFixed(1)} km/L <ToneBadge tone={meta?.tone ?? 'warn'} label={meta?.label ?? b.source} />
                  {' '}— {b.count}건 적용
                  {b.source === 'registration' && ' (자동차등록증 ⑫제원란 공인연비, 출처등급 A)'}
                  {b.source === 'public_api' && ' (한국에너지공단 자동차 표시연비, 출처등급 A)'}
                  {b.source === 'ai_estimate' && ' (AI 유사차량 추정, 출처등급 C — 참조모델 근거 필수)'}
                  {b.source === 'fixture' && ' (사전 캐시값, 출처등급 C)'}
                </li>
              );
            })
          ) : (
            <li style={{ color: 'var(--color-dim)' }}>기준연비 정보 없음</li>
          )}
          <li>적재상태 보정 — 공차 ×1.08 / 적차 ×0.78. 출처등급: 설정값(미확정), PoC 실측 회귀로 확정 예정</li>
        </ul>

        <p className="mt-3 text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>데이터 출처등급</p>
        <table className="mt-1 w-full border-collapse text-xs" style={{ color: 'var(--color-mist)' }}>
          <tbody>
            <tr className="border-b" style={{ borderColor: 'var(--color-rule)' }}>
              <td className="py-1 pr-2">운행거리·이벤트</td><td>단말 자동 기록 · A</td>
            </tr>
            <tr className="border-b" style={{ borderColor: 'var(--color-rule)' }}>
              <td className="py-1 pr-2">연료 사용량</td><td>법인 유류카드 전표 · A (데이터 tier B는 미확보 — 운행거리만으로 산정)</td>
            </tr>
            <tr>
              <td className="py-1 pr-2">구간 귀속</td><td>지오펜스 선분교차 · 계산값(±샘플링간격/2 오차 명시)</td>
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
