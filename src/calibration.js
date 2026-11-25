export const referenceSphere = { x: 205, y: 1120, z: 214, diameter: 30, baseRadius: 44 };

export function masterQualificationSteps(stylus, tipOffset, capture, scanComplete) {
  const { x, y, z, diameter } = referenceSphere;
  const rubyRadius = stylus.diameter / 2;
  const contactRadius = diameter / 2 + rubyRadius;
  const centerZ = z - rubyRadius - tipOffset;
  const safeZ = z + 75 - tipOffset;
  const slope = Math.SQRT1_2;
  const directions = [
    [0, 0, 1],
    [slope, 0, slope], [-slope, 0, slope],
    [0, slope, slope], [0, -slope, slope],
  ];
  const point = ([dx, dy, dz], radius) =>
    ({ x: x + dx * radius, y: y + dy * radius, z: centerZ + dz * radius });

  const steps = [];
  for (const [index, direction] of directions.entries()) {
    const approach = point(direction, contactRadius + 12);
    steps.push(
      { goal: { x: approach.x, y: approach.y }, label: 'Positioning over the reference sphere' },
      { goal: approach, label: 'Approaching the reference sphere', rate: 115 },
      {
        goal: point(direction, contactRadius),
        label: index === 0 ? 'Locating reference sphere · Top contact' : `Static qualification · Contact ${index + 1} of 5`,
        rate: 8, dwell: 0.25, contact: true, action: capture,
      },
      { goal: approach, label: 'Retracting from the reference sphere', rate: 55 },
      { goal: { z: safeZ }, label: 'Moving to sphere clearance', rate: 140 },
    );
  }

  const equator = [1, 0, 0];
  const approach = point(equator, contactRadius + 12);
  steps.push(
    { goal: { x: approach.x, y: approach.y }, label: 'Aligning for Dynamic Tensor scans' },
    { goal: approach, label: 'Approaching the equator', rate: 115 },
    { goal: point(equator, contactRadius), label: 'Contacting the equator', rate: 8, contact: true },
  );

  for (const [label, rate, direction] of [['Slow equator scan', 8, 1], ['Fast equator scan', 40, -1]]) {
    steps.push({
      label: `Dynamic Tensor · ${label}`, rate, contact: true, action: scanComplete,
      circle: { x, y, z: centerZ, radius: contactRadius, direction, distance: 0 },
    });
  }
  steps.push(
    { goal: approach, label: 'Retracting from the reference sphere', rate: 55 },
    { goal: { z: safeZ }, label: 'Returning to sphere clearance', rate: 140 },
  );

  return steps;
}

export function fitReferenceSphere(contacts, rubyRadius) {
  const [top, right, left, rear, front] = contacts;
  const x = (right.x + left.x) / 2;
  const y = (rear.y + front.y) / 2;
  const sideZ = (right.z + left.z + rear.z + front.z) / 4;
  const height = top.z - sideZ;
  const chord = ((right.x - left.x) + (rear.y - front.y)) / 4;
  const contactRadius = (chord ** 2 + height ** 2) / (2 * height);
  return { x, y, z: top.z + rubyRadius - contactRadius, diameter: 2 * (contactRadius - rubyRadius) };
}
