/* =========================================================
   S&E Driving — app.js
   Vanilla JS SPA: auth flow + 정비(maintenance) dashboard/detail views
   ========================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     Icons (inline SVG, stroke=currentColor, {S}=size placeholder)
  --------------------------------------------------------- */
  var ICONS = {
    truck: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="14" height="11"/><path d="M15 10h4l3 3.2V17h-7z"/><circle cx="6" cy="19" r="1.8"/><circle cx="17.5" cy="19" r="1.8"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.6 5l-6 6 2.6 2.6 6-6a4 4 0 0 0 5-5.6l-2.5 2.5-2-2 2.5-2.5Z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z"/></svg>',
    compass: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4.2 1.2L4 16Z"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>',
    wifi: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.6a11 11 0 0 1 15 0"/><path d="M8 16.2a6 6 0 0 1 8 0"/><circle cx="12" cy="19.4" r="1.1" fill="currentColor" stroke="none"/></svg>',
    droplet: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.3s7.2 8.4 7.2 13a7.2 7.2 0 0 1-14.4 0c0-4.6 7.2-13 7.2-13Z"/></svg>',
    tire: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M6 18l2.1-2.1M15.9 8.1 18 6"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.1 3.6 1.8 19.5a1 1 0 0 0 .9 1.5h18.6a1 1 0 0 0 .9-1.5L12.9 3.6a1 1 0 0 0-1.8 0Z"/><path d="M12 9.5v4.2"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2.2"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/></svg>',
    fileText: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2.5H6.8a1.8 1.8 0 0 0-1.8 1.8v15.4A1.8 1.8 0 0 0 6.8 21.5h10.4a1.8 1.8 0 0 0 1.8-1.8V8Z"/><path d="M14 2.5V8h5"/><path d="M8.3 13h7.4M8.3 16.6h7.4M8.3 9.4h2.4"/></svg>',
    image: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3.5" width="18" height="17" rx="2.2"/><circle cx="8.5" cy="9" r="1.6"/><path d="M21 15.5l-5.3-5.3L4.5 20.5"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="4" width="13" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11.5h6M9 15.5h6"/></svg>',
    logout: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 21H5.8A1.8 1.8 0 0 1 4 19.2V4.8A1.8 1.8 0 0 1 5.8 3H9.5"/><path d="M16 16.5l5-4.5-5-4.5"/><path d="M21 12H9.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.6 10.6 0 0 1 12 19.5c-7 0-11-7.5-11-7.5a21.8 21.8 0 0 1 5.1-6M9.9 5.2A10.4 10.4 0 0 1 12 5c7 0 11 7 11 7a22 22 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="M1 1l22 22"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.3 7-12A7 7 0 0 0 5 10c0 5.7 7 12 7 12Z"/><circle cx="12" cy="10" r="2.4"/></svg>',
    medal: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 9.8 9M16 3l-1.8 6"/><circle cx="12" cy="14.5" r="6"/><path d="M12 11.8l1.05 2.1 2.3.3-1.67 1.62.4 2.3L12 17l-2.08 1.1.4-2.3-1.67-1.62 2.3-.3Z" fill="currentColor" stroke="none"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>',
    map: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 3 5.5v15L9 18l6 2.5 6-2.5v-15L15 5.5 9 3Z"/><path d="M9 3v15M15 5.5v15"/></svg>',
    keypad: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.8V20h13V9.8"/><path d="M9.5 20v-6h5v6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
    plateCard: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2.4"/><path d="M6 12h3.5M13 12h5"/></svg>',
    route: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19c3 0 3-6.5 6-6.5s3 6.5 6 6.5"/><path d="M16.5 12.5c1.6 0 3-1.4 3-3s-1.4-3-3-3-3 1.4-3 3"/><circle cx="4.5" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>',
    steeringWheel: '<svg viewBox="0 0 24 24" width="{S}" height="{S}" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4"/><path d="M12 4.6V9.6M6.2 15.8l4.2-2.6M17.8 15.8l-4.2-2.6"/></svg>'
  };
  function icon(name, size) {
    size = size || 18;
    return (ICONS[name] || '').split('{S}').join(size);
  }

  /* ---------------------------------------------------------
     State
  --------------------------------------------------------- */
  var state = {
    theme: localStorage.getItem('se_theme') || 'light',
    user: { id: '' },
    vehicle: {
      plate: '서울 80바 1234',
      vin: '',
      regMileage: null,
      type: '6',
      currentMileage: 143200,
      lastInspectionDate: '2026-08-11',
      score: 82,
      reservations: [],
      terminal: {
        status: 'success',
        firmwareVersion: 'v3.2.1',
        firmwareLatest: true,
        lastCommAt: '2026.08.11 09:14',
        signalLabel: '양호',
        signalRatio: 0.8,
        serial: 'TM-80B-1234-AX21',
        checklist: [
          { label: '운행 전 단말기 전원·통신 확인', done: false },
          { label: '펌웨어 업데이트 알림 확인', done: false }
        ]
      },
      engineOil: {
        lastChangeDate: '2025-12-05',
        lastChangeMileage: 98200,
        intervalKm: 60000,
        intervalDays: 365,
        levelPercent: 8,
        receiptAttached: false,
        checklist: [
          { label: '엔진오일 잔량 육안 확인', done: false },
          { label: '오일 누유·번짐 흔적 확인', done: false },
          { label: '엔진 경고등 점등 여부 확인', done: false }
        ]
      },
      tire: {
        positions: [
          { id: 'FL', label: '1열 좌측(운전석)', shortLabel: '1열 좌측', installedDate: '2025-11-01', installedMileage: 120000 },
          { id: 'FR', label: '1열 우측(조수석)', shortLabel: '1열 우측', installedDate: '2024-05-15', installedMileage: 98000 },
          { id: 'RL1', label: '2열 좌측', shortLabel: '2열 좌측', installedDate: '2025-10-01', installedMileage: 118000 },
          { id: 'RR1', label: '2열 우측', shortLabel: '2열 우측', installedDate: '2023-08-20', installedMileage: 78000 },
          { id: 'RL2', label: '3열 좌측', shortLabel: '3열 좌측', installedDate: '2025-09-10', installedMileage: 115000 },
          { id: 'RR2', label: '3열 우측', shortLabel: '3열 우측', installedDate: '2025-08-01', installedMileage: 112000 },
          { id: 'RL3', label: '4열 좌측', shortLabel: '4열 좌측', installedDate: '2025-07-15', installedMileage: 110000 },
          { id: 'RR3', label: '4열 우측', shortLabel: '4열 우측', installedDate: '2024-04-01', installedMileage: 96000 }
        ],
        checklist: [
          { label: '타이어 공기압 확인', done: false },
          { label: '트레드 마모 상태 확인', done: false },
          { label: '못·이물질 박힘 여부 확인', done: false }
        ]
      }
    }
  };

  var TIRE_CYCLE_KM = 60000;
  var TIRE_CYCLE_MONTHS = 36;

  /* ---------------------------------------------------------
     안전운전 스코어링 (PRD-06-안전운전-스코어링-모델-정리.md 6.1~6.3 그대로 구현)

     100점에서 항목별로 감점하는 6개 항목(ITM-01~06), 배점 합계 100:
       ITM-01 급가속 12  | min(12, max(0, n/100km − 2.0) × 1.2) | 보정 적용
       ITM-02 급감속 13  | min(13, max(0, n/100km − 2.0) × 1.3) | 보정 적용
       ITM-03 과속   25  | min(25, 과속지수분 × 1.6)             | 보정 미적용
       ITM-04 차로변경 10| min(10, max(0, n/100km − 1.0) × 1.5)  | 보정 적용
       ITM-05 피로   25  | min(25, max(0,연속h−4)×7 + max(0,야간비율−0.25)×12) | 보정 미적용
       ITM-06 환경   15  | min(15, 미스매치율 × 15)              | 보정 미적용

     최종 산식: 안전운전점수 = 100 − Σ(항목별 감점ᵢ ÷ 보정계수ᵢ)
     보정계수(ITM-01·02·04에만 적용)는 화물 운송 특성을 반영해 감점을 완화하는
     방향으로만 작동(1 이상, 최대 1.55) — 화물 운송 특성 보정(6.3, ADJ-01~04):
       ADJ-01 총중량 25톤 이상        +0.15
       ADJ-02 야간 운행 비율 50% 이상  +0.10 (이미 입력된 야간비율로 자동 판정)
       ADJ-03 산업단지 구간 해당      +0.20
       ADJ-04 고속도로 구간 비율 30% 이상 +0.10
  --------------------------------------------------------- */
  var SCORE_ADJ_CAP = 1.55;

  function scoreAdjustmentCoefficient(d) {
    var add = 0;
    if (d.grossWeightTon >= 25) add += 0.15;   // ADJ-01
    if (d.nightRatio >= 0.5) add += 0.10;      // ADJ-02
    if (d.industrialZone) add += 0.20;         // ADJ-03
    if (d.highwayRatio >= 0.3) add += 0.10;    // ADJ-04
    return Math.min(1 + add, SCORE_ADJ_CAP);
  }

  // d = { km, accel, brake, laneChange, overspeedMin, maxContinuousH, nightRatio,
  //       mismatchRatio, grossWeightTon, industrialZone, highwayRatio }
  function computeSafetyScore(d) {
    var per100 = d.km > 0 ? (100 / d.km) : 0;
    var corr = scoreAdjustmentCoefficient(d);
    var accelRate = d.accel * per100;
    var brakeRate = d.brake * per100;
    var laneRate = d.laneChange * per100;

    var dAccel = clamp(Math.max(0, accelRate - 2.0) * 1.2, 0, 12) / corr;
    var dBrake = clamp(Math.max(0, brakeRate - 2.0) * 1.3, 0, 13) / corr;
    var dOverspeed = clamp(d.overspeedMin * 1.6, 0, 25);
    var dLane = clamp(Math.max(0, laneRate - 1.0) * 1.5, 0, 10) / corr;
    var dFatigue = clamp(Math.max(0, d.maxContinuousH - 4) * 7 + Math.max(0, d.nightRatio - 0.25) * 12, 0, 25);
    var dEnv = clamp(d.mismatchRatio * 15, 0, 15);

    var totalDeduction = dAccel + dBrake + dOverspeed + dLane + dFatigue + dEnv;
    return clamp(100 - totalDeduction, 0, 100);
  }

  // 기간 종합 점수: 개별 점수를 평균 내지 않고, 기간에 속한 모든 운행의 원본
  // 입력값을 전부 합산(피로는 최댓값, 비율류는 km 가중평균)한 뒤 위 산식을
  // 그 "가상의 1건"에 한 번만 적용한다.
  function computePeriodSafetyScore(trips) {
    if (!trips.length) return 0;
    var agg = { km: 0, accel: 0, brake: 0, laneChange: 0, overspeedMin: 0, maxContinuousH: 0 };
    var weightedNight = 0, weightedMismatch = 0, weightedHighway = 0, sumWeight = 0, industrialCount = 0;
    trips.forEach(function (t) {
      agg.km += t.km;
      agg.accel += t.accel;
      agg.brake += t.brake;
      agg.laneChange += t.laneChange;
      agg.overspeedMin += t.overspeedMin;
      agg.maxContinuousH = Math.max(agg.maxContinuousH, t.maxContinuousH);
      weightedNight += t.nightRatio * t.km;
      weightedMismatch += t.mismatchRatio * t.km;
      weightedHighway += t.highwayRatio * t.km;
      sumWeight += t.grossWeightTon;
      if (t.industrialZone) industrialCount++;
    });
    agg.nightRatio = agg.km ? weightedNight / agg.km : 0;
    agg.mismatchRatio = agg.km ? weightedMismatch / agg.km : 0;
    agg.highwayRatio = agg.km ? weightedHighway / agg.km : 0;
    agg.grossWeightTon = sumWeight / trips.length;
    agg.industrialZone = (industrialCount / trips.length) >= 0.5;
    return computeSafetyScore(agg);
  }

  /* ---------------------------------------------------------
     지난달 안전운전 기록 (mock — 나중에 실제 운행 데이터 연동 예정)
     score는 하드코딩이 아니라 TRIP_LOG 중 평가 기간(periodStart~periodEnd)에
     속한 운행 전체를 합산해 위 안전운전 산식으로 재계산한 값(아래에서 대입).
  --------------------------------------------------------- */
  var driveRecord = {
    score: 0,
    percentile: 12,
    tripCount: 42,
    totalKm: 3180,
    avgSpeed: 64,
    hardBrakeCount: 0,
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    baselineDate: '2026-08-01'
  };

  // TRIP_LOG: km 외 항목은 전부 안전운전 산식 입력값이며, 실측 데이터가 아직
  // 없어 "운행마다 고정된 현실적 더미값"을 부여했다(매 렌더링마다 바뀌지 않음).
  //   accel/brake/laneChange = 급가속/급감속/차로변경 건수
  //   overspeedMin = 과속 지수분(분), maxContinuousH = 최대 연속운행시간(h)
  //   nightRatio/mismatchRatio/highwayRatio = 야간/환경 미스매치/고속도로 비율(0~1)
  //   grossWeightTon = 총중량(톤), industrialZone = 산업단지 구간 통과 여부
  var TRIP_LOG = [
    { date: '2026-07-31', from: '서울 금천', to: '대전 유성', km: 164, accel: 3, brake: 2, laneChange: 5, overspeedMin: 4, maxContinuousH: 3.2, nightRatio: 0.05, mismatchRatio: 0.05, grossWeightTon: 19, industrialZone: false, highwayRatio: 0.75 },
    { date: '2026-07-29', from: '대전 유성', to: '부산 강서', km: 238, accel: 4, brake: 3, laneChange: 6, overspeedMin: 6, maxContinuousH: 3.8, nightRatio: 0.10, mismatchRatio: 0.08, grossWeightTon: 21, industrialZone: false, highwayRatio: 0.80 },
    { date: '2026-07-27', from: '부산 강서', to: '서울 금천', km: 396, accel: 6, brake: 5, laneChange: 9, overspeedMin: 9, maxContinuousH: 5.1, nightRatio: 0.35, mismatchRatio: 0.12, grossWeightTon: 24, industrialZone: false, highwayRatio: 0.85 },
    { date: '2026-07-24', from: '서울 금천', to: '광주 광산', km: 288, accel: 5, brake: 4, laneChange: 7, overspeedMin: 7, maxContinuousH: 4.4, nightRatio: 0.15, mismatchRatio: 0.10, grossWeightTon: 20, industrialZone: false, highwayRatio: 0.78 },
    { date: '2026-07-22', from: '광주 광산', to: '서울 금천', km: 288, accel: 3, brake: 3, laneChange: 5, overspeedMin: 3, maxContinuousH: 3.9, nightRatio: 0.08, mismatchRatio: 0.05, grossWeightTon: 20, industrialZone: false, highwayRatio: 0.78 },
    { date: '2026-07-18', from: '서울 금천', to: '천안 서북', km: 92, accel: 2, brake: 2, laneChange: 3, overspeedMin: 2, maxContinuousH: 1.8, nightRatio: 0.0, mismatchRatio: 0.03, grossWeightTon: 17, industrialZone: false, highwayRatio: 0.4 },
    { date: '2026-07-15', from: '천안 서북', to: '서울 금천', km: 92, accel: 1, brake: 1, laneChange: 2, overspeedMin: 1, maxContinuousH: 1.7, nightRatio: 0.0, mismatchRatio: 0.02, grossWeightTon: 17, industrialZone: false, highwayRatio: 0.4 },
    { date: '2026-06-26', from: '서울 금천', to: '인천 남동', km: 52, accel: 2, brake: 2, laneChange: 4, overspeedMin: 1, maxContinuousH: 1.2, nightRatio: 0.02, mismatchRatio: 0.04, grossWeightTon: 18, industrialZone: true, highwayRatio: 0.15 },
    { date: '2026-06-19', from: '인천 남동', to: '서울 금천', km: 52, accel: 2, brake: 1, laneChange: 3, overspeedMin: 1, maxContinuousH: 1.1, nightRatio: 0.0, mismatchRatio: 0.03, grossWeightTon: 18, industrialZone: true, highwayRatio: 0.15 },
    { date: '2026-06-08', from: '서울 금천', to: '수원 영통', km: 38, accel: 1, brake: 1, laneChange: 2, overspeedMin: 0, maxContinuousH: 0.9, nightRatio: 0.0, mismatchRatio: 0.02, grossWeightTon: 16, industrialZone: false, highwayRatio: 0.2 },
    { date: '2026-05-21', from: '서울 금천', to: '춘천', km: 118, accel: 4, brake: 4, laneChange: 6, overspeedMin: 5, maxContinuousH: 2.6, nightRatio: 0.05, mismatchRatio: 0.15, grossWeightTon: 19, industrialZone: false, highwayRatio: 0.55 },
    { date: '2026-05-14', from: '춘천', to: '서울 금천', km: 118, accel: 3, brake: 3, laneChange: 5, overspeedMin: 4, maxContinuousH: 2.5, nightRatio: 0.03, mismatchRatio: 0.12, grossWeightTon: 19, industrialZone: false, highwayRatio: 0.55 }
  ];

  // 화면에 노출되는 개별 운행 점수 — 매번 다시 계산하지 않도록 한 번만 산정해 캐싱
  TRIP_LOG.forEach(function (t) { t.score = Math.round(computeSafetyScore(t)); });

  // 상단 "기간 종합 점수" — 평가 기간(periodStart~periodEnd)에 속한 운행 전체를
  // 합산해 안전운전 산식으로 재계산한다(개별 점수의 평균이 아님).
  driveRecord.score = Math.round(computePeriodSafetyScore(
    TRIP_LOG.filter(function (t) { return t.date >= driveRecord.periodStart && t.date <= driveRecord.periodEnd; })
  ));

  function tripGrade(score) {
    if (score >= 90) return { label: '우수', tone: 'success' };
    if (score >= 75) return { label: '양호', tone: 'primary' };
    return { label: '주의', tone: 'warning' };
  }
  function tripPeriods() {
    var seen = {};
    var list = [];
    TRIP_LOG.forEach(function (t) {
      var ym = t.date.slice(0, 7);
      if (!seen[ym]) { seen[ym] = true; list.push(ym); }
    });
    return list.sort().reverse();
  }
  function periodLabel(ym) {
    var parts = ym.split('-');
    return parts[0] + '년 ' + Number(parts[1]) + '월';
  }
  var selectedTripPeriod = null;

  /* ---------------------------------------------------------
     공지사항 목록 (알림 화면 + 로그인 후 팝업의 최신 1건)
  --------------------------------------------------------- */
  var NOTICES = [
    { date: '2026-08-13', title: '폭염 대비 안전운행 안내', body: '여름철 고온으로 인한 <b>타이어 파손</b> 및 <b>엔진 과열</b> 위험이 높아지고 있습니다. 운행 전 타이어 공기압과 엔진오일 상태를 꼭 확인해 주세요.', read: false },
    { date: '2026-08-05', title: '시스템 정기 점검 안내 (08.10 새벽 2시~4시)', body: '서비스 안정화를 위한 정기 점검이 진행됩니다. 해당 시간에는 앱 접속 및 알림 발송이 일시 중단될 수 있습니다.', read: false },
    { date: '2026-07-28', title: '정비소 예약 기능이 새로 추가되었습니다', body: '정비 화면 하단에서 주변 정비소를 찾고 바로 예약할 수 있는 기능이 추가되었습니다. 지금 확인해보세요.', read: false },
    { date: '2026-07-10', title: '여름철 장거리 운행 안전 수칙', body: '2시간 이상 연속 운행 시 반드시 휴게소에서 휴식을 취해 주세요. 졸음운전은 대형 사고로 이어질 수 있습니다.', read: false }
  ];

  /* ---------------------------------------------------------
     자가 점검 제출 이력 (mock — 실제로는 서버에 제출된 이력을 조회해야 함).
     "제출하기"를 누르면 오늘 날짜로 done:true 항목이 추가/갱신됨.
  --------------------------------------------------------- */
  var SELF_CHECK_LOG = {
    terminal: [
      { date: '2026-08-07', done: true },
      { date: '2026-07-31', done: true },
      { date: '2026-07-24', done: false },
      { date: '2026-07-17', done: true }
    ],
    oil: [
      { date: '2026-08-07', done: true },
      { date: '2026-07-24', done: false },
      { date: '2026-07-10', done: true }
    ],
    tire: [
      { date: '2026-08-07', done: true },
      { date: '2026-07-17', done: true },
      { date: '2026-06-19', done: false }
    ]
  };

  /* ---------------------------------------------------------
     Helpers
  --------------------------------------------------------- */
  function toDate(str) { return new Date(str + 'T00:00:00'); }
  function addDays(str, days) { var d = toDate(str); d.setDate(d.getDate() + days); return d; }
  function daysBetween(str, toD) { return Math.round((toD - toDate(str)) / 86400000); }
  function fmtDot(str) { return String(str).split('-').join('.'); }
  function fmtDotShort(str) { return String(str).slice(2).split('-').join('.'); }
  function fmtDateObj(d) {
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return y + '.' + m + '.' + day;
  }
  function comma(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function toneVar(status) { return status === 'success' ? 'var(--success)' : status === 'warning' ? 'var(--warning)' : 'var(--danger)'; }
  function worstStatus(list) {
    if (list.indexOf('danger') !== -1) return 'danger';
    if (list.indexOf('warning') !== -1) return 'warning';
    return 'success';
  }

  function scoreGrade(score) {
    if (score >= 80) return { label: '양호', tone: 'success', medal: 'gold', medalLabel: 'GOLD' };
    if (score >= 60) return { label: '주의', tone: 'warning', medal: 'silver', medalLabel: 'SILVER' };
    return { label: '위험', tone: 'danger', medal: 'bronze', medalLabel: 'BRONZE' };
  }

  function medalBadge(grade) {
    return '<span class="medal-badge medal-' + grade.medal + '">' + icon('medal', 16) + grade.medalLabel + '</span>';
  }

  function computeOilStats() {
    var oil = state.vehicle.engineOil;
    var today = new Date();
    var used = state.vehicle.currentMileage - oil.lastChangeMileage;
    var distanceRatio = clamp(used / oil.intervalKm, 0, 2);
    var elapsedDays = daysBetween(oil.lastChangeDate, today);
    var periodRatio = clamp(elapsedDays / oil.intervalDays, 0, 2);
    var remainingKm = Math.max(oil.intervalKm - used, 0);
    var nextDue = addDays(oil.lastChangeDate, oil.intervalDays);
    var worse = Math.max(distanceRatio, periodRatio);
    var severity = worse >= 1 ? 'danger' : worse >= 0.7 ? 'warning' : 'success';
    return {
      used: used, distanceRatio: distanceRatio, elapsedDays: elapsedDays, periodRatio: periodRatio,
      remainingKm: remainingKm, nextDue: nextDue, severity: severity,
      moreUrgent: distanceRatio >= periodRatio ? 'distance' : 'period'
    };
  }

  function statusLabel(kind, status) {
    var map = {
      terminal: { success: '정상', warning: '점검 필요', danger: '통신 이상' },
      oil: { success: '정상', warning: '점검 필요', danger: '교체 필요' },
      tire: { success: '정상', warning: '점검 필요', danger: '교체 필요' }
    };
    return map[kind][status];
  }

  function badge(status, label) {
    var iconName = status === 'success' ? 'check' : 'alert';
    return '<span class="badge badge-' + status + '">' + icon(iconName, 13) + label + '</span>';
  }
  function plainBadge(tone, label) {
    return '<span class="badge badge-' + tone + '">' + label + '</span>';
  }

  function checklistFor(group) {
    if (group === 'oil') return state.vehicle.engineOil.checklist;
    if (group === 'tire') return state.vehicle.tire.checklist;
    return state.vehicle.terminal.checklist;
  }
  function renderChecklistCard(group, title) {
    var items = checklistFor(group);
    return (
      '<div class="card"><h2 class="card-title">' + icon('clipboard', 16) + title + '</h2>' +
      '<div class="checklist">' +
      items.map(function (c, i) {
        return '<button type="button" class="check-row' + (c.done ? ' checked' : '') + '" data-check-group="' + group + '" data-check-idx="' + i + '">' +
          '<span class="check-box">' + icon('check', 12) + '</span><span class="check-text">' + c.label + '</span></button>';
      }).join('') +
      '</div>' +
      '<button type="button" class="btn btn-primary btn-block" data-action="submit-checklist" data-check-group="' + group + '" style="margin-top:16px;"' +
      (items.some(function (c) { return c.done; }) ? '' : ' disabled') +
      '>' + icon('check', 16) + '제출하기</button>' +
      '</div>'
    );
  }

  function computeTireStat(pos) {
    var today = new Date();
    var used = state.vehicle.currentMileage - pos.installedMileage;
    var distanceRatio = clamp(used / TIRE_CYCLE_KM, 0, 2);
    var monthsElapsed = daysBetween(pos.installedDate, today) / 30.4;
    var periodRatio = clamp(monthsElapsed / TIRE_CYCLE_MONTHS, 0, 2);
    var worse = Math.max(distanceRatio, periodRatio);
    var status = worse >= 1 ? 'danger' : worse >= 0.7 ? 'warning' : 'success';
    return { used: used, distanceRatio: distanceRatio, monthsElapsed: monthsElapsed, status: status };
  }
  function wheelCountFor(type) { return type === '8' ? 8 : 6; }
  function activeTirePositions() {
    var all = state.vehicle.tire.positions;
    if (state.vehicle.type === '8') return all;
    return all.filter(function (p) { return p.id !== 'RL3' && p.id !== 'RR3'; });
  }
  function tireStatsAll() {
    return activeTirePositions().map(function (p) { return { pos: p, stat: computeTireStat(p) }; });
  }

  /* ---------------------------------------------------------
     Toast
  --------------------------------------------------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  /* ---------------------------------------------------------
     Theme
  --------------------------------------------------------- */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('se_theme', state.theme);
    document.querySelectorAll('.brand-logo').forEach(function (img) {
      img.src = state.theme === 'dark' ? img.dataset.darkSrc : img.dataset.lightSrc;
      img.classList.toggle('blend-dark', state.theme === 'dark');
      img.classList.toggle('blend-light', state.theme !== 'dark');
    });
  }
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    if (document.getElementById('screen-main').classList.contains('active')) {
      navigateMain(currentMainView);
    }
  }

  /* ---------------------------------------------------------
     Numeric keypad (bottom sheet) — for inputs marked
     [data-numeric-keypad], e.g. 현재 누적 주행거리
  --------------------------------------------------------- */
  var keypadTargetInput = null;
  var keypadBuffer = '';

  function openKeypad(input) {
    keypadTargetInput = input;
    keypadBuffer = (input.value || '').replace(/[^0-9]/g, '');
    var labelEl = document.querySelector('label[for="' + input.id + '"]');
    document.getElementById('keypad-label').textContent = labelEl ? labelEl.textContent : '입력';
    document.getElementById('keypad-value').textContent = keypadBuffer ? comma(Number(keypadBuffer)) : '0';
    document.getElementById('keypad-overlay').classList.add('show');
  }
  function closeKeypad() {
    document.getElementById('keypad-overlay').classList.remove('show');
    keypadTargetInput = null;
  }
  function applyKeypadBuffer() {
    document.getElementById('keypad-value').textContent = keypadBuffer ? comma(Number(keypadBuffer)) : '0';
    if (keypadTargetInput) {
      keypadTargetInput.value = keypadBuffer ? comma(Number(keypadBuffer)) : '';
      keypadTargetInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /* ---------------------------------------------------------
     Vehicle registration photo — simulated auto-parse
     (no real OCR backend here; mimics one for the prototype)
  --------------------------------------------------------- */
  var MOCK_REG_PARSE = {
    plate: '서울 80바 1234',
    vin: 'KMFGA17JPRB012345',
    mileage: 128500,
    lastInspection: '2026-06-02'
  };

  function revealRegFields() {
    var el = document.getElementById('reg-fields');
    if (el) el.style.display = 'block';
  }

  function runRegPhotoParse(file) {
    var statusEl = document.getElementById('reg-parse-status');
    var hintEl = document.getElementById('reg-parse-hint');
    if (hintEl) hintEl.style.display = 'none';
    statusEl.style.display = 'flex';
    statusEl.className = 'parse-status parsing';
    statusEl.innerHTML = '<span class="spinner"></span>사진에서 정보를 인식하는 중...';

    function fillFail() {
      revealRegFields();
      ['su-plate', 'su-vin', 'su-reg-mileage', 'su-last-inspection'].forEach(function (id) { document.getElementById(id).value = ''; });
      statusEl.className = 'parse-status fail';
      statusEl.innerHTML = icon('alert', 14) + '사진에서 정보를 정확히 인식하지 못했습니다. 아래 항목을 직접 입력해주세요.';
    }
    function fillSuccess(d) {
      revealRegFields();
      if (d.plate) document.getElementById('su-plate').value = d.plate;
      if (d.vin) document.getElementById('su-vin').value = d.vin;
      if (d.regMileage != null) document.getElementById('su-reg-mileage').value = d.regMileage;
      if (d.lastInspectionDate) document.getElementById('su-last-inspection').value = d.lastInspectionDate;
      if (d.vehicleType === '6' || d.vehicleType === '8') document.getElementById('su-type').value = d.vehicleType;
      if (d.currentMileage != null) document.getElementById('su-mileage').value = comma(Number(d.currentMileage));
      statusEl.className = 'parse-status success';
      statusEl.innerHTML = icon('check', 14) + '사진에서 정보를 자동으로 인식했어요. 확인 후 필요하면 수정하세요.';
    }

    var hasGemini = !!(window.SE_CONFIG && window.SE_CONFIG.GEMINI_API_KEY && window.SE_OCR);
    if (file && hasGemini) {
      window.SE_OCR.recognize(file).then(function (d) {
        if (!d || (!d.plate && !d.vin && !d.regMileage && !d.lastInspectionDate)) fillFail();
        else fillSuccess(d);
      }).catch(fillFail);
      return;
    }

    // Gemini 키 미설정 시 기존 mock 인식으로 대체 (화면은 항상 동작)
    setTimeout(function () {
      var success = Math.random() < 0.7;
      if (success) {
        fillSuccess({ plate: MOCK_REG_PARSE.plate, vin: MOCK_REG_PARSE.vin, regMileage: MOCK_REG_PARSE.mileage, lastInspectionDate: MOCK_REG_PARSE.lastInspection });
      } else {
        fillFail();
      }
    }, 1100);
  }

  /* ---------------------------------------------------------
     Notice popup (post-login announcement + 알림 목록에서 열기)
  --------------------------------------------------------- */
  var currentModalNotice = null;
  function openNoticeModal(notice, showCheckbox) {
    currentModalNotice = notice;
    document.getElementById('notice-modal-date').textContent = fmtDot(notice.date);
    document.getElementById('notice-modal-title').textContent = notice.title;
    document.getElementById('notice-modal-body').innerHTML = notice.body;
    document.getElementById('notice-check-row').style.display = showCheckbox ? 'flex' : 'none';
    document.getElementById('notice-dont-show').checked = false;
    document.getElementById('notice-modal').classList.add('show');
  }
  function maybeShowNotice() {
    var today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('se_notice_hide_until') === today) return;
    openNoticeModal(NOTICES[0], true);
  }

  /* ---------------------------------------------------------
     Header partial
  --------------------------------------------------------- */
  var CI_LOGO_SRC = '../reference/dark_logo_trim.png';
  function renderHeader(opts) {
    var metaHtml = '';
    if (opts.meta && opts.meta.length) {
      metaHtml = '<div class="header-meta">' + opts.meta.map(function (m, i) {
        return (i > 0 ? '<span class="dot">·</span>' : '') + '<span class="header-meta-icon">' + icon(m.icon, 13) + '</span>' + m.text;
      }).join('') + '</div>';
    }
    return (
      '<div class="header-row-title">' +
      (opts.back ? '<button class="header-back" data-back>' + icon('back', 20) + '</button>' : '<span class="header-icon">' + icon(opts.icon, 20) + '</span>') +
      '<h1 class="header-title">' + opts.title + '</h1>' +
      (opts.edit ? '<button class="header-edit" data-edit-vehicle>' + icon('pencil', 16) + '</button>' : '') +
      '<img class="header-ci-logo" src="' + CI_LOGO_SRC + '" alt="S&E Driving" />' +
      '</div>' + metaHtml
    );
  }

  function vehicleMeta() {
    return [
      { icon: 'plateCard', text: state.vehicle.plate },
      { icon: 'calendar', text: '최종 점검일 ' + fmtDot(state.vehicle.lastInspectionDate) }
    ];
  }
  function driveMeta() {
    return [
      { icon: 'plateCard', text: state.vehicle.plate },
      { icon: 'route', text: '전월 운행 ' + comma(driveRecord.totalKm) + 'km' }
    ];
  }
  function homeMeta() {
    return [{ icon: 'plateCard', text: state.vehicle.plate }];
  }
  function maintGradeLabel(tone) {
    if (tone === 'success') return '우수';
    if (tone === 'warning') return '양호';
    return '점검 필요';
  }

  /* ---------------------------------------------------------
     Gauge
  --------------------------------------------------------- */
  function gaugeSvg(score) {
    var r = 40, c = 2 * Math.PI * r, ratio = clamp(score / 100, 0, 1), dash = c * ratio;
    var tone = scoreGrade(score).tone;
    return (
      '<div class="gauge-wrap"><svg width="96" height="96" viewBox="0 0 96 96">' +
      '<circle class="gauge-track" cx="48" cy="48" r="' + r + '"/>' +
      '<circle class="gauge-value" style="stroke:' + toneVar(tone) + '" cx="48" cy="48" r="' + r + '" stroke-dasharray="' + dash + ' ' + (c - dash) + '"/>' +
      '</svg><div class="gauge-center"><div class="gauge-score">' + score + '<span style="font-size:13px;font-weight:800;">점</span></div><div class="gauge-max">/100</div></div></div>'
    );
  }

  /* ---------------------------------------------------------
     Truck illustration + hotspots
  --------------------------------------------------------- */
  function truckTopAsset() {
    if (state.vehicle.type !== '8') {
      return state.theme === 'dark'
        ? { src: '../reference/dark_truck_6wheel_topdown.png', cls: 'blend-dark' }
        : { src: '../reference/light_truck_6wheel_topdown.png', cls: 'blend-light' };
    }
    return state.theme === 'dark'
      ? { src: '../reference/dark_truck_8wheel_topdown.png', cls: 'blend-dark' }
      : { src: '../reference/light_truck_8wheel_topdown.png', cls: 'blend-light' };
  }
  function hotspot(x, y, size, status, label) {
    return '<span class="hotspot" style="left:' + x + '%;top:' + y + '%;width:' + size + 'px;height:' + size + 'px;--dot-color:' + toneVar(status) + '"><span class="hotspot-label">' + label + '</span></span>';
  }

  var weatherUnmount = null;

  /* ---------------------------------------------------------
     Nearby service centers (mock data — demo only, not a real
     Kakao Map integration; phone numbers are fictional).
  --------------------------------------------------------- */
  // Kakao Map 로드/검색 실패 시 대체용 mock 정비소 (실 연동 성공하면 displayedShops가 교체됨)
  var SHOPS = [
    { name: '서울중앙 화물차정비센터', dist: '0.6km', addr: '서울 금천구 시흥대로 120', phone: '02-1234-5678', x: 34, y: 38 },
    { name: '강남 대형트럭 서비스', dist: '1.2km', addr: '서울 강남구 테헤란로 210', phone: '02-2345-6789', x: 62, y: 28 },
    { name: '한마음 카센터', dist: '1.8km', addr: '서울 구로구 디지털로 30', phone: '010-3456-7890', x: 22, y: 66 },
    { name: '튼튼 정비공업사', dist: '2.4km', addr: '서울 영등포구 국회대로 55', phone: '02-4567-8901', x: 74, y: 62 },
    { name: '굿모닝 트럭타이어', dist: '3.1km', addr: '서울 양천구 목동로 15', phone: '010-5678-9012', x: 50, y: 80 }
  ];
  var displayedShops = SHOPS;
  var selectedShop = null;

  /* ---------------------------------------------------------
     정비 이력 (mock — 나중에 실제 정비 기록 연동 예정)
  --------------------------------------------------------- */
  var MAINTENANCE_HISTORY = [
    { date: '2026-08-11', item: '정기 점검', mileage: 143200, shop: '서울중앙 화물차정비센터', cost: 50000, note: '분기 정기 점검 — 전체 항목 양호.' },
    { date: '2025-12-05', item: '엔진오일 교체', mileage: 98200, shop: '서울중앙 화물차정비센터', cost: 180000, note: '엔진오일 및 오일필터 교체 완료.' },
    { date: '2025-11-01', item: '타이어 교체 (1열 좌측/운전석)', mileage: 120000, shop: '한마음 카센터', cost: 310000, note: '정기 교체 주기에 따라 사전 교체.' },
    { date: '2024-05-15', item: '타이어 교체 (1열 우측/조수석)', mileage: 98000, shop: '굿모닝 트럭타이어', cost: 320000, note: '편마모 발견으로 교체.' },
    { date: '2023-08-20', item: '타이어 교체 (2열 우측)', mileage: 78000, shop: '튼튼 정비공업사', cost: 340000, note: '마모 한계 도달로 긴급 교체.' }
  ];
  var selectedHistoryIdx = null;
  var reportKind = 'terminal';
  var reportBackTarget = 'dashboard';

  function renderDashboardTruck() {
    var body = '<div class="truck3d-mount" id="dash-truck3d"></div><div class="truck3d-hint">드래그하여 360° 회전</div>';

    return (
      '<div class="card truck-card"><div class="truck-stage" id="dash-truck-stage">' +
      body +
      '</div></div>'
    );
  }

  function mountTruckStageExtras() {
    var mount = document.getElementById('dash-truck3d');
    if (mount && window.SE_Truck3D) window.SE_Truck3D.init(mount, state.theme, wheelCountFor(state.vehicle.type));
  }

  function mountHomeWeather() {
    if (weatherUnmount) { weatherUnmount(); weatherUnmount = null; }
    var canvas = document.getElementById('home-weather-canvas');
    var chip = document.getElementById('home-weather-chip');
    if (canvas && window.SE_Weather) weatherUnmount = window.SE_Weather.mount(canvas, chip);
  }

  function renderTireDetailTruck() {
    var asset = truckTopAsset();
    // x/y are calibrated against the actual wheel positions in the
    // reference/*_truck_*wheel_topdown.png artwork (front axle sits
    // narrower than the cargo-box axles, hence the two x values).
    var rows = state.vehicle.type === '8' ? [
      { p: 'FL', x: 32, y: 30, side: 'left' }, { p: 'FR', x: 66, y: 30, side: 'right' },
      { p: 'RL1', x: 28, y: 51, side: 'left' }, { p: 'RR1', x: 70, y: 51, side: 'right' },
      { p: 'RL2', x: 28, y: 64, side: 'left' }, { p: 'RR2', x: 70, y: 64, side: 'right' },
      { p: 'RL3', x: 28, y: 75, side: 'left' }, { p: 'RR3', x: 70, y: 75, side: 'right' }
    ] : [
      { p: 'FL', x: 32, y: 32, side: 'left' }, { p: 'FR', x: 66, y: 32, side: 'right' },
      { p: 'RL1', x: 28, y: 56, side: 'left' }, { p: 'RR1', x: 70, y: 56, side: 'right' },
      { p: 'RL2', x: 28, y: 70, side: 'left' }, { p: 'RR2', x: 70, y: 70, side: 'right' }
    ];
    var byId = {};
    state.vehicle.tire.positions.forEach(function (p) { byId[p.id] = p; });
    var dots = '', labels = '';
    rows.forEach(function (r) {
      var pos = byId[r.p];
      var stat = computeTireStat(pos);
      dots += hotspot(r.x, r.y, 22, stat.status, pos.label);
      labels +=
        '<div class="tire-wheel-label side-' + r.side + '" style="left:' + r.x + '%;top:' + r.y + '%;">' +
        '<b>' + pos.shortLabel + '</b><span style="color:' + toneVar(stat.status) + '">' + statusLabel('tire', stat.status) + '</span> · ' + fmtDotShort(pos.installedDate) +
        '</div>';
    });
    // Driver's seat sits just inboard (to the right) of the front-left wheel.
    var steering = '<span class="steering-wheel" style="left:44%;top:28%;">' + icon('steeringWheel', 28) + '</span>';
    // Labels render in a separate, non-clipped overlay sized to match the
    // stage exactly — the stage itself keeps overflow:hidden (for the image's
    // rounded corners), so a label wide enough to reach past the wheel's
    // true position would otherwise get cut off mid-text.
    return (
      '<div class="truck-stage" id="tire-truck-stage">' +
      '<img src="' + asset.src + '" class="' + asset.cls + '" alt="타이어 위치" />' +
      steering + dots +
      '</div>' +
      '<div class="tire-label-overlay">' + labels + '</div>'
    );
  }

  /* ---------------------------------------------------------
     View content renderers
  --------------------------------------------------------- */
  function renderDashboardContent() {
    var v = state.vehicle;
    var oilStats = computeOilStats();
    var tireList = tireStatsAll();
    var tireStatus = worstStatus(tireList.map(function (x) { return x.stat.status; }));
    var issueCount = [v.terminal.status, oilStats.severity, tireStatus].filter(function (s) { return s !== 'success'; }).length;
    var worstTire = tireList.reduce(function (acc, x) {
      var rank = { success: 0, warning: 1, danger: 2 };
      return rank[x.stat.status] > rank[acc.stat.status] ? x : acc;
    }, tireList[0]);
    var tireSummary = worstTire.stat.status === 'success' ? '전체 양호'
      : (worstTire.pos.shortLabel + ' ' + (worstTire.stat.status === 'danger' ? '교체 시기 초과' : '교체 준비 필요'));

    return (
      renderDashboardTruck() +
      '<div class="item-list">' +
      '<button class="item-row" data-goto="terminal-detail">' +
      '<span class="item-icon tone-' + v.terminal.status + '">' + icon('wifi', 22) + '</span>' +
      '<span class="item-body"><span class="item-title-row"><span class="item-title">통합단말기</span>' + badge(v.terminal.status, statusLabel('terminal', v.terminal.status)) + '</span>' +
      '<span class="item-sub">통신 ' + (v.terminal.signalLabel === '낮음' ? '불량' : '양호') + ', 펌웨어 ' + (v.terminal.firmwareLatest ? '최신' : '업데이트 필요') + '</span></span>' +
      '<span class="item-cta">상세 ' + icon('chevron', 15) + '</span>' +
      '</button>' +
      '<button class="item-row" data-goto="oil-detail">' +
      '<span class="item-icon tone-' + oilStats.severity + '">' + icon('droplet', 22) + '</span>' +
      '<span class="item-body"><span class="item-title-row"><span class="item-title">엔진오일</span>' + badge(oilStats.severity, statusLabel('oil', oilStats.severity)) + '</span>' +
      '<span class="item-sub">교체 주기 임박, 잔여 ' + v.engineOil.levelPercent + '%</span></span>' +
      '<span class="item-cta">상세 ' + icon('chevron', 15) + '</span>' +
      '</button>' +
      '<button class="item-row" data-goto="tire-detail">' +
      '<span class="item-icon tone-' + tireStatus + '">' + icon('tire', 22) + '</span>' +
      '<span class="item-body"><span class="item-title-row"><span class="item-title">타이어</span>' + badge(tireStatus, statusLabel('tire', tireStatus)) + '</span>' +
      '<span class="item-sub">' + tireSummary + '</span></span>' +
      '<span class="item-cta">상세 ' + icon('chevron', 15) + '</span>' +
      '</button>' +
      '</div>' +
      renderReservationSummary()
    );
  }

  function renderReservationSummary() {
    var list = state.vehicle.reservations;
    var body;
    if (!list.length) {
      body = '<div class="kv-row" style="border-bottom:none;padding-top:2px;"><span class="kv-label">예정된 예약</span><span class="kv-value muted">없음</span></div>';
    } else {
      body = '<div class="kv-list">' + list.map(function (r) {
        return '<div class="kv-row"><span class="kv-label">' + r.shopName + '</span><span class="kv-value">' + r.status + '</span></div>';
      }).join('') + '</div>';
    }
    return (
      '<div class="section-heading">정비 예약 현황</div>' +
      '<div class="card">' + body + '</div>' +
      '<button class="btn btn-primary btn-block" data-goto="reserve-list" style="margin-bottom:10px;">' + icon('calendar', 16) + '정비소 예약하기</button>' +
      '<button class="btn btn-outline btn-block" data-goto="maintenance-history">' + icon('fileText', 16) + '정비 이력 현황</button>'
    );
  }

  function renderMaintenanceHistoryContent() {
    var rows = MAINTENANCE_HISTORY.map(function (h, i) {
      return (
        '<tr data-history-idx="' + i + '">' +
        '<td class="notice-date">' + fmtDot(h.date) + '</td>' +
        '<td class="notice-title">' + h.item + '</td>' +
        '<td style="width:1%;text-align:right;color:var(--text-muted);">' + icon('chevron', 15) + '</td>' +
        '</tr>'
      );
    }).join('');
    return (
      '<div class="fade-in">' +
      '<table class="notice-table">' +
      '<thead><tr><th>날짜</th><th>정비 항목</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '</div>'
    );
  }

  function renderMaintenanceHistoryDetailContent() {
    var h = MAINTENANCE_HISTORY[selectedHistoryIdx];
    if (!h) return '<div class="empty-state"><p>선택된 정비 이력이 없습니다.</p></div>';
    return (
      '<div class="card fade-in"><div class="status-hero">' +
      '<div class="status-hero-icon tone-success">' + icon('wrench', 30) + '</div>' +
      '<div class="status-hero-body"><div class="status-hero-title">' + h.item + '</div>' +
      '<div class="status-hero-sub">' + fmtDot(h.date) + '</div></div>' +
      '</div></div>' +

      '<div class="card"><h2 class="card-title">' + icon('fileText', 16) + '정비 상세</h2>' +
      '<div class="kv-list">' +
      '<div class="kv-row"><span class="kv-label">정비일</span><span class="kv-value">' + fmtDot(h.date) + '</span></div>' +
      '<div class="kv-row"><span class="kv-label">시행 정비소</span><span class="kv-value">' + h.shop + '</span></div>' +
      '<div class="kv-row"><span class="kv-label">당시 주행거리</span><span class="kv-value">' + comma(h.mileage) + ' km</span></div>' +
      '<div class="kv-row"><span class="kv-label">비용</span><span class="kv-value">' + comma(h.cost) + '원</span></div>' +
      '</div></div>' +

      '<div class="card"><h2 class="card-title">메모</h2>' +
      '<p style="font-size:13.5px;color:var(--text-secondary);line-height:1.6;">' + h.note + '</p></div>'
    );
  }

  function renderOilDetailContent() {
    var oil = state.vehicle.engineOil;
    var s = computeOilStats();
    var distPct = Math.round(clamp(s.distanceRatio, 0, 1) * 100);
    var periodPct = Math.round(clamp(s.periodRatio, 0, 1) * 100);
    var heroTitle = s.severity === 'danger' ? '엔진오일 교체가 필요합니다' : s.severity === 'warning' ? '엔진오일 교체 준비' : '엔진오일 상태 양호';
    var monthsApprox = Math.round((s.elapsedDays / 30) * 10) / 10;

    var noteHtml = '';
    if (s.severity === 'danger') {
      noteHtml = '<div class="meter-note" style="color:var(--danger);background:var(--danger-tint);">소진율이 100%를 초과했습니다 — 즉시 교체가 필요합니다.</div>';
    } else if (s.severity === 'warning') {
      noteHtml = '<div class="meter-note">소진율이 70%를 넘었습니다 — 교체를 준비하세요.</div>';
    }

    return (
      '<div class="card fade-in"><div class="status-hero">' +
      '<div class="status-hero-icon tone-' + s.severity + '">' + icon('droplet', 30) +
      '<span class="corner-flag" style="color:var(--' + s.severity + ')">' + icon(s.severity === 'success' ? 'check' : 'alert', 13) + '</span></div>' +
      '<div class="status-hero-body">' + badge(s.severity, statusLabel('oil', s.severity)) +
      '<div class="status-hero-title">' + heroTitle + '</div>' +
      '<div class="status-hero-sub">잔여 약 ' + comma(s.remainingKm) + 'km<br/>' + fmtDateObj(s.nextDue) + ' 중 먼저 도래</div>' +
      '</div></div></div>' +

      '<div class="card"><h2 class="card-title">' + icon('fileText', 16) + '교체 이력</h2>' +
      '<div class="kv-list">' +
      '<div class="kv-row"><span class="kv-label">최근 교체일</span><span class="kv-value">' + fmtDot(oil.lastChangeDate) + '</span></div>' +
      '<div class="kv-row"><span class="kv-label">교체 시 주행거리</span><span class="kv-value">' + comma(oil.lastChangeMileage) + ' km</span></div>' +
      '<div class="kv-row"><span class="kv-label">현재 누적 주행거리</span><span class="kv-value">' + comma(state.vehicle.currentMileage) + ' km</span></div>' +
      '<div class="kv-row"><span class="kv-label">경과</span><span class="kv-value">' + s.elapsedDays + '일 (약 ' + monthsApprox + '개월)</span></div>' +
      '<div class="kv-row"><span class="kv-label">영수증</span><span class="kv-value muted">' + (oil.receiptAttached ? '첨부됨' : '미첨부') + '</span></div>' +
      '</div></div>' +

      '<div class="card"><h2 class="card-title">' + icon('droplet', 16) + '오일 소진율</h2>' +
      '<div class="meter"><div class="meter-top"><span class="meter-label">거리 기준' + (s.moreUrgent === 'distance' ? ' ' + badge('warning', '더 급함') : '') + '</span><span class="meter-pct">' + distPct + '%</span></div>' +
      '<div class="meter-track"><div class="meter-fill ' + (s.moreUrgent === 'distance' ? 'tone-warning' : 'tone-primary') + '" style="width:' + clamp(distPct, 0, 100) + '%"></div></div></div>' +
      '<div class="meter"><div class="meter-top"><span class="meter-label">기간 기준' + (s.moreUrgent === 'period' ? ' ' + badge('warning', '더 급함') : '') + '</span><span class="meter-pct">' + periodPct + '%</span></div>' +
      '<div class="meter-track"><div class="meter-fill ' + (s.moreUrgent === 'period' ? 'tone-warning' : 'tone-primary') + '" style="width:' + clamp(periodPct, 0, 100) + '%"></div></div></div>' +
      noteHtml +
      '<div class="meter-next">다음 교체 권장<br/>잔여 약 <b>' + comma(s.remainingKm) + 'km</b> 또는 <b>' + fmtDateObj(s.nextDue) + '</b> 중 먼저 도래</div>' +
      '</div>' +

      renderChecklistCard('oil', '자가 점검') +

      '<button class="btn btn-primary btn-block" data-goto="oil-register" style="margin-bottom:10px;">' + icon('droplet', 16) + '오일 교체 등록</button>' +
      '<button class="btn btn-outline btn-block" data-action="reserve" style="margin-bottom:10px;">' + icon('calendar', 16) + '정비소 예약</button>' +
      '<button class="btn btn-outline btn-block" data-report-kind="oil">' + icon('clipboard', 16) + '점검 리포트 보기</button>'
    );
  }

  function renderOilRegisterContent() {
    var today = new Date().toISOString().slice(0, 10);
    return (
      '<form id="form-oil-register" class="fade-in">' +
      '<div class="card" style="width:100%;">' +
      '<div class="field">' +
      '<label>영수증 사진 (선택)</label>' +
      '<label class="dropzone" for="oil-receipt" id="oil-dropzone">' +
      '<span class="dropzone-icon">' + icon('image', 28) + '</span>' +
      '<span class="dropzone-title">탭하여 영수증 사진 선택</span>' +
      '<span class="dropzone-sub" id="oil-receipt-name">선택된 파일 없음</span>' +
      '</label>' +
      '<input type="file" id="oil-receipt" accept="image/*" style="display:none;" />' +
      '</div>' +
      '<div class="field"><label for="oil-date">교체일</label>' +
      '<input type="date" id="oil-date" value="' + today + '" /></div>' +
      '<div class="field"><label for="oil-mileage">교체 시 주행거리 (km)</label>' +
      '<input type="number" id="oil-mileage" placeholder="예: ' + state.vehicle.currentMileage + '" min="0" required /></div>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button type="button" class="btn btn-ghost" data-back>취소</button>' +
      '<button type="submit" class="btn btn-primary">등록</button>' +
      '</div></form>'
    );
  }

  function renderTerminalDetailContent() {
    var t = state.vehicle.terminal;
    var dotPos = clamp(t.signalRatio, 0, 1) * 100;
    return (
      '<div class="card fade-in"><div class="status-hero">' +
      '<div class="status-hero-icon tone-' + t.status + '">' + icon('wifi', 30) +
      '<span class="corner-flag" style="color:var(--' + t.status + ')">' + icon(t.status === 'success' ? 'check' : 'alert', 13) + '</span></div>' +
      '<div class="status-hero-body">' + badge(t.status, statusLabel('terminal', t.status)) +
      '<div class="status-hero-title">통신 상태 ' + t.signalLabel + '</div>' +
      '<div class="status-hero-sub">펌웨어 ' + (t.firmwareLatest ? '최신 버전' : '업데이트 필요') + '</div>' +
      '</div></div></div>' +

      '<div class="card"><h2 class="card-title">' + icon('fileText', 16) + '단말기 정보</h2>' +
      '<div class="kv-list">' +
      '<div class="kv-row"><span class="kv-label">펌웨어 버전</span><span class="kv-value">' + t.firmwareVersion + ' / ' + (t.firmwareLatest ? '최신' : '구버전') + '</span></div>' +
      '<div class="kv-row"><span class="kv-label">최근 통신 일시</span><span class="kv-value">' + t.lastCommAt + '</span></div>' +
      '<div class="kv-row"><span class="kv-label">신호 세기</span><span class="kv-value" style="color:var(--primary)">' + t.signalLabel + '</span></div>' +
      '<div class="kv-row"><span class="kv-label">단말기 일련번호</span><span class="kv-value">' + t.serial + '</span></div>' +
      '</div></div>' +

      '<div class="card"><h2 class="card-title">통신 상태</h2>' +
      '<div class="signal-block"><div class="signal-value">' + t.signalLabel + '</div>' +
      '<div class="signal-track"><div class="signal-dot" style="left:' + dotPos + '%"></div></div>' +
      '<div class="signal-scale"><span>낮음</span><span>보통</span><span>높음</span></div>' +
      '</div></div>' +

      renderChecklistCard('terminal', '자가 점검') +

      '<button class="btn btn-primary btn-block" data-action="reserve" style="margin-bottom:10px;">' + icon('calendar', 16) + '정비소 예약</button>' +
      '<button class="btn btn-outline btn-block" data-report-kind="terminal">' + icon('clipboard', 16) + '점검 리포트 보기</button>'
    );
  }

  function renderTireDetailContent() {
    var issueCount = tireStatsAll().filter(function (x) { return x.stat.status !== 'success'; }).length;
    return (
      '<div class="fade-in">' +
      '<div class="tire-flag">' + icon('alert', 16) + '점검·교체 필요 ' + issueCount + '개 · 권장 교체 주기 ' + comma(TIRE_CYCLE_KM) + 'km / ' + TIRE_CYCLE_MONTHS + '개월</div>' +
      '<div class="card truck-card">' + renderTireDetailTruck() + '</div>' +

      renderChecklistCard('tire', '자가 점검') +

      '<button class="btn btn-primary btn-block" data-goto="tire-register" style="margin-bottom:10px;">' + icon('tire', 16) + '타이어 교체 등록</button>' +
      '<button class="btn btn-outline btn-block" data-action="reserve" style="margin-bottom:10px;">' + icon('calendar', 16) + '정비소 예약</button>' +
      '<button class="btn btn-outline btn-block" data-report-kind="tire">' + icon('clipboard', 16) + '점검 리포트 보기</button>' +
      '</div>'
    );
  }

  function renderTireRegisterContent() {
    var today = new Date().toISOString().slice(0, 10);
    var options = activeTirePositions().map(function (p) {
      return '<option value="' + p.id + '">' + p.label + '</option>';
    }).join('');
    return (
      '<form id="form-tire-register" class="fade-in">' +
      '<div class="card" style="width:100%;">' +
      '<div class="field">' +
      '<label for="tire-position">교체 위치</label>' +
      '<select id="tire-position">' + options + '</select>' +
      '</div>' +
      '<div class="field">' +
      '<label>교체 영수증 사진 (선택)</label>' +
      '<label class="dropzone" for="tire-receipt" id="tire-dropzone">' +
      '<span class="dropzone-icon">' + icon('image', 28) + '</span>' +
      '<span class="dropzone-title">탭하여 영수증 사진 선택</span>' +
      '<span class="dropzone-sub" id="tire-receipt-name">선택된 파일 없음</span>' +
      '</label>' +
      '<input type="file" id="tire-receipt" accept="image/*" style="display:none;" />' +
      '</div>' +
      '<div class="field"><label for="tire-date">교체일</label>' +
      '<input type="date" id="tire-date" value="' + today + '" /></div>' +
      '<div class="field"><label for="tire-mileage">교체 시 주행거리 (km)</label>' +
      '<input type="number" id="tire-mileage" placeholder="예: ' + state.vehicle.currentMileage + '" min="0" required /></div>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button type="button" class="btn btn-ghost" data-back>취소</button>' +
      '<button type="submit" class="btn btn-primary">등록</button>' +
      '</div></form>'
    );
  }

  var REPORT_TITLE = { terminal: '통합단말기', oil: '엔진오일', tire: '타이어' };

  function renderReportDetailContent() {
    var group = REPORT_TITLE[reportKind] ? reportKind : 'terminal';
    var log = (SELF_CHECK_LOG[group] || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var doneCount = log.filter(function (l) { return l.done; }).length;
    var tone = log.length === 0 ? 'danger' : doneCount === log.length ? 'success' : doneCount > 0 ? 'warning' : 'danger';
    var rows = log.map(function (l) {
      return (
        '<tr><td class="notice-date">' + fmtDot(l.date) + '</td>' +
        '<td style="text-align:right;font-weight:800;color:' + (l.done ? 'var(--success)' : 'var(--text-muted)') + '">' + (l.done ? '확인 완료' : '미확인') + '</td></tr>'
      );
    }).join('');
    return (
      '<div class="card fade-in"><div class="status-hero">' +
      '<div class="status-hero-icon tone-' + tone + '">' + icon('clipboard', 30) + '</div>' +
      '<div class="status-hero-body"><div class="status-hero-title">' + REPORT_TITLE[group] + ' 자가 점검 이력</div>' +
      '<div class="status-hero-sub">' + doneCount + ' / ' + log.length + '일 확인 완료</div>' +
      '</div></div></div>' +

      (log.length
        ? '<table class="notice-table"><thead><tr><th>날짜</th><th style="text-align:right;">상태</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p style="font-size:12.5px;color:var(--text-muted);text-align:center;margin-top:8px;line-height:1.6;">아직 제출된 자가 점검 내역이 없습니다.<br/>자가 점검을 진행한 뒤 다시 확인해 주세요.</p>')
    );
  }

  function renderHomeContent() {
    var v = state.vehicle;
    var oilStats = computeOilStats();
    var tireList = tireStatsAll();
    var tireStatus = worstStatus(tireList.map(function (x) { return x.stat.status; }));
    var maintIssues = [v.terminal.status, oilStats.severity, tireStatus].filter(function (s) { return s !== 'success'; }).length;
    var maintTone = maintIssues === 0 ? 'success' : (tireStatus === 'danger' || oilStats.severity === 'danger' ? 'danger' : 'warning');
    var driveGrade = scoreGrade(driveRecord.score);

    return (
      '<div class="fade-in">' +
      '<div class="home-greeting">안녕하세요, ' + (state.user.nickname || state.user.id || '게스트') + '님</div>' +
      '<div class="home-greeting-sub">오늘도 안전 운행하세요.</div>' +

      '<div class="truck-photo-placeholder" id="home-weather-stage">' +
      '<canvas class="weather-canvas" id="home-weather-canvas"></canvas>' +
      '<span class="weather-chip" id="home-weather-chip">날씨 불러오는 중…</span>' +
      '<span class="truck-photo-icon">' + icon('truck', 28) + '</span>' +
      '<span class="truck-photo-text">내 트럭 사진</span>' +
      '</div>' +

      '<div class="home-card-grid">' +
      '<button class="home-card-vertical" data-goto="drive">' +
      '<span class="item-icon tone-' + driveGrade.tone + '">' + icon('medal', 20) + '</span>' +
      '<div class="home-card-title">지난달 안전운전</div>' +
      '<div class="home-card-value">' + driveRecord.score + '점 · ' + driveGrade.medalLabel + '</div>' +
      '</button>' +

      '<button class="home-card-vertical" data-goto="dashboard">' +
      '<span class="item-icon tone-' + maintTone + '">' + icon('wrench', 20) + '</span>' +
      '<div class="home-card-title-row"><span class="home-card-title">차량 정비 상태</span><span class="home-card-grade" style="color:' + toneVar(maintTone) + '">' + maintGradeLabel(maintTone) + '</span></div>' +
      '<div class="home-card-value">' + (maintIssues === 0 ? '전체 항목 정상' : '점검 필요 항목 ' + maintIssues + '건') + '</div>' +
      '</button>' +
      '</div>' +
      '</div>'
    );
  }

  function renderNotificationsContent() {
    var today = new Date().toISOString().slice(0, 10);
    var rows = NOTICES.map(function (n, i) {
      var unread = n.date === today || !n.read;
      return '<tr data-notice-idx="' + i + '" class="' + (unread ? 'unread' : '') + '"><td class="notice-date">' + fmtDot(n.date) + '</td><td class="notice-title">' + n.title + '</td></tr>';
    }).join('');
    return (
      '<div class="fade-in">' +
      '<table class="notice-table">' +
      '<thead><tr><th>날짜</th><th>제목</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '</div>'
    );
  }

  function renderDriveContent() {
    var grade = scoreGrade(driveRecord.score);
    var periods = tripPeriods();
    if (!selectedTripPeriod || periods.indexOf(selectedTripPeriod) === -1) selectedTripPeriod = periods[0];
    var filteredTrips = TRIP_LOG.filter(function (t) { return t.date.slice(0, 7) === selectedTripPeriod; });

    var tripRows = filteredTrips.length ? filteredTrips.map(function (t) {
      var g = tripGrade(t.score);
      return (
        '<button class="item-row trip-row" data-action="trip-detail">' +
        '<span class="item-body"><span class="item-title-row"><span class="item-title">' + fmtDot(t.date) + '</span>' + plainBadge(g.tone, g.label) + '</span>' +
        '<span class="item-sub">' + t.from + ' → ' + t.to + ' · ' + comma(t.km) + 'km · ' + t.score + '점</span></span>' +
        '<span class="item-cta">' + icon('chevron', 15) + '</span>' +
        '</button>'
      );
    }).join('') : '<div class="empty-state" style="padding:32px 24px;"><p>선택한 기간의 운행 기록이 없습니다.</p></div>';

    var periodOptions = periods.map(function (p) {
      return '<option value="' + p + '"' + (p === selectedTripPeriod ? ' selected' : '') + '>' + periodLabel(p) + '</option>';
    }).join('');

    return (
      '<div class="fade-in">' +
      '<div class="card">' +
      '<div class="score-row">' +
      '<div class="gauge-wrap"><svg width="96" height="96" viewBox="0 0 96 96">' +
      '<circle class="gauge-track" cx="48" cy="48" r="40"/>' +
      '<circle class="gauge-value" style="stroke:' + toneVar(grade.tone) + '" cx="48" cy="48" r="40" stroke-dasharray="' + (2 * Math.PI * 40 * driveRecord.score / 100) + ' ' + (2 * Math.PI * 40 * (1 - driveRecord.score / 100)) + '"/>' +
      '</svg><div class="gauge-center"><div class="gauge-score">' + driveRecord.score + '<span style="font-size:13px;font-weight:800;">점</span></div><div class="gauge-max">/100</div>' +
      '</div></div>' +
      '<div class="score-divider"></div>' +
      '<div class="medal-figure">' +
      '<img class="medal-img" src="../reference/medal_' + grade.medal + '.png" alt="' + grade.medalLabel + ' 등급" />' +
      '<div class="medal-percentile">상위 ' + driveRecord.percentile + '%</div>' +
      '</div>' +
      '</div>' +
      '<div class="drive-stats">' +
      '<div class="drive-stat"><div class="drive-stat-label">운행 건수</div><div class="drive-stat-value">' + driveRecord.tripCount + ' 회</div></div>' +
      '<div class="drive-stat"><div class="drive-stat-label">총 주행거리</div><div class="drive-stat-value">' + comma(driveRecord.totalKm) + ' km</div></div>' +
      '<div class="drive-stat"><div class="drive-stat-label">평균 속도</div><div class="drive-stat-value">' + driveRecord.avgSpeed + ' km/h</div></div>' +
      '<div class="drive-stat"><div class="drive-stat-label">급제동 횟수</div><div class="drive-stat-value">' + driveRecord.hardBrakeCount + ' 건</div></div>' +
      '</div>' +
      '<div class="eval-meta-note">평가 기간 ' + fmtDot(driveRecord.periodStart) + ' ~ ' + fmtDot(driveRecord.periodEnd) + '<br/>기준일 ' + fmtDot(driveRecord.baselineDate) + '</div>' +
      '</div>' +
      '<div class="section-heading-row">' +
      '<span class="section-heading">일자별 운행 기록</span>' +
      '<select class="period-select" id="trip-period-select">' + periodOptions + '</select>' +
      '</div>' +
      '<div class="item-list">' + tripRows + '</div>' +
      '</div>'
    );
  }

  function renderSettingsContent() {
    var v = state.vehicle;
    var displayName = state.user.nickname || state.user.id || '게스트';
    var initial = displayName.slice(0, 1).toUpperCase();
    var avatarInner = state.user.photoDataUrl
      ? '<img class="profile-avatar-img" src="' + state.user.photoDataUrl + '" alt="프로필 사진" />'
      : '<div class="profile-avatar">' + initial + '</div>';
    return (
      '<div class="fade-in">' +
      '<div class="profile-card">' +
      '<label class="profile-avatar-wrap" for="profile-photo-input" title="프로필 사진 등록">' +
      avatarInner +
      '<span class="profile-avatar-edit">' + icon('image', 13) + '</span>' +
      '</label>' +
      '<input type="file" id="profile-photo-input" accept="image/*" style="display:none;" />' +
      '<div><div class="profile-name">' + displayName + '</div>' +
      '<div class="profile-sub">' + v.plate + '</div></div></div>' +

      '<div class="section-heading">화면</div>' +
      '<div class="settings-row"><div><div class="settings-row-title">다크 모드</div><div class="settings-row-sub">눈이 편안한 어두운 테마로 전환합니다</div></div>' +
      '<label class="switch"><input type="checkbox" id="theme-switch" ' + (state.theme === 'dark' ? 'checked' : '') + ' /><span class="switch-track"><span class="switch-thumb"></span></span></label>' +
      '</div>' +

      '<div class="section-heading">차량 정보</div>' +
      '<div class="settings-row"><div><div class="settings-row-title">차량 번호</div><div class="settings-row-sub">' + v.plate + '</div></div>' +
      '<button class="btn btn-ghost btn-sm" data-edit-vehicle>' + icon('pencil', 14) + '수정</button></div>' +
      '<div class="settings-row"><div><div class="settings-row-title">차종</div><div class="settings-row-sub">' + (v.type === '8' ? '8휠 화물차' : '6휠 화물차') + '</div></div></div>' +

      '<div class="section-heading">계정</div>' +
      '<button class="btn btn-ghost btn-block" data-action="logout">' + icon('logout', 16) + '로그아웃</button>' +
      '</div>'
    );
  }

  function shopRowsHtml(shops) {
    return shops.map(function (s, i) {
      return (
        '<div class="shop-row">' +
        '<div class="shop-row-top">' +
        '<div class="shop-info"><div class="shop-name">' + s.name + '</div><div class="shop-meta">' + s.addr + '</div></div>' +
        '<span class="shop-dist">' + s.dist + '</span>' +
        '<button class="btn btn-primary shop-reserve-btn" data-book-shop="' + i + '">예약하기</button>' +
        '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderReserveListContent() {
    displayedShops = SHOPS;
    var pins = SHOPS.map(function (s, i) {
      return '<span class="map-pin" style="left:' + s.x + '%;top:' + s.y + '%;" data-book-shop="' + i + '">' + icon('pin', 26) + '</span>';
    }).join('');

    return (
      '<div class="fade-in">' +
      '<div class="map-mock" id="reserve-map">' +
      '<span class="map-pin me" style="left:46%;top:50%;">' + icon('pin', 22) + '</span>' +
      pins +
      '<span class="map-note" id="reserve-map-note">지도를 불러오는 중...</span>' +
      '</div>' +
      '<div class="section-heading">현재 위치 기준 가까운 정비소 <span id="reserve-shop-count">' + SHOPS.length + '</span>곳</div>' +
      '<div id="reserve-shop-rows">' + shopRowsHtml(SHOPS) + '</div>' +
      '</div>'
    );
  }

  function mountReserveMap() {
    var mapEl = document.getElementById('reserve-map');
    if (!mapEl || !window.SE_KakaoMap) return;
    window.SE_KakaoMap.mount(mapEl, {
      onReady: function (shops) {
        displayedShops = shops;
        var rowsEl = document.getElementById('reserve-shop-rows');
        var countEl = document.getElementById('reserve-shop-count');
        if (rowsEl) rowsEl.innerHTML = shopRowsHtml(shops);
        if (countEl) countEl.textContent = shops.length;
      },
      onError: function () {
        var noteEl = document.getElementById('reserve-map-note');
        if (noteEl) noteEl.textContent = '데모 지도 · 카카오맵 연동 실패(mock으로 표시)';
      }
    });
  }

  function renderCallConfirmContent() {
    if (!selectedShop) return '<div class="empty-state"><p>선택된 정비소가 없습니다.</p></div>';
    var s = selectedShop;
    return (
      '<div class="card fade-in">' +
      '<div class="call-sheet-icon">' + icon('phone', 28) + '</div>' +
      '<div class="call-number">' + s.phone + '</div>' +
      '<div class="call-shop-name">' + s.name + ' · ' + s.dist + '</div>' +
      '<div class="btn-row">' +
      '<button type="button" class="btn btn-ghost" data-back>취소</button>' +
      '<a href="tel:' + s.phone.replace(/-/g, '') + '" class="btn btn-call" data-action="call-placed" style="flex:1;">' + icon('phone', 16) + '전화 걸기</a>' +
      '</div></div>' +
      '<p style="font-size:12px;color:var(--text-muted);text-align:center;margin-top:14px;line-height:1.6;">예약 요청이 접수되었습니다.<br/>정비소와 통화하여 방문 일정을 확정해주세요.</p>'
    );
  }

  /* ---------------------------------------------------------
     Router
  --------------------------------------------------------- */
  var currentMainView = 'home';
  var BACK_TARGET = {
    'oil-detail': 'dashboard', 'terminal-detail': 'dashboard', 'tire-detail': 'dashboard', 'oil-register': 'oil-detail',
    'tire-register': 'tire-detail',
    'reserve-list': 'dashboard', 'call-confirm': 'reserve-list',
    'maintenance-history': 'dashboard', 'maintenance-history-detail': 'maintenance-history'
  };
  var NAV_TAB_FOR = {
    home: 'home',
    dashboard: 'dashboard', 'oil-detail': 'dashboard', 'terminal-detail': 'dashboard', 'tire-detail': 'dashboard', 'oil-register': 'dashboard',
    'tire-register': 'dashboard',
    'reserve-list': 'dashboard', 'call-confirm': 'dashboard', 'report-detail': 'dashboard',
    'maintenance-history': 'dashboard', 'maintenance-history-detail': 'dashboard',
    drive: 'drive', notifications: 'notifications', settings: 'settings'
  };

  var HEADERS = {
    home: function () { return renderHeader({ icon: 'home', title: '홈', meta: homeMeta() }); },
    dashboard: function () { return renderHeader({ icon: 'truck', title: '차량 정비 현황', meta: vehicleMeta() }); },
    'oil-detail': function () { return renderHeader({ back: true, icon: 'droplet', title: '엔진오일 상세', meta: vehicleMeta() }); },
    'terminal-detail': function () { return renderHeader({ back: true, icon: 'wifi', title: '통합단말기 상세', meta: vehicleMeta() }); },
    'tire-detail': function () { return renderHeader({ back: true, icon: 'tire', title: '타이어 상세', meta: vehicleMeta() }); },
    'oil-register': function () { return renderHeader({ back: true, title: '오일 교체 등록', meta: vehicleMeta() }); },
    'tire-register': function () { return renderHeader({ back: true, title: '타이어 교체 등록', meta: vehicleMeta() }); },
    'reserve-list': function () { return renderHeader({ back: true, icon: 'map', title: '정비소 예약', meta: vehicleMeta() }); },
    'call-confirm': function () { return renderHeader({ back: true, title: '예약 전화하기', meta: vehicleMeta() }); },
    'maintenance-history': function () { return renderHeader({ back: true, icon: 'fileText', title: '정비 이력', meta: vehicleMeta() }); },
    'maintenance-history-detail': function () { return renderHeader({ back: true, title: '정비 이력 상세', meta: vehicleMeta() }); },
    'report-detail': function () { return renderHeader({ back: true, icon: 'clipboard', title: (REPORT_TITLE[reportKind] || REPORT_TITLE.terminal) + ' 점검 리포트', meta: vehicleMeta() }); },
    drive: function () { return renderHeader({ icon: 'compass', title: '운행', meta: driveMeta() }); },
    notifications: function () { return renderHeader({ icon: 'bell', title: '알림', meta: homeMeta() }); },
    settings: function () { return renderHeader({ icon: 'settings', title: '설정', meta: homeMeta() }); }
  };
  var CONTENTS = {
    home: renderHomeContent,
    dashboard: renderDashboardContent,
    'oil-detail': renderOilDetailContent,
    'terminal-detail': renderTerminalDetailContent,
    'tire-detail': renderTireDetailContent,
    'oil-register': renderOilRegisterContent,
    'tire-register': renderTireRegisterContent,
    'reserve-list': renderReserveListContent,
    'call-confirm': renderCallConfirmContent,
    'maintenance-history': renderMaintenanceHistoryContent,
    'maintenance-history-detail': renderMaintenanceHistoryDetailContent,
    'report-detail': renderReportDetailContent,
    drive: renderDriveContent,
    notifications: renderNotificationsContent,
    settings: renderSettingsContent
  };

  function navigateMain(view) {
    currentMainView = view;
    document.getElementById('app-header').innerHTML = HEADERS[view]();
    document.getElementById('app-content').innerHTML = CONTENTS[view]();
    document.querySelectorAll('.nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.nav === NAV_TAB_FOR[view]);
    });
    document.getElementById('app-content').scrollTop = 0;
    document.getElementById('app-root').scrollTop = 0;

    if (view === 'dashboard') {
      mountTruckStageExtras();
    } else if (window.SE_Truck3D) {
      window.SE_Truck3D.dispose();
    }

    if (view === 'home') {
      mountHomeWeather();
    } else if (weatherUnmount) {
      weatherUnmount(); weatherUnmount = null;
    }

    if (view === 'reserve-list') {
      mountReserveMap();
    }
  }

  function enterApp() {
    document.querySelectorAll('.screen-auth').forEach(function (s) { s.classList.remove('active'); });
    document.getElementById('screen-main').classList.add('active');
    navigateMain('home');
  }
  function showAuth(id) {
    document.getElementById('screen-main').classList.remove('active');
    document.querySelectorAll('.screen-auth').forEach(function (s) { s.classList.remove('active'); });
    document.getElementById(id).classList.add('active');
  }

  /* ---------------------------------------------------------
     Event wiring
  --------------------------------------------------------- */
  function wirePasswordToggle(btn) {
    var input = document.getElementById(btn.dataset.togglePw);
    var visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    btn.classList.toggle('is-visible', !visible);
    btn.innerHTML = (!visible ? ICONS.eyeOff : ICONS.eye).split('{S}').join('20');
  }

  // Focusing a button deep inside an absolutely-positioned overlay (the notice
  // modal, the keypad sheet, …) can make some browsers scroll #app-root itself
  // into view for that focus target, even though it's overflow:hidden and
  // never meant to scroll. Only #app-content should ever scroll, so correct
  // any stray #app-root scroll right after each click settles.
  function resetShellScroll() {
    var root = document.getElementById('app-root');
    if (root && root.scrollTop !== 0) root.scrollTop = 0;
  }

  document.addEventListener('click', function (e) {
    setTimeout(resetShellScroll, 0);
    var t;

    if ((t = e.target.closest('[data-toggle-pw]'))) { wirePasswordToggle(t); return; }

    if ((t = e.target.closest('[data-numeric-keypad]'))) { openKeypad(t); return; }
    if ((t = e.target.closest('[data-key]'))) {
      var k = t.dataset.key;
      if (k === 'back') keypadBuffer = keypadBuffer.slice(0, -1);
      else if (k === 'clear') keypadBuffer = '';
      else if (keypadBuffer.length < 7) keypadBuffer += k;
      applyKeypadBuffer();
      return;
    }
    if ((t = e.target.closest('#keypad-done'))) { closeKeypad(); return; }
    if (e.target.id === 'keypad-overlay') { closeKeypad(); return; }

    if ((t = e.target.closest('#reg-manual-toggle'))) {
      revealRegFields();
      var hintEl = document.getElementById('reg-parse-hint');
      if (hintEl) hintEl.style.display = 'none';
      document.getElementById('reg-parse-status').style.display = 'none';
      return;
    }

    if ((t = e.target.closest('#notice-confirm'))) {
      if (document.getElementById('notice-dont-show').checked) {
        localStorage.setItem('se_notice_hide_until', new Date().toISOString().slice(0, 10));
      }
      if (currentModalNotice) currentModalNotice.read = true;
      document.getElementById('notice-modal').classList.remove('show');
      return;
    }

    if ((t = e.target.closest('[data-nav]'))) {
      navigateMain(t.dataset.nav);
      return;
    }

    if ((t = e.target.closest('[data-goto]'))) { navigateMain(t.dataset.goto); return; }

    if ((t = e.target.closest('[data-back]'))) {
      if (currentMainView === 'report-detail') { navigateMain(reportBackTarget || 'dashboard'); return; }
      navigateMain(BACK_TARGET[currentMainView] || 'dashboard');
      return;
    }

    if ((t = e.target.closest('[data-toggle-coords]'))) {
      var stage = document.getElementById(t.dataset.toggleCoords);
      stage.classList.toggle('show-coords');
      t.classList.toggle('active');
      return;
    }

    if ((t = e.target.closest('[data-check-idx]'))) {
      var idx = Number(t.dataset.checkIdx);
      var group = t.dataset.checkGroup || 'terminal';
      var list = checklistFor(group);
      var item = list[idx];
      item.done = !item.done;
      t.classList.toggle('checked', item.done);
      var card = t.closest('.card');
      var submitBtn = card ? card.querySelector('[data-action="submit-checklist"]') : null;
      if (submitBtn) submitBtn.disabled = !list.some(function (c) { return c.done; });
      return;
    }

    if ((t = e.target.closest('[data-history-idx]'))) {
      selectedHistoryIdx = Number(t.dataset.historyIdx);
      navigateMain('maintenance-history-detail');
      return;
    }

    if ((t = e.target.closest('[data-notice-idx]'))) {
      var noticeIdx = Number(t.dataset.noticeIdx);
      NOTICES[noticeIdx].read = true;
      if (currentMainView === 'notifications') {
        document.getElementById('app-content').innerHTML = renderNotificationsContent();
      }
      openNoticeModal(NOTICES[noticeIdx], false);
      return;
    }
    if ((t = e.target.closest('[data-action="trip-detail"]'))) { toast('운행 상세 기능은 준비 중입니다.'); return; }

    if ((t = e.target.closest('[data-action="submit-checklist"]'))) {
      var checklistGroup = t.dataset.checkGroup || 'terminal';
      var today = new Date().toISOString().slice(0, 10);
      var log = SELF_CHECK_LOG[checklistGroup] || (SELF_CHECK_LOG[checklistGroup] = []);
      var todayEntry = log.filter(function (l) { return l.date === today; })[0];
      if (todayEntry) todayEntry.done = true;
      else log.unshift({ date: today, done: true });
      toast('점검 결과가 제출되었습니다.');
      return;
    }

    if ((t = e.target.closest('[data-action="reserve"]'))) { navigateMain('reserve-list'); return; }
    if ((t = e.target.closest('[data-report-kind]'))) {
      reportKind = t.dataset.reportKind;
      reportBackTarget = currentMainView;
      navigateMain('report-detail');
      return;
    }

    if ((t = e.target.closest('[data-book-shop]'))) {
      var shop = displayedShops[Number(t.dataset.bookShop)];
      selectedShop = shop;
      state.vehicle.reservations = [{ shopName: shop.name, status: '예약 접수' }];
      navigateMain('call-confirm');
      return;
    }
    if ((t = e.target.closest('[data-action="call-placed"]'))) { toast('통화를 연결합니다.'); return; }
    if ((t = e.target.closest('[data-action="logout"]'))) {
      showAuth('screen-login');
      toast('로그아웃되었습니다.');
      return;
    }

    if ((t = e.target.closest('[data-edit-vehicle]'))) {
      var plate = window.prompt('차량 번호를 입력하세요', state.vehicle.plate);
      if (plate) { state.vehicle.plate = plate.trim(); navigateMain(currentMainView); toast('차량 정보가 수정되었습니다.'); }
      return;
    }

    if ((t = e.target.closest('#link-to-signup'))) { e.preventDefault(); showAuth('screen-signup'); return; }
    if ((t = e.target.closest('#link-to-login'))) { e.preventDefault(); showAuth('screen-login'); return; }
    if ((t = e.target.closest('#signup-back-btn'))) { showAuth('screen-login'); return; }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'theme-switch') { toggleTheme(); }
    if (e.target.id === 'trip-period-select') {
      selectedTripPeriod = e.target.value;
      navigateMain('drive');
    }
    if (e.target.id === 'su-reg-photo') {
      var regNameEl = document.getElementById('reg-photo-name');
      var regZoneEl = document.getElementById('reg-dropzone');
      var regFile = e.target.files && e.target.files[0];
      regNameEl.textContent = regFile ? regFile.name : '선택된 파일 없음';
      if (regZoneEl) regZoneEl.classList.toggle('has-file', !!regFile);
      if (regFile) runRegPhotoParse(regFile);
    }
    if (e.target.id === 'oil-receipt') {
      var nameEl = document.getElementById('oil-receipt-name');
      var zoneEl = document.getElementById('oil-dropzone');
      var f = e.target.files && e.target.files[0];
      nameEl.textContent = f ? f.name + ' 첨부됨' : '선택된 파일 없음';
      if (zoneEl) zoneEl.classList.toggle('has-file', !!f);
    }
    if (e.target.id === 'tire-receipt') {
      var tNameEl = document.getElementById('tire-receipt-name');
      var tZoneEl = document.getElementById('tire-dropzone');
      var tf = e.target.files && e.target.files[0];
      tNameEl.textContent = tf ? tf.name + ' 첨부됨' : '선택된 파일 없음';
      if (tZoneEl) tZoneEl.classList.toggle('has-file', !!tf);
    }
    if (e.target.id === 'profile-photo-input') {
      var photoFile = e.target.files && e.target.files[0];
      if (photoFile) {
        var reader = new FileReader();
        reader.onload = function (ev) {
          state.user.photoDataUrl = ev.target.result;
          if (currentMainView === 'settings') navigateMain('settings');
        };
        reader.readAsDataURL(photoFile);
      }
    }
    if (e.target.id === 'su-privacy-consent') {
      var submitBtn2 = document.getElementById('signup-submit-btn');
      if (submitBtn2) submitBtn2.disabled = !e.target.checked;
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'su-pw2') {
      var pw = document.getElementById('su-pw').value;
      var hint = document.getElementById('hint-pw2');
      if (!e.target.value) { hint.textContent = ' '; hint.className = 'field-hint'; }
      else if (e.target.value === pw) { hint.textContent = '비밀번호가 일치합니다.'; hint.className = 'field-hint ok'; }
      else { hint.textContent = '비밀번호가 일치하지 않습니다.'; hint.className = 'field-hint error'; }
    }
  });

  document.addEventListener('submit', function (e) {
    if (e.target.id === 'form-login') {
      e.preventDefault();
      var id = document.getElementById('login-id').value.trim();
      state.user.id = id || '게스트';
      enterApp();
      toast('환영합니다, ' + state.user.id + '님!');
      maybeShowNotice();
    }

    if (e.target.id === 'form-signup') {
      e.preventDefault();
      var pw = document.getElementById('su-pw').value;
      var pw2 = document.getElementById('su-pw2').value;
      if (pw !== pw2) { toast('비밀번호가 일치하지 않습니다.'); return; }

      var newId = document.getElementById('su-id').value.trim();
      state.user.id = newId;
      var nickname = document.getElementById('su-nickname').value.trim();
      state.user.nickname = nickname;

      var plateVal = document.getElementById('su-plate').value.trim();
      if (plateVal) state.vehicle.plate = plateVal;
      state.vehicle.vin = document.getElementById('su-vin').value.trim();
      var regMileageVal = Number(document.getElementById('su-reg-mileage').value);
      if (regMileageVal > 0) state.vehicle.regMileage = regMileageVal;
      var lastInspVal = document.getElementById('su-last-inspection').value;
      if (lastInspVal) state.vehicle.lastInspectionDate = lastInspVal;

      state.vehicle.type = document.getElementById('su-type').value;
      var mileage = Number(document.getElementById('su-mileage').value.replace(/,/g, ''));
      if (mileage > 0) state.vehicle.currentMileage = mileage;

      e.target.reset();
      document.getElementById('reg-fields').style.display = 'none';
      document.getElementById('reg-parse-status').style.display = 'none';
      document.getElementById('reg-parse-hint').style.display = 'block';
      document.getElementById('reg-photo-name').textContent = '선택된 파일 없음';
      document.getElementById('reg-dropzone').classList.remove('has-file');

      showAuth('screen-login');
      document.getElementById('login-id').value = newId;
      toast('가입이 완료되었습니다! 로그인해주세요.');
    }

    if (e.target.id === 'form-oil-register') {
      e.preventDefault();
      var date = document.getElementById('oil-date').value;
      var mileageVal = Number(document.getElementById('oil-mileage').value);
      var fileInput = document.getElementById('oil-receipt');
      if (date) state.vehicle.engineOil.lastChangeDate = date;
      if (mileageVal > 0) state.vehicle.engineOil.lastChangeMileage = mileageVal;
      state.vehicle.engineOil.receiptAttached = !!(fileInput.files && fileInput.files[0]);
      state.vehicle.engineOil.levelPercent = 100;
      navigateMain('oil-detail');
      toast('오일 교체가 등록되었습니다.');
    }

    if (e.target.id === 'form-tire-register') {
      e.preventDefault();
      var posId = document.getElementById('tire-position').value;
      var tireDate = document.getElementById('tire-date').value;
      var tireMileageVal = Number(document.getElementById('tire-mileage').value);
      var pos = state.vehicle.tire.positions.filter(function (p) { return p.id === posId; })[0];
      if (pos) {
        if (tireDate) pos.installedDate = tireDate;
        if (tireMileageVal > 0) pos.installedMileage = tireMileageVal;
      }
      navigateMain('tire-detail');
      toast('타이어 교체가 등록되었습니다.');
    }
  });

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */
  document.querySelectorAll('[data-icon]').forEach(function (el) {
    el.innerHTML = icon(el.dataset.icon, 20);
  });
  applyTheme();
  showAuth('screen-login');
})();
