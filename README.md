# MOVE-AI-CHALLENGE-2026_TAMS — S&E Driving Platform

세방 운송 안전·친환경 데이터 검증 플랫폼 — "운송을 더 잘하게 만들지 않는다. 운송이 어땠는지 증명한다."

## 사전 준비 자산

설계 문서(`PRD.md`, `BUILD_SEQUENCE.md`, `산출기준서.md`, `CLAUDE.md`)는 사전 준비한 자산입니다.
애플리케이션 코드(`app/`)는 전량 대회 당일 작성했습니다.

`app/files2/`는 비어 있습니다(스키마 안내는 `app/files2/README.md`) — 합성 표본·조작탐지 데모 픽스처를
전부 지우고 실측 데이터만으로 갑니다. 실제 CSV를 넣기 전까지 Safe·Eco·증명서 화면은 빈 상태로 뜹니다(의도된
동작이지 오류가 아닙니다).

## 구조

```
app/                        Vite + React + TypeScript + Tailwind
  files2/                   실측 원천 CSV(비어 있음, README.md에 필요한 스키마 안내)
  scripts/                  데이터 파이프라인 (Node, 빌드 타임 전용)
    lib/csv.mjs             CSV 입출력 + _truth.csv 로드 차단 가드
    lib/constants.mjs       물리 상수 · GRADE_META (등급→톤 매핑 단일 출처)
    lib/baselineFuel.mjs    기준연비 3+1계층 조회 (등록증/공공API/AI추정/픽스처)
    build-vehicles.mjs      등급판정 + 연료교차검증 + 월별(5개월) 집계
    build-eco.mjs           Scope 1 배출량 · Tier 집계
    build-certificates.mjs  trip/leg/event 조합 → 운송건별 원자료
    build-attribution.mjs   지오펜스 선분교차 구간귀속
    build-all.mjs           오케스트레이션(npm run build:data)
    mapSchemaPlugin.mjs     Vite dev 미들웨어 — LLM 스키마 매핑(POST /api/map-schema)
  src/                      프론트엔드
```

## 실행

```
cd app
npm install
npm run build:data   # files2/ CSV → public/data/*.json
npm run dev
```
