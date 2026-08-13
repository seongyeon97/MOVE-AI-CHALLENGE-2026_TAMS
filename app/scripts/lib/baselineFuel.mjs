// baselineFuel.mjs — 기준연비 3+1계층 조회 (PRD §4, 산출기준서 §2-2).
// 빌드 타임에만 호출한다. 런타임(앱)에서 이 파일을 import하지 않는다.
//
// ① registration  vehicle_master.registered_kmpl                    trust A
// ② public_api     공공데이터포털 한국에너지공단 표시연비            trust A
// ③ ai_estimate    Gemini 유사차량 추정                              trust C
// ④ fixture        public/fixtures/fuel_economy_cache.json          trust C
//
// 우선순위대로 시도하고 처음 성공한 것을 쓴다. 실패는 에러가 아니라 다음 계층으로 폴백.

import { readFileSync } from 'node:fs';
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

// ① 등록증
function tryRegistration(vehicle) {
  const kmpl = Number(vehicle.registered_kmpl);
  if (!Number.isFinite(kmpl) || kmpl <= 0) return null;
  return { kmpl, source: 'registration', trust: 'A' };
}

// ② 공공데이터포털 — DATA_GO_KR_KEY 없으면 조용히 스킵(에러 아님).
async function tryPublicApi(vehicle) {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return null;

  const endpoint = 'https://apis.data.go.kr/B552584/EfficiencyClassAvgInfoService/getRenewalCompareAvgEfficiency';
  const params = new URLSearchParams({
    serviceKey: key,
    manufacturerNm: vehicle.maker ?? '',
    modelNm: vehicle.model ?? '',
    year: vehicle.year ?? '',
    _type: 'json',
    numOfRows: '5',
  });

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${endpoint}?${params}`, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.response?.body?.items?.item?.[0];
    const kmpl = Number(item?.복합연비 ?? item?.avgEfficiency);
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
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

  throw new Error(`baseline fuel lookup exhausted all layers for ${vehicle.vehicle_id}`);
}

/** vehicle_master.csv 전체를 순회해 baseline_fuel.json 페이로드를 만든다. */
export async function resolveBaselineFuel(vehicles, opts) {
  const result = {};
  const now = new Date().toISOString();
  for (const vehicle of vehicles) {
    const entry = await lookupBaselineFuel(vehicle, opts);
    entry.fetched_at = now;
    if (!entry.source || !entry.trust) {
      throw new Error(`baseline fuel entry missing source/trust for ${vehicle.vehicle_id}`);
    }
    result[vehicle.vehicle_id] = entry;
  }
  return result;
}
