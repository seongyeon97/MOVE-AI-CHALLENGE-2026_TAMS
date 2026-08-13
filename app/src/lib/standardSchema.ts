// standardSchema.ts — PRD §7.1. 표준 스키마 14필드. 매핑 검토표·미매핑 안내가 여기 하나만 본다.

export type StandardFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'timestamp';

export type StandardField = {
  key: string;
  label: string;
  type: StandardFieldType;
  missing_impact: string;
};

export const STANDARD_SCHEMA: StandardField[] = [
  { key: 'timestamp', label: '타임스탬프', type: 'timestamp', missing_impact: '시계열 정렬 불가 — 이벤트·궤적 순서를 재구성할 수 없음' },
  { key: 'vehicle_id', label: '차량ID', type: 'string', missing_impact: '차량 식별 불가 — 이 파일 전체가 매칭 대상에서 제외됨' },
  { key: 'lat', label: '위도', type: 'number', missing_impact: '지오펜스 구간귀속·Heat-map 불가' },
  { key: 'lon', label: '경도', type: 'number', missing_impact: '지오펜스 구간귀속·Heat-map 불가' },
  { key: 'location_text', label: '위치명(텍스트)', type: 'string', missing_impact: '지오코딩 실패 시 위치 표시를 좌표로만 대체' },
  { key: 'speed_kmh', label: '속도(km/h)', type: 'number', missing_impact: 'R2(물리정합성)·R3(속도적분) 검사 판정 보류' },
  { key: 'rpm', label: 'RPM', type: 'number', missing_impact: 'R4(시퀀스중복) 검사 정확도 저하' },
  { key: 'odo_km', label: '누적거리(km)', type: 'number', missing_impact: '주행거리·발생률 산정 불가 — 등급판정 자체가 안 됨' },
  { key: 'laden', label: '적재상태', type: 'boolean', missing_impact: '공차/적차 구분 불가 — 연료 교차검증이 부정확해짐' },
  { key: 'gps_status', label: 'GPS 상태', type: 'string', missing_impact: '위치 신뢰도 판단 불가' },
  { key: 'event_type', label: '이벤트 유형', type: 'enum', missing_impact: '위험운전 발생률 산정 불가' },
  { key: 'accel_raw', label: '가속도 원시값', type: 'number', missing_impact: '이벤트 임계값 재검증 불가' },
  { key: 'fuel_l', label: '연료(L)', type: 'number', missing_impact: '연료 교차검증·Eco 배출량 산정 불가' },
  { key: 'idle_sec', label: '공회전시간(초)', type: 'number', missing_impact: '공회전 연료 보정 불가 — 연료초과율이 과대산정될 수 있음' },
  { key: 'driver_id', label: '기사ID', type: 'string', missing_impact: '기사뷰 개인화 불가(차량 단위로만 표시)' },
];
