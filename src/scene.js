import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSoftwareView } from './software-view.js';
import { ports, rack, stylusLength, workpiece, worldPosition } from './machine.js';

const logo = `${import.meta.env.BASE_URL}zeiss.svg`;
const metal = (color, metalness, roughness, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

function graniteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(1024, 1024);
  let seed = 47031;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < 1024; y++) {
    for (let x = 0; x < 1024; x++) {
      const mineral = rand();
      const cloud = Math.sin(x * 0.085 + Math.cos(y * 0.055) * 1.6) * Math.sin(y * 0.073);
      const grain = 34 + cloud * 8 + rand() * 23 + (mineral > 0.88 ? mineral * 64 : 0) - (mineral < 0.11 ? 18 : 0);
      const at = (y * 1024 + x) * 4;
      pixels.data.set([grain * 0.91, grain * 0.96, grain, 255], at);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  for (let i = 0; i < 15000; i++) {
    const pale = rand() > 0.48;
    ctx.fillStyle = pale ? `rgba(154,160,156,${rand() * 0.30})` : `rgba(11,16,17,${rand() * 0.55})`;
    ctx.fillRect(rand() * 1024, rand() * 1024, 0.5 + rand() * 3.2, 0.7 + rand() * 2.1);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

function brushedTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 256; y++) {
    const value = Math.round(164 + 14 * Math.sin(y * 12.19) + 12 * Math.sin(y * 2.45));
    ctx.fillStyle = `rgb(${value},${value},${value})`;
    ctx.fillRect(0, y, 64, 1);
  }
  return new THREE.CanvasTexture(canvas);
}

function box(parent, material, w, h, d, x, y, z, radius = 0) {
  const geometry = radius ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d);
  return addMesh(parent, geometry, material, x, y, z);
}

function cylinder(parent, material, r, h, x, y, z, segments = 32, lower = r) {
  return addMesh(parent, new THREE.CylinderGeometry(r, lower, h, segments), material, x, y, z);
}

function addMesh(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function group(parent, x = 0, y = 0, z = 0) {
  const object = new THREE.Group();
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function textMap(text, { width = 512, height = 96, color = '#282e36', font = '700 74px Arial', background } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + height * 0.02, width * 0.96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function decal(parent, map, width, height, x, y, z) {
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  sign.position.set(x, y, z);
  parent.add(sign);
  return sign;
}

function materials() {
  const granite = graniteTexture();
  const brush = brushedTexture();
  return {
    granite: metal(0xc1c7ca, 0.12, 0.29, { map: granite, bumpMap: granite, bumpScale: 0.0017, envMapIntensity: 0.52 }),
    graniteEdge: metal(0xaab1b5, 0.07, 0.43, { map: granite, bumpMap: granite, bumpScale: 0.004 }),
    white: metal(0xe9edf1, 0.23, 0.29),
    edge: metal(0xc1cbd1, 0.35, 0.34),
    black: metal(0x20262b, 0.29, 0.27),
    rubber: metal(0x101518, 0.0, 0.72),
    aluminum: metal(0xbfcbd4, 0.85, 0.29, { roughnessMap: brush }),
    steel: metal(0x9eacb8, 0.99, 0.18),
    ceramic: metal(0xd9d6c7, 0.19, 0.25),
    ruby: new THREE.MeshPhysicalMaterial({ color: 0xa21239, roughness: 0.17, metalness: 0.2, clearcoat: 1 }),
    blue: metal(0x0a58ae, 0.14, 0.33),
  };
}

function buildBase(scene, m) {
  box(scene, m.graniteEdge, 1.733, 0.442, 1.86, 0, -0.239, 0, 0.021);
  box(scene, m.granite, 1.731, 0.047, 1.858, 0, -0.0235, 0, 0.014);
  box(scene, m.granite, 0.163, 0.094, 1.825, 0.706, 0.046, -0.026, 0.011);
  box(scene, m.rubber, 0.026, 0.016, 1.75, 0.719, 0.097, -0.01, 0.004);
  box(scene, m.steel, 0.021, 0.018, 1.736, 0.687, 0.093, -0.012, 0.004);
  box(scene, m.granite, 0.17, 0.031, 1.815, -0.683, 0.015, -0.028, 0.008);
  for (const x of [-0.689, 0.689]) {
    for (const z of [-0.704, 0.058, 0.719]) {
      box(scene, m.black, 0.231, 0.032, 0.201, x, -0.685, z, 0.014);
      cylinder(scene, m.rubber, 0.079, 0.08, x, -0.629, z, 24, 0.094);
      cylinder(scene, m.steel, 0.046, 0.104, x, -0.546, z, 12);
      box(scene, m.black, 0.175, 0.059, 0.151, x, -0.474, z, 0.01);
      for (const dx of [-0.078, 0.078]) cylinder(scene, m.aluminum, 0.015, 0.027, x + dx, -0.66, z, 6);
    }
  }
  const vents = group(scene, 0.795, -0.35, -0.676);
  box(vents, m.black, 0.188, 0.269, 0.292, 0, 0, 0, 0.035);
  for (let i = 0; i < 6; i++) box(vents, m.rubber, 0.006, 0.012, 0.197, 0.095, -0.084 + i * 0.031, 0, 0.003);
  const threadColors = [m.black, m.steel];
  for (const x of [-0.45, -0.225, 0, 0.225, 0.45]) {
    for (const z of [0.65, 0.27, -0.12]) {
      cylinder(scene, threadColors[1], 0.009, 0.001, x, 0.001, z, 16);
      cylinder(scene, threadColors[0], 0.006, 0.001, x, 0.0018, z, 16);
    }
  }
}

function buildBridge(scene, m, mark) {
  const bridge = group(scene);
  box(bridge, m.black, 0.251, 0.133, 0.378, 0.706, 0.159, 0.024, 0.023);
  box(bridge, m.black, 0.187, 0.056, 0.234, -0.663, 0.057, 0.022, 0.009);
  box(bridge, m.white, 0.19, 1.294, 0.213, -0.663, 0.716, 0.025, 0.019);
  box(bridge, m.white, 0.224, 1.153, 0.275, 0.706, 0.792, 0.024, 0.021);
  box(bridge, m.edge, 0.018, 1.142, 0.196, 0.819, 0.786, 0.015, 0.008);
  box(bridge, m.white, 0.007, 1.105, 0.183, 0.829, 0.792, 0.015, 0.003);
  box(bridge, m.white, 0.095, 0.274, 0.064, -0.674, 1.192, -0.099, 0.015);
  const name = textMap('A C C U R A', { font: '700 66px Arial' });
  decal(bridge, name, 0.304, 0.060, 0.706, 0.554, 0.1635).rotation.z = Math.PI / 2;

  box(bridge, m.black, 1.26, 0.277, 0.224, 0.008, 1.172, -0.029, 0.015);
  box(bridge, m.aluminum, 1.25, 0.187, 0.036, 0.008, 1.175, 0.089, 0.005);
  for (const y of [1.102, 1.135, 1.173, 1.215, 1.246]) {
    box(bridge, m.edge, 1.238, 0.003, 0.004, 0.008, y, 0.109, 0.001);
  }
  for (const y of [1.047, 1.290]) {
    box(bridge, m.rubber, 1.235, 0.03, 0.030, 0.008, y, 0.098, 0.003);
    box(bridge, m.steel, 1.23, 0.009, 0.015, 0.008, y - 0.012, 0.121, 0.002);
  }
  box(bridge, m.white, 1.24, 0.048, 0.218, 0.008, 1.322, -0.028, 0.008);
  box(bridge, m.white, 1.242, 0.036, 0.22, 0.008, 1.018, -0.028, 0.008);
  for (let i = 0; i < 23; i++) {
    box(bridge, m.black, 0.052, 0.032, 0.076, -0.551 + i * 0.051, 1.312, -0.156, 0.005);
  }

  const carriage = group(bridge);
  box(carriage, m.black, 0.238, 0.368, 0.263, 0, 1.207, 0.091, 0.012);
  box(carriage, m.black, 0.194, 0.104, 0.247, 0, 1.402, 0.095, 0.012);
  box(carriage, m.edge, 0.133, 0.239, 0.057, 0.045, 1.167, 0.222, 0.006);
  box(carriage, m.aluminum, 0.113, 0.185, 0.021, 0.048, 1.154, 0.252, 0.006);
  box(carriage, m.white, 0.147, 0.020, 0.068, 0.045, 1.227, 0.227, 0.003);

  const ram = group(carriage);
  box(ram, m.white, 0.172, 1.326, 0.168, 0, 0.991, 0, 0.013);
  box(ram, m.edge, 0.006, 1.248, 0.112, 0.085, 1.007, 0, 0.003);
  box(ram, m.aluminum, 0.007, 1.239, 0.033, 0.089, 0.994, 0.022, 0.002);
  for (let i = 0; i < 4; i++) box(ram, m.edge, 0.035, 0.005, 0.001, -0.053, 1.585 - i * 0.012, 0.0845);
  decal(ram, mark, 0.061, 0.061, 0.032, 1.076, 0.086);
  cylinder(ram, m.ceramic, 0.034, 0.226, 0, 0.285, 0, 32);
  cylinder(ram, m.steel, 0.048, 0.018, 0, 0.181, 0);
  cylinder(ram, m.black, 0.047, 0.019, 0, 0.161, 0);
  cylinder(ram, m.aluminum, 0.046, 0.059, 0, 0.123, 0);
  cylinder(ram, m.steel, 0.037, 0.011, 0, 0.0945, 0);
  decal(ram, mark, 0.024, 0.024, 0.0, 0.125, 0.0461);
  const stylus = group(ram);
  return { bridge, carriage, ram, stylus };
}

function buildStylus(parent, m, port) {
  const length = stylusLength / 1000;
  const ball = port.diameter / 2000;
  cylinder(parent, m.steel, 0.036, 0.009, 0, -0.003, 0);
  cylinder(parent, m.black, 0.029, 0.007, 0, -0.010, 0);
  cylinder(parent, m.aluminum, 0.015, 0.019, 0, -0.022, 0, 24, 0.009);
  cylinder(parent, m.steel, 0.0037, length - 0.031 - ball, 0, -(length + 0.031 - ball) / 2, 0, 16);
  addMesh(parent, new THREE.SphereGeometry(ball, 20, 12), m.ruby, 0, -length + ball, 0);
}

function buildRack(scene, m) {
  const rackGroup = group(scene, 0, 0, (600 - rack.y) / 1000);
  for (const x of [-0.407, 0.407]) {
    box(rackGroup, m.aluminum, 0.069, 0.027, 0.252, x, 0.014, 0.007, 0.004);
    for (const z of [-0.124, 0.138]) box(rackGroup, m.black, 0.071, 0.026, 0.018, x, 0.013, z, 0.003);
    box(rackGroup, m.aluminum, 0.051, 0.364, 0.057, x, 0.199, -0.033, 0.004);
    for (const dx of [-0.013, 0.013]) box(rackGroup, m.black, 0.003, 0.329, 0.002, x + dx, 0.184, -0.003);
    box(rackGroup, m.aluminum, 0.054, 0.055, 0.054, x, 0.060, -0.009, 0.004);
    cylinder(rackGroup, m.steel, 0.013, 0.003, x, 0.028, 0.086, 16);
  }
  box(rackGroup, m.aluminum, 0.898, 0.05, 0.052, 0, 0.364, -0.074, 0.006);
  box(rackGroup, m.black, 0.913, 0.013, 0.026, 0, 0.36, -0.046, 0.004);
  decal(rackGroup, textMap('MSR', { width: 160, height: 72, color: '#a02026', font: '800 50px Arial' }),
    0.070, 0.025, -0.406, 0.151, -0.002).rotation.z = Math.PI / 2;
  return ports.map(port => {
    const x = (port.x - 450) / 1000;
    const holder = group(rackGroup, x, rack.plate / 1000, 0);
    box(holder, m.black, 0.113, 0.027, 0.062, 0, -0.009, -0.049, 0.006);
    for (const side of [-1, 1]) {
      box(holder, m.black, 0.033, 0.023, 0.085, side * 0.041, -0.008, 0.012, 0.005);
      box(holder, m.aluminum, 0.011, 0.011, 0.004, side * 0.043, -0.006, 0.055, 0.001);
      cylinder(holder, m.steel, 0.006, 0.003, side * 0.045, 0.006, 0.031, 12);
    }
    const label = decal(holder, textMap(String(port.id), {
      width: 64, height: 64, background: '#dde2e8', font: '700 45px Arial',
    }), 0.019, 0.019, 0, 0.006, -0.044);
    label.rotation.x = -Math.PI / 2;
    const stored = group(holder);
    buildStylus(stored, m, port);
    return stored;
  });
}

function buildArtifact(scene, m) {
  const [x, , z] = worldPosition({ ...workpiece, z: 0 });
  const item = group(scene, x, 0, z);
  const { width, depth, top } = workpiece;
  box(item, m.aluminum, width / 1000, top / 1000, depth / 1000, 0, top / 2000, 0, 0.007);
  for (const dx of [-0.082, 0.082]) {
    for (const dz of [-0.048, 0.048]) {
      cylinder(item, m.steel, 0.021, 0.001, dx, top / 1000 + 0.0005, dz);
      cylinder(item, m.black, 0.016, 0.001, dx, top / 1000 + 0.0011, dz);
    }
  }
  const label = textMap('REFERENCE BLOCK', { width: 480, height: 86, color: '#424b56', font: '700 54px Arial' });
  decal(item, label, 0.176, 0.022, 0, 0.035, depth / 2000 + 0.001);
  return item;
}

const views = {
  iso: { eye: [3.1, 2.22, 4.22], target: [0, 0.75, 0.018], zoom: 1.00 },
  front: { eye: [0, 1.76, 5.3], target: [0, 0.75, 0.0], zoom: 1.00 },
  rack: { eye: [1.32, 2.70, -4.20], target: [0, 0.24, -0.48], zoom: 2.60 },
};

export function createScene(container) {
  const canvas = document.createElement('canvas');
  const options = { antialias: true, alpha: false, powerPreference: 'high-performance' };
  const context = canvas.getContext('webgl2', options);
  let webGL;
  if (context) {
    try {
      webGL = new THREE.WebGLRenderer({ canvas, context, ...options });
      webGL.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      webGL.shadowMap.enabled = true;
      webGL.shadowMap.type = THREE.PCFShadowMap;
      webGL.toneMapping = THREE.ACESFilmicToneMapping;
      webGL.toneMappingExposure = 1.17;
    } catch (error) {
      webGL = undefined;
      console.warn('Switching to the software view', error);
    }
  }
  const renderer = webGL ?? createSoftwareView();
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D model of the ZEISS ACCURA');
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe4e9ee);
  scene.fog = new THREE.Fog(0xe4e9ee, 4, 13);
  const camera = new THREE.OrthographicCamera(-2, 2, 1.68, -1.68, 0.02, 50);
  const control = new OrbitControls(camera, renderer.domElement);
  control.enableDamping = true;
  control.dampingFactor = 0.12;
  control.minZoom = 0.65;
  control.maxZoom = 3.9;
  control.maxPolarAngle = Math.PI * 0.51;
  let dirty = true;
  control.addEventListener('change', () => { dirty = true; });

  if (webGL) {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(webGL);
    scene.environment = pmrem.fromScene(room, 0.055).texture;
    scene.environmentIntensity = 0.82;
    room.dispose();
    pmrem.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xf3f8ff, 0x929da8, 1.8));
  const key = new THREE.DirectionalLight(0xfff8ef, 2.5);
  key.position.set(-3.1, 5.4, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 2.8, bottom: -2.8, near: 0.2, far: 13 });
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.006;
  key.shadow.radius = 2.3;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb6cde8, 1.65);
  rim.position.set(4.0, 3.1, -3.4);
  scene.add(rim);

  const floor = addMesh(scene, new THREE.PlaneGeometry(45, 45), metal(0xc4ccd2, 0.04, 0.87), 0, -0.705, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const grid = new THREE.GridHelper(28, 56, 0xaab6c0, 0xaab6c0);
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  grid.position.y = -0.704;
  scene.add(grid);

  const m = materials();
  const mark = new THREE.TextureLoader().load(logo, () => { dirty = true; });
  mark.colorSpace = THREE.SRGBColorSpace;
  mark.anisotropy = 8;
  buildBase(scene, m);
  const moving = buildBridge(scene, m, mark);
  const parked = buildRack(scene, m);
  const artifact = buildArtifact(scene, m);
  const active = ports.map(port => {
    const tool = group(moving.stylus, 0, stylusLength / 1000, 0);
    buildStylus(tool, m, port);
    return tool;
  });

  const setView = name => {
    const view = views[name] ?? views.iso;
    camera.position.set(...view.eye);
    control.target.set(...view.target);
    camera.zoom = view.zoom;
    camera.updateProjectionMatrix();
    control.update();
    dirty = true;
  };
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = container;
    if (!height || !width) return;
    const ratio = width / height;
    const halfHeight = Math.max(1.62, 1.25 / ratio);
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.left = -halfHeight * ratio;
    camera.right = halfHeight * ratio;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    dirty = true;
  };
  new ResizeObserver(resize).observe(container);
  setView('iso');
  resize();

  let last = '';
  return {
    setView,
    render(machine) {
      const { position, loaded, manualTool } = machine;
      const state = `${position.x},${position.y},${position.z},${loaded},${manualTool},${machine.artifact}`;
      if (last !== state) {
        const [x, y, z] = worldPosition(position);
        moving.bridge.position.z = z;
        moving.carriage.position.x = x;
        moving.ram.position.set(0, y, 0.132);
        // The spindle is offset forward of the beam. Shift the beam so the stylus
        // center and the programmed Y coordinate coincide, including at the rack.
        moving.bridge.position.z -= 0.132;
        active.forEach((tool, index) => { tool.visible = loaded === index + 1; });
        parked.forEach((tool, index) => { tool.visible = loaded !== index + 1 && manualTool !== index + 1; });
        artifact.visible = machine.artifact;
        last = state;
        dirty = true;
      }
      control.update();
      if (dirty) renderer.render(scene, camera);
      dirty = false;
    },
  };
}
