const canvas = document.getElementById('gameCanvas');

const hud = {
  score: document.getElementById('score'),
  multiplier: document.getElementById('multiplier'),
  speed: document.getElementById('speed'),
  distance: document.getElementById('distance'),
  trafficCount: document.getElementById('trafficCount'),
  status: document.getElementById('status'),
};

const startOverlay = document.getElementById('startOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const finalStats = document.getElementById('finalStats');

const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const gasBtn = document.getElementById('gasBtn');
const brakeBtn = document.getElementById('brakeBtn');

const input = {
  left: false,
  right: false,
  accelerate: false,
  brake: false,
};

const bgMusic = new Audio('music.mp3.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.35;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08111f);
scene.fog = new THREE.Fog(0x0d1830, 55, 250);

const textureLoader = new THREE.TextureLoader();

const camera = new THREE.PerspectiveCamera(
  65,
  window.innerWidth / window.innerHeight,
  0.1,
  1200
);

const clock = new THREE.Clock();

const game = {
  running: false,
  gameOver: false,
  score: 0,
  distance: 0,
  multiplier: 1,
};

const road = {
  laneWidth: 3.2,
  laneCount: 4,
  width: 12.8,
  segmentLength: 36,
  segmentCount: 20,
};

const player = {
  mesh: null,
  speed: 0,
  maxSpeed: 245,
  minAutoSpeed: 72,
  acceleration: 85,
  brakePower: 130,
  drag: 16,
  steering: 7.8,
  x: 0,
  z: 0,
  tilt: 0,
  crashed: false,
  collisionHalfWidth: 0.95,
  collisionHalfLength: 2.05
};

const traffic = [];
const roadSegments = [];
const roadsideObjects = [];
const lampPosts = [];
const stars = [];

const world = new THREE.Group();
scene.add(world);

/* =========================
   СВЕТ
========================= */
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x162235, 0.95);
scene.add(hemi);

const moonLight = new THREE.DirectionalLight(0xcfe3ff, 0.75);
moonLight.position.set(25, 40, 15);
scene.add(moonLight);

/* =========================
   ЗЕМЛЯ
========================= */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(900, 2200),
  new THREE.MeshStandardMaterial({
    color: 0x17351a,
    roughness: 1
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.03;
scene.add(ground);

/* =========================
   ВСПОМОГАТЕЛЬНЫЕ
========================= */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function laneX(laneIndex) {
  return (laneIndex - (road.laneCount - 1) / 2) * road.laneWidth;
}

function updateHUD() {
  hud.score.textContent = Math.floor(game.score);
  hud.multiplier.textContent = `x${game.multiplier.toFixed(1)}`;
  hud.speed.textContent = `${Math.round(player.speed)} км/ч`;
  hud.distance.textContent = `${(game.distance / 1000).toFixed(2)} км`;
  hud.trafficCount.textContent = String(traffic.length);
}

function setButtonActive(btn, active) {
  if (!btn) return;
  btn.classList.toggle('active', active);
}

function bindHoldButton(btn, key) {
  if (!btn) return;

  const press = (e) => {
    e.preventDefault();
    input[key] = true;
    setButtonActive(btn, true);
  };

  const release = (e) => {
    e.preventDefault();
    input[key] = false;
    setButtonActive(btn, false);
  };

  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
}

// ИСПРАВЛЕНО: Меняем привязку кнопок экрана местами, чтобы исправить инверсию
bindHoldButton(leftBtn, 'right');
bindHoldButton(rightBtn, 'left');
bindHoldButton(gasBtn, 'accelerate');
bindHoldButton(brakeBtn, 'brake');

/* =========================
   КЛАВИАТУРА
========================= */
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();

  // ИСПРАВЛЕНО: Инвертируем логику клавиш клавиатуры
  if (k === 'a' || e.key === 'ArrowLeft') input.right = true;
  if (k === 'd' || e.key === 'ArrowRight') input.left = true;
  if (k === 'w' || e.key === 'ArrowUp') input.accelerate = true;
  if (k === 's' || e.key === 'ArrowDown') input.brake = true;

  if (k === 'r' && game.gameOver) {
    restartGame();
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();

  // ИСПРАВЛЕНО: Инвертируем логику клавиш клавиатуры при отпускании
  if (k === 'a' || e.key === 'ArrowLeft') input.right = false;
  if (k === 'd' || e.key === 'ArrowRight') input.left = false;
  if (k === 'w' || e.key === 'ArrowUp') input.accelerate = false;
  if (k === 's' || e.key === 'ArrowDown') input.brake = false;
});

/* =========================
   ДОРОГА
========================= */
function createRoadSegment() {
  const group = new THREE.Group();

  const roadMesh = new THREE.Mesh(
    new THREE.BoxGeometry(road.width, 0.08, road.segmentLength),
    new THREE.MeshStandardMaterial({
      color: 0x2f3238,
      roughness: 0.98,
      metalness: 0
    })
  );
  roadMesh.position.y = 0;
  group.add(roadMesh);

  // светлые края
  const shoulderL = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.1, road.segmentLength),
    new THREE.MeshStandardMaterial({ color: 0xd6d6d6 })
  );
  shoulderL.position.set(-road.width / 2 - 0.15, 0.03, 0);
  group.add(shoulderL);

  const shoulderR = shoulderL.clone();
  shoulderR.position.x = road.width / 2 + 0.15;
  group.add(shoulderR);

  // красные линии опасной зоны
  const rumbleMat = new THREE.MeshBasicMaterial({ color: 0xd22d2d });
  for (let i = 0; i < 8; i++) {
    const stripL = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.03, 2.2),
      rumbleMat
    );
    stripL.position.set(-road.width / 2 - 0.45, 0.05, -road.segmentLength / 2 + 2 + i * 4.2);
    group.add(stripL);

    const stripR = stripL.clone();
    stripR.position.x = road.width / 2 + 0.45;
    group.add(stripR);
  }

  // пунктир между полосами
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  for (let i = 1; i < road.laneCount; i++) {
    const x = -road.width / 2 + i * road.laneWidth;
    for (let j = 0; j < 6; j++) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.03, 3.4),
        lineMat
      );
      dash.position.set(x, 0.06, -road.segmentLength / 2 + 4 + j * 6);
      group.add(dash);
    }
  }

  return group;
}

/* =========================
   МАШИНЫ
========================= */
function createGlowBox(color, w, h, d) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color })
  );
}

function addWheel(group, x, y, z) {
  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.38, 18),
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.95
    })
  );
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, y, z);
  group.add(wheel);
}

function addRoofPhoto(carGroup) {
  const roofTexture = textureLoader.load('assets/roof-photo.jpg.jpeg');

  roofTexture.colorSpace = THREE.SRGBColorSpace;
  roofTexture.minFilter = THREE.LinearFilter;
  roofTexture.magFilter = THREE.LinearFilter;

  const photoMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 1.8),
    new THREE.MeshBasicMaterial({
      map: roofTexture,
      transparent: true
    })
  );

  photoMesh.rotation.x = -Math.PI / 2;
  photoMesh.position.set(0, 1.69, -0.05);

  carGroup.add(photoMesh);
}

function createPlayerCar() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.8, 4.4),
    new THREE.MeshStandardMaterial({
      color: 0x214cff,
      metalness: 0.3,
      roughness: 0.35
    })
  );
  body.position.y = 0.8;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.68, 2.15),
    new THREE.MeshStandardMaterial({
      color: 0x101317,
      metalness: 0.2,
      roughness: 0.12
    })
  );
  cabin.position.set(0, 1.34, -0.08);
  group.add(cabin);

  addRoofPhoto(group);

  addWheel(group, -0.95, 0.38, 1.45);
  addWheel(group, 0.95, 0.38, 1.45);
  addWheel(group, -0.95, 0.38, -1.45);
  addWheel(group, 0.95, 0.38, -1.45);

  // фары
  const headL = createGlowBox(0xfff4cc, 0.26, 0.12, 0.08);
  headL.position.set(-0.58, 0.82, 2.22);
  group.add(headL);

  const headR = headL.clone();
  headR.position.x = 0.58;
  group.add(headR);

  // задние огни
  const tailL = createGlowBox(0xff3a2d, 0.3, 0.12, 0.08);
  tailL.position.set(-0.58, 0.8, -2.22);
  group.add(tailL);

  const tailR = tailL.clone();
  tailR.position.x = 0.58;
  group.add(tailR);

  // выхлоп
  const exhaustL = createGlowBox(0xffb347, 0.12, 0.08, 0.06);
  exhaustL.position.set(-0.34, 0.42, -2.24);
  group.add(exhaustL);

  const exhaustR = exhaustL.clone();
  exhaustR.position.x = 0.34;
  group.add(exhaustR);

  // конусы света от фар
  const headBeamMat = new THREE.MeshBasicMaterial({
    color: 0xfff0b3,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const beamLeft = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 8, 16, 1, true),
    headBeamMat
  );
  beamLeft.rotation.x = Math.PI / 2;
  beamLeft.position.set(-0.58, 0.72, 5.8);
  beamLeft.scale.set(1.2, 1, 1);
  group.add(beamLeft);

  const beamRight = beamLeft.clone();
  beamRight.position.x = 0.58;
  group.add(beamRight);

  return group;
}

function createTrafficCar(color = 0xd97706) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.8, 4.2),
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.2,
      roughness: 0.45
    })
  );
  body.position.y = 0.78;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 0.62, 2.0),
    new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.15
    })
  );
  cabin.position.set(0, 1.28, -0.02);
  group.add(cabin);

  addWheel(group, -0.92, 0.38, 1.35);
  addWheel(group, 0.92, 0.38, 1.35);
  addWheel(group, -0.92, 0.38, -1.35);
  addWheel(group, 0.92, 0.38, -1.35);

  const tailL = createGlowBox(0xff3328, 0.24, 0.1, 0.08);
  tailL.position.set(-0.52, 0.76, -2.12);
  group.add(tailL);

  const tailR = tailL.clone();
  tailR.position.x = 0.52;
  group.add(tailR);

  return group;
}

/* =========================
   ДЕРЕВЬЯ / ОБОЧИНА
========================= */
function createTree() {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 1.8, 8),
    new THREE.MeshStandardMaterial({
      color: 0x6b4423,
      roughness: 1
    })
  );
  trunk.position.y = 0.9;
  group.add(trunk);

  const leaves1 = new THREE.Mesh(
    new THREE.ConeGeometry(1.15, 2.0, 10),
    new THREE.MeshStandardMaterial({
      color: 0x1f6b2f,
      roughness: 1
    })
  );
  leaves1.position.y = 2.1;
  group.add(leaves1);

  const leaves2 = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 1.55, 10),
    new THREE.MeshStandardMaterial({
      color: 0x2b8a3e,
      roughness: 1
    })
  );
  leaves2.position.y = 3.0;
  group.add(leaves2);

  return group;
}

function spawnRoadsideObject(zPos, side) {
  const tree = createTree();
  const offset = road.width / 2 + rand(5.5, 10.5);
  const x = side === 'left' ? -offset : offset;

  tree.position.set(x, 0, zPos);
  world.add(tree);

  roadsideObjects.push({
    mesh: tree,
    x,
    z: zPos,
    side,
    radius: 1.15
  });
}

function buildRoadside() {
  for (let i = 0; i < 46; i++) {
    const z = i * 18 + rand(-3, 3);
    spawnRoadsideObject(z, 'left');
    spawnRoadsideObject(z + rand(0, 6), 'right');
  }
}

function updateRoadside(dt) {
  const worldSpeed = player.speed * 0.42;

  for (const obj of roadsideObjects) {
    obj.z -= worldSpeed * dt;
    obj.mesh.position.z = obj.z;
  }

  let furthestZ = -Infinity;
  for (const obj of roadsideObjects) {
    if (obj.z > furthestZ) furthestZ = obj.z;
  }

  for (const obj of roadsideObjects) {
    if (obj.z < -85) {
      obj.z = furthestZ + rand(14, 24);
      const offset = road.width / 2 + rand(5.5, 10.5);
      obj.x = obj.side === 'left' ? -offset : offset;
      obj.mesh.position.x = obj.x;
      obj.mesh.position.z = obj.z;
      furthestZ = obj.z;
    }
  }
}

function checkRoadsideCollision() {
  // авария если сильно выехал с дороги
  const hardRoadLimit = road.width * 0.5 + 0.9;
  if (Math.abs(player.x) > hardRoadLimit) {
    triggerCrash('Вылетел с дороги');
    return true;
  }

  // авария если задел дерево рядом
  for (const obj of roadsideObjects) {
    const dz = Math.abs(obj.z - player.z);
    if (dz > 2.6) continue;

    const dx = Math.abs(obj.x - player.x);
    if (dx < obj.radius + 0.85) {
      triggerCrash('Врезался в дерево');
      return true;
    }
  }

  return false;
}

/* =========================
   ФОНАРИ
========================= */
function createLampPost() {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 5.8, 10),
    new THREE.MeshStandardMaterial({
      color: 0x6b7382,
      roughness: 0.8
    })
  );
  pole.position.y = 2.9;
  group.add(pole);

  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.08, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0x7d8796,
      roughness: 0.8
    })
  );
  arm.position.set(0.55, 5.6, 0);
  group.add(arm);

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffefb0
    })
  );
  lamp.position.set(1.08, 5.45, 0);
  group.add(lamp);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 10, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffefb0,
      transparent: true,
      opacity: 0.18
    })
  );
  glow.position.copy(lamp.position);
  group.add(glow);

  return group;
}

function spawnLamp(zPos, side) {
  const lamp = createLampPost();
  const x = side === 'left'
    ? -(road.width / 2 + 2.6)
    : (road.width / 2 + 2.6);

  lamp.position.set(x, 0, zPos);

  // поворачиваем правые фонари
  if (side === 'right') {
    lamp.rotation.y = Math.PI;
  }

  world.add(lamp);
  lampPosts.push({ mesh: lamp, x, z: zPos, side });
}

function buildLamps() {
  for (let i = 0; i < 24; i++) {
    const z = i * 32 + 10;
    spawnLamp(z, 'left');
    spawnLamp(z + 16, 'right');
  }
}

function updateLamps(dt) {
  const worldSpeed = player.speed * 0.42;

  for (const lamp of lampPosts) {
    lamp.z -= worldSpeed * dt;
    lamp.mesh.position.z = lamp.z;
  }

  let furthestZ = -Infinity;
  for (const lamp of lampPosts) {
    if (lamp.z > furthestZ) furthestZ = lamp.z;
  }

  for (const lamp of lampPosts) {
    if (lamp.z < -95) {
      lamp.z = furthestZ + rand(24, 36);
      lamp.mesh.position.z = lamp.z;
      furthestZ = lamp.z;
    }
  }
}

/* =========================
   ЗВЁЗДЫ
========================= */
function buildStars() {
  const starGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  for (let i = 0; i < 90; i++) {
    const s = new THREE.Mesh(starGeo, starMat);
    s.position.set(
      rand(-180, 180),
      rand(30, 85),
      rand(-100, 280)
    );
    scene.add(s);
    stars.push(s);
  }
}

/* =========================
   ДОРОГА
========================= */
function buildRoad() {
  for (let i = 0; i < road.segmentCount; i++) {
    const segment = createRoadSegment();
    segment.position.z = i * road.segmentLength;
    roadSegments.push(segment);
    world.add(segment);
  }
}

function resetRoad() {
  for (let i = 0; i < roadSegments.length; i++) {
    roadSegments[i].position.z = i * road.segmentLength;
  }
}

function recycleRoad() {
  let furthest = -Infinity;
  for (const seg of roadSegments) {
    if (seg.position.z > furthest) furthest = seg.position.z;
  }

  for (const seg of roadSegments) {
    if (seg.position.z < -road.segmentLength * 1.5) {
      seg.position.z = furthest + road.segmentLength;
      furthest = seg.position.z;
    }
  }
}

function updateRoad(dt) {
  const worldSpeed = player.speed * 0.42;
  for (const seg of roadSegments) {
    seg.position.z -= worldSpeed * dt;
  }
  recycleRoad();
}

/* =========================
   ИГРОК
========================= */
function resetPlayer() {
  player.speed = 0;
  player.x = 0;
  player.z = 0;
  player.tilt = 0;
  player.crashed = false;

  if (player.mesh) {
    player.mesh.position.set(0, 0, 0);
    player.mesh.rotation.set(0, 0, 0);
  }
}

function updatePlayer(dt) {
  if (player.crashed) return;

  if (input.accelerate) {
    player.speed += player.acceleration * dt;
  } else {
    if (player.speed > player.minAutoSpeed) {
      player.speed -= player.drag * dt;
    }
  }

  if (input.brake) {
    player.speed -= player.brakePower * dt;
  }

  player.speed = clamp(player.speed, player.minAutoSpeed, player.maxSpeed);

  let steer = 0;
  // ИСПРАВЛЕНО: Полная инверсия знаков для направления движения
  if (input.left) steer += 1;
  if (input.right) steer -= 1;

  const steerPower = player.steering * (0.55 + player.speed / player.maxSpeed);
  player.x += steer * steerPower * dt;

  const softRoadLimit = road.width * 0.5 - 0.85;
  const outside = Math.abs(player.x) > softRoadLimit;

  // если почти на обочине — сильнее тормозим машину
  if (outside) {
    player.speed -= 38 * dt;
  }

  // жёсткий предел уже почти возле деревьев
  const hardRoadLimit = road.width * 0.5 + 1.1;
  player.x = clamp(player.x, -hardRoadLimit, hardRoadLimit);

  // ИСПРАВЛЕНО: Наклон модели теперь тоже инвертирован, чтобы соответствовать физике нового поворота
  player.tilt = lerp(player.tilt, steer * 0.2, dt * 8);

  player.mesh.position.x = player.x;
  player.mesh.position.z = player.z;
  player.mesh.rotation.z = player.tilt;

  const speedRatio = player.speed / player.maxSpeed;
  player.mesh.position.y =
    0.02 + Math.sin(performance.now() * 0.012) * 0.012 * speedRatio;
}

/* =========================
   ТРАФИК
========================= */
function spawnTrafficCar(zPos) {
  const colors = [
    0xd97706,
    0x7c3aed,
    0x16a34a,
    0x1d4ed8,
    0xb91c1c,
    0x4b5563,
    0xf59e0b
  ];

  const lane = Math.floor(Math.random() * road.laneCount);

  const mesh = createTrafficCar(colors[Math.floor(Math.random() * colors.length)]);
  const item = {
    mesh,
    lane,
    x: laneX(lane),
    z: zPos,
    speed: rand(88, 182),
    halfWidth: 0.95,
    halfLength: 1.95,
    passed: false
  };

  mesh.position.set(item.x, 0, item.z);
  world.add(mesh);
  traffic.push(item);
}

function clearTraffic() {
  for (const t of traffic) {
    world.remove(t.mesh);
  }
  traffic.length = 0;
}

function populateTraffic() {
  clearTraffic();

  let z = 50;
  for (let i = 0; i < 10; i++) {
    spawnTrafficCar(z + rand(0, 18));
    z += rand(28, 54);
  }
}

function updateTraffic(dt) {
  const playerWorldSpeed = player.speed * 0.42;

  for (let i = traffic.length - 1; i >= 0; i--) {
    const t = traffic[i];

    const relativeSpeed = playerWorldSpeed - t.speed * 0.42;
    t.z -= relativeSpeed * dt;
    t.mesh.position.z = t.z;
    t.mesh.position.x = t.x;

    if (!t.passed && t.z < -2.5) {
      t.passed = true;
      game.score += 30 * game.multiplier;
    }

    if (t.z < -70) {
      world.remove(t.mesh);
      traffic.splice(i, 1);
      spawnTrafficCar(rand(180, 280));
      continue;
    }

    const dx = Math.abs(t.x - player.x);
    const dz = Math.abs(t.z - player.z);

    if (
      dx < (t.halfWidth + player.collisionHalfWidth) &&
      dz < (t.halfLength + player.collisionHalfLength)
    ) {
      triggerCrash('Столкновение');
      return;
    }
  }

  while (traffic.length < 10) {
    spawnTrafficCar(rand(180, 280));
  }
}

/* =========================
   КАМЕРА / СКОРОСТНОЙ ЭФФЕКТ
========================= */
function updateCamera(dt) {
  const speedRatio = player.speed / player.maxSpeed;
  const targetX = player.x * 0.34;

  const shake = speedRatio * 0.045;
  const time = performance.now() * 0.0045;

  camera.position.x = lerp(
    camera.position.x,
    targetX + Math.sin(time * 2.4) * shake,
    dt * 3.6
  );

  camera.position.y = lerp(
    camera.position.y,
    5.45 + speedRatio * 0.55 + Math.sin(time * 3.1) * shake * 0.6,
    dt * 3.2
  );

  camera.position.z = lerp(
    camera.position.z,
    -8.8 - speedRatio * 1.45,
    dt * 3.1
  );

  camera.lookAt(player.x * 0.1, 1.0, 8);

  // эффект скорости: чем быстрее едем, тем шире угол камеры
  camera.fov = lerp(camera.fov, 65 + speedRatio * 10, dt * 3.5);
  camera.updateProjectionMatrix();
}

/* =========================
   СЧЁТ
========================= */
function updateScore(dt) {
  const speedFactor = player.speed / 100;
  game.distance += player.speed * dt * 0.52;
  game.score += dt * 12 * speedFactor * game.multiplier;

  const ratio = player.speed / player.maxSpeed;
  game.multiplier = 1 + ratio * 1.6;
}

/* =========================
   CRASH / START / RESTART
========================= */
function triggerCrash(reason = 'Авария') {
  if (game.gameOver) return;

  player.crashed = true;
  game.gameOver = true;
  game.running = false;
  player.speed = 0;

  hud.status.textContent = 'CRASH';

  finalStats.textContent =
    `${reason} | Счёт: ${Math.floor(game.score)} | Дистанция: ${(game.distance / 1000).toFixed(2)} км`;

  gameOverOverlay.classList.add('visible');
}

function startGame() {
  startOverlay.classList.remove('visible');

  game.running = true;
  game.gameOver = false;
  player.crashed = false;

  clock.start();
  clock.getDelta();

  if (player.speed < player.minAutoSpeed) {
    player.speed = player.minAutoSpeed;
  }

  hud.status.textContent = 'GO';
  updateHUD();

  bgMusic.play().catch(err => {
    console.warn('Музыка не запустилась:', err);
  });
}

function restartGame() {
  clearTraffic();
  resetRoad();
  resetPlayer();
  populateTraffic();

  // сброс деревьев / фонарей ближе к старту
  for (let i = 0; i < roadsideObjects.length; i++) {
    const obj = roadsideObjects[i];
    obj.z = i * 9 + rand(10, 40);
    obj.mesh.position.z = obj.z;
  }

  for (let i = 0; i < lampPosts.length; i++) {
    const lamp = lampPosts[i];
    lamp.z = i * 18 + rand(10, 30);
    lamp.mesh.position.z = lamp.z;
  }

  game.score = 0;
  game.distance = 0;
  game.multiplier = 1;
  game.gameOver = false;
  game.running = true;

  player.speed = player.minAutoSpeed;
  player.crashed = false;

  clock.start();
  clock.getDelta();

  finalStats.textContent = '';
  gameOverOverlay.classList.remove('visible');

  hud.status.textContent = 'GO';
  updateHUD();
}

/* =========================
   UPDATE GAME
========================= */
function updateGame(dt) {
  updatePlayer(dt);
  updateRoad(dt);
  updateRoadside(dt);
  updateLamps(dt);
  updateTraffic(dt);
  updateCamera(dt);
  updateScore(dt);

  if (checkRoadsideCollision()) return;

  updateHUD();
}

/* =========================
   RESIZE
========================= */
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

/* =========================
   INIT
========================= */
function init() {
  buildRoad();
  buildRoadside();
  buildLamps();
  buildStars();

  player.mesh = createPlayerCar();
  player.mesh.position.set(0, 0, 0);
  world.add(player.mesh);

  populateTraffic();

  camera.position.set(0, 5.5, -8.8);
  camera.lookAt(0, 1, 8);

  updateHUD();
}

/* =========================
   LOOP
========================= */
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.033);

  if (game.running && !game.gameOver) {
    updateGame(dt);
  }

  renderer.render(scene, camera);
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', restartGame);
window.addEventListener('resize', onResize);

init();
animate();