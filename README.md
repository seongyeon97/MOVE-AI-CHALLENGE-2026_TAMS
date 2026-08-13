# MOVE-AI-CHALLENGE-2026_TAMS — S&E Driving Platform

세방 운송 안전·친환경 데이터 검증 플랫폼 — "운송을 더 잘하게 만들지 않는다. 운송이 어땠는지 증명한다."

## 사전 준비 자산

설계 문서(`PRD.md`, `BUILD_SEQUENCE.md`, `산출기준서.md`, `CLAUDE.md`)는 사전 준비한 자산입니다.
애플리케이션 코드(`app/`)는 전량 대회 당일 작성했습니다.

`app/files2/`의 CSV는 **실측 데이터가 아닙니다.** 실측 23대(트랙터 13 + 승용 10) 원본이 도착하기 전
파이프라인 개발·검증용으로 `app/scripts/dev/generate-sample-files2.mjs`가 생성한 합성 표본입니다.
스키마만 같으면 실측 CSV로 교체해도 빌드 스크립트는 그대로 동작합니다.

## 구조

```
app/                        Vite + React + TypeScript + Tailwind
  scripts/                  데이터 파이프라인 (Node, 빌드 타임 전용)
    lib/csv.mjs             CSV 입출력 + _truth.csv 로드 차단 가드
    lib/constants.mjs       물리 상수 · GRADE_META (등급→톤 매핑 단일 출처)
    lib/baselineFuel.mjs    기준연비 3+1계층 조회 (등록증/공공API/AI추정/픽스처)
    build-vehicles.mjs      등급판정 + 연료교차검증 + 월별(5개월) 집계
    build-certificates.mjs  trip/leg/event 조합 → 운송건별 원자료
    build-all.mjs           오케스트레이션(npm run build:data)
    dev/                    실측 도착 전 합성 표본 생성기(대회 산출물 아님)
  src/                      프론트엔드
```

## 실행

```
cd app
npm install
npm run build:data   # files2/ CSV → public/data/*.json
npm run dev
```
