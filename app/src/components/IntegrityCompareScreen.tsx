import { useEffect, useState } from 'react';
import { parseCsvText } from '../lib/csvBrowser';
import { runIntegrityCheck, type IntegrityResult, type LogPoint } from '../lib/runIntegrityCheck';
import { runFuelDispatchCheck, type FuelDispatchResult } from '../lib/runFuelDispatchCheck';

type VehicleReport = {
  vehicleId: string;
  reported_km: number;
  core_events: number;
  rate: number;
  baseline_kmpl: number;
  integrity: IntegrityResult;
  fuelDispatch: FuelDispatchResult;
  grade: '정상' | 'A' | 'C' | 'D';
  finalVerdict: string;
};

async function loadVehicleReport(vehicleId: string): Promise<VehicleReport> {
  const base = `/fixtures/demo_${vehicleId}`;
  const [logText, eventsText, dispatchText, fuelText, regHtml] = await Promise.all([
    fetch(`${base}/driving_log.csv`).then((r) => r.text()),
    fetch(`${base}/events.csv`).then((r) => r.text()),
    fetch(`${base}/dispatch.csv`).then((r) => r.text()),
    fetch(`${base}/fuel_card.csv`).then((r) => r.text()),
    fetch(`${base}/registration.html`).then((r) => r.text()),
  ]);

  const points: LogPoint[] = parseCsvText(logText).map((r) => ({
    ts: r.ts, lat: Number(r.lat), lon: Number(r.lon), speed_kmh: Number(r.speed_kmh), rpm: Number(r.rpm), odo_km: Number(r.odo_km),
  }));
  const events = parseCsvText(eventsText);
  const dispatch = parseCsvText(dispatchText)[0];
  const fuel = parseCsvText(fuelText);

  const reported_km = points.length > 0 ? points[points.length - 1].odo_km - points[0].odo_km : 0;
  const core_events = events.length;
  const rate = reported_km > 0 ? core_events / reported_km : 0;

  const baselineMatch = regHtml.match(/공인연비[^0-9]*([\d.]+)/);
  const baseline_kmpl = baselineMatch ? Number(baselineMatch[1]) : 0;
  const fuel_l = fuel.reduce((s, f) => s + Number(f.fuel_l), 0);
  const dispatch_distance_km = Number(dispatch?.dispatch_distance_km ?? 0);

  const integrity = runIntegrityCheck(points);
  const fuelDispatch = runFuelDispatchCheck({ submitted_distance_km: reported_km, dispatch_distance_km, fuel_l, baseline_kmpl });

  // 신뢰등급 D→A→C→정상 순서(B는 이 2대 비교만으론 판정 불가 — 순위가 필요해서 뺀다).
  let grade: VehicleReport['grade'] = '정상';
  if (reported_km === 0 && core_events > 0) grade = 'D';
  else if (rate > 1.0) grade = 'A';
  else if (rate === 0 && reported_km > 100) grade = 'C';

  const anomalyFlags = [
    integrity.r2.verdict === 'fail',
    integrity.r3.verdict === 'fail',
    integrity.r4.verdict === 'fail',
    integrity.r5.verdict === 'fail',
    fuelDispatch.f1_fuel_exceeds_baseline,
    fuelDispatch.f2_distance_mismatch,
  ];

  let finalVerdict: string;
  if (grade === 'C' || grade === 'D') finalVerdict = '신뢰 불가';
  else if (anomalyFlags.some(Boolean)) finalVerdict = '조작 의심';
  else if (grade === 'A') finalVerdict = '신뢰 불가';
  else if (grade === '정상') finalVerdict = '통과';
  else finalVerdict = '판정 불가';

  return { vehicleId, reported_km, core_events, rate, baseline_kmpl, integrity, fuelDispatch, grade, finalVerdict };
}

function VerdictRow({ label, verdict }: { label: string; verdict: string }) {
  const tone = verdict === 'pass' ? 'ok' : verdict === 'hold' ? 'void' : 'dead';
  const text = verdict === 'pass' ? '통과' : verdict === 'hold' ? '판정 보류' : '이상 감지';
  return (
    <div className="flex justify-between text-xs" style={{ color: 'var(--color-mist)' }}>
      <span>{label}</span>
      <span className={`tone-${tone}-fg`}>{text}</span>
    </div>
  );
}

function VehicleCard({ report }: { report: VehicleReport }) {
  const verdictTone = report.finalVerdict === '통과' ? 'ok' : report.finalVerdict === '조작 의심' ? 'dead' : 'warn';
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>{report.vehicleId}</p>

      <div>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>① 제출값</p>
        <ul className="num space-y-0.5 text-xs" style={{ color: 'var(--color-mist)' }}>
          <li>주행거리 {report.reported_km.toFixed(1)}km</li>
          <li>이벤트 {report.core_events}건</li>
          <li>발생률 {(report.rate * 100).toFixed(1)}건/100km</li>
        </ul>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>
          ② 검사결과 (샘플링 간격 {report.integrity.sampling_interval_sec.toFixed(0)}초)
        </p>
        <div className="flex flex-col gap-0.5">
          <VerdictRow label="R2 물리정합성(평균속도)" verdict={report.integrity.r2.verdict} />
          <VerdictRow label="R3 속도적분" verdict={report.integrity.r3.verdict} />
          <VerdictRow label="R4 시퀀스중복" verdict={report.integrity.r4.verdict} />
          <VerdictRow label="R5 연속성" verdict={report.integrity.r5.verdict} />
          <VerdictRow label="F1 연료대비 과다연비" verdict={report.fuelDispatch.f1_fuel_exceeds_baseline ? 'fail' : 'pass'} />
          <VerdictRow label="F2 제출거리-배차거리 괴리" verdict={report.fuelDispatch.f2_distance_mismatch ? 'fail' : 'pass'} />
        </div>
        <p className="num mt-1 text-xs" style={{ color: 'var(--color-dim)' }}>
          실측연비 {report.fuelDispatch.measured_kmpl.toFixed(2)}km/L (기준 {report.baseline_kmpl.toFixed(1)}km/L) ·
          {' '}배차거리 괴리 {report.fuelDispatch.f2_deviation_pct.toFixed(1)}%
        </p>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>③ 최종판정</p>
        <p className={`tone-${verdictTone}-fg text-sm font-medium`}>{report.finalVerdict}</p>
        <p className="text-xs" style={{ color: 'var(--color-dim)' }}>사다리: 등급C/D→신뢰불가 · R2~R5/F1/F2→조작의심 · 등급A→신뢰불가 · 등급정상→통과</p>
      </div>
    </div>
  );
}

export function IntegrityCompareScreen() {
  const [reports, setReports] = useState<VehicleReport[] | null>(null);

  useEffect(() => {
    Promise.all([loadVehicleReport('SB000213'), loadVehicleReport('SB000214')]).then(setReports);
  }, []);

  if (!reports) {
    return <div className="p-6 text-sm" style={{ color: 'var(--color-dim)' }}>불러오는 중…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>조작탐지 데모 — 두 차량 비교</h1>
      <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
        SB000214는 SB000213의 운행기록에 주행거리 1.9배 부풀리기 + 이벤트 절반 삭제 + 구간 2곳 복제만 가한 표본이다.
        배차내역·유류사용내역은 카드사·화주 발행이라 조작 대상에서 뺐다.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {reports.map((r) => <VehicleCard key={r.vehicleId} report={r} />)}
      </div>
    </div>
  );
}
