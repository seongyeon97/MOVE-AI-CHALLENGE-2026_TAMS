# BUILD_SEQUENCE **v2** — 0에서 재구현 프롬프트 목록

> 순서 = 우선순위 내림차순. 시간 부족하면 **뒤에서부터** 자른다. 각 단계 완료 판정 기준을 통과해야 다음으로.
> `docs/PRD.md`(v2)를 옆에 열어두고 참조 — 여기 프롬프트는 PRD 각 장(§) 요약 인용이고, **전체 수식·스키마는 PRD가 원본**이다.
> `CLAUDE.md`의 금지 목록을 먼저 읽어라. GPT 계열 도구는 자동으로 안 읽으므로 프롬프트 앞에 붙여라.

---

## 0. 데이터 파이프라인 (불가 — 자르면 전부 무너짐)

**프롬프트 원문:**
> `files2/` CSV 7개(vehicle_master, daily_summary, trip, leg, event, dtg_track, _truth) 있다. `app/scripts/lib/csv.mjs`부터 만들어라: `readCsv`/`streamCsv`/`writeJson`/`num` 유틸, `_truth.csv`는 파일명 정규식(`/_?truth\.csv$/i`)으로 읽기 자체를 차단(`FORBIDDEN` 가드). 그 다음 `app/scripts/lib/constants.mjs`에 물리 상수를 박아라 — IDLE_L_PER_HOUR=2.4, CO2_KG_PER_L=2.606, BASELINE_G_CO2_PER_TONKM=62.0, CONTINUOUS_DRIVE_LIMIT_SEC=14400, FUEL_PENALTY_MAX=0.12, FUEL_PENALTY_RATE_SCALE=0.3, FAINT_RATIO_THRESHOLD=0.6, RANK_INVERSION_MIN=2, LADEN_FACTOR=0.78, EMPTY_FACTOR=1.08, 그리고 GRADE_META(정상/A/B/C/D 각각 label/tone/verifiable/settle/verdict). **FUEL_KMPL_EMPTY·FUEL_KMPL_LADEN 상수는 만들지 마라 — v2에서 삭제됐고 트랙1의 조회 결과로 대체된다.** 그 다음 `app/scripts/build-vehicles.mjs` — PRD §5.1~5.3 그대로: 발생률 계산 → if/else 순서(D→A→C→B→정상) → 연료 교차검증 → vehicles.json 출력. 마지막 `build-certificates.mjs`(trip/leg/event.csv 조합, CO2 계산, continuous 블록 분리) + `build-all.mjs`(오케스트레이션).

**완료 판정 기준:**
- `npm run build:data` 1회로 `vehicles.json`, `certificates.json` 생성
- 10대 각각 grade가 정상/A/B/C/D 중 하나, D는 `reported_km===0`인 차량에만
- `_truth.csv`를 import하는 코드가 저장소 어디에도 없음(grep 확인)
- 등급별 tone 매핑이 `GRADE_META` 한 곳에서만 나옴

**소요:** 60~90분 · **커밋:** `feat: add data pipeline — CSV ingest, grade judgment, fuel cross-check`

---

## 1. 기준연비 조회 ★ v2 신규 (불가 — Safe가 이걸 전제)

**프롬프트 원문:**
> `app/scripts/lib/baselineFuel.mjs`를 만들어라. PRD §4 그대로 3계층 폴백이다.
>
> ① `vehicle_master.csv`의 `registered_kmpl`(자동차등록증 공인연비)이 있으면 그걸 쓰고 `source:'registration', trust:'A'`.
> ② 없으면 공공데이터포털 한국에너지공단 자동차 표시연비 API를 `maker`·`model`·`year`로 조회해 복합연비를 쓰고 `source:'public_api', trust:'A'`. serviceKey는 `process.env.DATA_GO_KR_KEY`.
> ③ 그것도 없으면 Gemini로 유사차량 추정 — 입력은 제조사·모델·연식·차종·총중량·배기량·연료, responseSchema로 `{estimated_kmpl, reference_models[], reasoning, confidence}` 강제. 승용 5~25 / 화물 1.5~12 범위 밖이면 null 반환. `source:'ai_estimate', trust:'C'`.
> ④ 위 셋 다 실패하면 `public/fixtures/fuel_economy_cache.json`에서 읽고 `source:'fixture'`.
>
> 조회 순서는 `vehicle_class`로 갈린다 — `'car'`는 **②공공API를 먼저** 시도하고(대부분 여기서 잡힌다), `'truck'`은 **①등록증을 먼저** 시도한다(대형차는 공공DB에 없다).
> 적재상태 보정은 `kmpl_empty = kmpl × 1.08`, `kmpl_laden = kmpl × 0.78`. 승용차는 보정 없이 kmpl 그대로 양쪽에 넣는다.
> 결과를 `baseline_fuel.json`으로 출력하고, `build-vehicles.mjs`가 이걸 읽어 `baseline_fuel_l` 계산에 쓰도록 연결해라. **런타임에 API를 때리지 않는다 — 빌드 타임에만.**
> 마지막으로 `npm run cache:fuel` 스크립트를 추가해 현재 조회 결과를 `fuel_economy_cache.json`으로 굳히게 해라.

**완료 판정 기준:**
- `DATA_GO_KR_KEY` 없이 실행해도 캐시 폴백으로 `baseline_fuel.json`이 정상 생성됨
- 각 항목에 `source`와 `trust`가 반드시 붙어 있음(누락 시 빌드 실패시키기)
- 25톤 트랙터가 공공API에서 안 나오는 것이 **에러가 아니라 정상 폴백**으로 처리됨
- 승용차 10대는 공공API에서 실제로 조회됨(`source:'public_api'`) — 한 건도 안 잡히면 조회 키가 틀린 것
- `ai_estimate` 항목에 `reference_models`와 `reasoning`이 비어 있지 않음
- `build-vehicles.mjs` 어디에도 3.9/2.8 하드코딩이 없음

**소요:** 45분 · **커밋:** `feat: add 3-tier baseline fuel economy lookup (registration/public API/AI estimate)`

> ⚠️ **09:00에 제일 먼저 공공데이터포털 활용신청을 넣어라.** 승인 나도 키 활성화까지 시간이 걸린다. 그동안은 캐시 픽스처로 개발한다.

---

## 2. Safe 화면 (최우선 — 자르면 논지 안 섬)

**프롬프트 원문:**
> **더미 차량을 만들지 마라.** v2는 실측 23대(트랙터 13 + 승용 10)뿐이다. `build-fleet.mjs`·`build-glovis-fleet.mjs`·`fleetGen.mjs`는 만들지 않는다. `vehicles.json` 하나가 모든 화면의 원천이다.
> `build-vehicles.mjs`가 각 차량에 `monthly[]` 5개월(2026-04~08) 배열을 채우도록 확장해라(reported_km/core_events/rate/fuel_implied_rate/grade/fuel_l/fuel_per_100km/fuel_excess_pct 전부 월별). `vehicle_class`('truck'|'car')와 `baseline`(트랙1 결과 전체)도 함께 실어라.
>
> 그 다음 `SafeScreen.tsx` — PRD §3.1 그대로. 진단과 검증을 **한 화면에 통합**한다.
> - 상단: 판정 요약 **한 줄**("212대 중 N대 데이터 신뢰 불가 · 검증 커버리지 X%") + 우측 액션 버튼 3개(데이터 업로드 / 리포트 생성 / 전체 공지 발송). **KPI 카드로 쪼개지 마라.**
> - 필터: 차종(전체/화물/승용) · 신뢰등급 · 차량ID 검색
> - 표 컬럼: 순위 / 차량(+차종 배지) / 단말(+등급배지) / 주행거리 / 이벤트 / 발생률 / **기준연비(+출처배지)** / 실측연비 / 5개월 순위 스트립 / S&E 점수 / 상태(공지·단말점검 점 2개)
> - 순위는 항상 `fuel_implied_rate` 기준, **항상 전체 기준으로 계산 후 필터로 행만 고른다**
> - D등급은 표 아래 "평가 제외" 섹션으로 분리
> - 4월 대비 8월 순위 변동 최대 차량 하이라이트 배너
> - 행 클릭 → 그 자리 아래 상세 패널: 판정(등급+사유+근거3줄) / 이벤트 분해 막대 / 연비 교차검증 / 리포트 문장 / 공지 발송 버튼

**완료 판정 기준:**
- 협력사·차종 필터를 걸어도 **순위 숫자가 안 바뀌고** 보이는 행만 줄어듦
- 헤드라인의 "N대 신뢰 불가"가 `grade !== '정상'` 카운트와 일치
- "평가 제외" 카운트가 D등급 차량 수와 일치
- 기준연비 셀에 출처 배지가 **모든 행에** 붙어 있음
- 5개월 순위 스트립 8월 값이 vehicles.json 현재 순위와 일치
- 차종 필터에 '승용'을 걸면 기준연비 출처가 `공공API` 배지로 뜸(트랙터는 `등록증`/`AI추정`)
- 저장소에 `fleet.json`·`fleetGen.mjs`가 존재하지 않음
- 상단에 KPI 카드가 없음(한 줄 텍스트여야 함)

**소요:** 75~90분 · **커밋:** `feat: add SafeScreen — unified diagnosis and fuel cross-check verification`

---

## 3. 앱 셸 · 좌측 메뉴 · 디자인 토큰

**프롬프트 원문:**
> `app/src/index.css`에 PRD §8 색상 토큰 전부(다크+라이트 두 세트, `:root[data-theme='light']` 오버라이드) + tone-* 클래스 5종(ok/warn/caution/dead/void, 각각 -fg/-bd/-bg/-rail) + 폰트 변수(Pretendard 본문, IBM Plex Mono `.num`).
>
> `Sidebar.tsx` — 고정 5항목: Safe / Eco / Heat-map / 증명서 발급 / (구분선) 설정 / (구분선) 기사뷰로 전환. 미확인 공지·단말점검 있으면 Safe 옆에 점 하나.
>
> `App.tsx` — Screen 타입 유니온, 세션 게이트(로그인 전엔 LoginScreen만), 로그인 직후 **바로 Safe로 진입**.
> **상단 메뉴바·빵조각·홈 화면은 만들지 마라. v2에서 삭제됐다.** 역할 전환은 사이드바 최하단 링크 하나뿐이다.

**완료 판정 기준:**
- 라이트/다크 전환 시 컴포넌트 코드를 안 건드림 — `grep -E '#[0-9a-fA-F]{3,6}'` 결과가 컴포넌트 파일에 0
- 로그인 직후 랜딩이 Safe 화면(홈 화면 경유 없음)
- 상단에 어떤 내비게이션도 없음
- 로그인 안 한 상태에서 state 강제 변경으로도 접근 안 됨

**소요:** 40분 · **커밋:** `feat: add app shell — sidebar navigation, session gate, design tokens`

---

## 4. 설정 화면 (불가 — 증명서 구간검증이 의존)

**프롬프트 원문:**
> `SettingsScreen.tsx` + `lib/settings.ts` — PRD §3.5 그대로.
> 타입: `Site {site_id, name, address, lat, lon, radius_m}` / `Corridor {corridor_id, name, origin_site_id, destination_site_id}`. `localStorage` 키 `se.settings.v1`, 초기값은 `public/fixtures/settings.json` 시드.
>
> ① 사업장 등록 — 모달에 사업장명 + 주소 검색(키워드 → 후보 목록 → 선택 시 좌표 확정) + 미니지도(마커 + 반경 원) + 반경 슬라이더(500m~3km, 기본 1000m). 등록된 사업장은 카드 목록.
> ② 운송구간 등록 — 출발지/도착지 select(등록된 사업장에서) + 구간명. **여러 개 등록 가능**.
> ③ 지오펜스 미리보기 — 전체 원을 한 지도에 겹쳐 표시, 원이 겹치면 경고 배너.
>
> 지도는 이 인터페이스 뒤에 숨겨라(카카오맵은 다른 담당자가 붙인다):
> ```ts
> searchAddress(keyword: string): Promise<AddressCandidate[]>
> renderMiniMap(el, {center, markers, circles}): {destroy()}
> ```
> **폴백 필수** — 카카오 키 없으면 검색창 대신 위경도 직접 입력 필드로 전환, 지도 자리엔 "지도 미연동 — 좌표 직접 입력" 안내.

**완료 판정 기준:**
- 카카오 키 없이도 사업장 등록·운송구간 등록이 끝까지 됨
- 새로고침해도 등록 내용이 유지됨(localStorage)
- 운송구간을 2개 이상 등록할 수 있음
- 반경이 겹치는 사업장 2개를 넣으면 경고가 뜸

**소요:** 45분 · **커밋:** `feat: add settings screen — sites, corridors, geofence configuration`

---

## 5. 증명서 발급

**프롬프트 원문:**
> `app/scripts/build-attribution.mjs` 먼저 — PRD §5.6 지오펜스 구간귀속. **반드시 선분 교차 판정으로 구현하라.** 점 포함 판정(`dist(point,center)<R`)은 2분 샘플링에서 반경 1km 원을 통째로 건너뛰어 전부 failed가 된다. 연속한 두 점을 잇는 선분이 원과 교차하는지 판정하고, 교점까지 선형 보간해 진입/이탈 시각을 추정해라. 출력에 `±샘플링간격/2` 오차를 함께 실어라. 판정은 출발·도착 모두 검출 → verified / 한쪽만 → partial / 둘 다 → failed.
>
> 그 다음 `CorridorMap.tsx`(오프라인 SVG, 결정적 해시 기반 도로 스텁 + Catmull-Rom 스무딩), `Certificate.tsx`, `TripPicker.tsx`, `CertificateScreen.tsx` — PRD §3.4 그대로.
> 선택기: 운송구간(설정에서 등록한 것) → 기간 → 신뢰등급, 3단 종속 드롭다운.
> 문서 블록 순서: ① 헤더 ② **구간 귀속 검증(최상단)** ③ 안전(이벤트 4종·연속운전·신뢰등급배지) ④ 친환경(CO₂·원단위·기본계수대비·Tier·공차비중) ⑤ 데이터 신뢰 고지(출처등급표) ⑥ 액션(증명서 발행 / PDF 내려받기).
> 대비보기 토글: 같은 노선·같은 규격의 검증됨↔검증불가 한 쌍을 `xl:grid-cols-2`로 나란히.
>
> **증명서에 S&E 점수·운전점수·배지·기사코드·정비상태·연료 절대량을 넣지 마라.** v2에서 전부 제거됐다.

**완료 판정 기준:**
- 증명서 어디에도 점수·기사코드·배지가 없음(grep으로 `scoreOf`·`driver_id` 확인)
- `settle==='block'` 건은 이벤트에 취소선 + "이행검증 불가" 표기
- 대비보기 켰을 때 좌우가 서로 다른 verifiable 값, 같은 route_id
- 구간귀속 판정이 verified/partial/failed 3종으로 나옴(전부 failed면 선분교차 미구현 의심)

**소요:** 75분(대비보기 생략 시 55분) · **커밋:** `feat: add certificate screen with geofence-based segment attribution`

---

## 6. Eco 화면

> ⚠️ **상세 내용 미확정.** 아래는 골격만이다. 내용이 확정되면 이 트랙을 갱신한다.

**프롬프트 원문:**
> `EcoScreen.tsx` — PRD §3.2 골격.
> ① 상단 요약: 총 배출량(tCO₂e) / 1차 데이터 비율(%) / Tier 분포
> ② 차량별 표: 차량 / 차종 / **Scope** / Tier / 기준연비(+출처배지) / 실측연비 / 연료(L) / CO₂(kg) / 원단위 / 감축여지(kg)
> **트랙터와 승용차를 합산하지 마라.** 승용차는 톤킬로가 없으므로 원단위를 `gCO₂/km`로 내고, 총계는 Scope별로 분리한다. Scope 1과 Scope 3을 한 숫자로 더하면 온실가스 회계 오류다.
> ③ 기본계수 대비: 실측 산정 vs 표준 배출원단위(62.0 gCO₂/ton-km)
> ④ 공차 구간 비중
>
> **표기 규칙 절대 준수** — 기본계수와 실측의 차이는 "감축량"이 아니라 **"계측 오차"**. 기준연비 초과분은 "감축량"이 아니라 **"감축 여지"(상한)**. Tier와 신뢰등급은 **절대 합산하지 말고** 나란히만 표시.

**완료 판정 기준:**
- 화면 어디에도 "감축량"이라는 단어가 없음(grep)
- Tier와 신뢰등급이 별도 컬럼으로 나란히 있고 합산 점수가 없음
- `tierOf(v) = v.fuel_l > 0 ? 3 : 1` 그대로
- 승용차 행 원단위 단위가 `gCO₂/km`이고 트랙터와 같은 총계에 안 들어감

**소요:** 45분 · **커밋:** `feat: add Eco screen — Scope 3 emissions and Tier grading`

---

## 7. Heat-map

**프롬프트 원문:**
> `build-tracks.mjs`(dtg_track.csv 스트리밍, 데시메이션, 노선별 대표 1건) → routes.json. `build-corridor-hotspots.mjs` — PRD §5.7: 기준선 8등분, **verifiable(grade==='정상') 차량 이벤트만** 최근접 구간 배정, 발생률 내림차순 상위3 위험/다음5 주의/나머지 양호 → corridor.json.
>
> `HeatmapScreen.tsx` — `xl:grid-cols-[1fr_360px]`, 좌측 지도 / 우측 구간 랭킹 리스트. 지도는 우선 오프라인 SVG `CorridorMap`으로 붙여라(카카오맵은 다른 담당자). 지도 컴포넌트는 교체 가능한 인터페이스 뒤에 두고, 카카오 로드 실패 6초 타임아웃 시 SVG로 자동 대체.
>
> 경로는 2분 간격 위치 점을 결정적 보간(직선 + 도로 스텁 각도)으로 이었다는 사실을 **지도 범례에 고정 표기**하라. 실측 궤적처럼 보이게 하지 마라.

**완료 판정 기준:**
- corridor.json 집계에 `grade!=='정상'` 차량 이벤트가 안 섞임(코드에서 필터 확인)
- 위험 3개/주의 5개 구간 수가 정확히 고정
- 카카오 키 없이도 SVG 지도로 화면이 완결됨
- 범례에 "추정 경로" 표기가 있음

**소요:** 45분 · **커밋:** `feat: add heatmap screen with verifiable-only corridor hotspot analysis`

---

## 8. 로그인 · 회원가입

**프롬프트 원문:**
> `LoginScreen.tsx` — 내부 step 머신. **역할은 회사/기사 2단이다**(화주·협력사 분리 없음).
> 회사 → ID+비밀번호, 무엇을 입력해도 통과, 하단에 "아이디·비밀번호는 무엇을 입력해도 통과합니다" 캡션.
> 기사 → 회원가입 먼저: 차량등록증 업로드(900ms 딜레이 후 `fakeParseRegistration()`이 무작위 값 생성, **실제 OCR 아님**을 캡션으로 명시) 또는 수기입력 → 정비 자기신고 2문항(엔진오일/타이어 교체 여부 + 개월수) → 완료화면 → 로그인.

**완료 판정 기준:**
- 역할 버튼이 2개(회사/기사)
- "실제 OCR 아님" 명시 문구가 화면에 보임
- 2문항 다 응답해야 완료 버튼 활성
- 로그인 성공 시 회사는 Safe, 기사는 기사뷰로 진입

**소요:** 25분 · **커밋:** `feat: add login screen with company/driver role selection`

---

## 9. 데이터 업로드 (LLM 스키마 매핑)

**프롬프트 원문:**
> `lib/standardSchema.ts` — PRD §7.1 14필드 그대로(key/label/type/missing_impact). 서버 미들웨어 `mapSchema.server.ts` — 고정 모델ID, responseSchema 강제 JSON, 시스템 프롬프트 7규칙(헤더 위치 직접 탐지 / 헤더+표본값 둘 다 근거 / 단위변환은 표본값 크기로 판단 / 오타는 문맥으로 해석하되 source_name은 원문 보존 / 대응없으면 unmapped / 결측 표준필드는 하류영향 명시 / 한국어 한줄 + 신뢰도), `attempts:1` + `timeout:30000`.
> `IngestScreen.tsx` — 여러 파일 대기열, 버튼 2개(파싱/결과), 8초 넘으면 지연 안내, 매핑 검토표(드롭다운 수정 가능, 중복 매핑 시 확인 비활성화), 확정 후 전체 파일 재파싱 + runDiagnosis + runIntegrityCheck 동시 실행.
> **Safe 화면 상단 "데이터 업로드" 버튼으로 진입한다. 사이드바에 넣지 마라.**

**완료 판정 기준:**
- API 키 없이 실행해도 "결과" 버튼이 파싱 시작만 되면 활성화
- 헤더 행이 1행이 아닌 CSV에서도 `header_row_index`를 모델이 스스로 찾음
- 미매핑 표준필드가 하류영향 문구와 함께 나열됨
- 같은 표준필드에 컬럼 2개 매핑 시 확인 버튼 비활성화

**소요:** 60분 · **커밋:** `feat: add ingest screen with LLM-assisted schema mapping`

---

## 10. 기사뷰

**프롬프트 원문:**
> `DriverScreen.tsx` — v1 사양 그대로 이식. 데스크톱에서도 `max-w-[430px]` 폰 목업.
> 차량 select에서 실측 23대 중 선택. **`fleetDriverDemo.ts`·`syntheticMaintStatus`는 만들지 마라** — 23대 전부 실제 운행이력이 있으므로 가짜 이력을 생성할 이유가 없다. 정비 레코드도 23건 손으로 쓴다. 구조: 좌측 지도 자리 + 위험구간 안내 배너(corridor.json에서 본인 노선 최고위험 1개) / 우측 aside: 트럭 점검 다이어그램 → S&E 점수 히어로 → 단말점검 요청 버튼 → 공개범위 고지 → 차량 식별 → 통계 3종 → 운행 이력.
> 하단 3섹션: 우수 운전자 배지(`badgeTierOf`, scoreOf 재사용 — 새 산식 금지) / 정비 이행 / 공지사항(확인완료 버튼).
> `TruckInspectionDiagram.tsx` — 트럭 SVG 위 엔진오일·타이어 hotspot 2개, 색은 이 그림에서만 예외적으로 진짜 초록/주황/빨강(#22c55e/#f59e0b/#ef4444) — 신뢰등급 톤과 다른 축임을 색으로 구분.

**완료 판정 기준:**
- `scoreOf`가 null인 차량은 배지 'none'
- 단말점검 요청 버튼 → Safe 화면 상태 열에 반영
- 저장소에 `fleetDriverDemo.ts`·`syntheticMaintStatus`가 없음
- 위험구간 안내가 corridor.json 실제 데이터로 뜸

**소요:** 35분 · **커밋:** `feat: add driver view with inspection diagram and badge system`

---

## 11. 공지사항 · 단말점검 루프

**프롬프트 원문:**
> `lib/notices.ts` + `lib/deviceRequests.ts` — `useSyncExternalStore` 기반 세션 전역 스토어(새로고침 시 리셋). Safe 화면에서 공지 발송(개별/일괄) → 기사뷰에서 확인 → "확인완료" 누르면 Safe 화면 상태 열이 초록으로. 기사뷰 "단말 점검 요청" → `requestDeviceCheck` → Safe 상태 열에 반영.
> 채널명 상수를 한 곳에 두고 재사용하라 — v1에서 문자열 불일치로 공지가 안 뜬 버그가 있었다.

**완료 판정 기준:**
- 공지 발송 → 해당 vehicle_id 기사뷰에서 확인 가능 → 확인완료 시 Safe 열 색 변경
- 새로고침하면 전부 사라짐(세션 전용 의도)
- 채널명이 상수로 재사용됨(grep으로 문자열 리터럴 중복 없음 확인)

**소요:** 40분 · **커밋:** `feat: add notice board and device-check request loop`

---

## 12. 조작탐지 데모

**프롬프트 원문:**
> `public/fixtures/demo_SB000213/`·`demo_SB000214/` 각 5파일(운행기록/배차내역/유류사용내역/위험운전기록/자동차등록증html). 214는 213 대비 **주행거리 1.9배 부풀리기 + 이벤트 절반 삭제 + 2개 구간 복제**만. 유류카드 전표와 배차내역은 손대지 않는다(카드사·화주 발행이라 조작 불가라는 전제).
> `runFuelDispatchCheck.ts` — F1(measured_kmpl > 기준연비 → 조작의심), F2(|제출거리−배차거리|/배차거리 > 10% → 조작의심). `runIntegrityCheck.ts`(R2~R5). **샘플링 간격이 120초 이상이면 R3·R4는 "판정 보류"로 표기하고 통과 처리하지 마라.**
> `IntegrityCompareScreen.tsx` — 두 차량 나란히, 제출값 → 검사결과 → 최종판정 사다리(C/D 우선 → R2~R5/F1/F2 → A → 정상).

**완료 판정 기준:**
- 214의 제출값만 보면 213보다 발생률이 **낮게** 나옴(조작이 숫자만 보면 유리해 보이게 설계됐는지)
- F1/F2 걸면 214가 "조작의심"으로 뒤집힘
- 샘플링 간격 표시가 화면에 있음
- 최종판정 사다리 순서가 PRD §5.4와 일치

**소요:** 60분 · **커밋:** `feat: add tamper detection demo with fuel/dispatch cross-check`

---

## 13. Heat-map AI 위험요소 평가

**프롬프트 원문:**
> 구간 클릭 시 우측 패널에 LLM 평가 문단을 띄워라. 입력은 구간 좌표·이벤트 유형 분포·발생 건수·통행 건수. 출력은 위험 요인 추정 1~2문장 + 운전 조언 1문장.
> **금지** — 사고 예측, 확률 수치, 근거 없는 원인 단정. "~로 보인다 / ~일 가능성" 어법만 쓴다. 응답에 "AI 추정" 배지를 반드시 붙인다. 실패하면 문구를 생략하고 숫자만 표시한다.

**완료 판정 기준:**
- 네트워크 끊고도 화면이 정상 동작(문구만 사라짐)
- 출력에 확률·예측 수치가 없음
- "AI 추정" 배지가 붙어 있음

**소요:** 30분 · **커밋:** `feat: add AI corridor risk assessment`

---

## 자르기 순서 요약

```
시간 부족 시 뒤부터:  13 → 12 → 11 → 10 → 9 → 7 → 6 → 5
절대 자르지 않음:     0 · 1 · 2 · 3 · 4
```

**0**(파이프라인)이 없으면 아무것도 안 돌고, **1**(기준연비)이 없으면 **2**(Safe)가 안 서고, **2**가 없으면 이 프로젝트의 논지 자체가 성립하지 않는다. **4**(설정)는 **5**(증명서)의 구간검증이 의존하므로 증명서를 살릴 거면 함께 살린다.

**16:00이 개발 마감선이다.** 여기서 안 된 건 버린다.
