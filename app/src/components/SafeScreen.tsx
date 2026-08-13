import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CorridorBundle, Grade, Vehicle, VehicleClass } from '../types';
import { GRADE_META, GRADE_ORDER } from '../lib/grade';
import { FUEL_SOURCE_META } from '../lib/fuelSource';
import { scoreOf } from '../lib/score';
import { buildVehicleReport, signalRatioOf } from '../lib/report';
import { aggregateRange, coverageByVehicle, type DailyBundle } from '../lib/aggregate';
import { useSort } from '../lib/useSort';
import { sendNotice, useLatestNoticeStatus } from '../lib/notices';
import { ALL_VEHICLES } from '../lib/channels';
import { buildNoticeDraft } from '../lib/noticeDraft';

type ClassFilter = 'all' | VehicleClass;
type GradeFilter = 'all' | Grade;

function ToneBadge({ tone, label }: { tone: string; label: string }) {
  return (
    <span
      className={`tone-${tone}-fg tone-${tone}-bd tone-${tone}-bg inline-flex items-center rounded border px-1.5 py-0.5 text-xs`}
    >
      {label}
    </span>
  );
}

function RankStrip({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div className="flex gap-0.5">
      {vehicle.monthly.map((m) => {
        const meta = GRADE_META[m.grade];
        const isLatest = m.month === vehicle.monthly[vehicle.monthly.length - 1].month;
        return (
          <div
            key={m.month}
            title={`${m.month} · ${meta.label} · 순위 ${m.fuel_rank ?? '제외'}`}
            // -bg는 14% 반투명이라 전부 어둡게 깔린다. 상태 막대는 원색인 -rail을 쓴다.
            className={`tone-${meta.tone}-rail h-4 w-3 rounded-sm`}
            style={{ opacity: isLatest ? 1 : 0.35 }} // 당월 진하게 · 전월 흐리게
          />
        );
      })}
    </div>
  );
}

/**
 * 공지 확인 여부 — 기사뷰에서 기사가 공지를 열어 확인하면 여기가 초록 "공지 확인"으로 바뀐다.
 * 단말 상태는 왼쪽 월별 막대(RankStrip)가 이미 보여주므로 여기서 겹쳐 표시하지 않는다.
 */
function NoticeStatus({ vehicleId }: { vehicleId: string }) {
  const notice = useLatestNoticeStatus(vehicleId);

  if (!notice) {
    return <span className="text-xs" style={{ color: 'var(--color-dim)' }}>—</span>;
  }
  return notice.acknowledged ? (
    <ToneBadge tone="ok" label="공지 확인" />
  ) : (
    <ToneBadge tone="dead" label="공지 미확인" />
  );
}

export function SafeScreen({ onOpenIngest }: { onOpenIngest: () => void }) {
  const [bundle, setBundle] = useState<DailyBundle | null>(null);
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [search, setSearch] = useState('');
  // 입력칸은 이 draft 상태에 바로 반영되고, 실제 필터링은 확인을 눌러야 적용된다(타이핑마다 표 안 흔들리게).
  const [classFilterDraft, setClassFilterDraft] = useState<ClassFilter>('all');
  const [gradeFilterDraft, setGradeFilterDraft] = useState<GradeFilter>('all');
  const [searchDraft, setSearchDraft] = useState('');
  // 조회 기간 — 차량마다 데이터 보유 기간이 제각각이라 기간을 안 자르면 3일치와 154일치가 같은 표에서 비교된다.
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeDraft, setRangeDraft] = useState<{ from: string; to: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // 공지 초안 — 보내기 전에 무엇이 나가는지 먼저 펼쳐 본다.
  const [showDraft, setShowDraft] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [corridor, setCorridor] = useState<CorridorBundle | null>(null);

  function loadData() {
    setRefreshing(true);
    return fetch('/data/daily.json')
      .then((r) => r.json())
      .then((b: DailyBundle) => {
        setBundle(b);
        const full = { from: b.meta.date_min ?? '', to: b.meta.date_max ?? '' };
        setRange(full);
        setRangeDraft(full);
      })
      .catch(() => setBundle(null))
      .finally(() => setRefreshing(false));
  }

  useEffect(() => {
    loadData();
    // 공지 초안에 위험구간을 넣으려면 Heat-map 집계가 필요하다. 없으면 그 항목만 빠진다.
    fetch('/data/corridor.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((c: CorridorBundle | null) => setCorridor(c?.routes ? c : null))
      .catch(() => setCorridor(null));
  }, []);

  function applyFilters() {
    setClassFilter(classFilterDraft);
    setGradeFilter(gradeFilterDraft);
    setSearch(searchDraft);
    if (rangeDraft) setRange(rangeDraft);
  }

  // 기간이 바뀌면 그 구간만 잘라 전체 차량을 다시 집계·판정한다(순위도 그 기간 기준으로 다시 매겨진다).
  const vehicles = useMemo(() => {
    if (!bundle || !range) return null;
    return aggregateRange(bundle, range.from, range.to);
  }, [bundle, range]);

  const coverage = useMemo(() => (bundle ? coverageByVehicle(bundle) : null), [bundle]);

  // 훅은 조건부로 호출할 수 없으므로 필터링·정렬을 이른 반환보다 먼저 계산해 둔다.
  const filteredRows = useMemo(() => {
    if (!vehicles) return [];
    return vehicles
      .filter((v) => v.grade !== 'D')
      .filter((v) => classFilter === 'all' || v.vehicle_class === classFilter)
      .filter((v) => gradeFilter === 'all' || v.grade === gradeFilter)
      .filter((v) => v.vehicle_id.toLowerCase().includes(search.toLowerCase()));
  }, [vehicles, classFilter, gradeFilter, search]);

  const { toggle, sorted: ranked, indicator } = useSort(filteredRows, {
    rank: (v) => v.fuel_rank,
    vehicle: (v) => v.vehicle_id,
    device: (v) => v.grade_label,
    distance: (v) => v.reported_km,
    events: (v) => v.core_events,
    rate: (v) => v.rate,
    baseline: (v) => v.baseline.kmpl,
    measured: (v) => (v.fuel_l > 0 ? v.reported_km / v.fuel_l : null),
    score: (v) => scoreOf(v),
  }, { key: 'rank', dir: 'asc' }); // 기본은 순위 1등부터

  if (!vehicles || !range || !rangeDraft) {
    const isEmpty = bundle === null && !refreshing;
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm" style={{ color: 'var(--color-dim)' }}>
          {isEmpty ? '데이터가 없습니다 — 운행·유류 파일을 올리면 여기에 차량 목록이 나옵니다.' : '불러오는 중…'}
        </p>
        {/* 빈 화면에서 "어디로 가야 하나"를 찾게 만들지 않는다 — 버튼을 그 자리에 둔다. */}
        {isEmpty && (
          <button
            type="button"
            onClick={onOpenIngest}
            className="tone-ok-bg tone-ok-fg rounded-md px-4 py-2 text-sm font-medium"
          >
            데이터 업로드 →
          </button>
        )}
      </div>
    );
  }

  const untrustedCount = vehicles.filter((v) => v.grade !== '정상').length;
  const coveragePct = vehicles.length > 0
    ? Math.round((vehicles.filter((v) => v.verifiable).length / vehicles.length) * 100)
    : 0;

  const excluded = vehicles.filter((v) => v.grade === 'D');

  // 공지 초안 — 지금 조회기간의 판정 결과 + Heat-map 집계에서 그대로 뽑는다.
  const draft = buildNoticeDraft(vehicles, corridor);

  /** 패널을 열 때 초안을 최신 판정으로 다시 채운다 — 기간을 바꾸고 열면 그 기간 기준이어야 한다. */
  function openDraft(open: boolean) {
    if (open) {
      setDraftText(draft.text);
      setSentAt(null);
    }
    setShowDraft(open);
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="num text-sm" style={{ color: 'var(--color-paper)' }}>
          {vehicles.length}대 중 {untrustedCount}대 데이터 신뢰 불가 · 검증 커버리지 {coveragePct}%
          <span className="ml-2 text-xs" style={{ color: 'var(--color-slate)' }}>
            ({range.from} ~ {range.to} 기준)
          </span>
        </p>
        {/* 업로드는 이 화면의 주 동작이라 채운 버튼 하나로 눈에 띄게 둔다.
            "리포트 생성"은 아무 동작도 없는 버튼이라 지웠다 — 눌러도 반응이 없으면 헷갈리기만 한다. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenIngest}
            className="tone-ok-bg tone-ok-fg rounded-md px-4 py-2 text-xs font-medium"
          >
            데이터 업로드
          </button>
          {/* 보내기 전에 무엇이 나가는지 먼저 본다 — 공지는 되돌릴 수 없다.
              발송도 이 패널 안에서 한다. 브라우저 prompt는 여러 줄 초안을 담지 못한다. */}
          <button
            type="button"
            onClick={() => openDraft(!showDraft)}
            className="rounded-md border px-3 py-1.5 text-xs"
            style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}
          >
            {showDraft ? '발송 내용 닫기' : '발송 내용 보기'}
          </button>
          <button
            type="button"
            onClick={() => openDraft(true)}
            className="rounded-md border px-3 py-1.5 text-xs"
            style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}
          >
            전체 공지 발송
          </button>
        </div>
      </div>

      {showDraft && (
        <div className="rounded-md border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium" style={{ color: 'var(--color-paper)' }}>
              발송 예정 내용
              <span className="ml-2 font-normal" style={{ color: 'var(--color-slate)' }}>
                지금 판정 결과에서 자동 작성 · 전체 차량 동일 발송
              </span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={draftText.trim() === '' || sentAt !== null}
                onClick={() => {
                  // 프로토타입 — 전체 발송은 차량 구분 없이 같은 내용이 모든 기사에게 간다.
                  sendNotice(ALL_VEHICLES, draftText);
                  setSentAt(new Date().toLocaleTimeString('ko-KR'));
                }}
                className="tone-ok-bg tone-ok-fg rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                {sentAt ? `발송됨 ${sentAt}` : '전체 차량에 발송'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftText(draft.text);
                  setSentAt(null);
                }}
                className="rounded-md border px-3 py-1.5 text-xs"
                style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}
              >
                초안 다시 만들기
              </button>
            </div>
          </div>
          {/* 초안은 그대로 보내도 되고 고쳐서 보내도 된다 — 판정 결과는 재료일 뿐 최종 문안은 사람이 정한다. */}
          <textarea
            value={draftText}
            onChange={(e) => {
              setDraftText(e.target.value);
              setSentAt(null);
            }}
            rows={14}
            className="num w-full resize-y rounded border p-3 text-xs leading-relaxed"
            style={{ borderColor: 'var(--color-rule)', background: 'var(--color-panel)', color: 'var(--color-mist)' }}
          />
          <p className="mt-2 text-xs" style={{ color: 'var(--color-dim)' }}>
            단말 점검 {draft.deviceCheck.length}대 · 이벤트 경고 {draft.heavyEvents.length}대 · 위험구간 {draft.segments.length}곳
            {sentAt && ' · 기사뷰 알림 목록 최상단에 올라갔습니다'}
          </p>
        </div>
      )}

      {/* 차종별 관리수준 — 특정 차량 순위가 아니라 "지금 어느 수준인가"를 먼저 보여준다. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ManagementLevel title="승용차" vehicles={vehicles.filter((v) => v.vehicle_class === 'car')} />
        <ManagementLevel title="화물차" vehicles={vehicles.filter((v) => v.vehicle_class === 'truck')} />
      </div>

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
          onClick={() => setRangeDraft({ from: bundle?.meta.date_min ?? '', to: bundle?.meta.date_max ?? '' })}
          className="rounded-md border px-2 py-1"
          style={{ borderColor: 'var(--color-line)', color: 'var(--color-dim)' }}
        >
          전체기간
        </button>
        <select
          value={classFilterDraft}
          onChange={(e) => setClassFilterDraft(e.target.value as ClassFilter)}
          className="rounded-md border px-2 py-1"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
        >
          <option value="all">전체 차종</option>
          <option value="truck">화물</option>
          <option value="car">승용</option>
        </select>
        <select
          value={gradeFilterDraft}
          onChange={(e) => setGradeFilterDraft(e.target.value as GradeFilter)}
          className="rounded-md border px-2 py-1"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
        >
          <option value="all">전체 등급</option>
          {GRADE_ORDER.map((g) => (
            <option key={g} value={g}>{GRADE_META[g].label}</option>
          ))}
        </select>
        <input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
          placeholder="차량ID 검색"
          className="rounded-md border px-2 py-1"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
        />
        <button
          type="button"
          onClick={applyFilters}
          className="tone-ok-bg tone-ok-fg rounded-md px-3 py-1.5 font-medium"
        >
          확인
        </button>
        <button
          type="button"
          onClick={loadData}
          disabled={refreshing}
          className="rounded-md border px-3 py-1.5 disabled:opacity-40"
          style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}
        >
          {refreshing ? '새로고침 중…' : '새로고침'}
        </button>
      </div>

      {/* 차량이 100대 가까이 되므로 표만 박스 안에서 스크롤시키고, 화면 자체는 한 눈에 들어오게 둔다. */}
      <div className="overflow-auto rounded-md border" style={{ borderColor: 'var(--color-line)', maxHeight: '46vh' }}>
      <table className="num w-full border-collapse text-xs">
        <thead className="sticky top-0" style={{ background: 'var(--color-ink)' }}>
          <tr className="border-b text-left" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-slate)' }}>
            {([
              ['rank', '순위'], ['vehicle', '차량'], ['device', '단말'], ['distance', '주행거리'],
              ['events', '이벤트'], ['rate', '발생률'], ['baseline', '기준연비'], ['measured', '실측연비'],
            ] as const).map(([key, label], i) => (
              <th
                key={key}
                onClick={() => toggle(key)}
                className={`cursor-pointer select-none py-2 pr-2 ${i === 0 ? 'pl-2' : ''}`}
                title="클릭: 내림차순 → 한 번 더: 오름차순"
              >
                {label}{indicator(key)}
              </th>
            ))}
            <th className="py-2 pr-2" title="월별 단말 상태 — 당월 진하게, 이전 달 흐리게">단말 상태(월별)</th>
            <th onClick={() => toggle('score')} className="cursor-pointer select-none py-2 pr-2" title="클릭: 내림차순 → 한 번 더: 오름차순">
              S&E{indicator('score')}
            </th>
            <th className="py-2 pr-2" title="기사뷰에서 공지를 확인하면 여기가 바뀝니다">공지 확인</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((v) => {
            const measuredKmpl = v.fuel_l > 0 ? v.reported_km / v.fuel_l : null;
            const score = scoreOf(v);
            const sourceMeta = FUEL_SOURCE_META[v.baseline.source];
            const isExpanded = expandedId === v.vehicle_id;
            return (
              <Fragment key={v.vehicle_id}>
                <tr
                  onClick={() => setExpandedId(isExpanded ? null : v.vehicle_id)}
                  className="cursor-pointer border-b"
                  style={{ borderColor: 'var(--color-rule)', color: 'var(--color-paper)' }}
                >
                  <td className="py-2 pr-2">{v.fuel_rank}</td>
                  <td className="py-2 pr-2">
                    {v.vehicle_id}{' '}
                    <span className="text-[10px]" style={{ color: 'var(--color-slate)' }}>
                      {v.vehicle_class === 'truck' ? '화물' : '승용'}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <ToneBadge tone={v.tone} label={v.grade_label} />
                  </td>
                  <td className="py-2 pr-2">{v.reported_km.toLocaleString('ko-KR')}km</td>
                  <td className="py-2 pr-2">{v.core_events}건</td>
                  <td className="py-2 pr-2">{v.rate !== null ? (v.rate * 100).toFixed(1) : '—'}/100km</td>
                  <td className="py-2 pr-2">
                    {v.baseline.kmpl.toFixed(1)}km/L <ToneBadge tone={sourceMeta.tone} label={sourceMeta.label} />
                  </td>
                  <td className="py-2 pr-2">{measuredKmpl !== null ? measuredKmpl.toFixed(2) : '—'}km/L</td>
                  <td className="py-2 pr-2"><RankStrip vehicle={v} /></td>
                  <td className="py-2 pr-2">{score ?? '—'}</td>
                  <td className="py-2 pr-2">
                    <NoticeStatus vehicleId={v.vehicle_id} />
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={11} className="pb-4">
                      <VehicleDetailPanel vehicle={v} coverage={coverage?.get(v.vehicle_id) ?? null} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* 전광판 — 표를 스크롤하지 않아도 전체 수준이 한 눈에 들어오게. 차종별로 나눠 놓는다. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SafeScoreboard title="승용차" vehicles={vehicles.filter((v) => v.vehicle_class === 'car')} />
        <SafeScoreboard title="화물차" vehicles={vehicles.filter((v) => v.vehicle_class === 'truck')} />
      </div>

      {excluded.length > 0 && (
        <div>
          <p className="mb-2 text-xs" style={{ color: 'var(--color-slate)' }}>
            평가 제외 ({excluded.length}대) — 주행거리 0, 정규화 분모 없음
          </p>
          <div className="overflow-auto rounded-md border" style={{ borderColor: 'var(--color-line)', maxHeight: '20vh' }}>
            <table className="num w-full border-collapse text-xs">
              <tbody>
                {excluded.map((v) => (
                  <tr key={v.vehicle_id} className="border-b" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-dim)' }}>
                    <td className="py-2 pr-2 pl-2">{v.vehicle_id}</td>
                    <td className="py-2 pr-2"><ToneBadge tone={v.tone} label={v.grade_label} /></td>
                    <td className="py-2 pr-2">{v.core_events}건 (거리 0)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** 차종별 관리수준 — 정상/점검필요 대수와 검증 커버리지. 개별 차량 순위는 표에서 보면 된다. */
function ManagementLevel({ title, vehicles }: { title: string; vehicles: Vehicle[] }) {
  const total = vehicles.length;
  const normal = vehicles.filter((v) => v.grade === '정상').length;
  const needsCheck = total - normal;
  const coveragePct = total > 0 ? Math.round((vehicles.filter((v) => v.verifiable).length / total) * 100) : 0;
  const tone = total === 0 ? 'void' : needsCheck === 0 ? 'ok' : needsCheck / total > 0.3 ? 'dead' : 'warn';

  return (
    <div className={`tone-${tone}-bd rounded-md border px-4 py-3`} style={{ background: 'var(--color-panel-2)' }}>
      <p className="text-xs" style={{ color: 'var(--color-slate)' }}>{title} 관리수준</p>
      {total === 0 ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-dim)' }}>해당 차종 데이터 없음</p>
      ) : (
        <>
          <p className="num mt-1 text-sm" style={{ color: 'var(--color-paper)' }}>
            {total}대 중 <span className="tone-ok-fg font-semibold">{normal}대 정상</span>
            {' · '}
            <span className={`tone-${tone}-fg font-semibold`}>{needsCheck}대 점검 필요</span>
          </p>
          <p className="num mt-0.5 text-xs" style={{ color: 'var(--color-mist)' }}>
            검증 커버리지 {coveragePct}%
          </p>
        </>
      )}
    </div>
  );
}

/** 차종별 안전 요약 전광판 — 평균은 대수 평균이 아니라 거리 가중(총 이벤트 ÷ 총 거리)이다. */
function SafeScoreboard({ title, vehicles }: { title: string; vehicles: Vehicle[] }) {
  const totalKm = vehicles.reduce((s, v) => s + v.reported_km, 0);
  const totalEvents = vehicles.reduce((s, v) => s + v.core_events, 0);
  const ratePer100 = totalKm > 0 ? (totalEvents / totalKm) * 100 : null;
  const untrusted = vehicles.filter((v) => v.grade !== '정상').length;
  const scores = vehicles.map(scoreOf).filter((s): s is number => s !== null);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const tone = untrusted === 0 ? 'ok' : untrusted / Math.max(1, vehicles.length) > 0.3 ? 'dead' : 'warn';

  return (
    <div className="rounded-md border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
      <p className="mb-2 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>
        {title} <span style={{ color: 'var(--color-slate)' }}>{vehicles.length}대</span>
      </p>
      {vehicles.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-dim)' }}>해당 차종 데이터 없음</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px]" style={{ color: 'var(--color-slate)' }}>평균 발생률(거리 가중)</p>
            <p className={`num tone-${tone}-fg text-xl font-semibold`}>
              {ratePer100 !== null ? ratePer100.toFixed(1) : '—'}
              <span className="ml-1 text-[10px]" style={{ color: 'var(--color-slate)' }}>건/100km</span>
            </p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--color-slate)' }}>데이터 신뢰 불가</p>
            <p className={`num tone-${tone}-fg text-xl font-semibold`}>
              {untrusted}
              <span className="ml-1 text-[10px]" style={{ color: 'var(--color-slate)' }}>/ {vehicles.length}대</span>
            </p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--color-slate)' }}>총 주행거리</p>
            <p className="num text-sm" style={{ color: 'var(--color-paper)' }}>{Math.round(totalKm).toLocaleString('ko-KR')}km</p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--color-slate)' }}>평균 S&E 점수</p>
            <p className="num text-sm" style={{ color: 'var(--color-paper)' }}>{avgScore !== null ? avgScore.toFixed(0) : '—'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function VehicleDetailPanel({ vehicle, coverage }: { vehicle: Vehicle; coverage: { from: string; to: string; days: number } | null }) {
  const signalRatio = signalRatioOf(vehicle);
  const measuredKmpl = vehicle.fuel_l > 0 ? vehicle.reported_km / vehicle.fuel_l : null;
  const sourceMeta = FUEL_SOURCE_META[vehicle.baseline.source];

  return (
    <div className="grid grid-cols-2 gap-4 rounded-md border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
      <div>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>판정</p>
        <ToneBadge tone={vehicle.tone} label={vehicle.grade_label} />
        <p className="mt-1 text-xs" style={{ color: 'var(--color-mist)' }}>{vehicle.verdict}</p>
        {coverage && (
          <p className="num mt-1 text-xs" style={{ color: 'var(--color-dim)' }}>
            이 차량 데이터 보유: {coverage.from} ~ {coverage.to} ({coverage.days}일치)
          </p>
        )}
        <ul className="num mt-2 space-y-0.5 text-xs" style={{ color: 'var(--color-slate)' }}>
          <li>관측 발생률: {vehicle.rate !== null ? (vehicle.rate * 100).toFixed(1) : '—'}건/100km</li>
          <li>
            연료가 시사하는 발생률:{' '}
            {vehicle.has_fuel_data && vehicle.fuel_implied_rate !== null
              ? `${(vehicle.fuel_implied_rate * 100).toFixed(1)}건/100km`
              : '유류데이터 없음 — 대체신호 없음'}
          </li>
          <li>두 신호의 비율: {vehicle.has_fuel_data ? (Number.isFinite(signalRatio) ? signalRatio.toFixed(2) : '∞') : '—'}</li>
        </ul>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>이벤트 분해</p>
        <div className="num flex flex-col gap-1 text-xs" style={{ color: 'var(--color-mist)' }}>
          {(['accel', 'start', 'decel', 'stop'] as const).map((type) => (
            <div key={type} className="flex items-center gap-2">
              <span className="w-14">{{ accel: '급가속', start: '급출발', decel: '급감속', stop: '급정지' }[type]}</span>
              <div className="h-2 flex-1 overflow-hidden rounded" style={{ background: 'var(--color-rule)' }}>
                <div
                  className="tone-warn-rail h-full"
                  style={{ width: `${Math.min(100, (vehicle.events_by_type[type] / Math.max(1, vehicle.core_events)) * 100)}%` }}
                />
              </div>
              <span>{vehicle.events_by_type[type]}건</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>연비 교차검증</p>
        <ul className="num space-y-0.5 text-xs" style={{ color: 'var(--color-mist)' }}>
          <li>기준연비: {vehicle.baseline.kmpl.toFixed(1)}km/L <ToneBadge tone={sourceMeta.tone} label={sourceMeta.label} /></li>
          <li>실측연비: {measuredKmpl !== null ? measuredKmpl.toFixed(2) : '—'}km/L</li>
          <li>초과율: {vehicle.fuel_excess_pct !== null ? `${vehicle.fuel_excess_pct.toFixed(1)}%` : '유류데이터 없음'}</li>
        </ul>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>리포트</p>
        <p className="text-xs" style={{ color: 'var(--color-mist)' }}>{buildVehicleReport(vehicle)}</p>
        <button
          type="button"
          onClick={() => {
            const message = window.prompt(`${vehicle.vehicle_id}에 보낼 공지 내용을 입력하세요.`);
            if (message) sendNotice(vehicle.vehicle_id, message);
          }}
          className="tone-ok-bg tone-ok-fg mt-3 rounded-md px-3 py-1.5 text-xs font-medium"
        >
          공지사항 발송
        </button>
      </div>
    </div>
  );
}
