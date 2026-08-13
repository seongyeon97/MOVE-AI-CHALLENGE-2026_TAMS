// HeatmapScreen.tsx — 위험구간 히트맵 (C 산출물). 탭 2개: 회사 리포트 / 차주 배포용 리포트.
// 순서가 곧 신뢰의 순서다 — 판정 근거(계산)가 먼저, 도로환경 해설이 뒤에 온다.
// 데이터는 빌드 타임 산출 정적 JSON만 읽는다. 런타임 API 호출 없음.

import { useEffect, useMemo, useState } from 'react';
import type { CorridorBundle, CorridorRoute, CorridorSegment, SegmentInsightBundle } from '../types';
import { CorridorMap } from './CorridorMap';
import { SegmentVerdictCard } from './SegmentVerdictCard';
import { SegmentInsightCard } from './SegmentInsightCard';
import { SegmentRoadview } from './SegmentRoadview';
import { DriverBriefing } from './DriverBriefing';

type Tab = 'company' | 'driver';

export function HeatmapScreen() {
  const [corridor, setCorridor] = useState<CorridorBundle | null>(null);
  const [insights, setInsights] = useState<SegmentInsightBundle | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('company');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // 노선을 고르고 [분석]을 눌러야 리포트가 열린다 — 들어오자마자 결과부터 들이밀지 않는다
  const [routeId, setRouteId] = useState<string>('');
  const [analyzedRouteId, setAnalyzedRouteId] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      fetch('/data/corridor.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/segment_insights.json').then((r) => (r.ok ? r.json() : null)),
    ]).then(([c, i]) => {
      if (c.status === 'fulfilled' && c.value?.meta) {
        setCorridor(c.value);
        setRouteId(c.value.routes[0]?.route_id ?? '');
      }
      if (i.status === 'fulfilled' && i.value?.insights) setInsights(i.value);
      setLoaded(true);
    });
  }, []);

  // 분석 대상 노선만 남긴다. 순위(rank_global)는 전 구간 기준으로 이미 계산돼 있으므로
  // 여기서 거르는 건 "보여줄 행"뿐이다 — 필터를 걸어도 순위는 바뀌지 않는다.
  const shownRoutes = useMemo(
    () => (corridor && analyzedRouteId ? corridor.routes.filter((r) => r.route_id === analyzedRouteId) : []),
    [corridor, analyzedRouteId],
  );

  const ranked = useMemo(() => {
    const rows: { route: CorridorRoute; seg: CorridorSegment }[] = [];
    for (const route of shownRoutes) {
      for (const seg of route.segments) {
        if (seg.event_count > 0) rows.push({ route, seg });
      }
    }
    return rows.sort((a, b) => a.seg.rank_global - b.seg.rank_global).slice(0, 100);
  }, [shownRoutes]);

  if (!loaded) {
    return <div className="p-6 text-sm" style={{ color: 'var(--color-dim)' }}>불러오는 중…</div>;
  }

  if (!corridor || corridor.routes.length === 0) {
    return (
      <div className="p-6">
        <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--color-paper)' }}>Heat-map — 구간 위험도</h2>
        <div className="rounded-md border p-4 text-sm leading-relaxed" style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}>
          <p className="mb-2">집계된 구간 데이터가 없습니다. 실측 CSV 투입 전의 의도된 빈 상태입니다(오류 아님).</p>
          <ol className="num list-decimal pl-5 text-xs" style={{ color: 'var(--color-slate)' }}>
            <li>운행데이터/에 실측 CSV(trip·event·dtg_track)와 route_roads_*.json을 넣는다</li>
            <li>npm run build:data:heatmap — 노선 기준선 + 구간 집계(routes.json·corridor.json)</li>
            <li>(선택) npm run build:data:insights — 도로환경 해설 생성</li>
          </ol>
        </div>
      </div>
    );
  }

  const { meta } = corridor;
  const flagged = shownRoutes.reduce((s, r) => s + r.segments.filter((x) => x.tone !== 'ok').length, 0);
  const shownSegments = shownRoutes.reduce((s, r) => s + r.segments.length, 0);
  const shownTrips = shownRoutes.reduce((s, r) => s + r.trips, 0);
  const selected = findSelected({ ...corridor, routes: shownRoutes }, selectedKey);
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
        {analyzedRouteId && (
          <p className="num text-xs" style={{ color: 'var(--color-slate)' }}>
            {shownSegments}개 구간 중 {flagged}개 주의·위험 · 화물 실측 운행 {shownTrips}건 기준
          </p>
        )}
      </header>

      {/* 노선 선택 + 분석 실행 */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}>
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-slate)' }}>
          분석할 노선
          <select
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            className="min-w-[280px] rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
          >
            {corridor.routes.map((r) => (
              <option key={r.route_id} value={r.route_id}>
                {r.route_name} ({r.trips}건 운행)
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!routeId}
          onClick={() => {
            setAnalyzedRouteId(routeId);
            setSelectedKey(null); // 노선이 바뀌면 이전 구간 선택은 무효
            setTab('company');
          }}
          className="rounded px-4 py-1.5 text-sm font-medium"
          style={{ background: 'var(--color-teal)', color: 'var(--color-ink-deep)', opacity: routeId ? 1 : 0.5 }}
        >
          분석
        </button>
        {analyzedRouteId && (
          <button
            type="button"
            onClick={() => {
              setAnalyzedRouteId(null);
              setSelectedKey(null);
            }}
            className="rounded border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}
          >
            닫기
          </button>
        )}
      </div>

      {!analyzedRouteId && (
        <p className="text-sm" style={{ color: 'var(--color-dim)' }}>
          노선을 고르고 [분석]을 누르면 회사 리포트와 차주 배포용 리포트가 열립니다.
        </p>
      )}

      {/* 탭 — 차주 리포트 없으면 탭 자체를 숨긴다(빈 껍데기 금지) */}
      {analyzedRouteId && hasDriverReport && (
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

      {!analyzedRouteId ? null : tab === 'driver' && insights?.driver_report ? (
        <DriverBriefing
          corridor={{ ...corridor, routes: shownRoutes }}
          report={insights.driver_report}
          insights={insights.insights}
        />
      ) : (
        <>
          {/* 지도 + 구간 순위 목록 */}
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]" style={{ minHeight: 420 }}>
            <div className="h-[420px]">
              <CorridorMap routes={shownRoutes} selectedKey={selectedKey} onSelect={setSelectedKey} />
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
                          <span className="num">{seg.km_from}~{seg.km_to}km</span>
                          {seg.dominant_type && (
                            // 무엇 위주의 위험인지 — 등급만 보면 대응 방법을 알 수 없다
                            <span style={{ color: 'var(--color-chalk)' }}>
                              {' '}· {seg.dominant_type}
                              {seg.dominant_share != null && (
                                <span className="num" style={{ color: 'var(--color-slate)' }}>
                                  {' '}{Math.round(seg.dominant_share * 100)}%
                                </span>
                              )}
                            </span>
                          )}
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

              {/* 로드뷰 + 도로환경 해설 */}
              {selectedInsight && (
                <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
                  <SegmentRoadview
                    center={selected.seg.centroid}
                    bearing={segmentBearing(selected.seg)}
                    fallbackImage={roadview}
                  />
                  <SegmentInsightCard insight={selectedInsight} />
                </div>
              )}
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
              지도나 목록에서 구간을 선택하면 판정 근거{insights ? '와 도로환경 해설' : ''}이 표시됩니다.
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

/** 구간 시작→끝 방위각. 로드뷰 시선을 주행 방향으로 맞추는 데 쓴다. */
function segmentBearing(seg: CorridorSegment): number {
  const pl = seg.polyline;
  if (pl.length < 2) return 0;
  const [lat1, lon1] = pl[0];
  const [lat2, lon2] = pl[pl.length - 1];
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
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
