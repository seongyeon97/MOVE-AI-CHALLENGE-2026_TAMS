// standardSchema.ts — 표준 스키마. 매핑 검토표·미매핑 안내가 여기 하나만 본다.
// 화물차(DTG 원시 로그: 2분 간격 GPS+개별 이벤트)와 승용차(주행 1건당 이미 집계된 안전지표)는
// 실제 원천 데이터 형태 자체가 다르다 — 하나의 스키마로 억지로 합치면 승용차의 급가속횟수·안전지수·
// 과속률 같은 핵심 안전필드가 전부 미매핑으로 빠진다. 그래서 차종별로 스키마를 분리한다.

export type StandardFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'timestamp';

export type StandardField = {
  key: string;
  label: string;
  type: StandardFieldType;
  missing_impact: string;
};

/**
 * 화물차 — 일자별 집계 기준(통합단말기 월간 집계 + 유류 배분).
 * 원래 2분 간격 DTG 원시 로그를 전제로 짰지만, 실제 받은 파일은 승용차와 같은 일자별 집계였다.
 * 운행(driving_events)과 유류(fuel)가 별도 파일로 오며 vehicle_id + date로 합쳐진다.
 */
export const TRUCK_SCHEMA: StandardField[] = [
  { key: 'vehicle_id', label: '차량ID', type: 'string', missing_impact: '차량 식별 불가 — 이 파일 전체가 매칭 대상에서 제외됨' },
  { key: 'date', label: '일자', type: 'timestamp', missing_impact: '기간 집계 불가 — 조회기간을 잘라 볼 수 없음' },
  { key: 'distance_km', label: '주행거리(km)', type: 'number', missing_impact: '발생률 산정 불가 — 등급판정 자체가 안 됨' },
  { key: 'driving_min', label: '운행시간(분)', type: 'number', missing_impact: '평균속도 기반 물리 정합성 검사 불가' },
  { key: 'laden', label: '적재상태', type: 'string', missing_impact: '공차/적차 구분 불가 — 적재상태 보정 없이 기준연비를 그대로 적용' },
  { key: 'hard_accel', label: '급가속 횟수', type: 'number', missing_impact: '위험운전 발생률 산정 불가' },
  { key: 'hard_start', label: '급출발 횟수', type: 'number', missing_impact: '위험운전 발생률 산정 불가' },
  { key: 'hard_decel', label: '급감속 횟수', type: 'number', missing_impact: '위험운전 발생률 산정 불가' },
  { key: 'hard_stop', label: '급정지 횟수', type: 'number', missing_impact: '위험운전 발생률 산정 불가' },
  { key: 'speeding_count', label: '과속 건수', type: 'number', missing_impact: '과속 경향 파악 불가(발생률에는 미포함 — 산출기준서 §1-1)' },
  { key: 'fuel_l', label: '연료(L)', type: 'number', missing_impact: '연료 교차검증·Eco 배출량 산정 불가 — 운행거리만으로 판단' },
  { key: 'idle_sec', label: '공회전시간(초)', type: 'number', missing_impact: '공회전 연료 보정 불가 — 연료초과율이 과대산정될 수 있음' },
  { key: 'driver_id', label: '기사ID', type: 'string', missing_impact: '기사뷰 개인화 불가(차량 단위로만 표시)' },
];

/** 승용차 — 주행(trip) 1건당 이미 집계된 안전·연비 지표 기준. 원시 GPS 스트림이 아니다. */
export const CAR_SCHEMA: StandardField[] = [
  { key: 'vehicle_id', label: '차량ID', type: 'string', missing_impact: '차량 식별 불가 — 이 파일 전체가 매칭 대상에서 제외됨' },
  { key: 'model', label: '모델명', type: 'string', missing_impact: '기준연비 공공API 조회 불가 — AI추정/픽스처 경로로만 진행' },
  { key: 'driver_id', label: '운전자/사번', type: 'string', missing_impact: '기사뷰 개인화 불가(차량 단위로만 표시)' },
  { key: 'trip_start', label: '주행시작시각', type: 'timestamp', missing_impact: '월별 집계·5개월 순위 이력 구성 불가' },
  { key: 'trip_end', label: '주행종료시각', type: 'timestamp', missing_impact: '운행시간 기반 검증(연속운전 등) 불가' },
  { key: 'trip_distance_km', label: '주행거리(km)', type: 'number', missing_impact: '발생률 산정 불가 — 등급판정 자체가 안 됨' },
  { key: 'odo_km', label: '누적거리(km)', type: 'number', missing_impact: '차량 생애 주행거리 추적 불가' },
  { key: 'origin_text', label: '출발지', type: 'string', missing_impact: '구간 귀속 참고정보 없음(승용차는 지오펜스 대상 아님)' },
  { key: 'destination_text', label: '도착지', type: 'string', missing_impact: '구간 귀속 참고정보 없음(승용차는 지오펜스 대상 아님)' },
  { key: 'fuel_type', label: '연료유형', type: 'string', missing_impact: '기준연비 조회 경로(공공API) 매칭 정확도 저하' },
  { key: 'fuel_used_l', label: '연료·전기 사용량', type: 'number', missing_impact: '연료 교차검증·Eco 배출량 산정 불가 — 운행거리만으로 판단' },
  { key: 'idle_min', label: '공회전(분)', type: 'number', missing_impact: '공회전 연료 보정 불가' },
  { key: 'safety_index', label: '안전지수', type: 'number', missing_impact: '원시 이벤트 대신 쓸 대체 안전신호 없음' },
  { key: 'harsh_accel_count', label: '급가속 횟수', type: 'number', missing_impact: '위험운전 발생률 산정 불가' },
  { key: 'harsh_decel_count', label: '급감속 횟수', type: 'number', missing_impact: '위험운전 발생률 산정 불가' },
  { key: 'speeding_pct', label: '과속률(%)', type: 'number', missing_impact: '과속 경향 파악 불가(승용차 데이터는 과속 항목이 유효함 — 화물차와 다름)' },
  { key: 'speeding_distance_km', label: '과속거리(km)', type: 'number', missing_impact: '과속 구간 규모 파악 불가' },
];

export const STANDARD_SCHEMAS = { truck: TRUCK_SCHEMA, car: CAR_SCHEMA } as const;
export type SchemaVehicleClass = keyof typeof STANDARD_SCHEMAS;
