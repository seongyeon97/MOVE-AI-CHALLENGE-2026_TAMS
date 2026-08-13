// constants.mjs — 물리 상수 · 등급 메타. 소유자: A. 수정 필요하면 A에게.
// FUEL_KMPL_EMPTY / FUEL_KMPL_LADEN은 여기 없다 — v2에서 삭제, 트랙1 조회 결과로 대체된다.

export const IDLE_L_PER_HOUR = 2.4;
export const CO2_KG_PER_L = 2.606;
export const BASELINE_G_CO2_PER_TONKM = 62.0;
export const CONTINUOUS_DRIVE_LIMIT_SEC = 14400;

export const FUEL_PENALTY_MAX = 0.12;
export const FUEL_PENALTY_RATE_SCALE = 0.3;
export const FAINT_RATIO_THRESHOLD = 0.6;
export const RANK_INVERSION_MIN = 2;

// 적재상태 보정계수 — 출처 등급: 설정값 (미확정). §산출기준서 2-2-1.
export const LADEN_FACTOR = 0.78;
export const EMPTY_FACTOR = 1.08;

// 위변조 정합성 검사 임계값 — 출처 등급: 설정값 (미확정). §산출기준서 1-4.
export const R2_MAX_AVG_SPEED_KMH = 110;
export const R3_MAX_INTEGRAL_DEVIATION = 0.15;
export const R4_MIN_DUPLICATE_RUN = 5;
export const R5_MAX_ODO_JUMP_SPEED_KMH = 150;
export const R5_MIN_ODO_REGRESSION = -0.05;
export const SAMPLING_INTERVAL_HOLD_SEC = 120; // 이 이상이면 R3·R4 "판정 보류"

// 조작탐지 F1/F2 — §BUILD_SEQUENCE 12.
export const DISPATCH_DISTANCE_TOLERANCE = 0.1;

// 신뢰등급 5단계. tone 값은 index.css의 .tone-* 클래스와 1:1 대응.
// 등급→톤 매핑은 이 객체 하나에서만 나온다 — 다른 곳에서 새로 매핑하지 않는다.
export const GRADE_META = {
  정상: {
    label: '정상',
    tone: 'ok',
    verifiable: true,
    settle: 'allow',
    verdict: '이벤트 신호와 연료 신호가 일치 — 신뢰 가능',
  },
  A: {
    label: '센서 과민',
    tone: 'warn',
    verifiable: false,
    settle: 'conditional',
    verdict: '발생률이 물리적 상한(100km당 100회)을 초과 — 단말 임계값 문제로 판단, 연료 기준 대체',
  },
  B: {
    label: '센서 둔감',
    tone: 'caution',
    verifiable: false,
    settle: 'conditional',
    verdict: '이벤트와 연료 원단위가 역행 — 이벤트 신호 폐기, 연료 기준 대체',
  },
  C: {
    label: '센서 침묵',
    tone: 'dead',
    verifiable: false,
    settle: 'block',
    verdict: '발생률 0건 + 주행거리 100km 초과 — 계측 실패 의심, 연료 기준 대체',
  },
  D: {
    label: '측정 불가',
    tone: 'void',
    verifiable: false,
    settle: 'block',
    verdict: '주행거리 산출 불가(0km) — 정규화 분모 없음, 평가 제외',
  },
};
