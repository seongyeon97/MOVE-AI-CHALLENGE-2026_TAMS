// HeatmapScreen.tsx — 위험구간 히트맵 (C 산출물). 탭 2개: 회사 리포트 / 차주 배포용 리포트.
// 순서가 곧 신뢰의 순서다 — 결정론적 계산(판정 근거 카드)이 먼저, AI 추론(해설 카드)이 뒤에 온다.
// 데이터는 빌드 타임 산출 정적 JSON만 읽는다. 런타임 API 호출 없음.

import { useEffect, useMemo, useState } from 'react';
import type { CorridorBundle, CorridorRoute, CorridorSegment, SegmentInsightBundle } from '../types';
import { CorridorMap } from './CorridorMap';
import { SegmentVerdictCard } from './SegmentVerdictCard';
import { SegmentInsightCard } from './SegmentInsightCard';
import { DriverBriefing } from './DriverBriefing';

type Tab = 'company' | 'driver';

export function HeatmapScreen() {
  const [corridor, setCorridor] = useState<CorridorBundle | null>(null);
  const [insights, setInsights] = useState<SegmentInsightBundle | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('company');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      fetch('/data/corridor.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/segment_insights.json').then((r) => (r.ok ? r.json() : null)),
    ]).then(([c, i]) => {
      if (c.status === 'fulfilled' && c.value?.meta) setCorridor(c.value);
      if (i.status === 'fulfilled' && i.value?.insights) setInsights(i.value);
      setLoaded(true);
    });
  }, []);

  const ranked = useMemo(() => {
    if (!corridor) return [];
    const rows: { route: CorridorRoute; seg: CorridorSegment }[] = [];
    for (const route of corridor.routes) {
      for (const seg of route.segments) {
        if (seg.event_count > 0) rows.push({ route, seg });
      }
    }
    return rows.sort((a, b) => a.seg.rank_global - b.seg.rank_global).slice(0, 100);
  }, [corridor]);

  if (!loaded) {
    return <div className="p-6 text-sm" style={{ color: 'var(--color-dim)' }}>불러오는 중…</div>;
  }

  if (!corridor || corridor.routes.length === 0) {
    return (
      <div className="p-6">
        <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--color-paper)' }}>Heat-map 분석 — 구간 위험도</h2>
        <div className="rounded-md border p-4 text-sm leading-relaxed" style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}>
          <p className="mb-2">
            Heat-map 분석은 <b>별도 구동으로 시연</b>합니다. 이 화면은 그 산출물이 들어올 자리이며,
            Safe·Eco·증명서와 데이터를 주고받지 않습니다 — 빈 상태가 정상입니다(오류 아님).
          </p>
          <p className="text-xs" style={{ color: 'var(--color-slate)' }}>
            연동 규약: <span className="num">/data/corridor.json</span>(구간 집계) ·
            {' '}<span className="num">/data/segment_insights.json</span>(AI 도로환경 해설, 선택).
            두 파일을 <span className="num">app/public/data/</span>에 두면 이 화면이 그대로 렌더합니다.
            위험 판정은 빌드 타임 결정론적 통계이고, AI는 확정된 구간의 해설만 답니다.
          </p>
        </div>
      </div>
    );
  }

  const { meta } = corridor;
  const flagged = corridor.routes.reduce(
    (s, r) => s + r.segments.filter((x) => x.tone !== 'ok').length,
    0,
  );
  const selected = findSelected(corridor, selectedKey);
  const selectedInsight =
    selected && insights
      ? insights.insights.find((i) => i.key === `${selected.route.route_id}-${selected.seg.segment_no}`) ?? null
      : null;
  const roadview = selectedInsight?.captures.find((c) => c.endsWith('_roadview.jpg')) ?? null;
  const hasDriverReport = Boolean(insights?.driver_report);

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* 헤더 */}
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-paper)' }}>Heat-map — 구간 위험도</h2>
        <p className="num text-xs" style={{ color: 'var(--color-slate)' }}>
          전체 {meta.criteria.total_segments}개 구간 중 {flagged}개 주의·위험 · verifiable 운행 {meta.criteria.verifiable_trips}건 기준
        </p>
      </header>

      {/* 탭 — 차주 리포트 없으면 탭 자체를 숨긴다(빈 껍데기 금지) */}
      {hasDriverReport && (
        <div role="tablist" aria-label="리포트 종류" className="flex gap-1 border-b" style={{ borderColor: 'var(--color-rule)' }}>
          {([['company', '회사 리포트'], ['driver', '차주 배포용 리포트']] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              type="button"
              onClick={() => setTab(key)}
              className="rounded-t-md px-3 py-2 text-sm"
              style={{
                color: tab === key ? 'var(--color-paper)' : 'var(--color-slate)',
                background: tab === key ? 'var(--color-panel)' : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'driver' && insights?.driver_report ? (
        <DriverBriefing corridor={corridor} report={insights.driver_report} insights={insights.insights} />
      ) : (
        <>
          {/* 지도 + 구간 순위 목록 */}
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]" style={{ minHeight: 420 }}>
            <div className="h-[420px]">
              <CorridorMap routes={corridor.routes} selectedKey={selectedKey} onSelect={setSelectedKey} />
            </div>
            <div className="h-[420px] overflow-y-auto rounded-md border" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}>
              <p className="sticky top-0 border-b px-3 py-2 text-xs font-medium" style={{ borderColor: 'var(--color-rule)', background: 'var(--color-panel)', color: 'var(--color-chalk)' }}>
                구간 순위 (전 노선 발생률 기준)
              </p>
              {ranked.length === 0 && <p className="p-3 text-xs" style={{ color: 'var(--color-dim)' }}>이벤트가 배정된 구간 없음</p>}
              <ul>
                {ranked.map(({ route, seg }) => {
                  const key = `${route.route_id}-${seg.segment_no}`;
                  const isSelected = selectedKey === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(isSelected ? null : key)}
                        className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-xs"
                        style={{
                          borderColor: 'var(--color-rule)',
                          background: isSelected ? 'var(--color-panel-2)' : 'transparent',
                          color: 'var(--color-mist)',
                        }}
                      >
                        <span className="num w-8 shrink-0" style={{ color: 'var(--color-slate)' }}>{seg.rank_global + 1}위</span>
                        <span className={`tone-${seg.tone}-fg tone-${seg.tone}-bd tone-${seg.tone}-bg shrink-0 rounded border px-1 py-0.5`}>{seg.grade_label}</span>
                        <span className="flex-1 truncate">
                          {route.route_name} <span className="num">{seg.km_from}~{seg.km_to}km</span>
                        </span>
                        <span className="num shrink-0" style={{ color: 'var(--color-paper)' }}>{seg.rate_per_trip.toFixed(2)}건/trip</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* 판정 근거 카드 — 계산. 먼저 온다 */}
          {selected ? (
            <>
              <SegmentVerdictCard route={selected.route} segment={selected.seg} meta={meta} />

              {/* 로드뷰 + AI 해설 — 추론. 나중에 온다 */}
              {selectedInsight && (
                <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
                  <figure className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--color-line)' }}>
                    {roadview ? (
                      <img src={roadview} alt="구간 로드뷰" className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center text-xs" style={{ background: 'var(--color-panel-2)', color: 'var(--color-dim)' }}>
                        로드뷰 없음
                      </div>
                    )}
                    <figcaption className="px-2 py-1 text-xs" style={{ color: 'var(--color-dim)', background: 'var(--color-panel)' }}>
                      로드뷰 (빌드 타임 캡처)
                    </figcaption>
                  </figure>
                  <SegmentInsightCard insight={selectedInsight} />
                </div>
              )}
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
              지도나 목록에서 구간을 선택하면 판정 근거{insights ? '와 AI 도로환경 해설' : ''}이 표시됩니다.
            </p>
          )}

          {/* 각주 — 집계 방식 고지 */}
          <footer className="rounded-md border px-4 py-2 text-xs leading-relaxed" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-dim)' }}>
            {meta.note} 등급은 절대 임계값이 아니라 전 구간 발생률 상대 순위(상위 {meta.rose_top_n}개 위험 ·
            다음 {meta.amber_top_n}개 주의)입니다. 이벤트 {meta.events_assigned}건 배정 · 궤적 미매칭 제외{' '}
            {meta.events_skipped_no_track}건.
          </footer>
        </>
      )}
    </div>
  );
}

function findSelected(corridor: CorridorBundle, key: string | null) {
  if (!key) return null;
  for (const route of corridor.routes) {
    for (const seg of route.segments) {
      if (`${route.route_id}-${seg.segment_no}` === key) return { route, seg };
    }
  }
  return null;
}
