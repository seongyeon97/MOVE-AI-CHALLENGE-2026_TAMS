// DriverBriefing.tsx — 차주 배포용 리포트 (D 산출물). 구간 선택 없음.
// 주의·위험 구간 전체가 노선 순서 → 주행거리 순서로 한 번에 펼쳐진다 — 인쇄해 나눠 줄 문서 형태.
// 로드뷰/지도/위성 3장은 같은 크기(4:3) — 한 장만 크게 넣으면 균형이 깨진다.

import type { CorridorBundle, DriverReport, SegmentInsight } from '../types';

type Props = {
  corridor: CorridorBundle;
  report: DriverReport;
  insights: SegmentInsight[];
};

const KIND_ORDER = ['roadview', 'map', 'sky'] as const;
const KIND_LABEL: Record<string, string> = { roadview: '로드뷰', map: '지도', sky: '위성' };

export function DriverBriefing({ corridor, report, insights }: Props) {
  const insightByKey = new Map(insights.map((i) => [i.key, i]));
  const spotByKey = new Map(report.spots.map((s) => [s.key, s]));

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      {/* 헤더 */}
      <header>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-paper)' }}>{report.title}</h2>
        </div>
        <p className="max-w-[70ch] text-sm leading-relaxed" style={{ color: 'var(--color-mist)' }}>{report.intro}</p>
      </header>

      {/* 핵심 수칙 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-chalk)' }}>핵심 운행 수칙</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {report.key_rules.map((r, i) => (
            <div key={i} className="rounded-md border p-3" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}>
              <p className="mb-1 text-sm font-medium" style={{ color: 'var(--color-paper)' }}>
                <span className="num mr-2" style={{ color: 'var(--color-slate)' }}>{String(i + 1).padStart(2, '0')}</span>
                {r.rule}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-mist)' }}>{r.why}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 노선별 섹션 */}
      {corridor.routes.map((route) => {
        const spots = route.segments
          .filter((s) => s.tone !== 'ok')
          .sort((a, b) => a.km_from - b.km_from);
        if (spots.length === 0) return null;
        const note = report.route_notes.find((n) => n.route_id === route.route_id);
        return (
          <section key={route.route_id}>
            <h3 className="mb-1 text-sm font-semibold" style={{ color: 'var(--color-chalk)' }}>
              {route.route_name} — 주의·위험 {spots.length}개 지점
            </h3>
            {note && <p className="mb-3 max-w-[70ch] text-xs leading-relaxed" style={{ color: 'var(--color-mist)' }}>{note.summary}</p>}
            <div className="flex flex-col gap-4">
              {spots.map((seg) => {
                const key = `${route.route_id}-${seg.segment_no}`;
                const spot = spotByKey.get(key);
                const insight = insightByKey.get(key);
                if (!spot) return null;
                return (
                  <article key={key} className="rounded-md border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}>
                    {/* 이미지 3장 동일 크기 — 없는 종류는 자리표시자로 자리를 지킨다 */}
                    <div className="mb-3 grid grid-cols-3 gap-2">
                      {KIND_ORDER.map((kind) => {
                        const src = insight?.captures.find((c) => c.endsWith(`_${kind}.jpg`));
                        return (
                          <figure key={kind} className="overflow-hidden rounded border" style={{ borderColor: 'var(--color-rule)' }}>
                            {src ? (
                              <img src={src} alt={KIND_LABEL[kind]} className="aspect-[4/3] w-full object-cover" />
                            ) : (
                              <div className="flex aspect-[4/3] items-center justify-center text-xs" style={{ background: 'var(--color-panel-2)', color: 'var(--color-dim)' }}>
                                이미지 없음
                              </div>
                            )}
                            <figcaption className="py-0.5 text-center text-xs" style={{ color: 'var(--color-dim)', background: 'var(--color-panel-2)' }}>
                              {KIND_LABEL[kind]}
                            </figcaption>
                          </figure>
                        );
                      })}
                    </div>
                    <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-paper)' }}>
                      {spot.nickname}
                      <span className="num ml-2 text-xs font-normal" style={{ color: 'var(--color-slate)' }}>
                        {seg.km_from}~{seg.km_to}km 지점 · <span className={`tone-${seg.tone}-fg`}>{seg.grade_label}</span>
                      </span>
                    </p>
                    <p className="mb-1 max-w-[70ch] text-xs leading-relaxed" style={{ color: 'var(--color-mist)' }}>
                      <span style={{ color: 'var(--color-slate)' }}>언제 — </span>{spot.when_to_watch}
                    </p>
                    <p className="mb-2 max-w-[70ch] text-xs font-semibold leading-relaxed" style={{ color: 'var(--color-chalk)' }}>
                      <span className="font-normal" style={{ color: 'var(--color-slate)' }}>어떻게 — </span>{spot.action}
                    </p>
                    <p className="num text-xs" style={{ color: 'var(--color-dim)' }}>
                      {insight?.address ?? '주소 없음'} · {insight?.geometry.shape ?? '형상 불명'}
                      {insight?.speed ? ` · 실측 평균 ${insight.speed.mean_kmh}km/h` : ''}
                      {seg.dominant_type ? ` · 최다 이벤트 ${seg.dominant_type}` : ''}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* 마무리 */}
      <footer className="rounded-md border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
        <p className="mb-2 max-w-[70ch] text-sm leading-relaxed" style={{ color: 'var(--color-chalk)' }}>{report.closing}</p>
        <p className="max-w-[70ch] text-xs leading-relaxed" style={{ color: 'var(--color-dim)' }}>
          이 안내문의 위험·주의 판정은 이 노선을 실제로 달린 화물 운행의 위험운전 이벤트 통계입니다.
          실제 운행에서는 현장 상황이 우선합니다.
        </p>
      </footer>
    </div>
  );
}
