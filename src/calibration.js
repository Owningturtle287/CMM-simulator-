export const millimetersPerInch = 25.4;
export const formatMeasurement = value => Number.isFinite(value) ? (Math.abs(value) < .0000005 ? 0 : value).toFixed(6) : '—';

const radiusInches = .590600;
const radius = radiusInches * millimetersPerInch;
const stem = 70;
const pivot = Object.freeze({ x: 170, y: 1085, z: 214 - stem * Math.SQRT1_2 });
export const sphereOrientations = [45, 135, 225, 315].map((rotate, index) => {
  const angle = rotate * Math.PI / 180;
  const axis = { x: Math.sin(angle) * Math.SQRT1_2, y: Math.cos(angle) * Math.SQRT1_2, z: Math.SQRT1_2 };
  return { number: index + 1, tilt: 135, rotate, axis, pivot, stem, radiusInches, radius, diameter: radius * 2,
    baseRadius: 44, x: pivot.x + stem * axis.x, y: pivot.y + stem * axis.y, z: 214 };
});
export const referenceSphere = sphereOrientations[0];

const directions = [
  { no: 1, name: '1_-Z', direction: 'Down' },
  { no: 2, name: '2_+Y', direction: 'Back' },
  { no: 3, name: '3_+X', direction: 'Right' },
  { no: 4, name: '4_-Y', direction: 'Front' },
  { no: 5, name: '5_-X', direction: 'Left' },
];

export function systemStyli(system) {
  if (!system) return [];
  const styli = system.styli ?? [1];
  return directions.filter(tip => styli.includes(tip.no));
}

export const qualificationModes = {
  tensor: { label: 'Tensor' },
  dynamic: { label: 'Dyn. tensor', dynamic: true },
  six: { label: 'Six Points', touches: 6 },
  manual: { label: 'Manual', manual: true },
  'dynamic-repeat': { label: 'Dyn. Tensor Re-qualification', repeat: true, dynamic: true },
  'tensor-repeat': { label: 'Tensor Re-qualification', repeat: true },
  'geometry-repeat': { label: 'Geometry Re-qualification', repeat: true, touches: 6 },
  'manual-repeat': { label: 'Manual Re-qualification', repeat: true, manual: true },
};

export function qualificationSteps(sphere, stylus, tipOffset, options, capture, scanComplete) {
  const { x, y, z, radius } = sphere;
  const ruby = stylus.diameter / 2;
  const contactRadius = radius + ruby;
  const centerZ = z - ruby - tipOffset;
  const safeZ = z + 75 - tipOffset;
  const { touches = 5, coverage = 90, dynamics = 100, scans = [] } = options;
  const angle = coverage * Math.PI / 360;
  const directions = [[0, 0, 1]];
  for (let i = 0; i < touches - 1; i++) {
    const around = i * 2 * Math.PI / (touches - 1);
    directions.push([Math.cos(around) * Math.sin(angle), Math.sin(around) * Math.sin(angle), Math.cos(angle)]);
  }
  const point = ([dx, dy, dz], distance) =>
    ({ x: x + dx * distance, y: y + dy * distance, z: centerZ + dz * distance });
  const steps = [];
  function approachPoint(approach, label) {
    steps.push(
      { goal: { x: approach.x, y: approach.y }, label: 'Positioning over the reference sphere' },
      { goal: approach, label, rate: 115 },
    );
  }
  function retract(approach) {
    steps.push(
      { goal: approach, label: 'Retracting from the reference sphere', rate: 55 },
      { goal: { z: safeZ }, label: 'Moving to sphere clearance', rate: 140 },
    );
  }
  for (const [index, direction] of directions.entries()) {
    const approach = point(direction, contactRadius + 7);
    approachPoint(approach, 'Approaching the reference sphere');
    steps.push({
      goal: point(direction, contactRadius), label: index === 0 && options.locate
        ? 'Locating reference sphere · Top contact' : `Probing reference sphere · Touch ${index + 1} of ${touches}`,
      rate: 8 * dynamics / 100, dwell: .2, contact: true, action: capture,
    });
    retract(approach);
  }
  for (const scan of scans) {
    const u = scan.u ?? [1, 0, 0];
    const approach = point(u, contactRadius + 7);
    approachPoint(approach, 'Approaching the scanning path');
    steps.push(
      { goal: point(u, contactRadius), label: 'Contacting the scan start', rate: 8 * dynamics / 100, contact: true },
      { label: `Dynamic Tensor · ${scan.label}`, rate: scan.rate, action: scanComplete,
        circle: { x, y, z: centerZ, radius: contactRadius, direction: scan.direction, distance: 0, u, v: scan.v ?? [0, 1, 0] } },
    );
    retract(approach);
  }
  return steps;
}

export const demonstrationScans = [
  { label: 'Slow equator scan', rate: 8, direction: 1 },
  { label: 'Fast equator scan', rate: 40, direction: -1 },
];

export function tensorScans() {
  const angle = 8 * Math.PI / 180;
  const flat = [1, 0, 0], across = [0, 1, 0];
  const tracks = [
    [flat, across],
    [flat, [0, Math.cos(angle), Math.sin(angle)]],
    [[Math.cos(angle), 0, Math.sin(angle)], across],
  ];
  return tracks.flatMap(([u, v], index) => [
    { label: `Track ${index + 1} · 5 mm/s`, rate: 5, direction: 1, u, v },
    { label: `Track ${index + 1} · 50 mm/s`, rate: 50, direction: -1, u, v },
  ]);
}

// Fit the sampled datum positions in centered coordinates to keep the solution well conditioned.
export function fitSphere(contacts) {
  if (contacts.length < 4) return null;
  const axes = ['x', 'y', 'z'];
  const mean = axes.map(axis => contacts.reduce((sum, point) => sum + point[axis], 0) / contacts.length);
  const rows = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
  for (const contact of contacts) {
    const d = axes.map((axis, i) => contact[axis] - mean[i]);
    const halfSquare = d.reduce((sum, value) => sum + value * value, 0) / 2;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) rows[i][j] += d[i] * d[j];
      rows[i][3] += d[i] * halfSquare;
    }
  }
  for (let col = 0; col < 3; col++) {
    let best = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[best][col])) best = row;
    }
    [rows[col], rows[best]] = [rows[best], rows[col]];
    const divisor = rows[col][col];
    if (Math.abs(divisor) < 1e-8) return null;
    rows[col] = rows[col].map(value => value / divisor);
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const factor = rows[row][col];
      rows[row] = rows[row].map((value, i) => value - factor * rows[col][i]);
    }
  }
  const [x, y, z] = mean.map((value, i) => value + rows[i][3]);
  const distances = contacts.map(point => Math.hypot(point.x - x, point.y - y, point.z - z));
  const radius = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  const sigma = Math.sqrt(distances.reduce((sum, value) => sum + (value - radius) ** 2, 0) / (distances.length - 1));
  return { x, y, z, radius, sigma };
}
