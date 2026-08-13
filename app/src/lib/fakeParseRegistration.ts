// fakeParseRegistration.ts — 차량등록증 업로드 스텁. 실제 OCR 아니다.
// 기사 자가가입(LoginScreen)과 법인 승용차 등록(SettingsScreen)이 이 함수 하나를 같이 쓴다.
import type { VehicleClass } from '../types';

export type ParsedRegistration = {
  vehicle_class: VehicleClass;
  maker: string;
  model: string;
  year: number;
  plate: string;
  registered_kmpl: number;
};

const TRUCK_SAMPLES = [
  { maker: '현대자동차', model: '엑시언트' },
  { maker: '볼보트럭', model: 'FH' },
  { maker: '스카니아', model: 'R시리즈' },
];
const CAR_SAMPLES = [
  { maker: '현대자동차', model: '아반떼' },
  { maker: '기아', model: 'K5' },
  { maker: '현대자동차', model: '쏘나타' },
];

function randomPlate() {
  const region = ['서울', '경기', '인천', '부산'][Math.floor(Math.random() * 4)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${region}12가${digits}`;
}

/** 900ms 딜레이 후 무작위 값을 반환한다. 실제 OCR이 아니다 — 화면에 그 사실을 반드시 캡션으로 밝힌다. */
export async function fakeParseRegistration(vehicleClass: VehicleClass = 'truck'): Promise<ParsedRegistration> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  const pool = vehicleClass === 'truck' ? TRUCK_SAMPLES : CAR_SAMPLES;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return {
    vehicle_class: vehicleClass,
    maker: pick.maker,
    model: pick.model,
    year: 2019 + Math.floor(Math.random() * 6),
    plate: randomPlate(),
    registered_kmpl: vehicleClass === 'truck'
      ? Number((3.2 + Math.random() * 0.8).toFixed(1))
      : Number((11 + Math.random() * 6).toFixed(1)),
  };
}
