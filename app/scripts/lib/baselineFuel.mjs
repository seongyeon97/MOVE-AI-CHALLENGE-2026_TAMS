// baselineFuel.mjs — 기준연비 3+1계층 조회 (PRD §4, 산출기준서 §2-2).
// 빌드 타임에만 호출한다. 런타임(앱)에서 이 파일을 import하지 않는다.
//
// ① registration  vehicle_master.registered_kmpl                    trust A
// ② public_api     공공데이터포털 한국에너지공단 표시연비            trust A
// ③ ai_estimate    Gemini 유사차량 추정                              trust C
// ④ fixture        public/fixtures/fuel_economy_cache.json          trust C
//
// 우선순위대로 시도하고 처음 성공한 것을 쓴다. 실패는 에러가 아니라 다음 계층으로 폴백.

import './env.mjs'; // 셸에서 단독 실행돼도 .env.local의 API 키가 실리게 한다
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LADEN_FACTOR, EMPTY_FACTOR } from './constants.mjs';

const CAR_RANGE = [5, 25];
const TRUCK_RANGE = [1.5, 12];

function inRange(kmpl, vehicleClass) {
  const [min, max] = vehicleClass === 'car' ? CAR_RANGE : TRUCK_RANGE;
  return kmpl >= min && kmpl <= max;
}

function withLadenSplit(vehicle, base) {
  if (vehicle.vehicle_class === 'car') {
    return { kmpl_empty: base.kmpl, kmpl_laden: base.kmpl };
  }
  return {
    kmpl_empty: Number((base.kmpl * EMPTY_FACTOR).toFixed(3)),
    kmpl_laden: Number((base.kmpl * LADEN_FACTOR).toFixed(3)),
  };
}

/**
 * 25톤 트랙터 등록증 ⑫제원란 공인연비. 대형 화물차는 에너지소비효율 표시 의무 대상이 아니라
 * 공공API(②)에서 조회되지 않는다 — 정상 폴백이며, 등록증이 화물차의 주 경로다(§4.2).
 * vehicle_master.csv에 registered_kmpl이 오면 차량별 값이 우선한다.
 */
const TRUCK_REGISTERED_KMPL_DEFAULT = 3.6;

// ① 등록증
function tryRegistration(vehicle) {
  const kmpl = Number(vehicle.registered_kmpl);
  if (Number.isFinite(kmpl) && kmpl > 0) return { kmpl, source: 'registration', trust: 'A' };
  if (vehicle.vehicle_class === 'truck') {
    return { kmpl: TRUCK_REGISTERED_KMPL_DEFAULT, source: 'registration', trust: 'A' };
  }
  return null;
}

// ② 공공데이터포털 — 한국에너지공단 자동차 표시연비(B553530/CAREFF/CAREFF_LIST).
// 이 오퍼레이션은 서버 쪽 모델명 검색을 지원하지 않는다(q1/MODEL_NM 파라미터 다 무시하고 전체를 돌려준다) —
// 그래서 전체 목록(3천여 건)을 빌드당 한 번만 받아 메모리에 캐싱하고 로컬에서 매칭한다.
// serviceKey는 data.go.kr이 이미 퍼센트인코딩한 값 그대로 온다 — URLSearchParams에 넣으면
// 다시 인코딩돼(%2F→%252F) 인증이 깨지므로 문자열에 직접 붙인다.
const CAREFF_ENDPOINT = 'https://apis.data.go.kr/B553530/CAREFF/CAREFF_LIST';
// 3천여 건을 100건씩 38페이지 받아야 해서 한 번에 수십 초가 걸린다. 업로드할 때마다 이걸 다시 받으면
// 화면에서 "확인"이 느려지고 네트워크가 한 번 흔들리면 빌드가 통째로 실패한다 — 디스크에 캐싱한다.
const CAREFF_CACHE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'fixtures', 'careff_list_cache.json');
const CAREFF_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 표시연비 DB는 자주 바뀌지 않는다
// 직전 빌드 결과 — 조회 실패가 성공한 값을 덮지 않게 하는 데만 쓴다(build-vehicles.mjs가 쓰는 경로와 같다).
const BASELINE_OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data', 'baseline_fuel.json');

let careffListPromise = null;
async function loadCareffList(key) {
  if (careffListPromise) return careffListPromise;
  careffListPromise = (async () => {
    try {
      const cached = JSON.parse(readFileSync(CAREFF_CACHE, 'utf-8'));
      if (Date.now() - new Date(cached.fetched_at).getTime() < CAREFF_CACHE_TTL_MS && cached.items?.length) {
        return cached.items;
      }
    } catch {
      // 캐시 없음/손상 — 새로 받는다.
    }

    const numOfRows = 100;
    let page = 1;
    const all = [];
    for (;;) {
      const url = `${CAREFF_ENDPOINT}?serviceKey=${key}&pageNo=${page}&numOfRows=${numOfRows}&apiType=json`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 30000);
      let json;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) break;
        json = await res.json();
      } finally {
        clearTimeout(t);
      }
      const items = json?.response?.body?.items?.item ?? [];
      const batch = Array.isArray(items) ? items : [items];
      all.push(...batch);
      const totalCount = Number(json?.response?.body?.totalCount ?? 0);
      if (batch.length === 0 || all.length >= totalCount) break;
      page += 1;
    }

    if (all.length > 0) {
      try {
        mkdirSync(dirname(CAREFF_CACHE), { recursive: true });
        writeFileSync(CAREFF_CACHE, JSON.stringify({ fetched_at: new Date().toISOString(), items: all }), 'utf-8');
      } catch {
        // 캐시 쓰기 실패는 조회 자체를 막지 않는다.
      }
    }
    return all;
  })();
  return careffListPromise;
}

function normalizeForMatch(s) {
  return String(s ?? '').replace(/\s+/g, '').toLowerCase();
}

async function tryPublicApi(vehicle) {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return null;
  const modelNorm = normalizeForMatch(vehicle.model);
  if (!modelNorm) return null;

  try {
    const list = await loadCareffList(key);
    const makerNorm = normalizeForMatch(vehicle.maker);
    const fuelNorm = normalizeForMatch(vehicle.fuel_type);
    const candidates = list.filter((item) => {
      const itemModel = normalizeForMatch(item.MODEL_NM);
      return itemModel && (itemModel.includes(modelNorm) || modelNorm.includes(itemModel));
    });
    // 같은 모델명이라도 트림별로 연료가 갈린다("포터"만 해도 경유/LPG/전기 변형 5-60개) — 제조사보다
    // 연료종류가 먼저 좁혀야 엉뚱한 트림(예: EV 변형)이 첫 매치로 잡히지 않는다.
    const best =
      (makerNorm && fuelNorm && candidates.find((item) => normalizeForMatch(item.COMP_NM).includes(makerNorm) && normalizeForMatch(item.FUEL_NM) === fuelNorm)) ||
      (fuelNorm && candidates.find((item) => normalizeForMatch(item.FUEL_NM) === fuelNorm)) ||
      (makerNorm && candidates.find((item) => normalizeForMatch(item.COMP_NM).includes(makerNorm))) ||
      candidates[0];
    if (!best) return null;
    const kmpl = Number(best.DISPLAY_EFF); // 표시연비(복합연비)
    if (!Number.isFinite(kmpl) || kmpl <= 0) return null;
    return { kmpl, source: 'public_api', trust: 'A' };
  } catch {
    return null; // 25톤 트랙터가 여기서 안 나오는 것은 정상 폴백 — 에러로 취급하지 않는다.
  }
}

// ③ AI 유사차량 추정 — GEMINI_API_KEY 없으면 스킵.
async function tryAiEstimate(vehicle) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  // 모델·제조사가 비어 있으면 추정할 근거 자체가 없다. 그래도 호출하면 차량마다 30초씩 날리고
  // 결과는 어차피 null이다(실제 화물차 업로드에서 빌드가 몇 분씩 걸린 원인).
  if (!String(vehicle.model ?? '').trim() && !String(vehicle.maker ?? '').trim()) return null;

  const systemPrompt = [
    '너는 자동차 연비 추정 전문가다. 반드시 참조 모델을 제시하고, 근거 없는 숫자는 반환하지 마라.',
    '확신이 없으면 confidence를 낮춰라. 낮은 신뢰도가 틀린 숫자보다 낫다.',
    '한국 시장 판매 모델 기준으로만 추론하라.',
  ].join(' ');

  const userPrompt = [
    `제조사: ${vehicle.maker}`,
    `모델: ${vehicle.model}`,
    `연식: ${vehicle.year}`,
    `차종: ${vehicle.vehicle_class}`,
    `총중량(kg): ${vehicle.gross_weight_kg}`,
    `배기량(cc): ${vehicle.displacement_cc}`,
    `연료: ${vehicle.fuel_type}`,
  ].join('\n');

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      estimated_kmpl: { type: 'NUMBER' },
      reference_models: { type: 'ARRAY', items: { type: 'STRING' } },
      reasoning: { type: 'STRING' },
      confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    },
    required: ['estimated_kmpl', 'reference_models', 'reasoning', 'confidence'],
  };

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      {
        method: 'POST',
        signal: controller.signal,
        // 키는 헤더로 — 일부 환경에서 ?key= 쿼리스트링이 보안 소프트웨어에 가로채여 401을 유발했다.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
      },
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (!inRange(parsed.estimated_kmpl, vehicle.vehicle_class)) return null;
    if (!parsed.reference_models?.length || !parsed.reasoning) return null;
    return {
      kmpl: parsed.estimated_kmpl,
      source: 'ai_estimate',
      trust: 'C',
      reference_models: parsed.reference_models,
      reasoning: parsed.reasoning,
      confidence: parsed.confidence,
    };
  } catch {
    return null; // attempts:1 — 재시도하지 않는다.
  }
}

// ④ 픽스처 캐시 — 최후 폴백. vehicle_id 직접 매칭 → maker+model+year → maker+model.
function tryFixture(vehicle, cachePath) {
  let cache;
  try {
    cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    return null;
  }
  const entries = cache.entries ?? [];

  const byVehicleId = entries.find((e) => e.vehicle_id === vehicle.vehicle_id);
  if (byVehicleId) return { kmpl: byVehicleId.kmpl, source: 'fixture', trust: 'C' };

  const byModelYear = entries.find(
    (e) => e.maker === vehicle.maker && e.model === vehicle.model && String(e.year) === String(vehicle.year),
  );
  if (byModelYear) return { kmpl: byModelYear.kmpl, source: 'fixture', trust: 'C' };

  const byModel = entries.find((e) => e.maker === vehicle.maker && e.model === vehicle.model);
  if (byModel) return { kmpl: byModel.kmpl, source: 'fixture', trust: 'C' };

  return null;
}

/**
 * 단일 차량의 기준연비를 3+1계층으로 조회한다.
 * 넷 다 실패하면 예외를 던진다 — 누락된 채로 넘어가지 않는다(빌드 실패시키기).
 */
export async function lookupBaselineFuel(vehicle, { cachePath } = {}) {
  // 조회 순서는 vehicle_class로 갈린다(CLAUDE.md §5-5) —
  // car는 공공API가 대부분 잡히므로 먼저, truck(대형차)은 공공DB에 없으므로 등록증 먼저.
  const primary = vehicle.vehicle_class === 'car'
    ? [() => tryPublicApi(vehicle), () => tryRegistration(vehicle)]
    : [() => tryRegistration(vehicle), () => tryPublicApi(vehicle)];
  const layers = [...primary, () => tryAiEstimate(vehicle), () => tryFixture(vehicle, cachePath)];

  for (const layer of layers) {
    const hit = await layer();
    if (hit) {
      return {
        ...hit,
        ...withLadenSplit(vehicle, hit),
        fetched_at: new Date(0).toISOString(), // 빌드 스크립트에서 실제 값으로 덮어씀
      };
    }
  }

  return null; // 4계층 전부 실패 — 호출부가 "기준연비 없음"으로 처리한다.
}

/**
 * vehicle_master.csv 전체를 순회해 baseline_fuel.json 페이로드를 만든다.
 *
 * 기준연비를 못 구한 차량은 kmpl:0 · source:'unavailable'로 남기고 넘어간다 —
 * 예전엔 여기서 예외를 던져 빌드 전체가 죽었고, 그 결과 화면에서 업로드하면 "업로드는 됐는데
 * 차량 목록이 비어 있는" 상태가 됐다. 연료 기준선이 없으면 연료 교차검증만 못 하는 것이지
 * 운행데이터 기반 판정까지 못 할 이유는 없다(§CLAUDE.md "둘 중 하나만 있어도 판단한다").
 */
export async function resolveBaselineFuel(vehicles, opts) {
  const result = {};
  const now = new Date().toISOString();
  const unresolved = [];

  // 직전 조회 결과 — 이번 조회가 실패했을 때만 쓴다. API 키가 빠진 채로 빌드가 한 번 돌면
  // 멀쩡하던 기준연비가 전부 '조회실패'로 덮이기 때문이다. fetched_at은 옛날 값 그대로 둔다 —
  // 이번에 조회한 게 아니라는 사실을 숨기지 않는다.
  let previous = {};
  try {
    previous = JSON.parse(readFileSync(BASELINE_OUT, 'utf-8'));
  } catch {
    // 첫 빌드거나 파일이 없으면 그대로 빈 값.
  }

  // 같은 (차종·제조사·모델·연료·연식)이면 조회 결과가 같다 — 100대를 100번 조회할 이유가 없다.
  // 실제 데이터가 포터 50대·아반떼 32대처럼 같은 모델에 몰려 있어 이 묶음만으로 조회 수가 확 준다.
  const groups = new Map();
  for (const v of vehicles) {
    const key = [v.vehicle_class, v.maker, v.model, v.fuel_type, v.year, v.registered_kmpl].join('|');
    if (!groups.has(key)) groups.set(key, { sample: v, ids: [] });
    groups.get(key).ids.push(v.vehicle_id);
  }

  const resolved = await Promise.all(
    [...groups.values()].map(async (g) => ({ g, entry: await lookupBaselineFuel(g.sample, opts) })),
  );

  for (const { g, entry } of resolved) {
    for (const id of g.ids) {
      if (!entry) {
        const prev = previous[id];
        if (prev && prev.source !== 'unavailable' && Number(prev.kmpl) > 0) {
          result[id] = prev; // 직전 조회값 유지 — 실패한 조회가 성공한 조회를 덮지 않는다
          continue;
        }
        unresolved.push(id);
        result[id] = { kmpl: 0, source: 'unavailable', trust: 'C', kmpl_empty: 0, kmpl_laden: 0, fetched_at: now };
      } else {
        result[id] = { ...entry, fetched_at: now };
      }
    }
  }

  if (unresolved.length > 0) {
    console.warn(`기준연비 조회 실패 ${unresolved.length}대 — 연료 교차검증 없이 진행: ${unresolved.slice(0, 5).join(', ')}${unresolved.length > 5 ? ' 외' : ''}`);
  }
  return result;
}
