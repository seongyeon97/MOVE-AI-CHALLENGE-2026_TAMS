# 위험구간 히트맵 + AI 도로환경 해설 — 타 프로젝트 이식용 프롬프트

> 아래 전체를 다른 프로젝트의 코딩 에이전트에게 그대로 붙여넣으면 된다.
> `[[ ]]` 로 감싼 부분만 그 프로젝트 사정에 맞게 채운 뒤 전달할 것.

---

## 0. 배경 — 무엇을 만드는가

차량 운행 기록(DTG/디지털 운행기록계)에서 **"이 노선 중 어디가 특히 위험한가"** 를 통계로
집계하고, 그 판정 근거와 도로환경 해설을 화면에 펼치는 기능 일체를 이식한다.
원본 구현은 화물 운송 안전 플랫폼(React + TypeScript + Vite + 카카오맵 JS SDK)에 있고,
아래 4개 산출물로 구성된다.

| # | 산출물 | 성격 | 실행 시점 |
|---|--------|------|-----------|
| A | 구간 집계 데이터 (`corridor.json`) | 결정론적 통계. AI 미개입 | 빌드 타임(오프라인) |
| B | 구간별 AI 도로환경 해설 + 차주 리포트 (`segment_insights.json` + 캡처 이미지) | 멀티모달 LLM 추론 | 빌드 타임(수동, API 키 필요) |
| C | 회사 리포트 UI (지도 + 순위 목록 + 판정 근거 카드 + AI 해설 카드) | 화면 | 런타임 |
| D | 차주 배포용 리포트 UI (전체 구간 한 장 안내문) | 화면 | 런타임 |

**핵심 설계 원칙 4가지 — 이걸 어기면 이식 실패다:**

1. **위험 판정은 100% 결정론적 통계다. AI는 판정에 절대 개입하지 않는다.**
   LLM은 "이미 확정된 위험 구간의 도로가 어떻게 생겼는지"만 설명한다.
   LLM 응답 스키마에 **숫자 필드를 단 하나도 두지 않는 것**으로 이걸 코드 레벨에서 강제한다.
   (근거 없는 AI 점수는 심사·감사에서 방어 불가능하다. 이게 원본 프로젝트 1차 실패 지점이었다.)
2. **네트워크·API 호출은 전부 빌드 타임.** 런타임에는 커밋된 정적 JSON만 읽는다.
   발표장/데모 환경 wifi를 신뢰하지 않으며, 브라우저 번들에 API 키를 넣지 않기 위함이다.
3. **이벤트 좌표를 쓰지 않는다.** 대신 누적 주행거리 기반 **선형 참조(linear referencing)** 로
   위치를 복원한다 (§2 참조). 단말이 위치를 드문드문 보고해도 정확도가 유지된다.
4. **등급은 절대 임계값이 아니라 상대 순위다.** 그리고 그 사실을 화면에서 숨기지 않는다.

---

## 1. 사전 요구 — 이 데이터가 있어야 이식 가능

이식 대상 프로젝트에 아래 4종이 없으면 §2의 선형 참조를 쓸 수 없다.
**없으면 먼저 나에게 무엇이 있는지 알려 달라 — 대체 전략을 다시 짜야 한다.**

| 필요한 것 | 원본에서의 이름 | 필수 컬럼 |
|-----------|----------------|-----------|
| 운행(trip)/구간(leg) 목록 | `leg.csv` | `trip_id`, `leg_no`, `direction`(왕복 방향 OUT/IN) |
| 위험운전 이벤트 | `event.csv` | `trip_id`, `leg_no`, `occurred_at`(타임스탬프), `event_type`(급가속/급감속/급출발/급정지 등) |
| 주행 궤적 | `dtg_track.csv` | `trip_id`, `leg_no`, `ts`, `odo_km`(누적 주행거리), `speed_kmh`, (선택) `lat`/`lon` |
| 노선 기준선 폴리라인 | `routes.json` / 길찾기 API 결과 | 노선별 `[[lat, lon], …]` |

추가 조건:
- **노선이 고정된 왕복 구간**이어야 한다("어디를 지나는지는 이미 알고, 몇 km 지점인지만 모른다").
  자유 경로 배송이면 이 방식을 못 쓴다 — 그 경우 좌표 기반 그리드 집계로 바꿔야 하니 미리 말해 달라.
- **데이터 신뢰도 필터**가 있으면 반드시 쓴다. 원본은 `certificates.json`의 `verifiable`
  플래그(= 센서 과민/침묵 아닌 정상 단말 차량)로 걸렀다. 이유는 §2-0.

---

## 2. A 산출물 — 구간 집계 스크립트

원본: `app/scripts/build-corridor-hotspots.mjs` → `src/data/corridor.json`
**기본 빌드 파이프라인에 포함시킨다**(네트워크 불필요, 로컬 CSV만 읽음).

### 2-0. 신뢰도 필터 (먼저)

```js
const trusted = certs.certificates.filter((c) => c.verifiable);
const trustedTripIds = new Set(trusted.map((c) => c.trip_id));
```

> **왜:** 신뢰등급 불문 이벤트를 다 넣으면 "핫스팟"이 아니라 *센서 이상 차량이 많이 지나간
> 자리*가 위험구간으로 잡힌다. 검증 안 된 이벤트에 벌점을 주지 않는다.

### 2-1. 구간 뼈대 — 노선 기준선을 1km 단위로 슬라이싱

```js
const BIN_KM = 1;          // 구간 폭
const ROSE_TOP_N = 3;      // 위험 등급 개수 (전체 기준, 노선별 아님)
const AMBER_TOP_N = 5;     // 주의 등급 개수
```

노선마다 기준선 폴리라인(가능하면 길찾기 API의 실제 도로 경로, 없으면 OUT 방향 GPS 궤적)을
잡고 하버사인으로 누적거리 배열 `km[]`을 만든 뒤, `ceil(totalKm / BIN_KM)` 개 bin으로 자른다.
각 bin은 `{ segment_no, centroid, polyline, km_from, km_to, event_count: 0, events_by_type: {} }`.

- `centroid` = 기준선 위 `(km_from+km_to)/2` 지점을 **폴리라인 정점 사이 보간**으로 구함
  → 항상 도로 위에 찍힌다.
- `polyline` = 기준선에서 `[km_from, km_to]` 구간만 잘라낸 좌표 배열
  → 지도에서 양호 구간을 점이 아니라 도로를 따라가는 옅은 선으로 그리는 데 쓴다.

```js
/** 기준선 위 임의의 km 지점을 좌표로 보간 */
function pointAtKm(ref, km, targetKm) {
  const last = km.length - 1;
  if (targetKm <= km[0]) return ref[0];
  if (targetKm >= km[last]) return ref[last];
  let i = 0;
  while (i < last && km[i + 1] < targetKm) i += 1;
  const span = km[i + 1] - km[i];
  const frac = span > 0 ? (targetKm - km[i]) / span : 0;
  return [
    ref[i][0] + frac * (ref[i + 1][0] - ref[i][0]),
    ref[i][1] + frac * (ref[i + 1][1] - ref[i][1]),
  ];
}
```

### 2-2. 선형 참조 — 이벤트를 구간에 배정 ★핵심★

**문제:** 법정 DTG는 초 단위로 단말에 기록되지만 관제 서버로는 통신비 때문에 2분 간격으로만
전송된다. 즉 이벤트가 물고 있는 `(lat, lon)`은 "가장 최근 수신 좌표"일 뿐 실제 발생 지점이
아니다. 그대로 지도에 찍으면 이벤트가 도로 밖으로 새거나 앞뒤로 밀린다.

**해법:** 좌표 대신 **거리**로 위치를 추적한다.

```js
/** occurred_at 시각의 누적주행거리를 두 궤적 점 사이 시간 비례로 복원 */
function interpolateOdo(track, eventEpoch) {
  if (track.length === 0) return null;
  if (eventEpoch <= track[0].t) return track[0].odo;
  const last = track.length - 1;
  if (eventEpoch >= track[last].t) return track[last].odo;
  let i = 0;
  while (i < last && track[i + 1].t < eventEpoch) i += 1;
  const span = track[i + 1].t - track[i].t;
  const frac = span > 0 ? (eventEpoch - track[i].t) / span : 0;
  return track[i].odo + frac * (track[i + 1].odo - track[i].odo);
}
```

배정 루프:

```js
for (const e of events) {
  const route = byRoute.get(routeIdByTrip.get(e.trip_id));
  if (!route) continue;

  const legKey = `${e.trip_id}|${e.leg_no}`;
  const odoInLeg = interpolateOdo(trackByLeg.get(legKey) ?? [], toEpoch(e.occurred_at));
  if (odoInLeg == null) { skippedNoTrack += 1; continue; }

  // 왕복이 같은 도로 → IN(복귀) 방향은 거리를 뒤집어 노선 기점 기준으로 환산
  const direction = legDirByKey.get(legKey) ?? 'OUT';
  const routeKmRaw = direction === 'IN' ? route.totalKm - odoInLeg : odoInLeg;
  const routeKm = Math.min(Math.max(routeKmRaw, 0), route.totalKm);

  const seg = route.segs[Math.min(Math.floor(routeKm / BIN_KM), route.segs.length - 1)];
  seg.event_count += 1;
  seg.events_by_type[e.event_type] = (seg.events_by_type[e.event_type] ?? 0) + 1;
  assigned += 1;
}
```

> 부수효과: 이벤트 원본 좌표를 한 번도 안 쓰므로 **단말이 좌표를 못 보낸 이벤트(lat=lon=0)도
> 정상 배정된다.**
> 궤적 CSV가 크면(원본 26만 행) 스트리밍으로 읽되 trusted trip만 메모리에 남길 것.

### 2-3. 발생률과 등급 — 상대 순위

```js
// 발생률 = 구간 이벤트 수 ÷ 그 노선의 verifiable 운행 건수
// 건수를 그대로 쓰면 통행 많은 노선이 자동으로 위험해 보인다.
const rate = trips > 0 ? seg.event_count / trips : 0;

flat.sort((a, b) => b.rate - a.rate);   // 전 노선 구간을 하나로 합쳐 정렬

const toneOf = (rank, rate) => {
  if (rate <= 0) return 'ok';
  if (rank < ROSE_TOP_N) return 'dead';                      // 위험
  if (rank < ROSE_TOP_N + AMBER_TOP_N) return 'warn';        // 주의
  return 'ok';                                               // 양호
};
```

**"몇 건 이상이면 위험"이라는 고정 기준선을 두지 않는다.** 절대 임계값은 데이터셋이 바뀌면
근거를 잃는다. 대신 전 구간을 줄 세워 상위 N개를 자르고, **그 사실 자체를 화면에 노출한다**(§4-2).

### 2-4. 판정 근거 공개용 통계 (`meta.criteria`)

등급이 상대 순위이므로, 컷 값과 비교 기준이 없으면 화면에서 판정을 설명할 수 없다.
집계 단계에서 같이 굽는다:

```js
const rates = flat.map((f) => f.rate).sort((a, b) => a - b);
const criteria = {
  total_segments: flat.length,
  segments_with_events: flat.filter((f) => f.seg.event_count > 0).length,
  dead_min_rate: r2(flat[ROSE_TOP_N - 1]?.rate ?? 0),                 // 위험 컷
  warn_min_rate: r2(flat[ROSE_TOP_N + AMBER_TOP_N - 1]?.rate ?? 0),   // 주의 컷
  rate_mean: r2(mean),
  rate_median: r2(median),
  rate_max: r2(rates[rates.length - 1] ?? 0),
  verifiable_trips: [...tripCountByRoute.values()].reduce((s, v) => s + v, 0),
};
```

### 2-5. 출력 스키마 (`corridor.json`)

```jsonc
{
  "meta": {
    "generated_from": ["…근거 데이터 목록…"],
    "note": "신뢰등급 정상 차량 이벤트만 집계. 이벤트 좌표를 쓰지 않고 선형 참조로 km 위치를 복원한다.",
    "bin_km": 1,
    "rose_top_n": 3,
    "amber_top_n": 5,
    "events_assigned": 3860,
    "events_skipped_no_track": 0,
    "criteria": { /* §2-4 */ }
  },
  "routes": [{
    "route_id": "R02",
    "route_name": "부산신항 — 광주 IHL",
    "trips": 9,                       // verifiable 운행 건수 = 발생률 분모
    "segments": [{
      "segment_no": 1,
      "centroid": [35.0812, 128.8123],
      "polyline": [[35.08, 128.81], …],
      "km_from": 0, "km_to": 1,
      "event_count": 74,
      "events_by_type": { "급가속": 32, "급감속": 32, "급출발": 6, "급정지": 4 },
      "rate_per_trip": 8.22,
      "rank_global": 0,               // 0-based 전역 순위
      "tone": "dead",                 // dead | warn | ok
      "grade_label": "위험",           // 위험 | 주의 | 양호
      "dominant_type": "급가속"
    }]
  }]
}
```

---

## 3. B 산출물 — AI 도로환경 해설 생성 스크립트

원본: `app/scripts/build-segment-insights.mjs` → `src/data/segment_insights.json` +
`public/segment_captures/*.jpg`

**기본 빌드 파이프라인에 넣지 않는다.** API 키 3종·네트워크·헤드리스 크롬이 필요해서,
키 없는 환경에서 일반 빌드가 깨지면 안 된다. `npm run build:data:insights` 로 수동 실행하고
**결과 JSON과 캡처 이미지는 커밋한다.**

필요 키:
- `KAKAO_REST_API_KEY` — 역지오코딩·주변 시설 검색 (지도 제공사에 맞게 교체 가능)
- `VITE_KAKAO_MAP_KEY` — 지도/위성/로드뷰 캡처용 JS SDK 키
- `GEMINI_API_KEY` — 해설 생성

> **키 로딩 주의:** `app/.env` 가 `process.env` 를 이기게 할 것. 셸에 남은 낡은 키가 `.env` 의
> 정상 키를 조용히 가리는 사고를 겪었다. `loadEnv()` 결과를 우선하고 없을 때만 `process.env` fallback.

### 3-1. 대상 추리기

`tone`이 `warn`/`dead`인 구간만. 양호까지 부르면 호출 수백 건에 할 말도 없다.

### 3-2. 실측 근거 수집 (LLM에 넣을 재료 — 전부 사실)

| 근거 | 출처 | 비고 |
|------|------|------|
| 주소 / 행정구역 | 역지오코딩 REST | 고속도로 본선은 주소가 안 나옴 → 행정구역이 fallback |
| 반경 2km 주요 시설 | 키워드 검색 REST | `['IC','분기점','요금소','터널','휴게소','교차로','교량']` 각각 검색 후 거리순 12개 |
| 도로 형상 | 폴리라인만으로 계산 | 아래 참조 |
| 구간 실측 속도 | `dtg_track.csv` + **§2-2와 동일한 선형 참조** | 평균/최고/최저/표준편차 |
| 이벤트 시간대 분포 | `event.csv` + 동일 선형 참조 | 상위 3개 시간대 |
| 지도·위성·로드뷰 이미지 | 헤드리스 캡처 (§3-3) | 멀티모달 입력 |

```js
/** 누적 방위 변화량이 크면 굽은 길, 0에 가까우면 직선. 최대 단일 꺾임은 램프·분기를 잡아낸다. */
function geometryOf(polyline) {
  if (polyline.length < 3) return { total_turn_deg: 0, max_turn_deg: 0, shape: '직선' };
  let total = 0, max = 0;
  for (let i = 1; i < polyline.length - 1; i += 1) {
    let d = Math.abs(bearing(polyline[i], polyline[i + 1]) - bearing(polyline[i - 1], polyline[i]));
    if (d > 180) d = 360 - d;
    total += d;
    if (d > max) max = d;
  }
  const shape = total > 90 ? '급곡선 연속' : total > 40 ? '완만한 곡선' : '거의 직선';
  return { total_turn_deg: Math.round(total), max_turn_deg: Math.round(max), shape };
}
```

> ⚠️ 속도·시간대 집계는 **반드시 §2-2와 같은 선형 참조 방식**을 써야 한다. 그래야
> "이 구간 평균속도"와 "이 구간 이벤트 수"가 같은 자리를 가리킨다.

### 3-3. 헤드리스 지도/위성/로드뷰 캡처

**카카오는 로드뷰 정적 이미지 REST API가 없다.** JS SDK로 실제 렌더한 화면을 찍는 것이 유일한
방법이다. (Google/Naver 등 다른 지도로 이식할 경우 Static Map API가 있으면 지도·위성은 그걸
쓰고, 스트리트뷰만 이 방식을 쓰면 된다.)

구현 3요소:

1. **전용 캡처 페이지** `public/__segment-capture.html`
   - 앱 라우팅과 무관한 독립 정적 HTML. 어떤 화면도 이 파일을 부르지 않는다(`__` 접두사가 표식).
   - 쿼리 파라미터: `key`(SDK 키) / `mode`(`map`|`sky`|`roadview`) / `lat` / `lon` /
     `pan`(로드뷰 시선 방위각) / `path`(`"lat,lon;lat,lon;…"` 구간 폴리라인)
   - `map`/`sky`: 폴리라인을 굵은 빨간 선으로 얹고 `map.setBounds(bounds, 120,120,120,120)`.
     **여백을 크게 준다** — 구간만 꽉 채우면 앞뒤 도로 맥락(진입 IC·분기)이 잘려 판단 불가.
     `tilesloaded` 이벤트 후 350ms 대기하고 찍어야 회색 화면이 안 나온다. 6초 안전망 타이머 필수.
   - `roadview`: `getNearestPanoId`를 **반경 50→150→400→1000m로 넓혀가며 재시도**
     (고속도로 본선은 촬영점이 드물다). `init` 이벤트에서 `setViewpoint({pan, tilt:0, zoom:0})`
     로 진행 방향을 보게 세우고 900ms 후 완료. 15초 타임아웃.
   - 완료 신호: `window.__capture = { state: 'ready'|'nopano'|'error', … }`

2. **로컬 서버** — 지도 SDK는 등록된 도메인에서만 동작하므로 반드시 `localhost`로 연다.
   이미 개발 서버(5173)가 떠 있으면 재사용하고, 없으면 이 HTML만 서빙하는 임시
   `node:http` 서버를 5173에 띄웠다 닫는다.

3. **헤드리스 브라우저** — `playwright` 대신 **`playwright-core` + 시스템에 설치된 크롬**을 쓴다
   (브라우저 수백 MB 다운로드 회피). 후보 경로를 순회해 존재하는 실행 파일을 찾고, 못 찾으면
   캡처를 건너뛰고 텍스트 근거만으로 해설한다(치명적 실패로 만들지 않는다).

```js
const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
```

```js
// 완료 신호를 폴링해 기다렸다가 찍는다
const state = await page.evaluate(() => new Promise((resolve) => {
  const tick = setInterval(() => {
    if (window.__capture) { clearInterval(tick); resolve(window.__capture.state); }
  }, 100);
}));
if (state !== 'ready') { /* 스킵 */ }
await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
```

**캐시 필수**: 파일이 이미 있으면 건너뛰고, `--force` 플래그로만 재촬영.
파일명은 `{route_id}_{segment_no}_{map|sky|roadview}.jpg`. viewport 1000×700.

### 3-4. Gemini 호출 — 구간별 해설

모델: `gemini-3.6-flash`, SDK: `@google/genai`.

**문체 규칙을 상수로 뽑아 모든 프롬프트와 스키마 필드 설명에 주입한다.** 이 리포트는 사내
담당자와 차주가 그대로 받아 보는 문서라서, 반말·평서형 종결이 섞이면 배포 문서로 못 쓴다.

```js
const STYLE_RULE = `모든 문장은 반드시 존댓말(합니다체)로 씁니다. "~이다", "~한다", "~하라", "~해라" 같은 평서형·명령형 종결을 절대 쓰지 않습니다. 명사로 끝나는 개조식 문장도 쓰지 않고, 반드시 "~입니다", "~합니다", "~됩니다", "~하십시오"로 끝맺습니다.`;
```

시스템 프롬프트:

```
당신은 화물 운송 안전 분석가입니다. 이미 통계로 확정된 "위험운전 이벤트가 몰리는 1km 구간"에
대해, 그 자리의 도로 환경이 어떻게 생겼는지를 해설합니다.

지켜야 할 규칙:
- 위험도 점수·등급·순위·확률을 새로 만들지 않습니다. 위험 판정은 이미 끝났고 당신 몫이 아닙니다.
- 제공된 근거(주소, 주변 시설, 도로 형상, 속도 프로파일, 이벤트 구성, 첨부 이미지)에 없는
  사실을 지어내지 않습니다. 모르면 모른다고 씁니다.
- 사고를 예측하지 않습니다. "사고가 날 것입니다"가 아니라 "이런 도로 구조라 급감속이 잦을 수
  있습니다"로 말합니다.
- 급가속·급출발이 잦다면 정체 해소·합류 후 가속 구간을, 급감속·급정지가 잦다면 진출 램프·
  요금소·정체 꼬리를 우선 의심합니다.
- 실무자가 읽는 보고서 문체로 간결하게 씁니다.
- ${STYLE_RULE}
```

응답 스키마 — **숫자 필드가 하나도 없다는 게 요점이다:**

```js
const INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: '이 구간의 도로 환경을 한 문장(40자 이내)으로. 위험을 단정하지 말고 지형·시설 특징을 말할 것. 반드시 "~입니다"로 끝나는 존댓말.' },
    causes: {
      type: 'array',
      description: '이벤트가 몰리는 도로환경상 원인 후보 2~3개. 확신 순으로.',
      items: {
        type: 'object',
        properties: {
          factor:     { type: 'string', description: '원인 한 줄. 반드시 존댓말로 끝맺을 것.' },
          evidence:   { type: 'string', description: '왜 그렇게 보는지 — 반드시 제공된 근거만 인용할 것. 새 수치를 만들지 말 것.' },
          confidence: { type: 'string', enum: ['높음', '보통', '낮음'] },
        },
        required: ['factor', 'evidence', 'confidence'],
      },
    },
    driver_advice: { type: 'string', description: '이 구간을 지나는 기사에게 줄 운행 조언 한 문장. 일반론 말고 이 구간 특성에 맞게.' },
    visual_notes:  { type: 'string', description: '첨부된 지도·위성·로드뷰 이미지에서 실제로 보이는 것만 서술. 판독 불가면 그렇다고 쓸 것.' },
  },
  required: ['headline', 'causes', 'driver_advice', 'visual_notes'],
};
```

호출 설정: `responseMimeType: 'application/json'`, `responseSchema: INSIGHT_SCHEMA`,
`maxOutputTokens: 8000`, `thinkingConfig: { thinkingBudget: 2048 }`.

사용자 파트 = 근거 텍스트 + 이미지 3장(`inlineData` base64). 이미지 앞에는
`[첨부 이미지] 일반 지도(빨간 선이 해당 1km 구간)` 같은 라벨 텍스트를 반드시 붙일 것 —
모델이 무엇을 보고 있는지 알아야 `visual_notes`가 정확해진다.

근거 텍스트 포맷(줄 단위):

```
노선: {route_name}
구간: {km_from}~{km_to}km 지점 (노선 기점 기준 누적거리), 구간번호 {segment_no}
중심 좌표: {lat}, {lon}
주소: {address ?? '도로명 주소 없음(고속도로 본선 등)'}
행정구역: {region ?? '불명'}
통계 판정: {grade_label} · 전체 {rank_global}위 · verifiable 차량 기준 {rate_per_trip}건/trip · 누적 {event_count}건
주된 이벤트 유형: {dominant_type}
도로 형상: {shape} (누적 방위변화 {total_turn_deg}°, 최대 단일 꺾임 {max_turn_deg}°)
진행 방위각: {bearing}° (북=0, 시계방향)
구간 속도(DTG 실측 {samples}점): 평균 … · 최고 … · 최저 … · 표준편차 …
이벤트 시간대 상위: 14시 12건 · 9시 8건 · …
반경 2km 주요 시설: 이름(거리m), …
```

### 3-5. Gemini 호출 — 차주 배포용 리포트 (구간별 해설 다음에 1회)

**전 구간을 한 프롬프트에 넣는다.** 구간을 하나씩 부르면 노선을 가로질러 반복되는
패턴(예: 항만 진출입부 급가속)을 못 묶는다. 묶어야 수칙이 3~5개로 줄고, 그래야 차주가 읽는다.

이미지는 구간당 **로드뷰 1장씩만** 넣는다(지도·위성은 구간별 해설에서 이미 봤고, 여기서는
"차주가 실제로 보게 될 풍경"이 필요하다).

입력 = 구간별 근거 텍스트 + 앞 단계의 해설 결과(`headline` / 원인 후보 / 현장 관찰) + 로드뷰들.

시스템 프롬프트:

```
당신은 화물 운송사의 안전관리 담당자입니다. 실제 그 길을 운행하는 차주(기사)에게 나눠 줄
안전 운행 안내문을 작성합니다.

읽는 사람이 다릅니다:
- 이 문서는 사무실 분석 보고서가 아니라, 운행 전에 훑어보는 안내문입니다. 통계 용어·분석
  방법론을 늘어놓지 않습니다.
- 차주를 평가하거나 질책하지 않습니다. "당신이 난폭운전을 한다"가 아니라 "이 자리 도로가
  이렇게 생겨서 여기서 다들 급하게 밟게 됩니다"라는 태도로 씁니다.
- 사고를 예측하거나 위험 점수를 매기지 않습니다. 제공된 근거에 없는 사실을 지어내지 않습니다.
- 지시가 아니라 안내입니다. 명령조 대신 정중한 권유형을 씁니다.
- ${STYLE_RULE}
```

스키마 (역시 숫자 필드 0개). **`key`/`route_id`는 `enum`으로 묶어 모델이 없는 구간을 지어내지
못하게 막는다:**

```js
function driverReportSchema(segmentKeys, routeIds) {
  return {
    type: 'object',
    properties: {
      title: { type: 'string', description: '리포트 제목 한 줄. 차주가 받는 문서의 이름.' },
      intro: { type: 'string', description: '어떤 데이터로 만들어졌고 무엇에 쓰는 문서인지 2~3문장. 감시 목적이 아니라 안전 안내라는 점을 분명히 할 것.' },
      key_rules: {
        type: 'array',
        description: '노선 전체를 관통하는 핵심 운행 수칙 3~5개. 구간마다 따로 말하지 말고 반복되는 패턴을 묶을 것.',
        items: { type: 'object',
          properties: { rule: { type: 'string' }, why: { type: 'string' } },
          required: ['rule', 'why'] },
      },
      route_notes: {
        type: 'array', description: '노선별 총평. 제공된 노선 전부에 대해 하나씩.',
        items: { type: 'object',
          properties: { route_id: { type: 'string', enum: routeIds }, summary: { type: 'string' } },
          required: ['route_id', 'summary'] },
      },
      spots: {
        type: 'array', description: '제공된 구간 전부에 대해 하나씩. 빠뜨리지 말 것.',
        items: { type: 'object',
          properties: {
            key:            { type: 'string', enum: segmentKeys },
            nickname:       { type: 'string', description: '차주가 지도 없이도 어딘지 알 수 있는 이름 (예: "용원 물류단지 앞 교차로"). 주변 시설·주소에서 뽑을 것.' },
            when_to_watch:  { type: 'string', description: '언제·어디서 주의해야 하는지 한 문장.' },
            action:         { type: 'string', description: '구체적으로 무엇을 하면 되는지 한 문장.' },
          },
          required: ['key', 'nickname', 'when_to_watch', 'action'] },
      },
      closing: { type: 'string', description: '마무리 1~2문장. 평가·감시가 아니라 안전 확보용이라는 점과 현장 상황이 우선이라는 점을 짚을 것.' },
    },
    required: ['title', 'intro', 'key_rules', 'route_notes', 'spots', 'closing'],
  };
}
```

`maxOutputTokens: 16000`, `thinkingConfig: { thinkingBudget: 4096 }`.

### 3-6. 출력 스키마 (`segment_insights.json`)

```jsonc
{
  "meta": {
    "generated_from": ["…"],
    "note": "위험 판정·순위·발생률은 전부 실측 통계다. Gemini는 그 결과가 나온 자리의 도로 환경만 해설하며, 새 점수·등급·확률을 만들지 않는다.",
    "model": "gemini-3.6-flash",
    "generated_at": "2026-08-13",
    "segment_count": 8
  },
  "insights": [{
    "key": "R02-1", "route_id": "R02", "segment_no": 1,
    "address": "…", "region": "…",
    "pois": [{ "name": "…", "category": "…", "distance_m": 320 }],
    "geometry": { "total_turn_deg": 118, "max_turn_deg": 42, "shape": "급곡선 연속" },
    "speed": { "samples": 940, "mean_kmh": 38.2, "max_kmh": 82, "min_kmh": 0, "stdev_kmh": 19.4 },
    "hours": { "total": 74, "top_hours": [{ "hour": 14, "count": 12 }] },
    "captures": ["/segment_captures/R02_1_map.jpg", "…_sky.jpg", "…_roadview.jpg"],
    "report": { "headline": "…", "causes": [], "driver_advice": "…", "visual_notes": "…" }
  }],
  "driver_report": { "title": "…", "intro": "…", "key_rules": [], "route_notes": [], "spots": [], "closing": "…" }
}
```

**실패 내성:** 키가 없으면 해당 단계만 건너뛰고 나머지로 진행한다. Gemini 키가 없으면
`null`을 반환해 **기존 커밋된 JSON을 덮어쓰지 않는다.** 구간 하나가 실패해도 나머지는 계속.

---

## 4. C 산출물 — 회사 리포트 UI

한 화면 안에서 **탭 2개**로 회사용/차주용을 가른다(`role="tablist"` / `role="tab"` /
`aria-selected`). 차주용 데이터(`driver_report`)가 없으면 탭 자체를 숨긴다 — 빈 껍데기 금지.

레이아웃 (회사 탭):

```
[헤더 — 전체 N개 구간 중 M개 주의·위험]
[탭: 회사 리포트 | 차주 배포용 리포트]
[지도(1fr)  |  구간 순위 목록(360px, 스크롤)]     ← 목록 항목 클릭 = 선택 토글
[판정 근거 카드 — SegmentVerdictCard]              ← 계산. 먼저 온다
[로드뷰(420px) | AI 도로환경 해설 카드]            ← 추론. 나중에 온다
[각주 — 집계 방식 고지]
```

> **순서가 곧 신뢰의 순서다.** 결정론적 계산을 먼저 보여주고 AI 추론을 뒤에 둔다.

### 4-1. 지도 표현

- **양호 구간**: 구간 폴리라인을 따라가는 **옅은 선**(밀도 표현)
- **주의·위험 구간**: 눈에 띄는 **점/마커** + 등급색
- 구간 선택 시 해당 `centroid`로 지도 포커스 이동, 다시 누르면 전체 보기 복귀
- 지도 SDK 로드 실패(키 없음/네트워크/도메인 미등록) 시 **오프라인 SVG 지도로 자동 폴백**

### 4-2. 판정 근거 카드 (`SegmentVerdictCard`) ★가장 중요★

AI 해설 카드와 역할이 정반대다. 저쪽은 **추론**, 이쪽은 **계산**이다.
배지도 대비시킨다: 이 카드는 `실측 통계 · AI 미개입`, AI 카드는 `AI 추론 · 현장 검증 안 됨`.

2열 그리드, 섹션 6개:

| 섹션 | 내용 |
|------|------|
| ① 무엇을 셌나 — 집계 대상 | 신뢰등급 필터를 쓴 이유를 한 문단으로. 그다음 정의목록으로 `이 구간 이벤트 N건` / `분모 — 이 노선 verifiable 운행 M건` / `구간 길이 1km (a~b km 지점)` |
| ② 이벤트를 이 구간에 어떻게 배정했나 — 선형 참조 | "단말은 2분 간격으로만 위치를 보고합니다. 그래서 이벤트가 들고 있는 GPS 좌표는 '가장 최근 수신 지점'일 뿐입니다. **이 집계는 이벤트 좌표를 쓰지 않습니다.**" + 1·2·3 번호 단계 설명 |
| ③ 발생률 산식 | 박스 안에 `발생률 = 구간 이벤트 수 ÷ 노선 verifiable 운행 건수` 그리고 **실제 값을 대입한 식**을 큰 글씨로: `74 ÷ 9 = 8.22 건/trip`. 아래에 "왜 건수를 그대로 안 쓰는가" 한 줄 |
| ④ 등급은 어떻게 갈렸나 — 상대 순위 | "고정 기준선은 쓰지 않습니다. 전체 N개 구간을 발생률 내림차순으로 줄 세운 뒤 상위 3개를 위험, 그다음 5개를 주의로 봅니다." + `이 구간 1위 / 352구간 → 위험` + **분포 바** + `평균의 17.9배 · 중앙값의 25.7배` |
| 이벤트 구성 | 유형별 가로 막대(`events_by_type` / 최댓값으로 정규화) + 건수 |
| 한계 | "등급은 이 N개 노선 안에서의 상대 순위이므로 노선이 바뀌면 컷도 바뀝니다. 궤적이 10초 간격이라 1km 구간 내부의 정확한 지점까지는 특정하지 못합니다. 전체 X건 배정, 궤적 미매칭 제외 Y건." |

**분포 바** — 판정을 눈으로 확인시키는 장치:

```tsx
const max = criteria.rate_max || 1;
const pct = (v) => `${Math.min(100, (v / max) * 100)}%`;
// 채움 = 이 구간 발생률, 세로 실선 2개 = 주의 컷 / 위험 컷 위치
// 하단 눈금: 0 · 주의 컷 {warn_min_rate} · 위험 컷 {dead_min_rate} · 최고 {rate_max}
```

### 4-3. AI 해설 카드 (`SegmentInsightCard`)

3요소를 **항상 함께** 띄운다. 하나라도 빼면 근거 없는 AI 판정문이 된다:

1. 헤더의 `AI 추론 · 현장 검증 안 됨` 배지
2. 각 원인에 붙는 `evidence` 문장과 `근거 높음/보통/낮음` 배지
3. **모델이 실제로 본 화면** — 캡처 3장 썸네일(클릭 시 전체화면 확대) + `visual_notes`

그 아래 "해설에 사용한 실측 근거" 정의목록(속도·도로 형상·시간대·주변 시설)과,
"위 문장은 도로환경 해설이며 사고 발생을 예측하거나 새 위험 점수를 매기지 않습니다" 고지.

> ⚠️ 확신도 배지에 **등급 색(teal/amber/rose)을 쓰지 말 것.** 그 색은 데이터 신뢰등급 전용이고,
> 여기 쓰면 "AI 확신도 = 신뢰등급"으로 읽힌다.

---

## 5. D 산출물 — 차주 배포용 리포트 UI (`DriverBriefing`)

구간 선택이 없다. **주의·위험 구간 전체가 노선 순서 → 주행 거리 순서로 한 번에 펼쳐진다** —
그대로 인쇄해 나눠 줄 수 있는 문서 형태.

```
[헤더 — 제목 + intro + 'AI 작성 · 현장 검증 안 됨' 배지]
[핵심 수칙 — 2열 그리드, 01/02/03 번호 + 수칙 + why]
[노선별 섹션] × N
   노선명 + '주의·위험 K개 지점' + route_notes.summary
   [SpotCard] × K   ← km_from 오름차순
[마무리 closing + 데이터 출처·한계 고지]
```

**`SpotCard` 구성:**

```
[로드뷰 | 지도 | 위성]   ← 3열 그리드, 전부 같은 크기(aspect 4/3). 캡션 각각.
[별명 + a~b km 지점]
[언제 → when_to_watch]
[어떻게 → action]        ← 굵게
[주소 · 도로 형상 · 실측 평균 속도 · 가장 많은 이벤트 유형]
```

> ⚠️ **로드뷰만 크게 넣지 말 것.** 지혼자 튀어 균형이 깨진다. 세 장을 같은 크기로 나란히 두고
> 텍스트는 그 아래 전체 폭을 쓴다. 이미지 없는 종류는 "이미지 없음" 자리표시자로 자리를 지킨다.

문서 폭은 `max-w-[1080px] mx-auto` 로 제한한다 — 나눠 주는 문서라 한 줄이 길면 안 읽힌다.
설명 문단은 `max-w-[70ch]`.

---

## 6. 타입 정의 (TypeScript)

```ts
export interface CorridorSegment {
  segment_no: number;
  centroid: [number, number];
  polyline: [number, number][];
  km_from: number;
  km_to: number;
  event_count: number;
  /** 유형별 내역 — 판정 근거 화면이 "무엇이 몰렸나"를 보여줄 때 쓴다 */
  events_by_type: Partial<Record<EventType, number>>;
  rate_per_trip: number;
  rank_global: number;
  tone: 'ok' | 'warn' | 'dead';
  grade_label: string;
  dominant_type: EventType | null;
}

export interface CorridorRoute {
  route_id: string;
  route_name: string;
  trips: number;
  segments: CorridorSegment[];
}

export interface CorridorBundle {
  meta: {
    bin_km: number;
    rose_top_n: number;
    amber_top_n: number;
    events_assigned: number;
    events_skipped_no_track: number;
    /**
     * 등급 판정 산식을 화면에서 그대로 재현하기 위한 값.
     * 등급은 절대 임계값이 아니라 전 구간 발생률 순위의 상위 N개로 정해진다 —
     * 컷 값과 비교 기준이 함께 있어야 "왜 이 구간인가"를 설명할 수 있다.
     */
    criteria: {
      total_segments: number;
      segments_with_events: number;
      dead_min_rate: number;
      warn_min_rate: number;
      rate_mean: number;
      rate_median: number;
      rate_max: number;
      verifiable_trips: number;
    };
  };
  routes: CorridorRoute[];
}

export interface SegmentInsight {
  key: string;
  route_id: string;
  segment_no: number;
  address: string | null;
  region: string | null;
  pois: { name: string; category: string; distance_m: number }[];
  geometry: { total_turn_deg: number; max_turn_deg: number; shape: string };
  speed: { samples: number; mean_kmh: number; max_kmh: number; min_kmh: number; stdev_kmh: number } | null;
  hours: { total: number; top_hours: { hour: number; count: number }[] } | null;
  captures: string[];
  report: {
    headline: string;
    causes: { factor: string; evidence: string; confidence: '높음' | '보통' | '낮음' }[];
    driver_advice: string;
    visual_notes: string;
  };
}

export interface DriverReport {
  title: string;
  intro: string;
  key_rules: { rule: string; why: string }[];
  route_notes: { route_id: string; summary: string }[];
  spots: { key: string; nickname: string; when_to_watch: string; action: string }[];
  closing: string;
}

export interface SegmentInsightBundle {
  meta: { model: string; generated_at: string; segment_count: number; note: string };
  insights: SegmentInsight[];
  driver_report: DriverReport | null;
}
```

구간 키 규약: 조회용 `` `${route_id}-${segment_no}` ``, 파일명용 `` `${route_id}_${segment_no}` ``.

---

## 7. package.json 스크립트

```jsonc
{
  "build:data": "… && node scripts/build-corridor-hotspots.mjs",   // 기본 파이프라인 포함
  "//build:data:insights": "수동 실행 전용 — build:data 파이프라인에 안 낀다. KAKAO_REST_API_KEY·VITE_KAKAO_MAP_KEY·GEMINI_API_KEY 필요. 결과 src/data/segment_insights.json + public/segment_captures/*.jpg 는 커밋 대상. 캡처 재촬영은 --force.",
  "build:data:insights": "node scripts/build-segment-insights.mjs"
}
```

의존성: `playwright-core`, `@google/genai` (둘 다 **devDependency** — 런타임 번들에 안 들어간다).

---

## 8. 이식 순서 (권장)

1. §1 사전 요구 데이터가 있는지 확인. 없으면 **먼저 보고할 것.**
2. A(집계 스크립트) 구현 → `corridor.json` 생성 → 콘솔에 노선별 최고위험 구간 출력으로 눈검사.
3. C의 지도 + 순위 목록 + **판정 근거 카드**까지 구현. 여기까지가 **AI 없이 완결되는 기능**이다.
   이 상태로 이미 방어 가능한 제품이어야 한다.
4. B(AI 해설 스크립트) 구현. 캡처 → 근거 수집 → Gemini 순으로 단계별 검증.
5. C의 AI 해설 카드 + D(차주 리포트) 구현.
6. 검증 (§9).

---

## 9. 검증 체크리스트

- [ ] 타입 체크 / 린트 / 프로덕션 빌드 통과
- [ ] `corridor.json`: `events_skipped_no_track`이 비정상적으로 크지 않은가(궤적 매칭 실패율)
- [ ] `meta.criteria.dead_min_rate ≥ warn_min_rate` 이고, 실제 `tone` 분포가 `rose_top_n`/`amber_top_n`과 일치하는가
- [ ] 지도에서 구간 폴리라인이 **도로 위에** 있는가(보간 검증)
- [ ] **브라우저로 실제 클릭해서 확인**: 구간 선택 → 판정 근거 카드가 로드뷰보다 위에 뜨고,
      ①~④ 섹션 + 분포 바 + 이벤트 구성 + 한계 각주가 전부 렌더되는가. 스크린샷 찍어 눈으로 볼 것.
- [ ] 차주 리포트: 로드뷰/지도/위성 3장 크기가 균등한가, 문서 폭이 과하게 넓지 않은가
- [ ] **반말 스캔**: 생성된 JSON 전체에서 `~이다/~한다/~하라/~된다/~있다/~없다/~보인다` 등
      평서형 종결이 0건인가 (자동 스캔 스크립트로 확인)
- [ ] 지도 SDK 키를 지우고도 앱이 폴백으로 뜨는가(오프라인 내성)
- [ ] `segment_insights.json`을 지우고도 화면이 깨지지 않고 해당 카드/탭만 숨는가

---

## 10. 절대 하지 말 것

- ❌ LLM 응답 스키마에 숫자 필드(점수·확률·등급값) 추가
- ❌ 런타임(브라우저)에서 LLM/지도 REST API 호출
- ❌ 브라우저 번들에 REST 키·Gemini 키 노출
- ❌ AI 생성 문장을 출처 표기(`AI 추론 · 현장 검증 안 됨`) 없이 노출
- ❌ 등급을 절대 임계값으로 바꾸면서 "상대 순위"라는 설명만 그대로 두기(설명과 산식 불일치)
- ❌ 이벤트 원본 GPS 좌표로 집계 회귀
- ❌ AI 해설을 기본 빌드 파이프라인에 넣어 키 없는 환경에서 빌드 실패시키기
- ❌ 확신도/AI 관련 UI에 데이터 신뢰등급 색 재사용
