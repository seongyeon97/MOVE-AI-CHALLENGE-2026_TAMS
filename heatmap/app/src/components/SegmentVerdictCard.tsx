// SegmentVerdictCard.tsx — 판정 근거 카드 (★가장 중요★).
// 등급이 어떤 계산으로 나왔는지를 산식 그대로 펼쳐 보인다.
// 등급이 상대 순위이므로 컷 값·분포·산식을 화면에서 그대로 재현해 보여준다.

import type { CorridorBundle, CorridorRoute, CorridorSegment } from '../types';

type Props = {
  route: CorridorRoute;
  segment: CorridorSegment;
  meta: CorridorBundle['meta'];
};

export function SegmentVerdictCard({ route, segment, meta }: Props) {
  const { criteria } = meta;
  const maxRate = criteria.rate_max || 1;
  const pct = (v: number) => `${Math.min(100, (v / maxRate) * 100)}%`;
  const typeEntries = Object.entries(segment.events_by_type).sort((a, b) => b[1] - a[1]);
  const typeMax = typeEntries[0]?.[1] ?? 1;
  const vsMean = criteria.rate_mean > 0 ? segment.rate_per_trip / criteria.rate_mean : null;
  const vsMedian = criteria.rate_median > 0 ? segment.rate_per_trip / criteria.rate_median : null;

  return (
    <details
      className="group rounded-md border p-4"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}
    >
      {/* 산식 전체를 항상 펼쳐 두면 화면이 길어진다 — 접었다 펼 수 있게 한다 */}
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-paper)' }}>
          판정 근거 — {route.route_name} {segment.km_from}~{segment.km_to}km ·{' '}
          <span className={`tone-${segment.tone}-fg`}>{segment.grade_label}</span>
        </h3>
        <span className="num shrink-0 text-xs" style={{ color: 'var(--color-slate)' }}>
          {segment.rate_per_trip.toFixed(2)}건/trip
          <span className="ml-2 group-open:hidden">펼치기 ▾</span>
          <span className="ml-2 hidden group-open:inline">접기 ▴</span>
        </span>
      </summary>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {/* ① 무엇을 셌나 */}
        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>① 무엇을 셌나 — 집계 대상</p>
          <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--color-mist)' }}>
            이 노선을 실제로 달린 화물차(트랙터) 운행의 이벤트를 셉니다. 승용 차량은 화물 노선을
            달리지 않으므로 집계에서 빠집니다 — 섞으면 핫스팟이 아니라 "차량이 많이 지나간 자리"가
            위험구간으로 잡히기 때문입니다.
          </p>
          <dl className="num grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--color-paper)' }}>
            <dt style={{ color: 'var(--color-slate)' }}>이 구간 이벤트</dt>
            <dd>{segment.event_count}건</dd>
            <dt style={{ color: 'var(--color-slate)' }}>분모</dt>
            <dd>이 노선 실측 운행 {route.trips}건</dd>
            <dt style={{ color: 'var(--color-slate)' }}>구간 길이</dt>
            <dd>{meta.bin_km}km ({segment.km_from}~{segment.km_to}km 지점)</dd>
          </dl>
        </div>

        {/* ② 선형 참조 */}
        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>② 이벤트를 이 구간에 어떻게 배정했나 — 선형 참조</p>
          <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--color-mist)' }}>
            단말은 2분 간격으로만 위치를 보고합니다. 그래서 이벤트가 들고 있는 GPS 좌표는 '가장 최근
            수신 지점'일 뿐입니다. <strong style={{ color: 'var(--color-paper)' }}>이 집계는 이벤트 좌표를 쓰지 않습니다.</strong>
          </p>
          <ol className="list-decimal pl-4 text-xs leading-relaxed" style={{ color: 'var(--color-mist)' }}>
            <li>이벤트 발생 시각을 앞뒤 궤적 점 사이에 놓고 누적 주행거리를 시간 비례로 복원</li>
            <li>복원한 주행거리를 노선 기준선 길이에 비례 환산해 기점 기준 km로 변환</li>
            <li>해당 km가 속한 {meta.bin_km}km 구간에 배정</li>
          </ol>
        </div>

        {/* ③ 발생률 산식 */}
        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>③ 발생률 산식</p>
          <div className="rounded border p-3 text-center" style={{ borderColor: 'var(--color-rule)', background: 'var(--color-panel-2)' }}>
            <p className="text-xs" style={{ color: 'var(--color-slate)' }}>발생률 = 구간 이벤트 수 ÷ 노선 실측 운행 건수</p>
            <p className="num mt-1 text-lg" style={{ color: 'var(--color-paper)' }}>
              {segment.event_count} ÷ {route.trips} = {segment.rate_per_trip.toFixed(2)} 건/trip
            </p>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-dim)' }}>
            건수를 그대로 쓰면 통행이 많은 노선이 자동으로 위험해 보이므로 운행 건수로 나눕니다.
          </p>
        </div>

        {/* ④ 상대 순위 */}
        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>④ 등급은 어떻게 갈렸나 — 상대 순위</p>
          <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--color-mist)' }}>
            고정 기준선은 쓰지 않습니다. 전체 {criteria.total_segments}개 구간을 발생률 내림차순으로
            줄 세운 뒤 상위 {meta.rose_top_n}개를 위험, 그다음 {meta.amber_top_n}개를 주의로 봅니다.
          </p>
          <p className="num mb-2 text-sm" style={{ color: 'var(--color-paper)' }}>
            이 구간 {segment.rank_global + 1}위 / {criteria.total_segments}구간 → {segment.grade_label}
            {vsMean !== null && vsMedian !== null && (
              <span className="ml-2 text-xs" style={{ color: 'var(--color-slate)' }}>
                평균의 {vsMean.toFixed(1)}배 · 중앙값의 {vsMedian.toFixed(1)}배
              </span>
            )}
          </p>
          {/* 분포 바 — 채움 = 이 구간, 세로 실선 = 주의/위험 컷 */}
          <div className="relative h-3 overflow-hidden rounded" style={{ background: 'var(--color-rule)' }}>
            <div className={`tone-${segment.tone}-rail h-full`} style={{ width: pct(segment.rate_per_trip) }} />
            <div className="tone-warn-rail absolute top-0 h-full w-px" style={{ left: pct(criteria.warn_min_rate) }} />
            <div className="tone-dead-rail absolute top-0 h-full w-px" style={{ left: pct(criteria.dead_min_rate) }} />
          </div>
          <div className="num mt-1 flex justify-between text-xs" style={{ color: 'var(--color-dim)' }}>
            <span>0</span>
            <span>주의 컷 {criteria.warn_min_rate.toFixed(2)}</span>
            <span>위험 컷 {criteria.dead_min_rate.toFixed(2)}</span>
            <span>최고 {criteria.rate_max.toFixed(2)}</span>
          </div>
        </div>

        {/* 이벤트 구성 */}
        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>이벤트 구성</p>
          {typeEntries.length === 0 && <p className="text-xs" style={{ color: 'var(--color-dim)' }}>이벤트 없음</p>}
          <div className="flex flex-col gap-1">
            {typeEntries.map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-mist)' }}>
                <span className="w-14 shrink-0">{type}</span>
                <div className="h-2 flex-1 overflow-hidden rounded" style={{ background: 'var(--color-rule)' }}>
                  <div className={`tone-${segment.tone}-rail h-full`} style={{ width: `${(count / typeMax) * 100}%` }} />
                </div>
                <span className="num w-10 shrink-0 text-right">{count}건</span>
              </div>
            ))}
          </div>
        </div>

        {/* 한계 */}
        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>한계</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-dim)' }}>
            등급은 이 데이터셋 안에서의 상대 순위이므로 노선 구성이 바뀌면 컷도 바뀝니다. 궤적
            샘플링 간격 때문에 {meta.bin_km}km 구간 내부의 정확한 지점까지는 특정하지 못합니다.
            전체 {meta.events_assigned}건 배정, 궤적 미매칭 제외 {meta.events_skipped_no_track}건.
          </p>
        </div>
      </div>
    </details>
  );
}
