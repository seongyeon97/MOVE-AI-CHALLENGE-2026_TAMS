import { useEffect, useState } from 'react';
import type { Corridor, Site } from '../types';
import { loadSettings, saveSettings, type Settings } from '../lib/settings';
import { searchAddress, type AddressCandidate } from '../lib/mapAdapter';
import { fakeParseRegistration, type ParsedRegistration } from '../lib/fakeParseRegistration';

const KAKAO_AVAILABLE = Boolean(import.meta.env.VITE_KAKAO_KEY);
const EARTH_RADIUS_M = 6371000;

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

function overlappingPairs(sites: Site[]): [Site, Site][] {
  const pairs: [Site, Site][] = [];
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      if (haversineM(sites[i], sites[j]) < sites[i].radius_m + sites[j].radius_m) pairs.push([sites[i], sites[j]]);
    }
  }
  return pairs;
}

type Tab = 'sites' | 'corridors' | 'cars';

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>('sites');
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [corridorModalOpen, setCorridorModalOpen] = useState(false);

  useEffect(() => { loadSettings().then(setSettings); }, []);

  async function persist(next: Settings) {
    setSettings(next);
    await saveSettings(next);
  }

  if (!settings) {
    return <div className="p-6 text-sm" style={{ color: 'var(--color-dim)' }}>불러오는 중…</div>;
  }

  const overlaps = overlappingPairs(settings.sites);

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-sm font-medium" style={{ color: 'var(--color-paper)' }}>설정</h1>

      <div className="flex gap-2 text-xs">
        {([['sites', '사업장'], ['corridors', '운송구간'], ['cars', '법인 차량 등록']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="rounded-md border px-3 py-1.5"
            style={{
              borderColor: tab === key ? 'var(--color-teal)' : 'var(--color-line)',
              background: tab === key ? 'var(--color-panel-2)' : 'transparent',
              color: 'var(--color-paper)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'sites' && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setSiteModalOpen(true)}
            className="tone-ok-bg tone-ok-fg w-fit rounded-md px-3 py-1.5 text-xs font-medium"
          >
            사업장 추가
          </button>

          {overlaps.length > 0 && (
            <div className="tone-dead-bg tone-dead-bd rounded-md border px-3 py-2 text-xs">
              두 사업장의 지오펜스가 겹칩니다 — 구간 판정이 모호해집니다: {overlaps.map(([a, b]) => `${a.name}↔${b.name}`).join(', ')}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {settings.sites.map((s) => (
              <div key={s.site_id} className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}>
                <p className="font-medium" style={{ color: 'var(--color-paper)' }}>{s.name}</p>
                <p>{s.address}</p>
                <p className="num">{s.lat.toFixed(4)}, {s.lon.toFixed(4)} · 반경 {s.radius_m}m</p>
                <button
                  type="button"
                  onClick={() => persist({ ...settings, sites: settings.sites.filter((x) => x.site_id !== s.site_id) })}
                  className="mt-1 text-xs"
                  style={{ color: 'var(--color-rose)' }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>

          <GeofencePreview sites={settings.sites} />
        </div>
      )}

      {tab === 'corridors' && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={settings.sites.length < 2}
            onClick={() => setCorridorModalOpen(true)}
            className="tone-ok-bg tone-ok-fg w-fit rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            운송구간 추가
          </button>
          {settings.sites.length < 2 && (
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>사업장을 2곳 이상 등록해야 구간을 만들 수 있습니다.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {settings.corridors.map((c) => {
              const origin = settings.sites.find((s) => s.site_id === c.origin_site_id);
              const dest = settings.sites.find((s) => s.site_id === c.destination_site_id);
              return (
                <div key={c.corridor_id} className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}>
                  <p className="font-medium" style={{ color: 'var(--color-paper)' }}>{c.name}</p>
                  <p>{origin?.name ?? '?'} → {dest?.name ?? '?'}</p>
                  <button
                    type="button"
                    onClick={() => persist({ ...settings, corridors: settings.corridors.filter((x) => x.corridor_id !== c.corridor_id) })}
                    className="mt-1 text-xs"
                    style={{ color: 'var(--color-rose)' }}
                  >
                    삭제
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'cars' && <CorporateCarTab />}

      {siteModalOpen && (
        <SiteModal
          onClose={() => setSiteModalOpen(false)}
          onSave={(site) => { persist({ ...settings, sites: [...settings.sites, site] }); setSiteModalOpen(false); }}
        />
      )}
      {corridorModalOpen && (
        <CorridorModal
          sites={settings.sites}
          onClose={() => setCorridorModalOpen(false)}
          onSave={(corridor) => { persist({ ...settings, corridors: [...settings.corridors, corridor] }); setCorridorModalOpen(false); }}
        />
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(4,13,23,0.6)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border p-5"
        style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function SiteModal({ onClose, onSave }: { onClose: () => void; onSave: (s: Site) => void }) {
  const [name, setName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [selected, setSelected] = useState<AddressCandidate | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [radius, setRadius] = useState(1000);
  const [searchError, setSearchError] = useState(false);

  async function handleSearch() {
    try {
      const results = await searchAddress(keyword);
      setCandidates(results);
      setSearchError(false);
    } catch {
      setSearchError(true);
    }
  }

  const coords = selected ?? (manualLat && manualLon ? { lat: Number(manualLat), lon: Number(manualLon) } : null);

  function handleSave() {
    if (!name || !coords) return;
    onSave({
      site_id: `SITE-${Date.now()}`,
      name,
      address: selected?.road_address ?? manualAddress,
      lat: coords.lat,
      lon: coords.lon,
      radius_m: radius,
    });
  }

  return (
    <Modal onClose={onClose}>
      <p className="mb-3 text-sm font-medium" style={{ color: 'var(--color-paper)' }}>사업장 추가</p>
      <div className="flex flex-col gap-2 text-xs">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="사업장명"
          className="rounded-md border px-3 py-2"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
        />

        {KAKAO_AVAILABLE && !searchError ? (
          <>
            <div className="flex gap-2">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="주소 키워드 검색"
                className="flex-1 rounded-md border px-3 py-2"
                style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}
              />
              <button type="button" onClick={handleSearch} className="rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}>검색</button>
            </div>
            {candidates.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(c)}
                className="rounded-md border px-3 py-2 text-left"
                style={{ borderColor: selected === c ? 'var(--color-teal)' : 'var(--color-line)', color: 'var(--color-mist)' }}
              >
                {c.display_name} — {c.road_address}
              </button>
            ))}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p style={{ color: 'var(--color-dim)' }}>지도 미연동 — 좌표 직접 입력</p>
            <input value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} placeholder="주소(참고용 텍스트)" className="rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }} />
            <div className="flex gap-2">
              <input value={manualLat} onChange={(e) => setManualLat(e.target.value)} placeholder="위도" className="num flex-1 rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }} />
              <input value={manualLon} onChange={(e) => setManualLon(e.target.value)} placeholder="경도" className="num flex-1 rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }} />
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span style={{ color: 'var(--color-slate)' }}>반경 {radius}m</span>
          <input type="range" min={500} max={3000} step={100} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
        </label>

        {coords && (
          <p className="num" style={{ color: 'var(--color-dim)' }}>미리보기: {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)} · 반경 {radius}m 원</p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5" style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}>취소</button>
          <button type="button" disabled={!name || !coords} onClick={handleSave} className="tone-ok-bg tone-ok-fg rounded-md px-3 py-1.5 font-medium disabled:opacity-40">저장</button>
        </div>
      </div>
    </Modal>
  );
}

function CorridorModal({ sites, onClose, onSave }: { sites: Site[]; onClose: () => void; onSave: (c: Corridor) => void }) {
  const [name, setName] = useState('');
  const [originId, setOriginId] = useState(sites[0]?.site_id ?? '');
  const [destId, setDestId] = useState(sites[1]?.site_id ?? '');

  return (
    <Modal onClose={onClose}>
      <p className="mb-3 text-sm font-medium" style={{ color: 'var(--color-paper)' }}>운송구간 추가</p>
      <div className="flex flex-col gap-2 text-xs">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="구간명" className="rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }} />
        <select value={originId} onChange={(e) => setOriginId(e.target.value)} className="rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}>
          {sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.name}</option>)}
        </select>
        <select value={destId} onChange={(e) => setDestId(e.target.value)} className="rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)', color: 'var(--color-paper)' }}>
          {sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.name}</option>)}
        </select>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5" style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}>취소</button>
          <button
            type="button"
            disabled={!name || !originId || !destId || originId === destId}
            onClick={() => onSave({ corridor_id: `COR-${Date.now()}`, name, origin_site_id: originId, destination_site_id: destId })}
            className="tone-ok-bg tone-ok-fg rounded-md px-3 py-1.5 font-medium disabled:opacity-40"
          >
            저장
          </button>
        </div>
      </div>
    </Modal>
  );
}

function GeofencePreview({ sites }: { sites: Site[] }) {
  if (sites.length === 0) return null;
  const lats = sites.map((s) => s.lat);
  const lons = sites.map((s) => s.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const pad = 0.05;
  const w = 400, h = 240;
  const project = (lat: number, lon: number) => {
    const x = ((lon - (minLon - pad)) / ((maxLon - minLon) + pad * 2 || 1)) * w;
    const y = h - ((lat - (minLat - pad)) / ((maxLat - minLat) + pad * 2 || 1)) * h;
    return [x, y];
  };

  return (
    <div>
      <p className="mb-1 text-xs font-medium" style={{ color: 'var(--color-paper)' }}>지오펜스 미리보기 (오프라인 SVG)</p>
      <svg width={w} height={h} style={{ background: 'var(--color-panel-2)', borderRadius: 8 }}>
        {sites.map((s) => {
          const [x, y] = project(s.lat, s.lon);
          const rPx = (s.radius_m / 111000) * (h / ((maxLat - minLat) + pad * 2 || 1));
          return (
            <g key={s.site_id}>
              <circle cx={x} cy={y} r={Math.max(4, rPx)} fill="var(--color-teal)" fillOpacity={0.15} stroke="var(--color-teal)" />
              <circle cx={x} cy={y} r={2} fill="var(--color-teal)" />
              <text x={x + 6} y={y - 6} fontSize={10} fill="var(--color-mist)">{s.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CorporateCarTab() {
  const STORAGE_KEY = 'se.corporateCars.v1';
  const [cars, setCars] = useState<ParsedRegistration[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  });
  const [parsing, setParsing] = useState(false);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(cars)); }, [cars]);

  async function handleUpload() {
    setParsing(true);
    const result = await fakeParseRegistration('car');
    setCars((prev) => [...prev, result]);
    setParsing(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
        법인 승용차는 차주가 없어 기사뷰 자가가입 경로로 등록되지 않는다 — 여기서 등록증을 올려 대신 등록한다.
        (등록 결과는 지금은 이 브라우저에만 저장된다 — files2/ 원천 CSV에 반영되려면 다음 빌드에서 실측 데이터로 합쳐야 한다.)
      </p>
      <button type="button" disabled={parsing} onClick={handleUpload} className="tone-ok-bg tone-ok-fg w-fit rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40">
        {parsing ? '분석 중…' : '자동차등록증 업로드'}
      </button>
      <p className="text-xs" style={{ color: 'var(--color-dim)' }}>실제 OCR이 아닌 표본 데이터로 채워집니다.</p>

      <div className="grid gap-2 sm:grid-cols-2">
        {cars.map((c, i) => (
          <div key={i} className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--color-line)', color: 'var(--color-mist)' }}>
            <p className="font-medium" style={{ color: 'var(--color-paper)' }}>{c.plate}</p>
            <p>{c.maker} {c.model} ({c.year})</p>
            <p className="num">공인연비 {c.registered_kmpl}km/L</p>
            <button type="button" onClick={() => setCars((prev) => prev.filter((_, idx) => idx !== i))} className="mt-1" style={{ color: 'var(--color-rose)' }}>삭제</button>
          </div>
        ))}
      </div>
    </div>
  );
}
