import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Grade, Vehicle, VehicleClass } from '../types';
import { GRADE_META, GRADE_ORDER } from '../lib/grade';
import { FUEL_SOURCE_META } from '../lib/fuelSource';
import { scoreOf } from '../lib/score';
import { buildVehicleReport, signalRatioOf } from '../lib/report';
import { sendNotice, useLatestNoticeStatus } from '../lib/notices';
import { useOpenDeviceRequest } from '../lib/deviceRequests';
import { ALL_VEHICLES } from '../lib/channels';

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
            className={`tone-${meta.tone}-bg h-4 w-3 rounded-sm`}
            style={{ opacity: isLatest ? 1 : 0.45 }}
          />
        );
      })}
    </div>
  );
}

function StatusDots({ vehicleId }: { vehicleId: string }) {
  const notice = useLatestNoticeStatus(vehicleId);
  const deviceRequest = useOpenDeviceRequest(vehicleId);

  const noticeColor = !notice ? 'var(--color-line)' : notice.acknowledged ? 'var(--color-teal)' : 'var(--color-rose)';
  const deviceColor = deviceRequest ? 'var(--color-amber)' : 'var(--color-line)';

  return (
    <span className="inline-flex gap-1">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: noticeColor }}
        title={!notice ? '공지 없음' : notice.acknowledged ? '공지 확인됨' : '공지 미확인'}
      />
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: deviceColor }}
        title={deviceRequest ? '단말점검 요청 접수됨' : '단말점검 요청 없음'}
      />
    </span>
  );
}

export function SafeScreen({ onOpenIngest }: { onOpenIngest: () => void }) {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/vehicles.json')
      .then((r) => r.json())
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }, []);

  const banner = useMemo(() => {
    if (!vehicles) return null;
    let best: { vehicle: Vehicle; delta: number } | null = null;
    for (const v of vehicles) {
      const first = v.monthly[0];
      const last = v.monthly[v.monthly.length - 1];
      if (first.fuel_rank === null || last.fuel_rank === null) continue;
      const delta = first.fuel_rank - last.fuel_rank;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { vehicle: v, delta };
    }
    return best;
  }, [vehicles]);

  if (!vehicles) {
    return <div className="p-6 text-sm" style={{ color: 'var(--color-dim)' }}>불러오는 중…</div>;
  }

  const untrustedCount = vehicles.filter((v) => v.grade !== '정상').length;
  const coveragePct = Math.round((vehicles.filter((v) => v.verifiable).length / vehicles.length) * 100);

  const excluded = vehicles.filter((v) => v.grade === 'D');
  const ranked = vehicles
    .filter((v) => v.grade !== 'D')
    .filter((v) => classFilter === 'all' || v.vehicle_class === classFilter)
    .filter((v) => gradeFilter === 'all' || v.grade === gradeFilter)
    .filter((v) => v.vehicle_id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.fuel_rank ?? 999) - (b.fuel_rank ?? 999));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="num text-sm" style={{ color: 'var(--color-paper)' }}>
          {vehicles.length}대 중 {untrustedCount}대 데이터 신뢰 불가 · 검증 커버리지 {coveragePct}%
        </p>
        <div className="flex gap-2">
          {(['데이터 업로드', '리포트 생성', '전체 공지 발송'] as const).map((label) => (
            <button
              key={label}
              type="button"
              onClick={
                label === '데이터 업로드'
                  ? onOpenIngest
                  : label === '전체 공지 발송'
                    ? () => {
                        const message = window.prompt('전체 차량에 보낼 공지 내용을 입력하세요.');
                        if (message) sendNotice(ALL_VEHICLES, message);
                      }
                    : undefined
              }
              className="rounded-md border px-3 py-1.5 text-xs"
              style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {banner && banner.delta !== 0 && (
        <div className="tone-warn-bg tone-warn-bd rounded-md border px-4 py-2 text-sm">
          <span className="tone-warn-fg font-medium">{banner.vehicle.vehicle_id}</span>
          {' — 4월 대비 8월 순위 '}
          <span className="num">{Math.abs(banner.delta)}</span>
          {`단계 ${banner.delta > 0 ? '상승' : '하락'} (연료 기준)`}
        </div>
      )}

      <div className="flex gap-2 text-xs">
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value as ClassFilter)}
          className="rounded-md border px-2 py-1"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
        >
          <option value="all">전체 차종</option>
          <option value="truck">화물</option>
          <option value="car">승용</option>
        </select>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value as GradeFilter)}
          className="rounded-md border px-2 py-1"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
        >
          <option value="all">전체 등급</option>
          {GRADE_ORDER.map((g) => (
            <option key={g} value={g}>{GRADE_META[g].label}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="차량ID 검색"
          className="rounded-md border px-2 py-1"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
        />
      </div>

      <table className="num w-full border-collapse text-xs">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-slate)' }}>
            <th className="py-2 pr-2">순위</th>
            <th className="py-2 pr-2">차량</th>
            <th className="py-2 pr-2">단말</th>
            <th className="py-2 pr-2">주행거리</th>
            <th className="py-2 pr-2">이벤트</th>
            <th className="py-2 pr-2">발생률</th>
            <th className="py-2 pr-2">기준연비</th>
            <th className="py-2 pr-2">실측연비</th>
            <th className="py-2 pr-2">5개월</th>
            <th className="py-2 pr-2">S&E</th>
            <th className="py-2 pr-2">상태</th>
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
                    <StatusDots vehicleId={v.vehicle_id} />
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={11} className="pb-4">
                      <VehicleDetailPanel vehicle={v} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {excluded.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs" style={{ color: 'var(--color-slate)' }}>
            평가 제외 ({excluded.length}대) — 주행거리 0, 정규화 분모 없음
          </p>
          <table className="num w-full border-collapse text-xs">
            <tbody>
              {excluded.map((v) => (
                <tr key={v.vehicle_id} className="border-b" style={{ borderColor: 'var(--color-rule)', color: 'var(--color-dim)' }}>
                  <td className="py-2 pr-2">{v.vehicle_id}</td>
                  <td className="py-2 pr-2"><ToneBadge tone={v.tone} label={v.grade_label} /></td>
                  <td className="py-2 pr-2">{v.core_events}건 (거리 0)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VehicleDetailPanel({ vehicle }: { vehicle: Vehicle }) {
  const signalRatio = signalRatioOf(vehicle);
  const measuredKmpl = vehicle.fuel_l > 0 ? vehicle.reported_km / vehicle.fuel_l : null;
  const sourceMeta = FUEL_SOURCE_META[vehicle.baseline.source];

  return (
    <div className="grid grid-cols-2 gap-4 rounded-md border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
      <div>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>판정</p>
        <ToneBadge tone={vehicle.tone} label={vehicle.grade_label} />
        <p className="mt-1 text-xs" style={{ color: 'var(--color-mist)' }}>{vehicle.verdict}</p>
        <ul className="num mt-2 space-y-0.5 text-xs" style={{ color: 'var(--color-slate)' }}>
          <li>관측 발생률: {vehicle.rate !== null ? (vehicle.rate * 100).toFixed(1) : '—'}건/100km</li>
          <li>연료가 시사하는 발생률: {(vehicle.fuel_implied_rate * 100).toFixed(1)}건/100km</li>
          <li>두 신호의 비율: {Number.isFinite(signalRatio) ? signalRatio.toFixed(2) : '∞'}</li>
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
          <li>초과율: {vehicle.fuel_excess_pct.toFixed(1)}%</li>
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
