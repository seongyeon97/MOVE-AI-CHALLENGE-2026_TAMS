// SegmentInsightCard.tsx — AI 도로환경 해설 카드. 판정 근거 카드와 역할이 정반대(추론 vs 계산).
// 3요소는 항상 함께: ①'AI 추론 · 현장 검증 안 됨' 배지 ②원인별 evidence+확신도 ③모델이 실제 본 캡처+visual_notes.
// ⚠️ 확신도 배지에 등급 색(tone-*)을 쓰지 않는다 — 그 색은 데이터 신뢰등급 전용.

import { useState } from 'react';
import type { SegmentInsight } from '../types';

const CAPTURE_LABEL: Record<string, string> = {
  map: '일반 지도',
  sky: '위성',
  roadview: '로드뷰',
};

function captureKind(path: string): string {
  const m = path.match(/_(map|sky|roadview)\.jpg$/);
  return m ? CAPTURE_LABEL[m[1]] : '이미지';
}

export function SegmentInsightCard({ insight }: { insight: SegmentInsight }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const { report } = insight;

  return (
    <section className="rounded-md border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-paper)' }}>AI 도로환경 해설</h3>
        {/* 등급 색 금지 — 중립색 배지 */}
        <span className="rounded border px-1.5 py-0.5 text-xs" style={{ borderColor: 'var(--color-steel)', color: 'var(--color-mist)', background: 'var(--color-panel-2)' }}>
          AI 추론 · 현장 검증 안 됨
        </span>
      </header>

      <p className="mb-3 text-sm" style={{ color: 'var(--color-paper)' }}>{report.headline}</p>

      {/* 원인 후보 — evidence·확신도 필수 동반 */}
      <div className="mb-3 flex flex-col gap-2">
        {report.causes.map((cause, i) => (
          <div key={i} className="rounded border p-2" style={{ borderColor: 'var(--color-rule)', background: 'var(--color-panel-2)' }}>
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="text-xs font-medium" style={{ color: 'var(--color-chalk)' }}>{cause.factor}</p>
              <span className="shrink-0 rounded border px-1 py-0.5 text-xs" style={{ borderColor: 'var(--color-steel)', color: 'var(--color-slate)' }}>
                근거 {cause.confidence}
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-mist)' }}>{cause.evidence}</p>
          </div>
        ))}
      </div>

      <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--color-chalk)' }}>
        <span style={{ color: 'var(--color-slate)' }}>운행 조언 — </span>{report.driver_advice}
      </p>

      {/* 모델이 실제로 본 화면 */}
      {insight.captures.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-xs" style={{ color: 'var(--color-slate)' }}>모델이 본 화면 (클릭 시 확대)</p>
          <div className="grid grid-cols-3 gap-2">
            {insight.captures.map((src) => (
              <button key={src} type="button" onClick={() => setZoom(src)} className="overflow-hidden rounded border" style={{ borderColor: 'var(--color-rule)' }}>
                <img src={src} alt={captureKind(src)} className="aspect-[4/3] w-full object-cover" />
                <span className="block py-0.5 text-center text-xs" style={{ color: 'var(--color-dim)', background: 'var(--color-panel-2)' }}>{captureKind(src)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--color-mist)' }}>
        <span style={{ color: 'var(--color-slate)' }}>화면 판독 — </span>{report.visual_notes}
      </p>

      {/* 해설에 사용한 실측 근거 */}
      <details className="mb-2">
        <summary className="cursor-pointer text-xs" style={{ color: 'var(--color-slate)' }}>해설에 사용한 실측 근거</summary>
        <dl className="num mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--color-mist)' }}>
          <dt style={{ color: 'var(--color-slate)' }}>주소</dt>
          <dd>{insight.address ?? '도로명 주소 없음(고속도로 본선 등)'} {insight.region ? `· ${insight.region}` : ''}</dd>
          <dt style={{ color: 'var(--color-slate)' }}>도로 형상</dt>
          <dd>{insight.geometry.shape} (누적 방위변화 {insight.geometry.total_turn_deg}° · 최대 단일 꺾임 {insight.geometry.max_turn_deg}°)</dd>
          {insight.speed && (
            <>
              <dt style={{ color: 'var(--color-slate)' }}>구간 속도</dt>
              <dd>
                평균 {insight.speed.mean_kmh}km/h · 최고 {insight.speed.max_kmh} · 최저 {insight.speed.min_kmh} · 표준편차{' '}
                {insight.speed.stdev_kmh} (DTG 실측 {insight.speed.samples}점)
              </dd>
            </>
          )}
          {insight.hours && insight.hours.top_hours.length > 0 && (
            <>
              <dt style={{ color: 'var(--color-slate)' }}>이벤트 시간대</dt>
              <dd>{insight.hours.top_hours.map((h) => `${h.hour}시 ${h.count}건`).join(' · ')}</dd>
            </>
          )}
          {insight.pois.length > 0 && (
            <>
              <dt style={{ color: 'var(--color-slate)' }}>주변 시설</dt>
              <dd>{insight.pois.slice(0, 8).map((p) => `${p.name}(${p.distance_m}m)`).join(', ')}</dd>
            </>
          )}
        </dl>
      </details>

      <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
        위 문장은 도로환경 해설이며 사고 발생을 예측하거나 새 위험 점수를 매기지 않습니다.
      </p>

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8" style={{ background: 'var(--color-ink-deep)' }} onClick={() => setZoom(null)} role="dialog" aria-label="이미지 확대">
          <img src={zoom} alt={captureKind(zoom)} className="max-h-full max-w-full rounded" />
        </div>
      )}
    </section>
  );
}
