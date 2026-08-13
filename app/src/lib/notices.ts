// notices.ts — 공지사항 발송·확인. Safe에서 보내고 기사뷰에서 확인한다. 세션 전용(새로고침 시 리셋).
import { useMemo } from 'react';
import { createStore } from './eventStore';
import { ALL_VEHICLES } from './channels';

export type Notice = {
  id: string;
  vehicle_id: string | typeof ALL_VEHICLES;
  message: string;
  created_at: string;
  acknowledged: boolean;
  acknowledged_at?: string;
};

const store = createStore<Notice>();
let seq = 0;

export function sendNotice(vehicleId: string | typeof ALL_VEHICLES, message: string) {
  seq += 1;
  store.add({
    id: `notice-${seq}`,
    vehicle_id: vehicleId,
    message,
    created_at: new Date().toISOString(),
    acknowledged: false,
  });
}

export function acknowledgeNotice(id: string) {
  store.update(
    (n) => n.id === id,
    (n) => ({ ...n, acknowledged: true, acknowledged_at: new Date().toISOString() }),
  );
}

/** 특정 차량이 받아야 할 공지(그 차량 대상 + 전체발송) 목록. */
export function useNoticesFor(vehicleId: string): Notice[] {
  const all = store.useAll();
  return useMemo(
    () => all.filter((n) => n.vehicle_id === vehicleId || n.vehicle_id === ALL_VEHICLES),
    [all, vehicleId],
  );
}

/** Safe 화면에서 차량별 최신 공지 확인 상태를 볼 때 쓴다. */
export function useLatestNoticeStatus(vehicleId: string): Notice | null {
  const notices = useNoticesFor(vehicleId);
  return notices.length > 0 ? notices[notices.length - 1] : null;
}
