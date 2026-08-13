/* ---------------------------------------------------------
   정비소 예약 지도 — Kakao Maps JS SDK 연동.
   window.SE_CONFIG.KAKAO_JS_KEY 없거나 로드/검색 실패(또는 타임아웃) 시
   onError만 호출하고 끝남 — app.js가 기존 mock 지도/목록으로 계속 보여줌.

   주의: 도메인이 카카오 개발자 콘솔(내 애플리케이션 > 플랫폼 > Web)에
   등록 안 돼 있으면 SDK가 에러를 던지지 않고 그냥 멈춘다 — 그래서
   모든 비동기 단계에 타임아웃을 걸어 무한 대기를 막는다.
--------------------------------------------------------- */
(function () {
  'use strict';

  var FALLBACK_CENTER = { lat: 37.5665, lng: 126.9780 }; // 서울시청 (위치 권한 거부/실패 시)
  var LOAD_TIMEOUT_MS = 8000;
  var SEARCH_TIMEOUT_MS = 8000;
  var loadPromise = null;

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error(label + ' timed out')); }, ms);
      promise.then(function (v) { clearTimeout(timer); resolve(v); },
        function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function loadSdk() {
    if (loadPromise) return loadPromise;
    var raw = new Promise(function (resolve, reject) {
      var key = window.SE_CONFIG && window.SE_CONFIG.KAKAO_JS_KEY;
      if (!key) { reject(new Error('no kakao key configured')); return; }
      if (window.kakao && window.kakao.maps && window.kakao.maps.services) { resolve(window.kakao); return; }
      var script = document.createElement('script');
      script.src = '//dapi.kakao.com/v2/maps/sdk.js?appkey=' + key + '&libraries=services&autoload=false';
      script.onload = function () {
        try {
          window.kakao.maps.load(function () { resolve(window.kakao); });
        } catch (e) { reject(e); }
      };
      script.onerror = function () { reject(new Error('kakao sdk script failed to load')); };
      document.head.appendChild(script);
    });
    loadPromise = withTimeout(raw, LOAD_TIMEOUT_MS, 'kakao sdk load').catch(function (e) {
      loadPromise = null; // 다음 시도 때 재로드 허용 (도메인 등록 후 재시도 등)
      throw e;
    });
    return loadPromise;
  }

  function getLocation() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(FALLBACK_CENTER); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        function () { resolve(FALLBACK_CENTER); },
        { timeout: 6000, maximumAge: 60000 }
      );
    });
  }

  // opts: { onReady(shops), onError() }
  function mount(mapEl, opts) {
    Promise.all([loadSdk(), getLocation()]).then(function (results) {
      var kakao = results[0], center = results[1];
      mapEl.innerHTML = '';
      var centerPos = new kakao.maps.LatLng(center.lat, center.lng);
      var map = new kakao.maps.Map(mapEl, { center: centerPos, level: 5 });
      new kakao.maps.Marker({ map: map, position: centerPos, title: '현재 위치' });

      var searchPromise = new Promise(function (resolve, reject) {
        var places = new kakao.maps.services.Places();
        places.keywordSearch('정비소', function (data, status) {
          if (status !== kakao.maps.services.Status.OK || !data.length) {
            reject(new Error('kakao keywordSearch status: ' + status));
            return;
          }
          resolve(data);
        }, { location: centerPos, radius: 20000, sort: kakao.maps.services.SortBy.DISTANCE });
      });

      return withTimeout(searchPromise, SEARCH_TIMEOUT_MS, 'kakao keywordSearch').then(function (data) {
        var shops = data.slice(0, 5).map(function (p) {
          return {
            name: p.place_name,
            addr: p.road_address_name || p.address_name,
            phone: p.phone || '전화번호 정보 없음',
            dist: p.distance ? (Number(p.distance) / 1000).toFixed(1) + 'km' : '',
            lat: Number(p.y),
            lng: Number(p.x)
          };
        });
        shops.forEach(function (s) {
          new kakao.maps.Marker({ map: map, position: new kakao.maps.LatLng(s.lat, s.lng), title: s.name });
        });
        opts.onReady && opts.onReady(shops);
      });
    }).catch(function (err) {
      console.error('[SE_KakaoMap] 지도/정비소 검색 실패, mock으로 대체:', err && err.message ? err.message : err);
      opts.onError && opts.onError();
    });
  }

  window.SE_KakaoMap = { mount: mount };
})();
