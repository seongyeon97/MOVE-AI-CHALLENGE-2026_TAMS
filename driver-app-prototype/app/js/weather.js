/* =========================================================
   S&E Driving — weather.js
   Live weather-reactive animated background (Canvas2D).
   Geolocation + Open-Meteo (free, no API key) -> sky gradient,
   sun/moon, drifting clouds (2 depth layers), rain/snow/fog,
   occasional thunder flash. Falls back to a time-of-day-only
   scene if location/network is unavailable.

   Layering contract for the host card (see style.css):
     1. WeatherBackground (this canvas, pointer-events:none)
     2. foreground content (truck illustration / icon, badge)
   The canvas never intercepts drag/tap input.

   Testing: append ?weather=<key> to the page URL to pin a
   condition without waiting for real weather, e.g.
   ?weather=rain / heavy-rain / snow / fog / thunder / night
   ========================================================= */
(function () {
  'use strict';

  // temp는 실제 API 응답 전에도 칩에 "--°C" 대신 그럴듯한 값이 보이도록
  // 초기값을 null이 아닌 값으로 둔다(뒤이어 실측/폴백 값으로 바로 갱신됨).
  var cache = { condition: 'clear', isDay: 1, heavy: false, temp: 28, fetchedAt: 0, source: 'pending' };
  var fetching = false;

  function bucketFromWMO(code) {
    if (code === 0) return 'clear';
    if (code === 1 || code === 2) return 'partly-cloudy';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 67) return 'rain';
    if (code >= 80 && code <= 82) return 'rain';
    if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return 'snow';
    if (code === 95 || code === 96 || code === 99) return 'thunder';
    return 'clear';
  }
  function isHeavyFromWMO(code) {
    return code === 65 || code === 67 || code === 82 || code === 96 || code === 99;
  }

  // 실측 데이터를 못 받아왔을 때도 "--°C"가 아니라 계절/시간대에 맞는
  // 그럴듯한 값을 보여준다(8월 서울 기준 — 낮엔 덥고 밤엔 선선한 정도).
  function fallbackFromClock() {
    var h = new Date().getHours();
    var isDay = h >= 6 && h < 19 ? 1 : 0;
    return { condition: 'clear', isDay: isDay, heavy: false, temp: isDay ? 31 : 25, fetchedAt: Date.now(), source: 'clock-fallback' };
  }

  /* ---------------------------------------------------------
     Dev-only weather override — ?weather=rain / heavy-rain /
     snow / fog / thunder / night / clear-day / partly-cloudy /
     cloudy / clear-night / heatwave / coldwave — lets the whole
     condition matrix be spot-checked without waiting for real
     weather to change. ?temp=NN independently forces the shown
     temperature (combine with ?weather= or use alone), e.g.
     ?weather=clear-day&temp=36 to demo the 폭염경보 advisory.
  --------------------------------------------------------- */
  var DEBUG_WEATHER_MAP = {
    'clear-day': { condition: 'clear', isDay: 1, temp: 30 },
    'clear-night': { condition: 'clear', isDay: 0, temp: 24 },
    'partly-cloudy': { condition: 'partly-cloudy', isDay: 1, temp: 28 },
    'cloudy': { condition: 'cloudy', isDay: 1, temp: 25 },
    'rain': { condition: 'rain', isDay: 1, heavy: false, temp: 22 },
    'heavy-rain': { condition: 'rain', isDay: 1, heavy: true, temp: 21 },
    'snow': { condition: 'snow', isDay: 1, temp: -2 },
    'thunder': { condition: 'thunder', isDay: 1, temp: 23 },
    'thunderstorm': { condition: 'thunder', isDay: 1, temp: 23 },
    'fog': { condition: 'fog', isDay: 1, temp: 18 },
    'night': { condition: 'clear', isDay: 0, temp: 24 },
    'heatwave': { condition: 'clear', isDay: 1, temp: 36 },
    'coldwave': { condition: 'clear', isDay: 0, temp: -14 }
  };
  function getDebugOverride() {
    try {
      if (!window.location || !window.location.search) return null;
      var params = new URLSearchParams(window.location.search);
      var w = params.get('weather');
      return w ? (DEBUG_WEATHER_MAP[w] || null) : null;
    } catch (e) { return null; }
  }
  function getDebugTempOverride() {
    try {
      if (!window.location || !window.location.search) return null;
      var params = new URLSearchParams(window.location.search);
      var t = params.get('temp');
      if (t === null) return null;
      var n = Number(t);
      return isFinite(n) ? Math.round(n) : null;
    } catch (e) { return null; }
  }
  // 기상청 특보 기준(폭염 33/35°C, 한파 -12/-15°C)을 단순화해 적용하고,
  // 트럭 안전과 직결되는 짧은 안내 문구를 붙인다. 기온 특보가 없으면
  // 강수/시정 조건(뇌우·호우·대설·안개)도 확인한다 — 극한 기온이 항상
  // 우선이고, 그 다음이 조건 기반 특보다.
  function weatherAdvisory(temp, condition, heavy) {
    if (typeof temp === 'number') {
      if (temp >= 35) return { label: '폭염경보', color: '#ff5a5a', message: '타이어 파손 및 엔진 과열 위험이 매우 높습니다' };
      if (temp >= 33) return { label: '폭염주의보', color: '#ffb020', message: '타이어 파손 및 엔진 과열 위험에 유의하세요' };
      if (temp <= -15) return { label: '한파경보', color: '#5aa8ff', message: '배터리 방전 및 도로 결빙 위험이 매우 높습니다' };
      if (temp <= -12) return { label: '한파주의보', color: '#7fc4ff', message: '배터리 방전 및 도로 결빙에 유의하세요' };
    }
    if (condition === 'thunder') return { label: '뇌우 주의', color: '#ffb020', message: '낙뢰·급변 기상에 유의해 서행하세요' };
    if (condition === 'rain' && heavy) return { label: '호우 주의', color: '#ffb020', message: '제동거리 증가 및 시야 확보에 유의하세요' };
    if (condition === 'snow') return { label: '대설 주의', color: '#7fc4ff', message: '노면 결빙 및 제동거리 증가에 유의하세요' };
    if (condition === 'fog') return { label: '안개 주의', color: '#c9ced4', message: '시야 확보에 유의해 서행하세요' };
    return null;
  }

  function fetchWeather() {
    if (fetching) return;
    var override = getDebugOverride();
    if (override) {
      cache = { condition: override.condition, isDay: override.isDay, heavy: !!override.heavy, temp: override.temp, fetchedAt: Date.now(), source: 'debug-override' };
      return;
    }
    fetching = true;
    var settle = function (data) { cache = data; fetching = false; };

    if (!('geolocation' in navigator)) { settle(fallbackFromClock()); return; }

    var timer = setTimeout(function () { settle(fallbackFromClock()); }, 6000);

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
          '&current=temperature_2m,weather_code,is_day,precipitation&timezone=auto';
        fetch(url).then(function (r) { return r.json(); }).then(function (j) {
          clearTimeout(timer);
          if (!j || !j.current) { settle(fallbackFromClock()); return; }
          var code = j.current.weather_code;
          settle({
            condition: bucketFromWMO(code),
            isDay: j.current.is_day,
            heavy: isHeavyFromWMO(code) || (typeof j.current.precipitation === 'number' && j.current.precipitation >= 4),
            temp: Math.round(j.current.temperature_2m),
            fetchedAt: Date.now(),
            source: 'live'
          });
        }).catch(function () { clearTimeout(timer); settle(fallbackFromClock()); });
      },
      function () { clearTimeout(timer); settle(fallbackFromClock()); },
      { timeout: 5500, maximumAge: 10 * 60 * 1000 }
    );
  }

  function ensureFresh() {
    if (getDebugOverride()) { if (cache.source !== 'debug-override') fetchWeather(); return; }
    if (cache.source === 'pending' || Date.now() - cache.fetchedAt > 15 * 60 * 1000) fetchWeather();
  }

  var PALETTES = {
    'clear|1': { top: '#7fc2f2', bottom: '#d8edfb', sun: true },
    'partly-cloudy|1': { top: '#8fb9d8', bottom: '#dbe7ef', sun: true, clouds: 3 },
    'cloudy|1': { top: '#93a2b2', bottom: '#c9d2da', clouds: 5 },
    'fog|1': { top: '#c3cad0', bottom: '#e2e6e9', fog: true },
    'rain|1': { top: '#5f6c7a', bottom: '#8996a3', clouds: 4, rain: true, rainCount: 20 },
    'rain-heavy|1': { top: '#4b5866', bottom: '#79899a', clouds: 5, rain: true, rainCount: 42 },
    'snow|1': { top: '#aebccb', bottom: '#dde5eb', clouds: 3, snow: true },
    'thunder|1': { top: '#454f5c', bottom: '#6b7684', clouds: 5, rain: true, thunder: true, rainCount: 34 },

    'clear|0': { top: '#050b1e', bottom: '#1c2c52', stars: true, moon: true },
    'partly-cloudy|0': { top: '#070c20', bottom: '#212f4d', stars: true, moon: true, clouds: 3 },
    'cloudy|0': { top: '#0c1220', bottom: '#232a38', clouds: 5 },
    'fog|0': { top: '#141a22', bottom: '#2a323a', fog: true },
    'rain|0': { top: '#0a0f1c', bottom: '#232c3a', clouds: 4, rain: true, rainCount: 20 },
    'rain-heavy|0': { top: '#070b14', bottom: '#1c2530', clouds: 5, rain: true, rainCount: 42 },
    'snow|0': { top: '#0e1626', bottom: '#28324a', clouds: 3, snow: true },
    'thunder|0': { top: '#0a0e18', bottom: '#232735', clouds: 5, rain: true, thunder: true, rainCount: 34 }
  };

  var CONDITION_LABEL = {
    'clear': '맑음', 'partly-cloudy': '구름 조금', 'cloudy': '흐림',
    'fog': '안개', 'rain': '비', 'snow': '눈', 'thunder': '뇌우'
  };
  var CONDITION_ICON = {
    'partly-cloudy': '🌤️', 'cloudy': '☁️', 'fog': '🌫️',
    'rain': '🌧️', 'snow': '🌨️', 'thunder': '⛈️'
  };

  function makeParticles(count, mk) {
    var arr = [];
    for (var i = 0; i < count; i++) arr.push(mk(i));
    return arr;
  }
  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function lerpColor(aHex, bHex, t) {
    var a = hexToRgb(aHex), b = hexToRgb(bHex);
    var r = Math.round(a.r + (b.r - a.r) * t);
    var g = Math.round(a.g + (b.g - a.g) * t);
    var bl = Math.round(a.b + (b.b - a.b) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function mount(canvas, chipEl, cautionEl) {
    ensureFresh();
    var ctx = canvas.getContext('2d');
    var raf = null, disposed = false;
    var clouds = [], rain = [], snow = [], stars = [];
    var lastCondKey = null;
    var flashT = 0;
    var curPal = PALETTES['clear|1'];
    var prevTop = curPal.top, prevBottom = curPal.bottom;
    var transitionStart = 0;
    var TRANSITION_MS = 1400;

    var reducedMotionMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function reducedMotion() { return !!(reducedMotionMQ && reducedMotionMQ.matches); }

    var ro = new ResizeObserver(function () { resize(); });
    ro.observe(canvas);

    function resize() {
      var rect = canvas.parentElement.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(rect.width, 50) * dpr;
      canvas.height = Math.max(rect.height, 50) * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    // Two depth layers per cloud batch (far = smaller/slower/fainter,
    // near = larger/faster/more opaque) for a subtle parallax read.
    function seedFor(key, w, h) {
      if (key === lastCondKey) return;
      var fromPal = PALETTES[lastCondKey] || curPal;
      prevTop = fromPal.top; prevBottom = fromPal.bottom;
      transitionStart = performance.now();
      lastCondKey = key;
      curPal = PALETTES[key] || PALETTES['clear|1'];
      var pal = curPal;

      clouds = makeParticles(pal.clouds || 0, function (i) {
        var far = i % 2 === 0;
        return far
          ? { x: Math.random() * w, y: h * (0.05 + Math.random() * 0.22), r: 46 + Math.random() * 54, speed: 3 + Math.random() * 4, op: 0.13 + Math.random() * 0.12 }
          : { x: Math.random() * w, y: h * (0.14 + Math.random() * 0.3), r: 32 + Math.random() * 46, speed: 9 + Math.random() * 9, op: 0.28 + Math.random() * 0.2 };
      });
      rain = pal.rain ? makeParticles(pal.rainCount || 22, function () {
        return { x: Math.random() * w, y: Math.random() * h, len: 10 + Math.random() * 10, speed: 260 + Math.random() * 180 };
      }) : [];
      snow = pal.snow ? makeParticles(40, function () {
        return { x: Math.random() * w, y: Math.random() * h, r: 1.4 + Math.random() * 2.2, speed: 18 + Math.random() * 24, sway: Math.random() * Math.PI * 2 };
      }) : [];
      stars = pal.stars ? makeParticles(45, function () {
        return { x: Math.random() * w, y: Math.random() * h * 0.7, r: Math.random() * 1.4 + 0.3, ph: Math.random() * Math.PI * 2 };
      }) : [];
    }

    function draw(ts) {
      if (disposed) return;
      raf = requestAnimationFrame(draw);
      if (document.hidden) return; // save CPU while the tab/card is not visible
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (w < 5 || h < 5) return;
      var rm = reducedMotion();
      var dt = Math.min((ts - (draw._last || ts)) / 1000, 0.05);
      draw._last = ts;
      var motionDt = rm ? 0 : dt;

      var heavyRain = cache.condition === 'rain' && cache.heavy;
      var key = (cache.condition || 'clear') + (heavyRain ? '-heavy' : '') + '|' + (cache.isDay === 0 ? 0 : 1);
      seedFor(key, w, h);
      var pal = curPal;

      var mixAmt = rm ? 1 : clamp01((ts - transitionStart) / TRANSITION_MS);
      var topColor = mixAmt >= 1 ? pal.top : lerpColor(prevTop, pal.top, mixAmt);
      var bottomColor = mixAmt >= 1 ? pal.bottom : lerpColor(prevBottom, pal.bottom, mixAmt);
      var fadeIn = mixAmt; // newly-seeded elements ease in as the sky crossfades

      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, topColor);
      g.addColorStop(1, bottomColor);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // stars
      stars.forEach(function (s) {
        var tw = rm ? 0.75 : 0.55 + 0.45 * Math.sin(ts / 700 + s.ph);
        ctx.globalAlpha = tw * fadeIn;
        ctx.fillStyle = '#eaf2ff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      // sun / moon — soft glow, near-static (calm, not a pulsing effect)
      if (pal.sun) {
        var sx = w * 0.78, sy = h * 0.24;
        ctx.globalAlpha = fadeIn;
        var sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, 46);
        sg.addColorStop(0, 'rgba(255,244,214,0.95)');
        sg.addColorStop(1, 'rgba(255,244,214,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff7dd'; ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (pal.moon) {
        var mx = w * 0.76, my = h * 0.22;
        ctx.globalAlpha = fadeIn;
        var mg = ctx.createRadialGradient(mx, my, 2, mx, my, 34);
        mg.addColorStop(0, 'rgba(230,238,255,0.65)');
        mg.addColorStop(1, 'rgba(230,238,255,0)');
        ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#eef3ff'; ctx.beginPath(); ctx.arc(mx, my, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = bottomColor; ctx.beginPath(); ctx.arc(mx + 5, my - 3, 11, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // clouds (two-depth parallax drift)
      clouds.forEach(function (c) {
        c.x += c.speed * motionDt;
        if (c.x - c.r > w) c.x = -c.r;
        ctx.globalAlpha = c.op * fadeIn;
        var cg = ctx.createRadialGradient(c.x, c.y, c.r * 0.1, c.x, c.y, c.r);
        cg.addColorStop(0, '#ffffff'); cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r, c.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      // fog bands
      if (pal.fog) {
        for (var i = 0; i < 3; i++) {
          var fy = h * (0.35 + i * 0.22) + (rm ? 0 : Math.sin(ts / 1600 + i) * 6);
          ctx.fillStyle = 'rgba(255,255,255,' + (0.10 + i * 0.03) * fadeIn + ')';
          ctx.fillRect(0, fy, w, 26);
        }
      }

      // rain — short, thin streaks; never fills the whole frame
      if (rain.length) {
        ctx.strokeStyle = 'rgba(214,230,245,' + (0.55 * fadeIn) + ')';
        ctx.lineWidth = 1.2;
        rain.forEach(function (d) {
          d.y += d.speed * motionDt; d.x -= d.speed * 0.18 * motionDt;
          if (d.y > h) { d.y = -10; d.x = Math.random() * w; }
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + d.len); ctx.stroke();
        });
      }

      // snow — varied sizes/speeds for depth, gentle drift
      if (snow.length) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * fadeIn) + ')';
        snow.forEach(function (s) {
          s.y += s.speed * motionDt; s.sway += motionDt;
          s.x += Math.sin(s.sway) * 0.4;
          if (s.y > h) { s.y = -6; s.x = Math.random() * w; }
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        });
      }

      // thunder — rare, brief brightness flash, never a drawn bolt
      if (pal.thunder && !rm) {
        flashT -= dt;
        if (flashT <= 0 && Math.random() < 0.01) flashT = 0.12;
        if (flashT > 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 0, w, h); }
      }
    }

    raf = requestAnimationFrame(draw);

    if (chipEl || cautionEl) {
      var updateChip = function () {
        if (disposed) return;
        var heavyRain = cache.condition === 'rain' && cache.heavy;
        var label = heavyRain ? '강한 비' : (CONDITION_LABEL[cache.condition] || '날씨');
        var tempOverride = getDebugTempOverride();
        var displayTemp = tempOverride !== null ? tempOverride : cache.temp;
        var tempTxt = typeof displayTemp === 'number' ? displayTemp + '°C' : '--°C';
        var iconTxt = cache.condition === 'clear'
          ? (cache.isDay === 0 ? '🌙' : '☀️')
          : (CONDITION_ICON[cache.condition] || '☀️');
        var advisory = weatherAdvisory(displayTemp, cache.condition, cache.heavy);
        if (chipEl) {
          var advisoryHtml = advisory
            ? ' <span style="color:' + advisory.color + ';font-weight:900;">· ' + advisory.label + '</span>'
            : '';
          chipEl.innerHTML = iconTxt + ' ' + tempTxt + ' · ' + label + advisoryHtml;
        }
        if (cautionEl) {
          if (advisory) {
            cautionEl.innerHTML = '<b style="color:' + advisory.color + ';">※ ' + advisory.label + '</b> · ' + advisory.message;
            cautionEl.style.display = 'block';
          } else {
            cautionEl.style.display = 'none';
          }
        }
        setTimeout(updateChip, 4000);
      };
      updateChip();
    }

    return function unmount() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }

  window.SE_Weather = { mount: mount };
})();
