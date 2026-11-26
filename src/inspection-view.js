import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { workpiece } from './machine.js';
import { inspectionTargets } from './inspection.js';
import { createSoftwareView } from './software-view.js';

const cameras = {
  iso: [0.47, 0.37, 0.49],
  top: [0, 0.72, 0.00001],
  front: [0, 0.07, 0.69],
};

export function createInspectionView(container, selectFeature) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
  const renderer = context
    ? new THREE.WebGLRenderer({ canvas, context, antialias: true })
    : createSoftwareView({ floorY: 0, gridSize: 1.2, gridDivisions: 48, contactShadow: false });
  if (context) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const surface = renderer.domElement;
  surface.setAttribute('aria-label', 'Interactive 3D inspection model of the reference block');
  container.prepend(surface);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xecf1f7);
  scene.add(new THREE.HemisphereLight(0xf6faff, 0x8497ad, 2.1));
  const light = new THREE.DirectionalLight(0xfff8ee, 2.2);
  light.position.set(-0.5, 1, 0.6);
  scene.add(light);
  const fill = new THREE.DirectionalLight(0xceebff, 0.85);
  fill.position.set(0.6, 0.3, -0.8);
  scene.add(fill);
  const grid = new THREE.GridHelper(1.2, 48, 0xaab9cb, 0xc5d1df);
  scene.add(grid);

  const camera = new THREE.OrthographicCamera(-0.29, 0.29, 0.2, -0.2, 0.01, 10);
  const controls = new OrbitControls(camera, surface);
  controls.minZoom = 0.45;
  controls.maxZoom = 8;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.zoomToCursor = true;
  const datum = new THREE.Vector3(0, 0.035, 0);
  const { width, depth, top } = workpiece;
  const w = width / 1000, d = depth / 1000, h = top / 1000;
  function part(parent, shape, color, x, y, z, extra) {
    const mesh = new THREE.Mesh(shape, new THREE.MeshStandardMaterial({ color, roughness: .6, ...extra }));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  const fixture = new THREE.Group();
  scene.add(fixture);
  const block = part(fixture, new THREE.BoxGeometry(w, h, d), 0x8098b3, 0, h / 2, 0, { metalness: .14 });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(block.geometry), new THREE.LineBasicMaterial({ color: 0x466079 }));
  block.add(edges);
  const rings = new THREE.CylinderGeometry(0.021, 0.021, 0.001, 28);
  const bores = new THREE.CylinderGeometry(0.016, 0.016, 0.001, 28);
  for (const x of [-0.082, 0.082]) {
    for (const z of [-0.048, 0.048]) {
      part(fixture, rings, 0x9daec2, x, h + 0.0005, z);
      part(fixture, bores, 0x2c435c, x, h + 0.0011, z);
    }
  }

  const clearance = new THREE.Group();
  scene.add(clearance);
  const clearanceWidth = w + .044, clearanceDepth = d + .044;
  for (const side of [-1, 1]) {
    part(clearance, new THREE.BoxGeometry(clearanceWidth, .0016, .0016), 0x407bac, 0, 0, side * clearanceDepth / 2);
    part(clearance, new THREE.BoxGeometry(.0016, .0016, clearanceDepth), 0x407bac, side * clearanceWidth / 2, 0, 0);
  }
  const origin = new THREE.Group();
  scene.add(origin);
  part(origin, new THREE.BoxGeometry(.042, .002, .002), 0xaa3244, .021, .003, 0);
  part(origin, new THREE.BoxGeometry(.002, .002, .042), 0x17795b, 0, .003, -.021);
  part(origin, new THREE.BoxGeometry(.002, .043, .002), 0x315da2, 0, .0245, 0);
  origin.position.set(-w / 2 - .044, 0, d / 2 + .042);
  const targets = inspectionTargets({ point: true, plane: true }).map(target => {
    const feature = target.feature.toLowerCase();
    const marker = part(fixture, new THREE.SphereGeometry(.006, 16, 10),
      feature === 'point' ? 0x7951bf : 0x0a7f8b, target.x / 1000, h + .005, -target.y / 1000);
    marker.userData.feature = feature;
    return { marker, feature, x: target.x, y: target.y };
  });
  const probe = new THREE.Group();
  scene.add(probe);
  part(probe, new THREE.CylinderGeometry(.003, .003, .058, 16), 0x718395, 0, .035, 0);
  part(probe, new THREE.SphereGeometry(.004, 16, 10), 0xba2246, 0, .004, 0);
  part(probe, new THREE.CylinderGeometry(.009, .009, .024, 16), 0x374e66, 0, .072, 0);
  probe.visible = false;
  clearance.visible = false;
  for (const { marker } of targets) marker.visible = false;

  function render() {
    if (container.clientWidth && container.clientHeight) renderer.render(scene, camera);
  }
  controls.addEventListener('change', render);
  function size() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    const ratio = width / height;
    const field = Math.max(.14, .188 / ratio);
    Object.assign(camera, { left: -field * ratio, right: field * ratio, top: field, bottom: -field });
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    render();
  }
  new ResizeObserver(size).observe(container);
  function setView(name) {
    controls.target.copy(datum);
    camera.position.set(...cameras[name]).add(datum);
    fit();
  }
  function fit() {
    camera.position.sub(controls.target).add(datum);
    controls.target.copy(datum);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
    render();
  }
  function update({ plan, selected, run, showClearance, machine }) {
    const loaded = machine.artifact;
    fixture.visible = loaded;
    clearance.visible = loaded && showClearance && plan.clearance >= 10 && plan.clearance <= 150;
    clearance.position.y = h + plan.clearance / 1000;
    block.material.color.set(selected === 'plane' ? 0x70adbd : 0x8098b3);
    for (const { marker, feature, x, y } of targets) {
      const measured = run?.samples.some(sample => sample.feature.toLowerCase() === feature &&
        Math.abs(sample.x - x) < .001 && Math.abs(sample.y - y) < .001);
      marker.visible = plan.features[feature];
      marker.material.color.set(measured ? 0x227548 : feature === 'point' ? 0x7951bf : 0x007d8a);
      marker.scale.setScalar(selected === feature ? 1.45 : 1);
    }
    const tip = machine.tipPosition;
    const x = (tip.x - workpiece.x) / 1000, z = (workpiece.y - tip.y) / 1000;
    probe.visible = run?.state === 'running' && Math.abs(x) < .19 && Math.abs(z) < .15 && tip.z < 190;
    probe.position.set(x, tip.z / 1000, z);
    render();
  }

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let press;
  surface.addEventListener('pointerdown', event => {
    press = event.isPrimary && event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  });
  surface.addEventListener('pointermove', event => {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 7) press = null;
  });
  surface.addEventListener('pointercancel', () => { press = null; });
  surface.addEventListener('pointerup', event => {
    if (!press || press.id !== event.pointerId || !fixture.visible) return;
    press = null;
    const rect = surface.getBoundingClientRect();
    pointer.set(2 * (event.clientX - rect.left) / rect.width - 1, 1 - 2 * (event.clientY - rect.top) / rect.height);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects([block, ...targets.map(item => item.marker).filter(marker => marker.visible)], false)[0];
    if (hit) selectFeature(hit.object.userData.feature ?? 'plane');
  });
  setView('iso');
  size();
  return { setView, fit, update };
}
