import { useEffect, useMemo, useState } from 'react';
import type { Certificate, Grade } from '../types';
import { aggregateCertificates } from '../lib/certificateAggregate';
import { loadSettings, type Settings } from '../lib/settings';
import { CertificateDocument } from './certificateDocument';

type GradeFilter = 'all' | Grade;

// 증명서는 화물차(트랙터)만 대상이다 — 승용차는 화물 운송을 하지 않으므로 대상 아님(PRD §3.4).
export function CertificateScreen() {
  const [certs, setCerts] = useState<Certificate[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  // 선택칸(draft)과 실제로 발급에 쓰인 조건(applied)을 나눈다 —
  // 대외 제출 문서라 구간만 고른 순간 반쯤 채워진 문서가 떠 있으면 안 된다. 확인을 눌러야 발급된다.
  const [corridorId, setCorridorId] = useState<string>('');
  // 기간은 일자 단위 — 같은 구간을 그 기간에 몇 번 운송했든 전부 합쳐 증명서 한 장으로 낸다.
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [applied, setApplied] = useState<{ corridorId: string; dateFrom: string; dateTo: string; gradeFilter: GradeFilter } | null>(null);

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
    if (!applied) return [];
    return pool.filter((c) => {
      if (!c.attribution.applicable || c.attribution.corridor_id !== applied.corridorId) return false;
      if (applied.dateFrom && c.date < applied.dateFrom) return false;
      if (applied.dateTo && c.date > applied.dateTo) return false;
      if (applied.gradeFilter !== 'all' && c.grade !== applied.gradeFilter) return false;
      return true;
    });
  }, [pool, applied]);

  // 구간·기간이 다 채워져야 발급할 수 있다. 등급은 '전체'가 기본값이라 선택으로 치지 않는다.
  const canIssue = corridorId !== '' && dateFrom !== '' && dateTo !== '';
  const missing = [
    corridorId === '' && '운송구간',
    dateFrom === '' && '시작일',
    dateTo === '' && '종료일',
  ].filter(Boolean) as string[];

  const aggregate = useMemo(() => aggregateCertificates(filtered), [filtered]);

  if (!certs) {
    return <div className="p-6 text-sm" style={{ color: 'var(--color-dim)' }}>불러오는 중…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>S&E 증명서 발급</h1>
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
        <button
          type="button"
          disabled={!canIssue}
          onClick={() => setApplied({ corridorId, dateFrom, dateTo, gradeFilter: 'all' })}
          className="tone-ok-bg tone-ok-fg rounded-md px-4 py-1.5 font-medium disabled:opacity-40"
        >
          확인 — 증명서 생성
        </button>
        {applied && (
          <button
            type="button"
            onClick={() => setApplied(null)}
            className="rounded-md border px-3 py-1.5"
            style={{ borderColor: 'var(--color-line)', color: 'var(--color-dim)' }}
          >
            다시 선택
          </button>
        )}
      </div>

      {!applied && (
        <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
          {missing.length > 0
            ? `${missing.join(' · ')}을(를) 선택한 뒤 확인을 누르세요.`
            : '확인을 누르면 이 조건으로 증명서가 생성됩니다.'}
        </p>
      )}

      {applied && filtered.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--color-dim)' }}>선택한 조건에 해당하는 운송건이 없습니다.</p>
      )}

      {applied && aggregate && <CertificateDocument aggregate={aggregate} />}
    </div>
  );
}
