# files2/ — 실측 원천 CSV

여기에 아래 7개 CSV를 넣으면 `npm run build:data`가 그대로 동작한다. 더미/합성 표본은 전부 지웠다 — 실제
데이터를 넣기 전까지 Safe·Eco·증명서 화면은 빈 상태로 뜬다(에러가 아니라 의도된 동작).

`_truth.csv`는 `scripts/lib/csv.mjs`가 파일명 정규식(`/_?truth\.csv$/i`)으로 읽기 자체를 차단한다 — 정답표라
앱·빌드 스크립트 어디서도 로드하지 않는다.

## vehicle_master.csv
`vehicle_id, vehicle_class(truck|car), device_model, maker, model, year, gross_weight_kg, displacement_cc, fuel_type, registered_kmpl`

`registered_kmpl`은 자동차등록증 공인연비. 없으면 빈 값 — 기준연비 3+1계층 조회(등록증→공공API→AI추정→픽스처)로 넘어간다.

## daily_summary.csv
`vehicle_id, date(YYYY-MM-DD), laden(true|false), reported_km, event_accel, event_start, event_decel, event_stop, event_speeding, fuel_l, idle_sec`

한 차량·한 날짜에 공차/적차 두 행이 있을 수 있다. 5개월(2026-04~08) 치가 있어야 Safe 화면 월별 순위 스트립이 채워진다.

## trip.csv / leg.csv / event.csv
증명서(트랙5) 원자료. `leg.csv`에는 `origin_site`·`destination_site`(사업장명, 설정 화면에 등록한 이름과 일치해야
지오펜스 구간귀속이 매칭된다)가 있어야 한다.

## dtg_track.csv
`vehicle_id, trip_id, ts, lat, lon, speed_kmh, rpm, odo_km, laden, gps_status` — 2분 간격 위치 로그.
지오펜스 선분교차 판정과 Heat-map(트럭만) 경로 추정이 이걸 쓴다.

## _truth.csv
정답표. **로드 금지.**
