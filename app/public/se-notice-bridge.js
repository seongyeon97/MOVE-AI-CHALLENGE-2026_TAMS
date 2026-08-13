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
  // 이 기기가 어느 차량인가. 회사뷰 차량ID와 같아야 Safe의 "공지 확인" 열이 그 차량 줄에서 바뀐다.
  // 기사뷰가 setVehicleId()로 정한다. 정하지 않으면 확인 기록에 차량이 안 남는다.
  var vehicleId = null;

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
    // 읽음 여부는 "이 차량이 확인했는가"다 — 옆 차량이 확인한 전체공지를 읽음으로 보면 안 된다.
    var by = n.acknowledged_by || [];
    var read = vehicleId ? by.indexOf(vehicleId) >= 0 : !!n.acknowledged;
    // 제목은 첫 줄, 본문은 전체 — 공지가 여러 줄이면 목록에 다 펼쳐지면 안 된다.
    var lines = String(n.message || '').split('\n');
    var title = (lines[0] || '').replace(/^\[|\]$/g, '') || '공지사항';
    return {
      id: n.id,
      date: String(n.created_at || '').slice(0, 10),
      title: title,
      body: String(n.message || '').replace(/\n/g, '<br/>'),
      read: read,
      from_company: true, // 회사뷰에서 온 공지 — 기사뷰 하드코딩 공지와 구분용
    };
  }

  var SENotices = {
    /**
     * 이 차량이 받아야 할 공지(해당 차량 + 전체발송). 오래된 것부터.
     * vehicleId를 넘기지 않으면 전체를 반환한다(차량 선택이 없는 시연 화면용).
     */
    list: function (forVehicleId) {
      var who = forVehicleId || vehicleId; // 생략하면 선택된 차량 기준
      var all = read();
      if (!who) return all;
      return all.filter(function (n) {
        return n.vehicle_id === who || n.vehicle_id === ALL;
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

    /** 이 기기의 차량ID를 정한다. 회사뷰 차량ID와 같은 값을 넣어야 그 차량 줄이 바뀐다. */
    setVehicleId: function (id) {
      vehicleId = id || null;
      return vehicleId;
    },

    vehicleId: function () {
      return vehicleId;
    },

    /**
     * 기사가 "확인"을 눌렀을 때. 회사뷰 Safe의 공지 확인 열이 초록으로 바뀐다.
     * 전체 발송이라도 확인은 차량별로 남긴다 — 옆 차량이 확인했다고 내 줄이 확인으로 뜨면 안 된다.
     */
    acknowledge: function (id, forVehicleId) {
      var who = forVehicleId || vehicleId;
      var now = new Date().toISOString();
      write(
        read().map(function (n) {
          if (n.id !== id) return n;
          var by = (n.acknowledged_by || []).slice();
          if (who && by.indexOf(who) === -1) by.push(who);
          return Object.assign({}, n, {
            acknowledged: true,
            acknowledged_at: n.acknowledged_at || now,
            acknowledged_by: by,
          });
        }),
      );
    },

    /** 이 차량의 미확인 공지를 한 번에 확인 처리. 생략 시 setVehicleId로 정한 차량. */
    acknowledgeAll: function (forVehicleId) {
      var who = forVehicleId || vehicleId;
      var now = new Date().toISOString();
      write(
        read().map(function (n) {
          var mine = !who || n.vehicle_id === who || n.vehicle_id === ALL;
          if (!mine) return n;
          var by = (n.acknowledged_by || []).slice();
          if (who && by.indexOf(who) === -1) by.push(who);
          return Object.assign({}, n, {
            acknowledged: true,
            acknowledged_at: n.acknowledged_at || now,
            acknowledged_by: by,
          });
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

  /* -----------------------------------------------------------------
     차량 선택 박스 — 기사뷰 화면 구조는 건드리지 않고 여기서 띄운다.
     프로토타입에서는 어느 차량을 골라도 화면 내용이 같다. 다른 건 확인 기록에 남는 차량ID뿐이고,
     그게 회사뷰 Safe의 "공지 확인" 열이 어느 줄에서 바뀌는지를 정한다.
  ----------------------------------------------------------------- */
  var VEHICLE_KEY = 'se.driver.vehicle';

  function mountVehiclePicker() {
    if (document.getElementById('se-vehicle-picker')) return;

    var box = document.createElement('div');
    box.id = 'se-vehicle-picker';
    box.style.cssText =
      'position:fixed;top:8px;right:8px;z-index:99999;display:flex;align-items:center;gap:6px;' +
      'padding:6px 8px;border-radius:8px;font:12px/1.2 system-ui,sans-serif;' +
      'background:rgba(12,30,46,.92);color:#cfe3ee;border:1px solid #2a4a60;box-shadow:0 2px 8px rgba(0,0,0,.3)';

    var label = document.createElement('span');
    label.textContent = '차량';
    label.style.opacity = '.7';

    var select = document.createElement('select');
    select.style.cssText =
      'background:#0a1826;color:#eaf3f8;border:1px solid #2a4a60;border-radius:6px;padding:3px 6px;font:12px system-ui,sans-serif';

    box.appendChild(label);
    box.appendChild(select);
    document.body.appendChild(box);

    function setOptions(ids) {
      select.innerHTML = '';
      ids.forEach(function (id) {
        var o = document.createElement('option');
        o.value = id;
        o.textContent = id;
        select.appendChild(o);
      });
      var saved = null;
      try {
        saved = localStorage.getItem(VEHICLE_KEY);
      } catch (e) {
        saved = null;
      }
      var pick = ids.indexOf(saved) >= 0 ? saved : ids[0];
      if (pick) {
        select.value = pick;
        SENotices.setVehicleId(pick);
        notify(); // 목록이 늦게 도착하므로 기사뷰가 차량번호를 다시 맞추게 알린다
      }
    }

    select.addEventListener('change', function () {
      SENotices.setVehicleId(select.value);
      try {
        localStorage.setItem(VEHICLE_KEY, select.value);
      } catch (e) {
        // 저장 실패해도 이번 세션은 동작한다
      }
      notify(); // 선택이 바뀌면 목록을 다시 그리게 알린다
    });

    // 회사뷰가 쓰는 차량 목록을 그대로 읽는다 — 같은 오리진의 빌드 산출물이다.
    fetch('/data/vehicles.json')
      .then(function (r) {
        return r.ok ? r.json() : [];
      })
      .then(function (rows) {
        var ids = (Array.isArray(rows) ? rows : [])
          .filter(function (v) {
            return v.vehicle_class === 'truck';
          })
          .map(function (v) {
            return v.vehicle_id;
          });
        setOptions(ids.length ? ids : ['(차량 목록 없음)']);
      })
      .catch(function () {
        setOptions(['(차량 목록 없음)']);
      });
  }

  if (document.readyState === 'loading') {
    global.addEventListener('DOMContentLoaded', mountVehiclePicker);
  } else {
    mountVehiclePicker();
  }

  global.SENotices = SENotices;
})(window);
