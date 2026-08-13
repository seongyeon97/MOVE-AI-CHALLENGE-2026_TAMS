// deviceRequests.ts — 기사뷰 "단말 점검 요청" → Safe 상태 열 반영. 세션 전용(새로고침 시 리셋).
import { useMemo } from 'react';
import { createStore } from './eventStore';

export type DeviceRequest = {
  id: string;
  vehicle_id: string;
  requested_at: string;
  resolved: boolean;
  resolved_at?: string;
};

const store = createStore<DeviceRequest>();
let seq = 0;

export function requestDeviceCheck(vehicleId: string) {
  seq += 1;
  store.add({ id: `devreq-${seq}`, vehicle_id: vehicleId, requested_at: new Date().toISOString(), resolved: false });
}

export function resolveDeviceCheck(id: string) {
  store.update(
    (r) => r.id === id,
    (r) => ({ ...r, resolved: true, resolved_at: new Date().toISOString() }),
  );
}

/** 사이드바 Safe 옆 점 — 회사가 아직 처리 안 한 단말점검 요청이 하나라도 있는가. */
export function useAnyOpenDeviceRequest(): boolean {
  const all = store.useAll();
  return useMemo(() => all.some((r) => !r.resolved), [all]);
}

export function useOpenDeviceRequest(vehicleId: string): DeviceRequest | null {
  const all = store.useAll();
  return useMemo(() => {
    const mine = all.filter((r) => r.vehicle_id === vehicleId && !r.resolved);
    return mine.length > 0 ? mine[mine.length - 1] : null;
  }, [all, vehicleId]);
}
