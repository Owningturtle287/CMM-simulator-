import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSoftwareView } from './software-view.js';
import { frame, ports, rack, rackCoverOpening, startingPosition, stylusLength, vastXT, workpiece, worldPosition } from './machine.js';

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
    probeShell: metal(0xb2b5ba, 0.65, 0.28, { roughnessMap: brush }),
    probeFace: metal(0xc1c3c6, 0.39, 0.41),
    probeCollar: metal(0x23282c, 0.3, 0.31),
    plate: metal(0xc3c6c9, 0.92, 0.23, { roughnessMap: brush }),
    plateInset: metal(0x293a33, 0.31, 0.41),
    plateContact: metal(0xbaa574, 0.82, 0.29),
    stylusCube: metal(0x55595a, 0.66, 0.32),
  };
}

function buildBase(scene, m) {
  // The right-hand guide is a granite step. Both guides extend to the bridge end stops.
  box(scene, m.graniteEdge, 1.733, 0.442, 1.94, 0, -0.239, -0.023, 0.021);
  box(scene, m.granite, 1.731, 0.047, 1.938, 0, -0.0235, -0.023, 0.014);
  box(scene, m.granite, 0.266, 0.109, 1.935, 0.758, 0.054, -0.023, 0.009);
  box(scene, m.granite, 0.143, 0.024, 1.888, -0.674, 0.011, -0.024, 0.007);
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
  const right = 0.706;
  // A shallow saddle rides above the step. The inboard skirt drops beside it.
  box(bridge, m.black, 0.344, 0.102, 0.438, right - 0.014, 0.165, 0.004, 0.016);
  box(bridge, m.black, 0.093, 0.137, 0.429, 0.573, 0.083, 0.004, 0.012);
  box(bridge, m.rubber, 0.237, 0.009, 0.405, 0.746, 0.113, 0.004, 0.004);
  box(bridge, m.black, 0.187, 0.044, 0.234, -0.663, 0.046, 0.022, 0.009);
  box(bridge, m.white, 0.19, 1.294, 0.213, -0.663, 0.716, 0.025, 0.019);
  box(bridge, m.white, 0.282, 1.156, 0.36, right, 0.786, 0.01, 0.02);
  box(bridge, m.edge, 0.010, 1.125, 0.282, 0.845, 0.786, 0.008, 0.005);
  box(bridge, m.white, 0.007, 1.107, 0.263, 0.85, 0.792, 0.008, 0.003);
  box(bridge, m.white, 0.095, 0.274, 0.064, -0.674, 1.192, -0.099, 0.015);
  const name = textMap('A C C U R A', { font: '700 66px Arial' });
  decal(bridge, name, 0.304, 0.060, right + 0.032, 0.554, 0.192).rotation.z = Math.PI / 2;

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
  cylinder(ram, m.ceramic, 0.034, 0.206, 0, 0.299, 0, 24);
  buildVastHead(ram, m, mark);
  const stylus = group(ram);
  return { bridge, carriage, ram, stylus };
}

function facetedMesh(parent, material, faces) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  for (const face of faces) {
    for (let i = 1; i < face.length - 1; i++) {
      for (const point of [face[0], face[i], face[i + 1]]) {
        positions.push(point.x, point.y, point.z);
        uvs.push(point.x * 10 + 0.5, point.y * 10 + point.z * 3 + 0.5);
      }
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.userData.canvasFaces = faces;
  return addMesh(parent, geometry, material, 0, 0, 0);
}

function joinRings(rings) {
  const first = rings[0];
  const last = rings.at(-1);
  const faces = [first.slice().reverse(), last];
  for (let row = 1; row < rings.length; row++) {
    const lower = rings[row - 1], upper = rings[row];
    for (let i = 0; i < lower.length; i++) {
      const next = (i + 1) % lower.length;
      faces.push([lower[i], lower[next], upper[next], upper[i]]);
    }
  }
  return faces;
}

function chamferedShell(parent, material, sections) {
  const rings = sections.map(([y, width, depth, chamfer]) => {
    const x = width / 2, z = depth / 2;
    return [
      [-x + chamfer, z], [x - chamfer, z], [x, z - chamfer], [x, -z + chamfer],
      [x - chamfer, -z], [-x + chamfer, -z], [-x, -z + chamfer], [-x, z - chamfer],
    ].map(([px, pz]) => new THREE.Vector3(px, y, pz));
  });
  return facetedMesh(parent, material, joinRings(rings));
}

function transverseFastener(parent, material, radius, depth, x, y, z, side = false) {
  const fastener = cylinder(parent, material, radius, depth, x, y, z, 12);
  if (side) fastener.rotation.z = Math.PI / 2;
  else fastener.rotation.x = Math.PI / 2;
  return fastener;
}

function buildVastHead(ram, m, mark) {
  const { width, depth, height } = vastXT;
  const head = group(ram, 0, stylusLength / 1000, 0);
  const w = width / 1000, d = depth / 1000, h = height / 1000;
  const radius = 0.006;
  const shell = [[0.021, w, d, radius]];
  for (const y of [0.037, 0.046, 0.055, 0.064]) {
    shell.push(
      [y - 0.0015, w, d, radius],
      [y - 0.00055, w - 0.0022, d - 0.0022, radius],
      [y + 0.00055, w - 0.0022, d - 0.0022, radius],
      [y + 0.0015, w, d, radius],
    );
  }
  shell.push([h - 0.011, w, d, radius]);
  chamferedShell(head, m.probeShell, shell);
  chamferedShell(head, m.probeCollar, [
    [0.004, 0.078, 0.078, 0.006], [0.008, 0.088, 0.088, radius],
    [0.019, w, d, radius], [0.022, w, d, radius],
  ]);
  chamferedShell(head, m.probeCollar, [
    [h - 0.011, w, d, radius], [h - 0.005, w, d, radius],
    [h, w - 0.003, d - 0.003, 0.004], [h + 0.005, 0.066, 0.070, 0.004],
  ]);
  const shield = [
    [-0.037, 0.085], [-0.030, 0.027], [-0.023, 0.019], [0.023, 0.019],
    [0.030, 0.027], [0.037, 0.085], [0.033, 0.089], [-0.033, 0.089],
  ];
  facetedMesh(head, m.probeFace, joinRings([0.0445, 0.0470].map(z =>
    shield.map(([x, y]) => new THREE.Vector3(x, y, z)))));
  for (const side of [-1, 1]) {
    transverseFastener(head, m.steel, 0.0033, 0.001, side * 0.0452, 0.093, 0.015, true);
    transverseFastener(head, m.rubber, 0.0017, 0.0011, side * 0.0460, 0.093, 0.015, true);
  }
  cylinder(head, m.probeCollar, 0.039, 0.005, 0, 0.005, 0, 36);
  cylinder(head, m.steel, 0.0315, 0.004, 0, 0.002, 0, 36);
  cylinder(head, m.plateInset, 0.024, 0.001, 0, 0.0003, 0, 28);
  decal(head, mark, 0.019, 0.019, 0, 0.072, 0.0476);
  const vast = textMap('VAST', { width: 280, height: 92, color: '#967339', font: 'italic 900 75px Arial' });
  const xt = textMap('XT', { width: 110, height: 75, color: '#24292f', font: 'italic 900 67px Arial' });
  decal(head, vast, 0.043, 0.014, -0.001, 0.041, 0.0476);
  decal(head, xt, 0.011, 0.007, 0.014, 0.030, 0.0476);
}

function buildAdapter(m, mark) {
  const plate = new THREE.Group();
  const radius = vastXT.plateDiameter / 2000;
  const quarter = Math.PI / 2;
  const fractionAngles = [
    0, 0.036, 0.067, 0.15, 0.24, 0.33, 0.42, 0.51, 0.60, 0.69,
    0.78, 0.87, 0.96, 1.05, 1.14, 1.23, 1.32, 1.41, quarter - 0.067, quarter - 0.036,
  ];
  const rings = [
    [-0.012, radius - 0.0013, 0.0014], [-0.011, radius, 0.0018],
    [-0.0068, radius, 0.0027], [-0.0057, radius - 0.0007, 0.0028],
    [-0.0048, radius, 0.0028], [-0.0013, radius, 0.0028], [0, radius - 0.0011, 0.0028],
  ].map(([y, outer, notch]) => [0, 1, 2, 3].flatMap(quadrant => fractionAngles.map(fraction => {
    const angle = quadrant * quarter + fraction;
    const cut = Math.min(fraction, quarter - fraction) < 0.05 ? notch : 0;
    return new THREE.Vector3(Math.sin(angle) * (outer - cut), y, Math.cos(angle) * (outer - cut));
  })));
  const faces = joinRings(rings);
  // Radial caps use a center fan so the four milled notches remain open.
  for (const cap of faces.splice(0, 2)) {
    const center = new THREE.Vector3(0, cap[0].y, 0);
    for (let i = 0; i < cap.length; i++) faces.push([center, cap[i], cap[(i + 1) % cap.length]]);
  }
  const plateMesh = facetedMesh(plate, m.plate, faces);
  const positions = plateMesh.geometry.getAttribute('position');
  const normals = plateMesh.geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    if (Math.min(Math.abs(x), Math.abs(z)) < 0.003 || Math.abs(normals.getY(i)) > 0.99) continue;
    // Smooth the turned rim while preserving the sharp edges of the milled slots.
    const horizontal = Math.hypot(normals.getX(i), normals.getZ(i)) / Math.hypot(x, z);
    normals.setXYZ(i, x * horizontal, normals.getY(i), z * horizontal);
  }
  plateMesh.geometry.userData.canvasFaces = joinRings([rings[0], rings[2], rings.at(-1)]
    .map(ring => ring.filter((_, index) => (index % fractionAngles.length) % 3 === 0)));
  cylinder(plate, m.plateInset, 0.0234, 0.00045, 0, 0.00016, 0, 32);
  cylinder(plate, m.stylusCube, 0.0179, 0.00044, 0, 0.00039, 0, 28);
  cylinder(plate, m.rubber, 0.0039, 0.0004, 0, 0.00068, 0, 16);
  box(plate, m.steel, 0.0055, 0.00022, 0.0007, 0, 0.00095, 0).rotation.y = -0.40;
  for (let i = 0; i < 3; i++) {
    const angle = 0.38 + i * 2 * Math.PI / 3;
    const x = Math.sin(angle) * 0.0128;
    const z = Math.cos(angle) * 0.0128;
    cylinder(plate, m.steel, 0.0026, 0.00055, x, 0.0008, z, 12);
    cylinder(plate, m.stylusCube, 0.0010, 0.00045, x, 0.0011, z, 8);
  }
  for (let i = 0; i < 8; i++) {
    const angle = (i + 0.5) * Math.PI / 4;
    cylinder(plate, m.plateContact, 0.00072, 0.00045, Math.sin(angle) * 0.0206,
      0.00051, Math.cos(angle) * 0.0206, 8);
  }
  decal(plate, mark, 0.0073, 0.0073, -0.0285, 0.0004, 0).rotation.x = -Math.PI / 2;
  const torque = textMap('M = 2 Nm', { width: 280, height: 96, font: '650 65px Arial', color: '#282c31' });
  decal(plate, torque, 0.015, 0.005, 0, 0.0004, -0.0279).rotation.x = -Math.PI / 2;
  cylinder(plate, m.steel, 0.0238, 0.0034, 0, -0.0132, 0, 30);
  cylinder(plate, m.stylusCube, 0.0155, 0.0045, 0, -0.0161, 0, 24);
  const cube = group(plate, 0, -0.0275, 0);
  cube.rotation.y = -Math.PI / 4;
  box(cube, m.stylusCube, 0.022, 0.022, 0.022, 0, 0, 0, 0.002);
  transverseFastener(cube, m.rubber, 0.0029, 0.0009, 0, 0, 0.0110);
  transverseFastener(cube, m.rubber, 0.0029, 0.0009, 0.0110, 0, 0, true);
  cylinder(plate, m.steel, 0.0055, 0.011, 0, -0.044, 0, 16, 0.0041);
  return plate;
}

function buildStylus(parent, m, port, adapter) {
  parent.add(adapter.clone());
  const length = stylusLength / 1000;
  const ball = port.diameter / 2000;
  const shaftTop = 0.049;
  cylinder(parent, m.steel, 0.0025, length - shaftTop - ball, 0, -(length + shaftTop - ball) / 2, 0, 12);
  addMesh(parent, new THREE.SphereGeometry(ball, 14, 10), m.ruby, 0, -length + ball, 0);
}

function buildRack(scene, m, adapter) {
  const [, , rear] = worldPosition({ x: frame.originX, y: rack.y, z: 0 });
  const rackGroup = group(scene, 0, 0, rear);
  const fixed = group(rackGroup);
  for (const x of [-0.407, 0.407]) {
    box(fixed, m.aluminum, 0.069, 0.027, 0.264, x, 0.014, -0.016, 0.004);
    for (const z of [-0.146, 0.114]) box(fixed, m.black, 0.071, 0.026, 0.018, x, 0.013, z, 0.003);
    box(fixed, m.aluminum, 0.051, 0.364, 0.057, x, 0.199, -0.056, 0.004);
    for (const dx of [-0.013, 0.013]) box(fixed, m.black, 0.003, 0.329, 0.002, x + dx, 0.184, -0.026);
    box(fixed, m.aluminum, 0.054, 0.055, 0.054, x, 0.060, -0.034, 0.004);
    cylinder(fixed, m.steel, 0.013, 0.003, x, 0.028, 0.067, 12);
  }
  box(fixed, m.aluminum, 0.918, 0.05, 0.052, 0, 0.357, -0.086, 0.006);
  decal(fixed, textMap('MSR', { width: 160, height: 72, color: '#a02026', font: '800 50px Arial' }),
    0.070, 0.025, -0.406, 0.151, -0.025).rotation.z = Math.PI / 2;
  const stations = ports.map(port => {
    const x = (port.x - frame.originX) / 1000;
    const seat = rack.plate / 1000;
    box(fixed, m.black, 0.117, 0.028, 0.032, x, seat + 0.001, -0.069, 0.004);
    for (const side of [-1, 1]) {
      box(fixed, m.black, 0.012, 0.027, 0.137, x + side * 0.054, seat + 0.001, -0.004, 0.003);
      box(fixed, m.probeCollar, 0.027, 0.018, 0.111, x + side * 0.044, seat - 0.018, 0.006, 0.003);
      box(fixed, m.steel, 0.024, 0.003, 0.105, x + side * 0.043, seat - 0.0135, 0.003, 0.001);
      const lip = box(fixed, m.steel, 0.020, 0.004, 0.016, x + side * 0.045, seat - 0.014, 0.059, 0.002);
      lip.rotation.y = side * 0.18;
    }
    const label = decal(fixed, textMap(String(port.id), {
      width: 64, height: 64, background: '#dde2e8', font: '700 45px Arial',
    }), 0.017, 0.017, x, seat + 0.016, -0.068);
    label.rotation.x = -Math.PI / 2;
    const cover = group(rackGroup, x, seat + 0.017, -0.052);
    box(cover, m.black, 0.095, 0.006, 0.104, 0, 0, 0.052, 0.002);
    for (let rib = 0; rib < 8; rib++) {
      box(cover, m.rubber, 0.09, 0.002, 0.004, 0, 0.003, 0.008 + rib * 0.012);
    }
    const stored = group(rackGroup, x, seat, 0);
    buildStylus(stored, m, port, adapter);
    return { cover, stored };
  });
  return { fixed, stations };
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

// Merge each rigid assembly independently so moving axes keep their own transforms.
function batchOpaque(root, moving = []) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const byMaterial = new Map();
  function collect(object) {
    if (moving.includes(object)) return;
    if (object.isMesh && !object.material.transparent) {
      const batch = byMaterial.get(object.material) ?? [];
      batch.push(object);
      byMaterial.set(object.material, batch);
    }
    for (const child of object.children) collect(child);
  }
  collect(root);
  for (const [material, meshes] of byMaterial) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      const copy = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return copy.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    });
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    if (!geometry) continue;
    addMesh(root, geometry, material, 0, 0, 0);
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  }
}

const views = {
  iso: { eye: [3.1, 2.22, 4.22], target: [0, 0.75, 0.018], zoom: 1.00 },
  front: { eye: [0, 1.76, 5.3], target: [0, 0.75, 0.0], zoom: 1.00 },
  rack: { eye: [0.28, 1.19, 3.21], target: [0, 0.34, -0.62], zoom: 2.62 },
};

export function createScene(container) {
  const canvas = document.createElement('canvas');
  const options = { antialias: true, alpha: false, powerPreference: 'high-performance' };
  const context = canvas.getContext('webgl2', options);
  let webGL;
  if (context) {
    try {
      webGL = new THREE.WebGLRenderer({ canvas, context, ...options });
      const pixelLimit = window.matchMedia('(pointer: coarse)').matches ? 1.5 : 1.75;
      webGL.setPixelRatio(Math.min(window.devicePixelRatio, pixelLimit));
      webGL.shadowMap.enabled = true;
      webGL.shadowMap.autoUpdate = false;
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
  key.shadow.mapSize.set(1024, 1024);
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
  const base = group(scene);
  buildBase(base, m);
  const moving = buildBridge(scene, m, mark);
  const adapter = buildAdapter(m, mark);
  if (webGL) batchOpaque(adapter);
  const { fixed: rackFrame, stations } = buildRack(scene, m, adapter);
  const artifact = buildArtifact(scene, m);
  const active = ports.map(port => {
    const tool = group(moving.stylus, 0, stylusLength / 1000, 0);
    buildStylus(tool, m, port, adapter);
    return tool;
  });

  if (webGL) {
    batchOpaque(base);
    batchOpaque(moving.bridge, [moving.carriage]);
    batchOpaque(moving.carriage, [moving.ram]);
    batchOpaque(moving.ram, [moving.stylus]);
    batchOpaque(rackFrame);
    batchOpaque(artifact);
    for (const { cover } of stations) batchOpaque(cover);
  }

  scene.traverse(object => {
    if (!object.isMesh) return;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });

  let selectedView, probeCenter;
  let position = startingPosition;
  function probeFocus() {
    const [x, y, z] = worldPosition(position);
    return new THREE.Vector3(x, y + 0.096, z);
  }
  const setView = name => {
    selectedView = name;
    control.maxZoom = name === 'probe' ? 18 : 3.9;
    if (name === 'probe') {
      probeCenter = probeFocus();
      control.target.copy(probeCenter);
      camera.position.copy(probeCenter).add(new THREE.Vector3(0.27, 0.11, 0.45));
      camera.zoom = 10.25;
    } else {
      const view = views[name] ?? views.iso;
      camera.position.set(...view.eye);
      control.target.set(...view.target);
      camera.zoom = view.zoom;
    }
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

  let x, y, z, lastLoaded, lastHeld, lastArtifact, lastDock, lastOpening;
  let lastTransfer, lastOffset;
  let shadowPending = true, nextShadow = 0;
  return {
    setView,
    render(machine, now) {
      const { loaded, manualTool, artifact: hasArtifact, dock } = machine;
      position = machine.position;
      const moved = x !== position.x || y !== position.y || z !== position.z;
      if (moved) {
        ({ x, y, z } = position);
        const [wx, wy, wz] = worldPosition(position);
        moving.bridge.position.z = wz - frame.ramLead / 1000;
        moving.carriage.position.x = wx;
        moving.ram.position.set(0, wy, frame.ramLead / 1000);
        if (selectedView === 'probe') {
          const center = probeFocus();
          const shift = center.clone().sub(probeCenter);
          camera.position.add(shift);
          control.target.add(shift);
          probeCenter = center;
        }
        dirty = shadowPending = true;
      }
      if (lastLoaded !== loaded || lastHeld !== manualTool) {
        active.forEach((tool, index) => { tool.visible = loaded === index + 1; });
        stations.forEach(({ stored }, index) => { stored.visible = loaded !== index + 1 && manualTool !== index + 1; });
        lastLoaded = loaded;
        lastHeld = manualTool;
        dirty = shadowPending = true;
      }
      const transfer = machine.adapterTransfer;
      if (lastOffset !== transfer?.offset) {
        if (lastTransfer) lastTransfer.part.position.y = lastTransfer.home;
        if (transfer) {
          const part = transfer.releasing ? active[transfer.id - 1] : stations[transfer.id - 1].stored;
          const home = transfer.releasing ? stylusLength / 1000 : rack.plate / 1000;
          part.position.y = home + (transfer.releasing ? -transfer.offset : transfer.offset) / 1000;
          lastTransfer = { part, home };
        } else lastTransfer = null;
        lastOffset = transfer?.offset;
        dirty = shadowPending = true;
      }
      if (lastArtifact !== hasArtifact) {
        artifact.visible = hasArtifact;
        lastArtifact = hasArtifact;
        dirty = shadowPending = true;
      }
      const opening = dock ? rackCoverOpening(y) : 0;
      if (lastDock !== dock || lastOpening !== opening) {
        if (lastDock && lastDock !== dock) stations[lastDock - 1].cover.scale.z = 1;
        if (dock) stations[dock - 1].cover.scale.z = 1 - 0.96 * opening;
        lastDock = dock;
        lastOpening = opening;
        dirty = shadowPending = true;
      }
      control.update();
      if (webGL && shadowPending && (!moved || now >= nextShadow)) {
        webGL.shadowMap.needsUpdate = dirty = true;
        shadowPending = false;
        nextShadow = now + 100;
      }
      if (dirty) renderer.render(scene, camera);
      dirty = false;
    },
  };
}
