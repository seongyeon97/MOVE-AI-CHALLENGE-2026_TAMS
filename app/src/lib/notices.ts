// notices.ts — 공지사항 발송·확인. 회사뷰(Safe)에서 보내고 기사뷰에서 확인한다.
//
// 저장소는 localStorage다(키: NOTICE_STORAGE_KEY). 기사뷰는 React 앱이 아니라 같은 오리진의
// 정적 페이지(public/driver-app.html)라, 메모리 스토어로는 발송과 확인이 서로에게 안 보인다.
// 기사뷰 쪽 연동 규약은 public/se-notice-bridge.js에 그대로 적어 뒀다 — 형식을 바꾸면 양쪽을 같이 고쳐야 한다.
import { useMemo } from 'react';
import { createStore } from './eventStore';
import { ALL_VEHICLES } from './channels';

/** 기사뷰와 공유하는 저장소 키. 바꾸면 se-notice-bridge.js도 같이 바꿔야 한다. */
export const NOTICE_STORAGE_KEY = 'se.notices.v1';

export type Notice = {
  id: string;
  vehicle_id: string | typeof ALL_VEHICLES;
  message: string;
  created_at: string;
  acknowledged: boolean;
  acknowledged_at?: string;
};

const store = createStore<Notice>(NOTICE_STORAGE_KEY);

/** 페이지가 둘(회사뷰·기사뷰)이라 순번 카운터로는 id가 겹친다 — 시각+난수로 만든다. */
function newId() {
  return `notice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sendNotice(vehicleId: string | typeof ALL_VEHICLES, message: string) {
  store.add({
    id: newId(),
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

/** 시연 초기화용 — 발송 이력을 비운다. */
export function clearNotices() {
  store.clear();
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
