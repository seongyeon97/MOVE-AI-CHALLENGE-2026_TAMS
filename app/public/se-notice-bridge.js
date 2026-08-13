/*
 * se-notice-bridge.js — 기사뷰(driver-app.html) ↔ 회사뷰(React app) 공지 연동.
 *
 * 두 화면은 같은 오리진의 다른 페이지다. 그래서 상태를 localStorage 한 곳에 두고 공유한다.
 * 회사뷰가 공지를 발송하면 여기 list()에 잡히고, 기사뷰가 acknowledge()를 부르면
 * 회사뷰 Safe 화면의 "공지 확인" 열이 초록으로 바뀐다(다른 창은 storage 이벤트로 즉시 반영).
 *
 * 쓰는 법 — driver-app.html에서:
 *   <script src="/se-notice-bridge.js"></script>
 *
 *   const 차량ID = 'SB-000001';
 *   SENotices.subscribe(function () { render(SENotices.list(차량ID)); });  // 목록 갱신
 *   render(SENotices.list(차량ID));                                        // 최초 1회
 *   // "확인" 버튼 onclick:
 *   SENotices.acknowledge(notice.id);
 *
 * 데이터 형식(회사뷰 src/lib/notices.ts와 동일):
 *   { id, vehicle_id, message, created_at, acknowledged, acknowledged_at? }
 *   vehicle_id === 'ALL' 이면 전체 차량 대상 공지다.
 *
 * 형식이나 키를 바꾸면 src/lib/notices.ts도 같이 바꿔야 한다.
 */
(function (global) {
  'use strict';

  var KEY = 'se.notices.v1';
  var ALL = 'ALL';
  var listeners = [];

  function read() {
    try {
      var parsed = JSON.parse(global.localStorage.getItem(KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return []; // 손상된 값이면 빈 목록 — 기사 화면이 죽는 것보다 낫다
    }
  }

  function write(items) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(items));
    } catch (e) {
      // 저장 실패해도 화면은 계속 돈다
    }
    notify();
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i]();
      } catch (e) {
        // 구독자 하나가 죽어도 나머지는 계속 받는다
      }
    }
  }

  // 회사뷰에서 발송한 공지를 받는다. storage 이벤트는 쓴 창이 아닌 창에만 뜬다.
  global.addEventListener('storage', function (e) {
    if (e.key === KEY) notify();
  });

  /** 기사뷰 NOTICES 배열과 같은 모양으로 변환 — 기존 목록에 concat만 하면 된다. */
  function toUiShape(n) {
    return {
      id: n.id,
      date: String(n.created_at || '').slice(0, 10),
      title: n.message,
      body: n.message,
      read: !!n.acknowledged,
      from_company: true, // 회사뷰에서 온 공지 — 기사뷰 하드코딩 공지와 구분용
    };
  }

  var SENotices = {
    /**
     * 이 차량이 받아야 할 공지(해당 차량 + 전체발송). 오래된 것부터.
     * vehicleId를 넘기지 않으면 전체를 반환한다(차량 선택이 없는 시연 화면용).
     */
    list: function (vehicleId) {
      var all = read();
      if (!vehicleId) return all;
      return all.filter(function (n) {
        return n.vehicle_id === vehicleId || n.vehicle_id === ALL;
      });
    },

    /** list()를 기사뷰 NOTICES 형식({date,title,body,read})으로 변환해 반환. 최신순. */
    listForUI: function (vehicleId) {
      return SENotices.list(vehicleId).map(toUiShape).reverse();
    },

    /** 아직 확인하지 않은 공지만. 배지 숫자에 쓴다. vehicleId 생략 가능. */
    unread: function (vehicleId) {
      return SENotices.list(vehicleId).filter(function (n) {
        return !n.acknowledged;
      });
    },

    /** 기사가 "확인"을 눌렀을 때. 회사뷰 Safe의 공지 확인 열이 초록으로 바뀐다. */
    acknowledge: function (id) {
      var now = new Date().toISOString();
      write(
        read().map(function (n) {
          if (n.id !== id) return n;
          return Object.assign({}, n, { acknowledged: true, acknowledged_at: now });
        }),
      );
    },

    /** 이 차량의 미확인 공지를 한 번에 확인 처리. vehicleId 생략 시 전체. */
    acknowledgeAll: function (vehicleId) {
      var now = new Date().toISOString();
      write(
        read().map(function (n) {
          var mine = !vehicleId || n.vehicle_id === vehicleId || n.vehicle_id === ALL;
          if (!mine || n.acknowledged) return n;
          return Object.assign({}, n, { acknowledged: true, acknowledged_at: now });
        }),
      );
    },

    /** 변경 알림 구독. 반환값을 호출하면 해제된다. */
    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (l) {
          return l !== fn;
        });
      };
    },

    ALL_VEHICLES: ALL,
    STORAGE_KEY: KEY,
  };

  global.SENotices = SENotices;
})(window);
