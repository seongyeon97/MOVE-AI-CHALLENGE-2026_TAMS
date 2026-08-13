# heatmap/ — 위험구간 히트맵 (트랙7) 작업본

`app/` 아래에 들어갈 파일을 **원래 경로 그대로** 담아둔 폴더다. 이 폴더 자체는 빌드에 쓰이지 않는다.
합칠 때는 `heatmap/app/...` 을 저장소 루트의 `app/...` 같은 자리에 덮어쓰면 된다.

```
heatmap/app/src/components/HeatmapScreen.tsx  →  app/src/components/HeatmapScreen.tsx
```

---

## 무엇을 만들었나

**히트맵의 원천을 실측 화물 운행 하나로 바꿨다.** 기존 집계는 `files2/`(승용 100대 포함) + `certificates.json`(비어 있음)에
묶여 있어 전 구간 0건이 나왔다. 새 파이프라인은 저장소 루트의 `운행데이터/`만 읽는다 — 트랙터 1대(GLV-T11),
노선 R04, 실측 운행 14건, 위험운전 이벤트 699건.

집계 결과 (`corridor.json`)

```
R04 경주 외동-경산 진량-부산신항 · 195.42km · 196구간 · trips=14
이벤트 699건 전량 배정, 궤적 미매칭 0건

#195 194~195km  71건 5.07건/trip 위험 (급감속)  ← 부산신항 게이트 진입
#73   72~73km   48건 3.43       위험 (급감속)  ← 경산 진량 하차지(레그 경계 75.9km)
#176 175~176km  44건 3.14       위험 (급감속)
#1     0~1km    39건 2.79       주의 (급출발)  ← 경주 외동 출발 야드
```

핫스팟이 실제 상하차지·항만 게이트에 떨어진다 — 선형 참조가 맞게 동작한다는 근거다.

---

## 파일 목록

### 새로 만든 것 (5개) — 그대로 복사하면 된다

| 경로 | 역할 |
|---|---|
| `app/scripts/build-heatmap.mjs` | 구간 집계. `운행데이터/`만 읽어 `corridor.json`·`routes.json` 생성 |
| `app/scripts/lib/heatmapSource.mjs` | 원천 로더 + 선형 참조. 집계와 해설이 **같은 자리**를 가리키도록 공유 |
| `app/src/components/SegmentRoadview.tsx` | 카카오 SDK 실시간 로드뷰 (정지 캡처는 폴백) |
| `app/src/lib/kakaoSdk.ts` | SDK 로더 일원화 |
| `app/public/data/routes.json`, `segment_insights.json`, `public/segment_captures/*.jpg` | 빌드 산출물(커밋 대상). 이게 있으면 `운행데이터/` 없이도 앱은 그대로 돈다 |

### 고친 것 (9개)

| 경로 | 변경 |
|---|---|
| `app/scripts/build-segment-insights.mjs` | 근거수집을 `운행데이터/` 기준으로 재작성. Gemini 실패 시 직전 해설·리포트 보존 |
| `app/src/components/HeatmapScreen.tsx` | 노선 선택 드롭다운 + [분석] 버튼 게이트, 로드뷰 연결, 문구 정리 |
| `app/src/components/CorridorMap.tsx` | 마커를 픽셀 단위 `CustomOverlay`로 교체(미터 반지름 `Circle`은 전체 보기에서 사라진다), 점을 폴리라인 위에 정렬, 우세 이벤트 유형 라벨 |
| `app/src/components/SegmentVerdictCard.tsx` | `<details>`로 접기(기본 닫힘), 문구 정리 |
| `app/src/components/SegmentInsightCard.tsx` | 실측 근거 기본 펼침, 문구 정리 |
| `app/src/components/DriverBriefing.tsx` | 문구 정리 |
| `app/src/lib/mapAdapter.ts` | 자체 SDK 로더 제거 → `kakaoSdk.ts` 사용 |
| `app/package.json` | `build:data:heatmap` 스크립트 추가 |
| `app/scripts/build-all.mjs` | ⚠️ 아래 참조 |
| `app/src/types.ts` | ⚠️ 아래 참조 |

---

## ⚠️ 공유 파일 2개는 덮어쓰지 말 것

`build-all.mjs`와 `types.ts`는 다른 트랙에서도 고치는 파일이다(CLAUDE.md §3 — A 담당).
이 폴더에 든 버전은 **내 작업 시점 기준**이라 그대로 덮으면 남의 변경이 날아간다.
아래 두 군데만 손으로 반영해라.

**`app/scripts/build-all.mjs`** — 마지막 줄 교체

```diff
-run('build-corridor-hotspots.mjs'); // 트랙7 — verifiable 이벤트만 구간 집계(네트워크 불필요)
+run('build-heatmap.mjs'); // 트랙7 — 운행데이터/(화물 실측)만으로 구간 집계(네트워크 불필요)
```

**`app/src/types.ts`** — `CorridorSegment`에 한 필드 추가

```diff
   dominant_type: string | null;
+  /** 우세 유형이 이 구간 이벤트에서 차지하는 비율(0~1). 지도·목록의 "무엇 위주 위험인가" 표기용 */
+  dominant_share?: number;
 }
```

`CorridorRoute.trips` 주석도 `verifiable 운행 건수` → `실측 운행 건수`로 바꿨다(선택).

---

## 원천 데이터

`heatmap/운행데이터/` 에 들어 있다. 빌드 스크립트는 **저장소 루트의 `운행데이터/`** 를 찾으므로
(`app/` 기준 `../운행데이터`), 다시 구울 때는 루트로 옮기거나 복사해라.

| 파일 | 내용 |
|---|---|
| `trip.csv` | 운행 14건 (route_id=R04) |
| `leg.csv` | 레그 28건 (전부 OUT, 편도 2구간) |
| `event.csv` | 위험운전 이벤트 699건 (급출발·급가속·급감속·급정지) |
| `dtg_track.csv` | DTG 궤적 15,978점 |
| `route_roads_R04.json` | 카카오모빌리티 길찾기 실도로 경로 1,704점 |
| `vehicle_master.csv`, `daily_summary.csv` | 차량 제원, 일자별 집계 |

⚠️ `vehicle_master.csv`에 **실차량번호가 그대로 들어 있다.** 배포본·데모 영상에서는
CLAUDE.md §6에 따라 `SB-0000xx`로 치환해야 한다.

굽는 명령:

```bash
npm run build:data:heatmap      # 집계. 네트워크 불필요
npm run build:data:insights     # 도로환경 해설. KAKAO_REST_API_KEY·VITE_KAKAO_MAP_KEY·GEMINI_API_KEY 필요
```

`.env`에 `VITE_KAKAO_KEY`가 필요하다 — 프론트는 이 이름을 읽고 스크립트는 `VITE_KAKAO_MAP_KEY`를 읽는다.
둘 다 같은 JS 키를 넣어라. 카카오 개발자 콘솔에 `http://localhost:5173`이 사이트 도메인으로 등록돼 있어야 지도가 뜬다.

---

## 검증 상태

- `tsc -b` 통과 · `oxlint` 통과 · 컴포넌트 하드코딩 hex 0건
- 이벤트 699건 전량 배정, 미매칭 0건
- 도로환경 해설 8구간 전부 생성, 차주 배포용 리포트 포함
