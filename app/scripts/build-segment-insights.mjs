// build-segment-insights.mjs — 구간별 AI 도로환경 해설 + 차주 리포트 (B 산출물).
// **기본 build:data 파이프라인에 넣지 않는다** — API 키 3종·네트워크·헤드리스 크롬 필요.
//   npm run build:data:insights          (캡처 재촬영: -- --force)
// 결과(public/data/segment_insights.json + public/segment_captures/*.jpg)는 커밋 대상.
//
// 원칙: 위험 판정·순위·발생률은 전부 실측 통계다. Gemini는 그 결과가 나온 자리의
// 도로환경만 해설한다 — 응답 스키마에 숫자 필드를 하나도 두지 않는 것으로 코드 레벨 강제.
//
// 실패 내성: 키 없으면 해당 단계만 건너뛰고 진행. Gemini 키 없으면 기존 JSON을 덮어쓰지 않는다.

import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, writeJson } from './lib/csv.mjs';
import {
  loadEnv,
  loadLegIndex,
  loadTracks,
  bearingDeg,
  toEpoch,
  toRouteKm,
  r2,
} from './lib/corridorShared.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILES2 = join(ROOT, 'files2');
const DATA_OUT = join(ROOT, 'public', 'data');
const CAPTURE_DIR = join(ROOT, 'public', 'segment_captures');
const OUT_PATH = join(DATA_OUT, 'segment_insights.json');
const FORCE = process.argv.includes('--force');

const env = loadEnv(ROOT);
const KAKAO_REST = env.get('KAKAO_REST_API_KEY');
const KAKAO_MAP = env.get('VITE_KAKAO_MAP_KEY');
const GEMINI = env.get('GEMINI_API_KEY');
const MODEL = 'gemini-3.6-flash';

// 문체 규칙 — 사내 담당자·차주가 그대로 받아 보는 문서. 모든 프롬프트·스키마 설명에 주입.
const STYLE_RULE = `모든 문장은 반드시 존댓말(합니다체)로 씁니다. "~이다", "~한다", "~하라", "~해라" 같은 평서형·명령형 종결을 절대 쓰지 않습니다. 명사로 끝나는 개조식 문장도 쓰지 않고, 반드시 "~입니다", "~합니다", "~됩니다", "~하십시오"로 끝맺습니다.`;

/* ── 카카오 REST ────────────────────────────────────────────────────── */

async function kakaoGet(url) {
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST}` } });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  return res.json();
}

async function reverseGeocode(lat, lon) {
  try {
    const [addr, region] = await Promise.all([
      kakaoGet(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lon}&y=${lat}`),
      kakaoGet(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lon}&y=${lat}`),
    ]);
    const a = addr.documents?.[0];
    const r = region.documents?.find((d) => d.region_type === 'H') ?? region.documents?.[0];
    return {
      address: a?.road_address?.address_name ?? a?.address?.address_name ?? null,
      region: r?.address_name ?? null,
    };
  } catch {
    return { address: null, region: null };
  }
}

const POI_KEYWORDS = ['IC', '분기점', '요금소', '터널', '휴게소', '교차로', '교량'];

async function nearbyPois(lat, lon) {
  const all = [];
  for (const kw of POI_KEYWORDS) {
    try {
      const data = await kakaoGet(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(kw)}&x=${lon}&y=${lat}&radius=2000&sort=distance&size=5`,
      );
      for (const d of data.documents ?? []) {
        all.push({ name: d.place_name, category: kw, distance_m: Number(d.distance) });
      }
    } catch {
      /* 검색 하나 실패해도 계속 */
    }
  }
  all.sort((a, b) => a.distance_m - b.distance_m);
  // 이름 중복 제거 후 거리순 12개
  const seen = new Set();
  return all.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true))).slice(0, 12);
}

/* ── 도로 형상 ─────────────────────────────────────────────────────── */

/** 누적 방위 변화량이 크면 굽은 길, 0에 가까우면 직선. 최대 단일 꺾임은 램프·분기를 잡는다. */
function geometryOf(polyline) {
  if (polyline.length < 3) return { total_turn_deg: 0, max_turn_deg: 0, shape: '직선' };
  let total = 0;
  let max = 0;
  for (let i = 1; i < polyline.length - 1; i += 1) {
    let d = Math.abs(bearingDeg(polyline[i], polyline[i + 1]) - bearingDeg(polyline[i - 1], polyline[i]));
    if (d > 180) d = 360 - d;
    total += d;
    if (d > max) max = d;
  }
  const shape = total > 90 ? '급곡선 연속' : total > 40 ? '완만한 곡선' : '거의 직선';
  return { total_turn_deg: Math.round(total), max_turn_deg: Math.round(max), shape };
}

/* ── 실측 근거: 속도·시간대 — §2-2와 동일한 선형 참조 (같은 자리를 가리켜야 한다) ── */

function buildEvidence() {
  const certsPath = join(DATA_OUT, 'certificates.json');
  if (!existsSync(certsPath) || !existsSync(join(FILES2, 'event.csv'))) return null;
  const certs = JSON.parse(readFileSync(certsPath, 'utf-8'));
  const certList = Array.isArray(certs) ? certs : certs.certificates ?? [];
  const trustedTripIds = new Set(certList.filter((c) => c.verifiable).map((c) => c.trip_id));
  const legIndex = loadLegIndex(FILES2);
  return { trustedTripIds, legIndex };
}

async function collectSpeedAndHours(corridor, targets) {
  const base = buildEvidence();
  if (!base) return new Map();
  const { trustedTripIds, legIndex } = base;
  const tracks = await loadTracks(FILES2, trustedTripIds);
  if (!tracks) return new Map();

  const routeByKey = new Map();
  for (const route of corridor.routes) routeByKey.set(route.route_id, route);
  const totalKmByRouteId = new Map(
    corridor.routes.map((r) => [r.route_id, r.segments[r.segments.length - 1]?.km_to ?? 0]),
  );
  const routeIdByTrip = new Map();
  {
    // corridor.json 노선명 ↔ leg.csv 노선키 매칭
    const idByRouteKey = new Map();
    for (const route of corridor.routes) {
      const [o, d] = route.route_name.split(' — ');
      idByRouteKey.set(`${o}|${d}`, route.route_id);
    }
    for (const [tripId, key] of legIndex.routeKeyByTrip) {
      const id = idByRouteKey.get(key);
      if (id) routeIdByTrip.set(tripId, id);
    }
  }

  // 궤적 점 → routeKm → 대상 구간이면 속도 수집
  const speedBySeg = new Map(); // key → number[]
  for (const [trackKey, points] of tracks.byKey) {
    const tripId = trackKey.split('|')[0];
    const routeId = routeIdByTrip.get(tripId);
    if (!routeId) continue;
    const totalKm = totalKmByRouteId.get(routeId) ?? 0;
    for (const p of points) {
      const legNo = tracks.perLeg ? trackKey.split('|')[1] : inferLegNo(legIndex, tripId, points, p, totalKm);
      const routeKm = toRouteKm({
        tracks,
        legByKey: legIndex.legByKey,
        tripId,
        legNo,
        epoch: p.t,
        totalKm,
      });
      if (routeKm == null) continue;
      for (const t of targets) {
        if (t.route_id !== routeId) continue;
        if (routeKm >= t.seg.km_from && routeKm < t.seg.km_to) {
          const key = `${t.route_id}-${t.seg.segment_no}`;
          if (!speedBySeg.has(key)) speedBySeg.set(key, []);
          speedBySeg.get(key).push(p.speed);
        }
      }
    }
  }

  // 이벤트 시간대 — 동일 선형 참조로 재배정
  const hoursBySeg = new Map(); // key → Map<hour, count>
  const events = readCsv(join(FILES2, 'event.csv'));
  for (const e of events) {
    if (!trustedTripIds.has(e.trip_id)) continue;
    const routeId = routeIdByTrip.get(e.trip_id);
    if (!routeId) continue;
    const totalKm = totalKmByRouteId.get(routeId) ?? 0;
    const routeKm = toRouteKm({
      tracks,
      legByKey: legIndex.legByKey,
      tripId: e.trip_id,
      legNo: e.leg_no,
      epoch: toEpoch(e.occurred_at),
      totalKm,
    });
    if (routeKm == null) continue;
    for (const t of targets) {
      if (t.route_id !== routeId) continue;
      if (routeKm >= t.seg.km_from && routeKm < t.seg.km_to) {
        const key = `${t.route_id}-${t.seg.segment_no}`;
        if (!hoursBySeg.has(key)) hoursBySeg.set(key, new Map());
        const hour = new Date(toEpoch(e.occurred_at) * 1000).getHours();
        hoursBySeg.get(key).set(hour, (hoursBySeg.get(key).get(hour) ?? 0) + 1);
      }
    }
  }

  const out = new Map();
  for (const t of targets) {
    const key = `${t.route_id}-${t.seg.segment_no}`;
    const speeds = speedBySeg.get(key) ?? [];
    let speed = null;
    if (speeds.length > 0) {
      const mean = speeds.reduce((s, v) => s + v, 0) / speeds.length;
      const stdev = Math.sqrt(speeds.reduce((s, v) => s + (v - mean) ** 2, 0) / speeds.length);
      speed = {
        samples: speeds.length,
        mean_kmh: r2(mean),
        max_kmh: r2(Math.max(...speeds)),
        min_kmh: r2(Math.min(...speeds)),
        stdev_kmh: r2(stdev),
      };
    }
    const hourMap = hoursBySeg.get(key);
    let hours = null;
    if (hourMap && hourMap.size > 0) {
      const top = [...hourMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      hours = {
        total: [...hourMap.values()].reduce((s, v) => s + v, 0),
        top_hours: top.map(([hour, count]) => ({ hour, count })),
      };
    }
    out.set(key, { speed, hours });
  }
  return out;
}

/** trip 단위 궤적(레그 구분 없음)에서 점의 leg_no 추정 — odo 상대거리가 노선길이 넘으면 IN(2) */
function inferLegNo(legIndex, tripId, points, p, totalKm) {
  const odoRel = p.odo - points[0].odo;
  return odoRel > totalKm ? '2' : '1';
}

/* ── 헤드리스 캡처 ─────────────────────────────────────────────────── */

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** 5173에 캡처 페이지가 이미 뜨는지 확인, 아니면 public/만 서빙하는 임시 서버를 띄운다. */
async function ensureCaptureServer() {
  const probe = 'http://localhost:5173/__segment-capture.html';
  try {
    const res = await fetch(probe, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return { origin: 'http://localhost:5173', close: () => {} };
  } catch {
    /* 안 떠 있음 */
  }
  const MIME = { '.html': 'text/html', '.jpg': 'image/jpeg', '.json': 'application/json' };
  const server = createServer((req, res) => {
    const path = join(ROOT, 'public', decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try {
      const body = readFileSync(path);
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(5173, resolve);
  });
  return { origin: 'http://localhost:5173', close: () => server.close() };
}

async function captureSegment(page, origin, routeId, seg, bearing) {
  const files = [];
  const path = seg.polyline.map(([a, b]) => `${a},${b}`).join(';');
  for (const mode of ['map', 'sky', 'roadview']) {
    const file = join(CAPTURE_DIR, `${routeId}_${seg.segment_no}_${mode}.jpg`);
    const rel = `/segment_captures/${routeId}_${seg.segment_no}_${mode}.jpg`;
    if (existsSync(file) && !FORCE) {
      files.push(rel);
      continue;
    }
    const url =
      `${origin}/__segment-capture.html?key=${KAKAO_MAP}&mode=${mode}` +
      `&lat=${seg.centroid[0]}&lon=${seg.centroid[1]}&pan=${bearing}` +
      (mode === 'roadview' ? '' : `&path=${encodeURIComponent(path)}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const state = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const tick = setInterval(() => {
              if (window.__capture) {
                clearInterval(tick);
                resolve(window.__capture.state);
              }
            }, 100);
          }),
      );
      if (state !== 'ready') {
        console.warn(`    ${mode} 캡처 스킵 (${state})`);
        continue;
      }
      await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
      files.push(rel);
      console.log(`    ${mode} 캡처 완료`);
    } catch (err) {
      console.warn(`    ${mode} 캡처 실패: ${err.message}`);
    }
  }
  return files;
}

/* ── Gemini ────────────────────────────────────────────────────────── */

// 응답 스키마 — 숫자 필드가 하나도 없다는 게 요점이다.
const INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    headline: {
      type: 'string',
      description:
        '이 구간의 도로 환경을 한 문장(40자 이내)으로. 위험을 단정하지 말고 지형·시설 특징을 말할 것. 반드시 "~입니다"로 끝나는 존댓말.',
    },
    causes: {
      type: 'array',
      description: '이벤트가 몰리는 도로환경상 원인 후보 2~3개. 확신 순으로.',
      items: {
        type: 'object',
        properties: {
          factor: { type: 'string', description: '원인 한 줄. 반드시 존댓말로 끝맺을 것.' },
          evidence: {
            type: 'string',
            description: '왜 그렇게 보는지 — 반드시 제공된 근거만 인용할 것. 새 수치를 만들지 말 것.',
          },
          confidence: { type: 'string', enum: ['높음', '보통', '낮음'] },
        },
        required: ['factor', 'evidence', 'confidence'],
      },
    },
    driver_advice: {
      type: 'string',
      description: '이 구간을 지나는 기사에게 줄 운행 조언 한 문장. 일반론 말고 이 구간 특성에 맞게.',
    },
    visual_notes: {
      type: 'string',
      description: '첨부된 지도·위성·로드뷰 이미지에서 실제로 보이는 것만 서술. 판독 불가면 그렇다고 쓸 것.',
    },
  },
  required: ['headline', 'causes', 'driver_advice', 'visual_notes'],
};

const INSIGHT_SYSTEM = `당신은 화물 운송 안전 분석가입니다. 이미 통계로 확정된 "위험운전 이벤트가 몰리는 1km 구간"에 대해, 그 자리의 도로 환경이 어떻게 생겼는지를 해설합니다.

지켜야 할 규칙:
- 위험도 점수·등급·순위·확률을 새로 만들지 않습니다. 위험 판정은 이미 끝났고 당신 몫이 아닙니다.
- 제공된 근거(주소, 주변 시설, 도로 형상, 속도 프로파일, 이벤트 구성, 첨부 이미지)에 없는 사실을 지어내지 않습니다. 모르면 모른다고 씁니다.
- 사고를 예측하지 않습니다. "사고가 날 것입니다"가 아니라 "이런 도로 구조라 급감속이 잦을 수 있습니다"로 말합니다.
- 급가속·급출발이 잦다면 정체 해소·합류 후 가속 구간을, 급감속·급정지가 잦다면 진출 램프·요금소·정체 꼬리를 우선 의심합니다.
- 실무자가 읽는 보고서 문체로 간결하게 씁니다.
- ${STYLE_RULE}`;

function driverReportSchema(segmentKeys, routeIds) {
  // key/route_id를 enum으로 묶어 모델이 없는 구간을 지어내지 못하게 막는다
  return {
    type: 'object',
    properties: {
      title: { type: 'string', description: '리포트 제목 한 줄. 차주가 받는 문서의 이름.' },
      intro: {
        type: 'string',
        description:
          '어떤 데이터로 만들어졌고 무엇에 쓰는 문서인지 2~3문장. 감시 목적이 아니라 안전 안내라는 점을 분명히 할 것.',
      },
      key_rules: {
        type: 'array',
        description: '노선 전체를 관통하는 핵심 운행 수칙 3~5개. 구간마다 따로 말하지 말고 반복되는 패턴을 묶을 것.',
        items: {
          type: 'object',
          properties: { rule: { type: 'string' }, why: { type: 'string' } },
          required: ['rule', 'why'],
        },
      },
      route_notes: {
        type: 'array',
        description: '노선별 총평. 제공된 노선 전부에 대해 하나씩.',
        items: {
          type: 'object',
          properties: { route_id: { type: 'string', enum: routeIds }, summary: { type: 'string' } },
          required: ['route_id', 'summary'],
        },
      },
      spots: {
        type: 'array',
        description: '제공된 구간 전부에 대해 하나씩. 빠뜨리지 말 것.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: segmentKeys },
            nickname: {
              type: 'string',
              description:
                '차주가 지도 없이도 어딘지 알 수 있는 이름 (예: "용원 물류단지 앞 교차로"). 주변 시설·주소에서 뽑을 것.',
            },
            when_to_watch: { type: 'string', description: '언제·어디서 주의해야 하는지 한 문장.' },
            action: { type: 'string', description: '구체적으로 무엇을 하면 되는지 한 문장.' },
          },
          required: ['key', 'nickname', 'when_to_watch', 'action'],
        },
      },
      closing: {
        type: 'string',
        description: '마무리 1~2문장. 평가·감시가 아니라 안전 확보용이라는 점과 현장 상황이 우선이라는 점을 짚을 것.',
      },
    },
    required: ['title', 'intro', 'key_rules', 'route_notes', 'spots', 'closing'],
  };
}

const DRIVER_SYSTEM = `당신은 화물 운송사의 안전관리 담당자입니다. 실제 그 길을 운행하는 차주(기사)에게 나눠 줄 안전 운행 안내문을 작성합니다.

읽는 사람이 다릅니다:
- 이 문서는 사무실 분석 보고서가 아니라, 운행 전에 훑어보는 안내문입니다. 통계 용어·분석 방법론을 늘어놓지 않습니다.
- 차주를 평가하거나 질책하지 않습니다. "당신이 난폭운전을 한다"가 아니라 "이 자리 도로가 이렇게 생겨서 여기서 다들 급하게 밟게 됩니다"라는 태도로 씁니다.
- 사고를 예측하거나 위험 점수를 매기지 않습니다. 제공된 근거에 없는 사실을 지어내지 않습니다.
- 지시가 아니라 안내입니다. 명령조 대신 정중한 권유형을 씁니다.
- ${STYLE_RULE}`;

function evidenceText(route, seg, ex, bearing) {
  const lines = [
    `노선: ${route.route_name}`,
    `구간: ${seg.km_from}~${seg.km_to}km 지점 (노선 기점 기준 누적거리), 구간번호 ${seg.segment_no}`,
    `중심 좌표: ${seg.centroid[0]}, ${seg.centroid[1]}`,
    `주소: ${ex.address ?? '도로명 주소 없음(고속도로 본선 등)'}`,
    `행정구역: ${ex.region ?? '불명'}`,
    `통계 판정: ${seg.grade_label} · 전체 ${seg.rank_global + 1}위 · verifiable 차량 기준 ${seg.rate_per_trip}건/trip · 누적 ${seg.event_count}건`,
    `주된 이벤트 유형: ${seg.dominant_type ?? '불명'}`,
    `이벤트 구성: ${Object.entries(seg.events_by_type).map(([k, v]) => `${k} ${v}건`).join(' · ') || '없음'}`,
    `도로 형상: ${ex.geometry.shape} (누적 방위변화 ${ex.geometry.total_turn_deg}°, 최대 단일 꺾임 ${ex.geometry.max_turn_deg}°)`,
    `진행 방위각: ${bearing}° (북=0, 시계방향)`,
  ];
  if (ex.speed) {
    lines.push(
      `구간 속도(DTG 실측 ${ex.speed.samples}점): 평균 ${ex.speed.mean_kmh}km/h · 최고 ${ex.speed.max_kmh} · 최저 ${ex.speed.min_kmh} · 표준편차 ${ex.speed.stdev_kmh}`,
    );
  } else {
    lines.push('구간 속도: 실측 표본 없음');
  }
  lines.push(
    ex.hours && ex.hours.top_hours.length > 0
      ? `이벤트 시간대 상위: ${ex.hours.top_hours.map((h) => `${h.hour}시 ${h.count}건`).join(' · ')}`
      : '이벤트 시간대: 표본 없음',
  );
  lines.push(
    ex.pois.length > 0
      ? `반경 2km 주요 시설: ${ex.pois.map((p) => `${p.name}(${p.distance_m}m)`).join(', ')}`
      : '반경 2km 주요 시설: 검색 결과 없음',
  );
  return lines.join('\n');
}

const CAPTURE_LABEL = { map: '일반 지도(빨간 선이 해당 1km 구간)', sky: '위성 사진(빨간 선이 해당 1km 구간)', roadview: '로드뷰(구간 중심 인근, 진행 방향)' };

function imageParts(captures) {
  const parts = [];
  for (const rel of captures) {
    const file = join(ROOT, 'public', rel.replace(/^\//, ''));
    if (!existsSync(file)) continue;
    const kind = rel.match(/_(map|sky|roadview)\.jpg$/)?.[1] ?? 'map';
    // 이미지 앞 라벨 필수 — 모델이 무엇을 보고 있는지 알아야 visual_notes가 정확하다
    parts.push({ text: `[첨부 이미지] ${CAPTURE_LABEL[kind]}` });
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: readFileSync(file).toString('base64') } });
  }
  return parts;
}

async function callGemini(ai, { system, parts, schema, maxTokens, thinking }) {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      responseSchema: schema,
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: thinking },
      httpOptions: { timeout: 30000 }, // attempts:1 — SDK 재시도 없음
    },
  });
  return JSON.parse(res.text);
}

/* ── 반말 스캔 — 생성 문장에 평서형 종결이 섞이면 배포 문서로 못 쓴다 ── */

function scanBanmal(obj, path = '$') {
  const BAD = /(이다|한다|하라|해라|된다|있다|없다|보인다)[.!]?\s*$/;
  const hits = [];
  if (typeof obj === 'string') {
    for (const sentence of obj.split(/(?<=[.!?])\s+/)) {
      if (BAD.test(sentence.trim())) hits.push(`${path}: "${sentence.trim().slice(-30)}"`);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => hits.push(...scanBanmal(v, `${path}[${i}]`)));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'key' || k === 'route_id') continue;
      hits.push(...scanBanmal(v, `${path}.${k}`));
    }
  }
  return hits;
}

/* ── main ──────────────────────────────────────────────────────────── */

async function main() {
  const corridorPath = join(DATA_OUT, 'corridor.json');
  if (!existsSync(corridorPath)) {
    console.error('corridor.json 없음 — npm run build:data 먼저.');
    process.exitCode = 1;
    return;
  }
  const corridor = JSON.parse(readFileSync(corridorPath, 'utf-8'));

  // 대상: tone warn/dead 구간만 — 양호까지 부르면 호출 수백 건에 할 말도 없다
  const targets = [];
  for (const route of corridor.routes) {
    for (const seg of route.segments) {
      if (seg.tone === 'warn' || seg.tone === 'dead') targets.push({ route_id: route.route_id, route, seg });
    }
  }
  if (targets.length === 0) {
    console.log('주의·위험 구간 0개 — 생성할 해설 없음.');
    return;
  }
  console.log(`대상 구간 ${targets.length}개 (주의·위험)`);

  // ① 실측 근거 수집
  const speedHours = await collectSpeedAndHours(corridor, targets);
  const evidences = new Map();
  for (const t of targets) {
    const key = `${t.route_id}-${t.seg.segment_no}`;
    const [lat, lon] = t.seg.centroid;
    let address = null;
    let region = null;
    let pois = [];
    if (KAKAO_REST) {
      ({ address, region } = await reverseGeocode(lat, lon));
      pois = await nearbyPois(lat, lon);
    } else {
      console.warn('KAKAO_REST_API_KEY 없음 — 주소·주변시설 근거 생략');
    }
    const sh = speedHours.get(key) ?? { speed: null, hours: null };
    evidences.set(key, { address, region, pois, geometry: geometryOf(t.seg.polyline), ...sh });
    console.log(`  ${key} 근거 수집: ${address ?? region ?? '주소 불명'} · POI ${pois.length}개`);
  }

  // ② 헤드리스 캡처 (실패해도 치명적이지 않다 — 텍스트 근거만으로 해설)
  const capturesByKey = new Map();
  const chrome = KAKAO_MAP ? findChrome() : null;
  if (chrome && KAKAO_MAP) {
    mkdirSync(CAPTURE_DIR, { recursive: true });
    const { chromium } = await import('playwright-core');
    const server = await ensureCaptureServer();
    const browser = await chromium.launch({ executablePath: chrome, headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    for (const t of targets) {
      const key = `${t.route_id}-${t.seg.segment_no}`;
      const pl = t.seg.polyline;
      const bearing = pl.length >= 2 ? bearingDeg(pl[0], pl[pl.length - 1]) : 0;
      console.log(`  ${key} 캡처…`);
      capturesByKey.set(key, await captureSegment(page, server.origin, t.route_id, t.seg, bearing));
    }
    await browser.close();
    server.close();
  } else {
    console.warn(chrome ? 'VITE_KAKAO_MAP_KEY 없음' : '크롬/엣지 실행 파일 못 찾음', '— 캡처 건너뜀(텍스트 근거만으로 해설)');
  }

  // ③ Gemini 해설
  if (!GEMINI) {
    console.warn('GEMINI_API_KEY 없음 — 해설 생성 건너뜀. 기존 segment_insights.json 보존.');
    return;
  }
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: GEMINI });

  const insights = [];
  for (const t of targets) {
    const key = `${t.route_id}-${t.seg.segment_no}`;
    const ex = evidences.get(key);
    const captures = capturesByKey.get(key) ?? [];
    const pl = t.seg.polyline;
    const bearing = pl.length >= 2 ? bearingDeg(pl[0], pl[pl.length - 1]) : 0;
    try {
      console.log(`  ${key} 해설 생성…`);
      const report = await callGemini(ai, {
        system: INSIGHT_SYSTEM,
        parts: [{ text: evidenceText(t.route, t.seg, ex, bearing) }, ...imageParts(captures)],
        schema: INSIGHT_SCHEMA,
        maxTokens: 8000,
        thinking: 2048,
      });
      insights.push({
        key,
        route_id: t.route_id,
        segment_no: t.seg.segment_no,
        address: ex.address,
        region: ex.region,
        pois: ex.pois,
        geometry: ex.geometry,
        speed: ex.speed,
        hours: ex.hours,
        captures,
        report,
      });
    } catch (err) {
      console.error(`  ${key} 해설 실패: ${err.message} — 이 구간만 건너뜀`);
    }
  }

  if (insights.length === 0) {
    console.error('생성된 해설 0개 — 기존 JSON 덮어쓰지 않음.');
    process.exitCode = 1;
    return;
  }

  // ④ 차주 리포트 — 전 구간을 한 프롬프트에(패턴을 묶어야 수칙이 3~5개로 준다), 로드뷰 1장씩만
  let driverReport = null;
  try {
    console.log('차주 배포용 리포트 생성…');
    const segmentKeys = insights.map((i) => i.key);
    const routeIds = [...new Set(insights.map((i) => i.route_id))];
    const parts = [];
    for (const ins of insights) {
      const t = targets.find((x) => `${x.route_id}-${x.seg.segment_no}` === ins.key);
      const pl = t.seg.polyline;
      parts.push({
        text:
          `=== 구간 ${ins.key} ===\n` +
          evidenceText(t.route, t.seg, evidences.get(ins.key), pl.length >= 2 ? bearingDeg(pl[0], pl[pl.length - 1]) : 0) +
          `\n[앞 단계 해설] ${ins.report.headline}\n원인 후보: ${ins.report.causes.map((c) => c.factor).join(' / ')}\n현장 관찰: ${ins.report.visual_notes}`,
      });
      parts.push(...imageParts(ins.captures.filter((c) => c.endsWith('_roadview.jpg'))));
    }
    driverReport = await callGemini(ai, {
      system: DRIVER_SYSTEM,
      parts,
      schema: driverReportSchema(segmentKeys, routeIds),
      maxTokens: 16000,
      thinking: 4096,
    });
  } catch (err) {
    console.error(`차주 리포트 실패: ${err.message} — 구간 해설만 저장`);
  }

  const bundle = {
    meta: {
      generated_from: ['public/data/corridor.json', '카카오 로컬 REST(주소·시설)', 'files2/dtg_track.csv·event.csv(속도·시간대)', '카카오맵 캡처 3종'],
      note: '위험 판정·순위·발생률은 전부 실측 통계다. Gemini는 그 결과가 나온 자리의 도로 환경만 해설하며, 새 점수·등급·확률을 만들지 않는다.',
      model: MODEL,
      generated_at: new Date().toISOString().slice(0, 10),
      segment_count: insights.length,
    },
    insights,
    driver_report: driverReport,
  };

  // 반말 스캔 (§9)
  const hits = scanBanmal({ insights: insights.map((i) => i.report), driver_report: driverReport });
  if (hits.length > 0) {
    console.warn(`⚠ 평서형 종결 ${hits.length}건 검출:`);
    hits.slice(0, 10).forEach((h) => console.warn(`  ${h}`));
  } else {
    console.log('반말 스캔 통과 (평서형 종결 0건)');
  }

  writeJson(OUT_PATH, bundle);
  console.log(`→ ${OUT_PATH} (구간 ${insights.length}개, 차주 리포트 ${driverReport ? '포함' : '없음'})`);
}

main();
