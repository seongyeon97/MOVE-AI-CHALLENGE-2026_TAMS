import { useState } from 'react';
import type { Role } from '../types';
import { fakeParseRegistration, type ParsedRegistration } from '../lib/fakeParseRegistration';

type LoginScreenProps = {
  onLogin: (role: Role) => void;
};

type Step = 'role' | 'company-login' | 'driver-method' | 'driver-manual' | 'driver-maintenance' | 'driver-done';

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [step, setStep] = useState<Step>('role');
  const [parsing, setParsing] = useState(false);
  const [registration, setRegistration] = useState<ParsedRegistration | null>(null);
  const [oilChanged, setOilChanged] = useState<'yes' | 'no' | null>(null);
  const [oilMonths, setOilMonths] = useState('');
  const [tireChanged, setTireChanged] = useState<'yes' | 'no' | null>(null);
  const [tireMonths, setTireMonths] = useState('');

  async function handleUpload() {
    setParsing(true);
    const result = await fakeParseRegistration('truck');
    setRegistration(result);
    setParsing(false);
    setStep('driver-maintenance');
  }

  function handleManualSubmit(form: ParsedRegistration) {
    setRegistration(form);
    setStep('driver-maintenance');
  }

  const maintenanceComplete = oilChanged !== null && oilMonths !== '' && tireChanged !== null && tireMonths !== '';

  return (
    <div className="flex h-full items-center justify-center" style={{ background: 'var(--color-ink)' }}>
      <div
        className="w-full max-w-md rounded-lg border p-8"
        style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}
      >
        <h1 className="mb-6 text-lg font-semibold" style={{ color: 'var(--color-paper)' }}>
          S&E Driving Platform
        </h1>

        {step === 'role' && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setStep('company-login')}
              className="rounded-md border px-4 py-3 text-left tone-ok-bd"
              style={{ background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
            >
              회사
              <div className="text-xs" style={{ color: 'var(--color-slate)' }}>운송사 관리자</div>
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/driver-app.html'; }}
              className="rounded-md border px-4 py-3 text-left"
              style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
            >
              기사
              <div className="text-xs" style={{ color: 'var(--color-slate)' }}>차량 기사 — S&E Driving 앱 로그인으로 이동</div>
            </button>
          </div>
        )}

        {step === 'company-login' && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              onLogin('company');
            }}
          >
            <input
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
              placeholder="아이디"
            />
            <input
              type="password"
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
              placeholder="비밀번호"
            />
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
              아이디·비밀번호는 무엇을 입력해도 통과합니다.
            </p>
            <button type="submit" className="tone-ok-bg tone-ok-fg rounded-md px-4 py-2 text-sm font-medium">
              로그인
            </button>
          </form>
        )}

        {step === 'driver-method' && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={parsing}
              onClick={handleUpload}
              className="rounded-md border px-4 py-3 text-left"
              style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
            >
              {parsing ? '분석 중…' : '차량등록증 업로드'}
            </button>
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
              업로드 시 자동으로 값을 채웁니다 — 실제 OCR이 아닌 표본 데이터입니다.
            </p>
            <button
              type="button"
              onClick={() => setStep('driver-manual')}
              className="rounded-md border px-4 py-3 text-left"
              style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
            >
              수기 입력
            </button>
          </div>
        )}

        {step === 'driver-manual' && (
          <DriverManualForm onSubmit={handleManualSubmit} />
        )}

        {step === 'driver-maintenance' && (
          <div className="flex flex-col gap-4">
            <div className="text-sm" style={{ color: 'var(--color-mist)' }}>
              등록 차량: {registration?.maker} {registration?.model} ({registration?.year}) · {registration?.plate}
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm" style={{ color: 'var(--color-paper)' }}>엔진오일 교체</legend>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOilChanged('yes')} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: oilChanged === 'yes' ? 'var(--color-teal)' : 'var(--color-line)', color: 'var(--color-paper)' }}>교체함</button>
                <button type="button" onClick={() => setOilChanged('no')} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: oilChanged === 'no' ? 'var(--color-teal)' : 'var(--color-line)', color: 'var(--color-paper)' }}>안 함</button>
              </div>
              <input
                value={oilMonths}
                onChange={(e) => setOilMonths(e.target.value)}
                placeholder="경과 개월 수"
                className="num rounded-md border px-3 py-1.5 text-sm"
                style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
              />
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm" style={{ color: 'var(--color-paper)' }}>타이어 교체</legend>
              <div className="flex gap-2">
                <button type="button" onClick={() => setTireChanged('yes')} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: tireChanged === 'yes' ? 'var(--color-teal)' : 'var(--color-line)', color: 'var(--color-paper)' }}>교체함</button>
                <button type="button" onClick={() => setTireChanged('no')} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: tireChanged === 'no' ? 'var(--color-teal)' : 'var(--color-line)', color: 'var(--color-paper)' }}>안 함</button>
              </div>
              <input
                value={tireMonths}
                onChange={(e) => setTireMonths(e.target.value)}
                placeholder="경과 개월 수"
                className="num rounded-md border px-3 py-1.5 text-sm"
                style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
              />
            </fieldset>
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
              정비 자기신고 — 신뢰등급 D(자기신고). 정비 전표 연동 시 A로 승격됩니다.
            </p>
            <button
              type="button"
              disabled={!maintenanceComplete}
              onClick={() => setStep('driver-done')}
              className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40 tone-ok-bg tone-ok-fg"
            >
              완료
            </button>
          </div>
        )}

        {step === 'driver-done' && (
          <div className="flex flex-col gap-4 text-center">
            <p style={{ color: 'var(--color-paper)' }}>가입이 완료됐습니다.</p>
            <button type="button" onClick={() => onLogin('driver')} className="tone-ok-bg tone-ok-fg rounded-md px-4 py-2 text-sm font-medium">
              로그인
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DriverManualForm({ onSubmit }: { onSubmit: (form: ParsedRegistration) => void }) {
  const [maker, setMaker] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [kmpl, setKmpl] = useState('');

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          vehicle_class: 'truck',
          maker,
          model,
          year: Number(year) || new Date().getFullYear(),
          plate,
          registered_kmpl: Number(kmpl) || 0,
        });
      }}
    >
      {[
        { label: '제조사', value: maker, set: setMaker },
        { label: '모델명', value: model, set: setModel },
        { label: '연식', value: year, set: setYear },
        { label: '차량번호', value: plate, set: setPlate },
        { label: '공인연비(km/L)', value: kmpl, set: setKmpl },
      ].map((f) => (
        <input
          key={f.label}
          value={f.value}
          onChange={(e) => f.set(e.target.value)}
          placeholder={f.label}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
        />
      ))}
      <button type="submit" className="mt-2 tone-ok-bg tone-ok-fg rounded-md px-4 py-2 text-sm font-medium">
        다음
      </button>
    </form>
  );
}
