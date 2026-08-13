// certificateDocument.tsx — 증명서 본체(A4 2면). 화면과 인쇄가 같은 마크업을 쓴다.
// 형태 원칙: 결론(구간·판정)은 크게, 근거는 작게. 판단이 아니라 사실만 담는다(CLAUDE.md §1-1).
import type React from 'react';
import type { Grade } from '../types';
import { GRADE_META } from '../lib/grade';
import { FUEL_SOURCE_META } from '../lib/fuelSource';
import type { aggregateCertificates } from '../lib/certificateAggregate';

export function ToneBadge({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`tone-${tone}-fg tone-${tone}-bd tone-${tone}-bg inline-flex items-center rounded border px-1.5 py-0.5 text-xs`}>
      {label}
    </span>
  );
}

const ATTRIBUTION_LABEL: Record<string, string> = { verified: '검증됨', partial: '부분 검증', failed: '검증 불가' };

/** 본문 한 줄 — 좌: 항목명 / 우: 값(크게) / 아래: 근거 한 줄. */
function CertRow({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="border-b py-3" style={{ borderColor: 'var(--color-rule)' }}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm" style={{ color: 'var(--color-chalk)' }}>{label}</span>
        <span className="num text-right text-lg" style={{ color: 'var(--color-paper)' }}>{value}</span>
      </div>
      {note && <p className="mt-1 text-right text-xs" style={{ color: 'var(--color-dim)' }}>{note}</p>}
    </div>
  );
}

type Aggregate = NonNullable<ReturnType<typeof aggregateCertificates>>;

export function CertificateDocument({ aggregate }: { aggregate: Aggregate }) {
  const { trips, data_tier_counts, attribution_counts, safety, eco, basis } = aggregate;
  const first = trips[0];

  const vehicleCount = new Set(trips.map((t) => t.vehicle_id)).size;
  const ratePer100 = eco.distance_km > 0 ? (safety.core_events / eco.distance_km) * 100 : null;
  const allVerified = attribution_counts !== null && attribution_counts.verified === trips.length;
  const noneVerified = attribution_counts !== null && attribution_counts.verified === 0;
  const verdictTone = !attribution_counts ? 'void' : allVerified ? 'ok' : noneVerified ? 'dead' : 'warn';
  const verdictMark = allVerified ? '✓' : noneVerified ? '✕' : '△';
  const verdictText = !attribution_counts
    ? '판정 대상 아님'
    : allVerified
      ? '전건 구간 검증됨'
      : noneVerified
        ? '구간 검증 불가'
        : '부분 검증';
  // 이행검증이 깨진 건은 이벤트 집계 자체가 무효다 — 0건을 준수로 읽지 않는다(§5.2).
  const eventsInvalid = first.settle === 'block';
  const grades = [...new Set(trips.map((t) => t.grade))].filter(Boolean) as Grade[];
  const methodLabel =
    basis.attribution_method === 'address' ? '주소 대조'
      : basis.attribution_method === 'geofence' ? '지오펜스'
        : '판정 없음';

  return (
    <div className="print-area flex flex-col items-center gap-6">
      {/* ── 1면: 증명서 본체 (A4 210×297mm) ───────────────────────── */}
      <article className="cert-sheet">
        <div className="flex h-full flex-col px-12 py-10">
          {/* ① 표제부 */}
          <p className="text-xs tracking-[0.25em]" style={{ color: 'var(--color-slate)' }}>
            S&amp;E DRIVING PLATFORM · 운송 안전·친환경 증명서
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-paper)' }}>
            {first.origin_site} <span style={{ color: 'var(--color-slate)' }}>→</span> {first.destination_site}
          </h2>
          <p className="num mt-2 text-sm" style={{ color: 'var(--color-chalk)' }}>
            {first.container_type} · {basis.date_from} ~ {basis.date_to} · 차량 {vehicleCount}대
          </p>

          {/* ② 히어로 — 실적과 판정. 이 둘이 문서의 결론이다. */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border p-5" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
              <p className="text-xs" style={{ color: 'var(--color-slate)' }}>운송 실적</p>
              <p className="num mt-2 text-4xl font-semibold" style={{ color: 'var(--color-paper)' }}>
                {trips.length.toLocaleString('ko-KR')}
                <span className="ml-1 text-sm font-normal" style={{ color: 'var(--color-slate)' }}>회</span>
              </p>
              <p className="num mt-2 text-xs" style={{ color: 'var(--color-mist)' }}>
                총 주행거리 {Math.round(eco.distance_km).toLocaleString('ko-KR')} km
                {eco.ton_km > 0 && ` · ${Math.round(eco.ton_km).toLocaleString('ko-KR')} ton-km`}
              </p>
            </div>

            <div className={`tone-${verdictTone}-bg tone-${verdictTone}-bd rounded-md border p-5`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs" style={{ color: 'var(--color-slate)' }}>구간 귀속 검증</p>
                <ToneBadge tone={verdictTone} label={methodLabel} />
              </div>
              <p className={`tone-${verdictTone}-fg mt-2 text-2xl font-semibold`}>
                {verdictMark} {verdictText}
              </p>
              <p className="num mt-2 text-xs" style={{ color: 'var(--color-mist)' }}>
                {attribution_counts
                  ? (['verified', 'partial', 'failed'] as const)
                      .filter((s) => attribution_counts[s] > 0)
                      .map((s) => `${ATTRIBUTION_LABEL[s]} ${attribution_counts[s]}회`)
                      .join(' · ')
                  : '승용차 또는 구간 미등록 — 귀속 검증 대상 아님'}
              </p>
            </div>
          </div>

          {/* ③ 본문 — 항목별 사실 */}
          <div className="mt-6">
            <CertRow
              label="위험운전 이벤트"
              value={
                <span className={eventsInvalid ? 'line-through' : ''}>
                  {ratePer100 !== null ? ratePer100.toFixed(1) : '—'}
                  <span className="ml-1 text-xs" style={{ color: 'var(--color-slate)' }}>건/100km</span>
                </span>
              }
              note={
                <>
                  급가속 {safety.event_counts.accel} · 급출발 {safety.event_counts.start} · 급감속 {safety.event_counts.decel} · 급정지 {safety.event_counts.stop}
                  {eventsInvalid && <span className="tone-dead-fg"> — 단말 검증 실패, 이 집계는 무효입니다. 0건을 준수로 읽지 않습니다</span>}
                </>
              }
            />
            <CertRow
              label="연속운전"
              value={
                <span className={`tone-${safety.all_compliant ? 'ok' : 'dead'}-fg`}>
                  {safety.all_compliant ? '한도 이내 준수' : '한도 초과'}
                </span>
              }
              note={`구간 최대 ${Math.round(safety.max_block_sec / 60)}분 · 한도 ${Math.round(safety.limit_sec / 60)}분`}
            />
            <CertRow
              label="CO₂ 배출량 (Scope 1)"
              value={
                <>
                  {Math.round(eco.co2_kg).toLocaleString('ko-KR')}
                  <span className="ml-1 text-xs" style={{ color: 'var(--color-slate)' }}>kg</span>
                </>
              }
              note={`연료 ${eco.fuel_l.toFixed(1)}L × 2.606 kgCO₂/L · 공차 구간 비중 ${(eco.empty_share * 100).toFixed(0)}%`}
            />
            {eco.g_co2_per_tonkm !== null && (
              <CertRow
                label="배출 원단위"
                value={
                  <>
                    {eco.g_co2_per_tonkm.toFixed(1)}
                    <span className="ml-1 text-xs" style={{ color: 'var(--color-slate)' }}>gCO₂/ton-km</span>
                  </>
                }
                note="표준 원단위 62.0 대비 차이는 계측 오차이며 감축량이 아닙니다"
              />
            )}
            <CertRow
              label="데이터 신뢰등급"
              value={
                <span className="inline-flex flex-wrap justify-end gap-1">
                  {grades.map((g) => <ToneBadge key={g} tone={GRADE_META[g].tone} label={GRADE_META[g].label} />)}
                </span>
              }
              note={`데이터 tier — A(운행·유류 교차검증) ${data_tier_counts.A}회 · B(단일 출처) ${data_tier_counts.B}회${data_tier_counts.none > 0 ? ` · 없음 ${data_tier_counts.none}회` : ''}`}
            />
            <CertRow
              label="기준연비"
              value={
                basis.baseline_sources.length > 0 ? (
                  <>
                    {basis.baseline_sources[0].kmpl.toFixed(1)}
                    <span className="ml-1 text-xs" style={{ color: 'var(--color-slate)' }}>km/L</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--color-dim)' }}>정보 없음</span>
                )
              }
              note={
                basis.baseline_sources.length > 0
                  ? basis.baseline_sources
                      .map((b) => `${FUEL_SOURCE_META[b.source as keyof typeof FUEL_SOURCE_META]?.label ?? b.source} ${b.count}건`)
                      .join(' · ')
                  : '기준연비 출처를 확보하지 못했습니다'
              }
            />
          </div>

          {/* ④ 각주 — 못 한 검증을 한 척하지 않는다. */}
          <div className="mt-auto pt-8">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-dim)' }}>
              {basis.attribution_method === 'address' ? (
                <>
                  † 구간 귀속은 <span className="tone-warn-fg">주소 대조</span>로 판정했습니다. 원자료에 위경도가 없어
                  출발·도착 주소가 등록 사업장과 일치하는지로 확인한 것이며, 지오펜스(선분 교차) 판정이 아닙니다.
                  좌표가 확보되면 승격됩니다.
                </>
              ) : (
                <>† 구간 귀속은 지오펜스 선분 교차로 판정했습니다. 진입·이탈 시각은 추정값이라 ±샘플링간격/2의 오차가 있습니다.</>
              )}
            </p>
            <p className="num mt-2 text-xs" style={{ color: 'var(--color-slate)' }}>
              산출 근거는 2면 · 발급기준일 {basis.date_to} · S&amp;E Driving Platform
            </p>
          </div>
        </div>
      </article>

      {/* ── 2면: 산출 근거 부속서 ──────────────────────────────────── */}
      <article className="cert-sheet">
        <div className="px-12 py-10">
          <p className="text-xs tracking-[0.25em]" style={{ color: 'var(--color-slate)' }}>부속서 · 2면</p>
          <h3 className="mt-2 text-xl font-semibold" style={{ color: 'var(--color-paper)' }}>산출 근거</h3>
          <p className="num mt-1 text-xs" style={{ color: 'var(--color-slate)' }}>
            {first.origin_site} → {first.destination_site} · {basis.date_from} ~ {basis.date_to}
          </p>

          <p className="mt-6 text-sm font-medium" style={{ color: 'var(--color-chalk)' }}>안전(Safe)</p>
          <ul className="num mt-2 space-y-1 text-xs" style={{ color: 'var(--color-mist)' }}>
            <li>위험운전 건수 = 급가속+급출발+급감속+급정지 합계 (단말 자동 기록, 출처등급 A)</li>
            <li>
              발생률 = 건수 ÷ 주행거리(km) × 100 = {safety.core_events}건 ÷ {eco.distance_km.toLocaleString('ko-KR')}km × 100
              {' '}= {ratePer100 !== null ? ratePer100.toFixed(1) : '—'}건/100km
            </li>
            <li>과속은 발생률에서 제외 — 전 차량 0으로만 보고돼 미수집 상태로 판단(산출기준서 §1-1)</li>
            {basis.attribution_method === 'address' && (
              <li>
                운송 1회 = 사업장 간 편도 이동 1건(구내 이동 제외). 원자료의 이벤트·연료는 일자 합계로만 오므로
                각 운송건에 <b>주행거리 비율로 배분</b>했습니다 — 운송건별 실측이 아닙니다.
              </li>
            )}
            <li>연속운전 한도 {Math.round(safety.limit_sec / 3600)}시간({safety.limit_sec.toLocaleString('ko-KR')}초) — 설정값</li>
            <li>신뢰등급은 발생률과 연료 신호의 대조로 판정 — 0건이라고 만점을 주지 않습니다(§5.2)</li>
          </ul>

          <p className="mt-5 text-sm font-medium" style={{ color: 'var(--color-chalk)' }}>친환경(Eco)</p>
          <ul className="num mt-2 space-y-1 text-xs" style={{ color: 'var(--color-mist)' }}>
            <li>CO₂(kg) = 연료(L) × 2.606 = {eco.fuel_l.toFixed(1)}L × 2.606 = {eco.co2_kg.toFixed(1)}kg</li>
            <li>경유 CO₂ 배출계수 2.606 kg/L — 출처등급: 설정값(온실가스 배출계수 고시 확정값으로 교체 예정)</li>
            <li>
              공회전 소모분 {eco.idle_l.toFixed(1)}L는 시간당 {basis.idle_l_per_hour} L/h로 환산 — 출처등급: 설정값
              {basis.idle_l_per_hour !== 2.4 && ' (승용차 계수. 화물차는 2.4 L/h)'}
            </li>
            {eco.g_co2_per_tonkm !== null && (
              <li>
                원단위 = CO₂(g) ÷ 톤킬로 = {(eco.co2_kg * 1000).toFixed(0)}g ÷ {eco.ton_km.toLocaleString('ko-KR')}ton-km
                {' '}= {eco.g_co2_per_tonkm.toFixed(1)} gCO₂/ton-km
                {basis.tonnage_per_container !== null && ` (적차거리 × ${basis.tonnage_per_container}t/${first.container_type})`}
              </li>
            )}
            <li>표준 배출원단위 62.0 gCO₂/ton-km 대비 차이는 <b>계측 오차</b>이지 감축량이 아닙니다(산출기준서 §3-3)</li>
            <li>공차 구간 비중 {(eco.empty_share * 100).toFixed(0)}% — 이 노선 구조상 표준원단위 방식이 어긋나는 근거</li>
          </ul>

          <p className="mt-5 text-sm font-medium" style={{ color: 'var(--color-chalk)' }}>기준연비 출처(§4.3 3계층)</p>
          <ul className="num mt-2 space-y-1 text-xs" style={{ color: 'var(--color-mist)' }}>
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

          <p className="mt-5 text-sm font-medium" style={{ color: 'var(--color-chalk)' }}>데이터 출처등급</p>
          <table className="mt-2 w-full border-collapse text-xs" style={{ color: 'var(--color-mist)' }}>
            <tbody>
              <tr className="border-b" style={{ borderColor: 'var(--color-rule)' }}>
                <td className="py-1.5 pr-2">운행거리·이벤트</td><td>단말 자동 기록 · A</td>
              </tr>
              <tr className="border-b" style={{ borderColor: 'var(--color-rule)' }}>
                <td className="py-1.5 pr-2">연료 사용량</td><td>법인 유류카드 전표 · A (tier B는 미확보 — 운행거리만으로 산정)</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-2">구간 귀속</td>
                <td>
                  {basis.attribution_method === 'address'
                    ? '주소 대조 · 계산값(좌표 미보유로 지오펜스 아님)'
                    : '지오펜스 선분교차 · 계산값(±샘플링간격/2 오차)'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      {/* 액션 — 인쇄 대화상자의 "PDF로 저장"으로 내보낸다(별도 라이브러리 없이 동작). */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="tone-ok-bg tone-ok-fg rounded-md px-3 py-1.5 text-xs font-medium"
          onClick={() => window.print()}
        >
          PDF로 출력
        </button>
        <span className="text-xs" style={{ color: 'var(--color-dim)' }}>
          A4 2면 · 인쇄 대화상자에서 대상을 &lsquo;PDF로 저장&rsquo;으로 선택하세요.
        </span>
      </div>
    </div>
  );
}
