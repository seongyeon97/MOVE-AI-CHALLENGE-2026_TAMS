/* =========================================================
   S&E Driving — truck3d.js
   Procedural low-poly 8-wheel box truck, drag-to-orbit viewer.
   No external 3D model needed — built entirely from primitives.
   ========================================================= */
import * as THREE from '../vendor/three.module.min.js';

var renderer = null, scene = null, camera = null, truckGroup = null;
var animId = null, ro = null;
var rotY = 0.55, tiltX = -0.14, velY = 0, velX = 0;
var dragging = false, lastX = 0, lastY = 0, lastMoveT = 0, idleSince = 0;
var mountEl = null;
var warnLabelLayer = null, warnMarkers = [];

function clearWarnLabels() {
  if (warnLabelLayer && warnLabelLayer.parentNode) warnLabelLayer.parentNode.removeChild(warnLabelLayer);
  warnLabelLayer = null;
  warnMarkers = [];
}

function dispose() {
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  if (ro) { ro.disconnect(); ro = null; }
  if (renderer) {
    renderer.dispose();
    var dom = renderer.domElement;
    if (dom && dom.parentNode) dom.parentNode.removeChild(dom);
  }
  clearWarnLabels();
  renderer = null; scene = null; camera = null; truckGroup = null;
}

function shadowTexture() {
  var c = document.createElement('canvas');
  c.width = c.height = 256;
  var ctx = c.getContext('2d');
  var g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildTruck(theme, wheelCount, tireStatuses, oilInfo) {
  var dark = theme === 'dark';
  var is6 = wheelCount !== 8;
  var group = new THREE.Group();
  var markers = []; // { object3D, status: 'warning'|'danger', label } — 경고 라벨 오버레이용
  // 축 순서(axleX)와 좌/우(side) 조합을 tire-detail 화면의 위치 ID(FL/FR/RL1/RR1/...)와
  // 맞춰서 '교체 필요' 타이어를 빨간색으로 표시하기 위한 매핑.
  var wheelIdPairs = is6
    ? [['FL', 'FR'], ['RL1', 'RR1'], ['RL2', 'RR2']]
    : [['FL', 'FR'], ['RL1', 'RR1'], ['RL2', 'RR2'], ['RL3', 'RR3']];

  var cabColor = dark ? 0x1c2a4d : 0x16213e;
  var cargoColor = dark ? 0x232f4d : 0xf2f4f7;
  var cargoSeam = dark ? 0x2c3a5e : 0xdbe0e6;
  var glassColor = 0x0a1220;
  var wheelColor = 0x17171a;
  var rimColor = dark ? 0x8fb8c9 : 0xc7ccd1;
  var chassisColor = 0x2a2e36;
  var accentColor = 0x2dd4bf;

  var matCab = new THREE.MeshStandardMaterial({ color: cabColor, metalness: 0.35, roughness: 0.5 });
  var matCargo = new THREE.MeshStandardMaterial({ color: cargoColor, metalness: 0.1, roughness: 0.65 });
  var matSeam = new THREE.MeshStandardMaterial({ color: cargoSeam, metalness: 0.1, roughness: 0.7 });
  var matGlass = new THREE.MeshStandardMaterial({ color: glassColor, metalness: 0.7, roughness: 0.15 });
  var matWheel = new THREE.MeshStandardMaterial({ color: wheelColor, metalness: 0.2, roughness: 0.85 });
  var matWheelDanger = new THREE.MeshStandardMaterial({ color: 0xe0392f, metalness: 0.2, roughness: 0.75, emissive: 0x5c0f0a, emissiveIntensity: 0.5 });
  var matRim = new THREE.MeshStandardMaterial({ color: rimColor, metalness: 0.8, roughness: 0.3 });
  var matChassis = new THREE.MeshStandardMaterial({ color: chassisColor, metalness: 0.4, roughness: 0.6 });
  var matChassisWarning = new THREE.MeshStandardMaterial({ color: 0xf2b705, metalness: 0.3, roughness: 0.6, emissive: 0x4a3900, emissiveIntensity: 0.4 });
  var matChassisDanger = new THREE.MeshStandardMaterial({ color: 0xe0392f, metalness: 0.3, roughness: 0.6, emissive: 0x5c0f0a, emissiveIntensity: 0.5 });
  var matLight = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffcf6b, emissiveIntensity: dark ? 1.4 : 0.6 });
  var matTail = new THREE.MeshStandardMaterial({ color: 0xff5a4d, emissive: 0xdd2c22, emissiveIntensity: dark ? 1.2 : 0.5 });

  var cargoLen = is6 ? 3.3 : 4.9;
  var cargoStartX = -1.6;
  var cargoEndX = cargoStartX + cargoLen;
  var cargoCenterX = cargoStartX + cargoLen / 2;
  var overallLen = cargoEndX - -3.42 + 0.3;

  // ---- chassis rail (= 엔진오일 위치) ----
  var oilStatus = oilInfo && oilInfo.status;
  var matChassisActive = oilStatus === 'danger' ? matChassisDanger : oilStatus === 'warning' ? matChassisWarning : matChassis;
  var chassis = new THREE.Mesh(new THREE.BoxGeometry(overallLen, 0.22, 1.9), matChassisActive);
  chassis.position.set((cargoEndX + -3.42) / 2, 0.78, 0);
  group.add(chassis);
  if (oilStatus === 'warning' || oilStatus === 'danger') {
    markers.push({ object3D: chassis, status: oilStatus, label: oilInfo.label });
  }

  // ---- cab ----
  var cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 1.95), matCab);
  cab.position.set(-2.55, 2.1, 0);
  group.add(cab);
  var roof = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.22, 1.8), matCab);
  roof.position.set(-2.55, 3.16, 0);
  group.add(roof);
  var windshield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 1.65), matGlass);
  windshield.position.set(-1.72, 2.35, 0);
  group.add(windshield);
  var sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.05), matGlass);
  sideGlassL.position.set(-2.35, 2.55, 0.99);
  group.add(sideGlassL);
  var sideGlassR = sideGlassL.clone(); sideGlassR.position.z = -0.99; group.add(sideGlassR);
  var bumper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.45, 1.9), matChassis);
  bumper.position.set(-3.42, 1.05, 0);
  group.add(bumper);
  var headL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.3), matLight);
  headL.position.set(-3.42, 1.55, 0.65); group.add(headL);
  var headR = headL.clone(); headL.position.z = 0.65; headR.position.z = -0.65; group.add(headR);
  var grille = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 1.3), new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.6, roughness: 0.4 }));
  grille.position.set(-3.36, 1.85, 0); group.add(grille);

  // ---- cargo box ----
  var cargo = new THREE.Mesh(new THREE.BoxGeometry(cargoLen, 2.05, 2.0), matCargo);
  cargo.position.set(cargoCenterX, 2.18, 0);
  group.add(cargo);
  // panel seam lines (both sides)
  var seamSpacing = cargoLen / (is6 ? 4 : 6);
  var seamCount = is6 ? 3 : 5;
  var seamHalf = Math.floor(seamCount / 2);
  for (var i = -seamHalf; i <= seamHalf; i++) {
    var seamL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.0, 0.01), matSeam);
    seamL.position.set(cargoCenterX + i * seamSpacing, 2.18, 1.006);
    group.add(seamL);
    var seamR = seamL.clone(); seamR.position.z = -1.006;
    group.add(seamR);
  }
  var cargoTop = new THREE.Mesh(new THREE.BoxGeometry(cargoLen, 0.06, 2.02), matSeam);
  cargoTop.position.set(cargoCenterX, 3.24, 0); group.add(cargoTop);
  var tailX = cargoEndX - 0.08;
  var tailL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.16), matTail);
  tailL.position.set(tailX, 1.5, 0.75); group.add(tailL);
  var tailR = tailL.clone(); tailR.position.z = -0.75; group.add(tailR);

  // ---- wheels ----
  var wheelR = 0.56, wheelW = 0.42;
  var axleX = is6 ? [-2.6, cargoEndX - 1.3, cargoEndX - 0.3] : [-2.6, -0.55, 1.0, 2.5];
  var wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 22);
  var rimGeo = new THREE.CylinderGeometry(wheelR * 0.52, wheelR * 0.52, wheelW + 0.03, 14);
  axleX.forEach(function (x, axleIdx) {
    [1, -1].forEach(function (side, sideIdx) {
      var z = side * 1.06;
      var wheelId = wheelIdPairs[axleIdx][sideIdx];
      var tireInfo = tireStatuses && tireStatuses[wheelId];
      var isDanger = !!(tireInfo && tireInfo.status === 'danger');
      var w = new THREE.Mesh(wheelGeo, isDanger ? matWheelDanger : matWheel);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, wheelR, z);
      group.add(w);
      if (isDanger) markers.push({ object3D: w, status: 'danger', label: tireInfo.label });
      var rim = new THREE.Mesh(rimGeo, matRim);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, wheelR, z);
      group.add(rim);
    });
  });

  // subtle brand accent strip under chassis (dark theme only, echoes the reference wireframe glow)
  if (dark) {
    var stripMat = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.9 });
    var strip = new THREE.Mesh(new THREE.BoxGeometry(overallLen, 0.03, 0.03), stripMat);
    strip.position.set((cargoEndX + -3.42) / 2, 0.66, 1.02);
    group.add(strip);
    var strip2 = strip.clone(); strip2.position.z = -1.02; group.add(strip2);
  }

  // 회전축(수직선)을 캡-화물함 경계로 이동: group은 그대로 두고 -PIVOT_X만큼 안으로
  // 밀어넣은 뒤, 바깥 pivot을 +PIVOT_X에 둔다 — 자식 메쉬 좌표는 그대로, 회전만 그
  // 경계선 기준으로 돈다.
  var PIVOT_X = cargoStartX;
  group.position.x = -PIVOT_X;
  var pivot = new THREE.Group();
  pivot.add(group);
  pivot.position.set(PIVOT_X, -1.95, 0); // y: 회전축 위치 유지, 세로 중심만 재조정
  return { group: pivot, markers: markers };
}

function init(container, theme, wheelCount, tireStatuses, oilInfo) {
  dispose();
  mountEl = container;
  var w = Math.max(container.clientWidth, 100), h = Math.max(container.clientHeight, 100);
  var dark = theme === 'dark';

  var centerX = wheelCount === 8 ? -0.1 : -0.9;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  camera.position.set(centerX + 5.5, 1.35, 6.8);
  camera.lookAt(centerX, -0.35, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  var ambient = new THREE.AmbientLight(0xffffff, dark ? 0.55 : 0.85);
  scene.add(ambient);
  var key = new THREE.DirectionalLight(dark ? 0xbfe3ff : 0xfff4e0, dark ? 1.0 : 1.15);
  key.position.set(4, 6, 4);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-5, 3, -4);
  scene.add(fill);
  if (dark) {
    var rim = new THREE.DirectionalLight(0x2dd4bf, 0.55);
    rim.position.set(-3, 1, -5);
    scene.add(rim);
  }

  var ground = new THREE.Mesh(new THREE.CircleGeometry(3.6, 32), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.95 + 0.001;
  scene.add(ground);

  var built = buildTruck(theme, wheelCount, tireStatuses, oilInfo);
  truckGroup = built.group;
  scene.add(truckGroup);
  setupWarnLabels(container, built.markers);

  rotY = 0.55; tiltX = -0.14; velY = 0;
  idleSince = performance.now();

  wireInteraction(renderer.domElement);

  ro = new ResizeObserver(function () {
    if (!renderer || !mountEl) return;
    var nw = Math.max(mountEl.clientWidth, 50), nh = Math.max(mountEl.clientHeight, 50);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  });
  ro.observe(container);

  animate();
}

function setupWarnLabels(container, markers) {
  clearWarnLabels();
  if (!markers || !markers.length) return;
  warnLabelLayer = document.createElement('div');
  warnLabelLayer.style.position = 'absolute';
  warnLabelLayer.style.inset = '0';
  warnLabelLayer.style.pointerEvents = 'none';
  container.appendChild(warnLabelLayer);
  warnMarkers = markers.map(function (m) {
    var el = document.createElement('div');
    el.className = 'truck3d-warn-label tone-' + m.status;
    el.textContent = '! ' + m.label;
    warnLabelLayer.appendChild(el);
    return { object3D: m.object3D, el: el };
  });
}

function updateWarnLabels() {
  if (!warnMarkers.length || !mountEl || !camera) return;
  var w = mountEl.clientWidth, h = mountEl.clientHeight;
  var v = new THREE.Vector3();
  warnMarkers.forEach(function (m) {
    m.object3D.getWorldPosition(v);
    v.y += 0.5;
    v.project(camera);
    m.el.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
    m.el.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
  });
}

function wireInteraction(dom) {
  dom.style.touchAction = 'none';
  dom.style.cursor = 'grab';

  dom.addEventListener('pointerdown', function (e) {
    dragging = true;
    dom.setPointerCapture(e.pointerId);
    dom.style.cursor = 'grabbing';
    lastX = e.clientX; lastY = e.clientY; lastMoveT = performance.now();
    velX = 0;
  });
  dom.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX;
    var now = performance.now();
    var dt = Math.max(now - lastMoveT, 1);
    rotY += dx * 0.008; // 좌우 드래그만 반영 — 상하 드래그로 기울이는 축은 없음(요청: 360도 좌우 회전만)
    velX = (dx * 0.008) / (dt / 16.7);
    lastX = e.clientX; lastY = e.clientY; lastMoveT = now;
    idleSince = now;
  });
  function release(e) {
    if (!dragging) return;
    dragging = false;
    dom.style.cursor = 'grab';
    idleSince = performance.now();
  }
  dom.addEventListener('pointerup', release);
  dom.addEventListener('pointercancel', release);
  dom.addEventListener('pointerleave', function () { if (!dragging) idleSince = performance.now(); });
}

function animate() {
  animId = requestAnimationFrame(animate);
  if (!renderer) return;

  if (dragging) {
    // handled directly in pointermove
  } else if (Math.abs(velX) > 0.0003) {
    rotY += velX;
    velX *= 0.93;
  } else {
    var now = performance.now();
    if (now - idleSince > 2200) rotY += 0.0022;
  }

  truckGroup.rotation.y = rotY;
  truckGroup.rotation.x = tiltX;
  truckGroup.updateMatrixWorld(true);
  renderer.render(scene, camera);
  updateWarnLabels();
}

window.SE_Truck3D = { init: init, dispose: dispose };
