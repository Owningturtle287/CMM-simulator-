import { probingRate, workpiece } from './machine.js';

export const defaultPlan = () => ({
  name: 'Untitled measurement plan', aligned: false, clearance: 30,
  features: { point: false, plane: false }, checks: { height: false, variation: false },
});

export const practicePlan = () => ({
  name: 'Reference block inspection', aligned: true, clearance: 30,
  features: { point: true, plane: true }, checks: { height: true, variation: true },
});

export function savedPlan(data) {
  if (!data || typeof data.name !== 'string' || !data.name.trim()) return null;
  const plan = defaultPlan();
  plan.name = data.name.trim().slice(0, 64);
  plan.aligned = data.aligned === true;
  if (Number.isFinite(data.clearance) && data.clearance >= 10 && data.clearance <= 150) plan.clearance = data.clearance;
  for (const feature of Object.keys(plan.features)) plan.features[feature] = data.features?.[feature] === true;
  plan.checks.height = (plan.features.point || plan.features.plane) && data.checks?.height === true;
  plan.checks.variation = plan.features.plane && data.checks?.variation === true;
  return plan;
}

export function inspectionBlocker(machine, plan) {
  if (!plan.name.trim()) return 'Enter a measurement plan name.';
  if (!plan.aligned) return 'Set the fixture base alignment first.';
  if (!(plan.clearance >= 10 && plan.clearance <= 150)) return 'Set clearance between 10 and 150 mm.';
  if (!plan.features.point && !plan.features.plane) return 'Add a point or plane feature first.';
  if (!machine.artifact) return 'Place the reference block on the granite.';
  if (!machine.drives || machine.stopped) return 'Enable the drives to run the plan.';
  if (machine.mode !== 'AUTO') return 'Set the controller to AUTO.';
  if (machine.plan) return 'Wait for current automatic travel to finish.';
  if (machine.fault) return 'Clear the machine obstruction before measuring.';
  if (!machine.loaded) return 'Mount a stylus system first.';
  if (machine.speed === 0) return 'Increase the speed override above 0%.';
  return '';
}

export function inspectionTargets(features) {
  const { width, depth } = workpiece;
  const targets = [];
  if (features.point) targets.push({ feature: 'Point', x: 0, y: 0 });
  if (features.plane) {
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      targets.push({ feature: 'Plane', x: dx * width * .20, y: dy * depth * .30 });
    }
  }
  return targets;
}

export function runInspection(machine, plan) {
  const blocked = inspectionBlocker(machine, plan);
  if (blocked) {
    machine.report(blocked);
    return null;
  }
  const { x, y, top } = workpiece;
  const targets = inspectionTargets(plan.features).map(point => ({ ...point, x: x + point.x, y: y + point.y }));
  const run = { state: 'running', name: plan.name, count: targets.length, samples: [], checks: { ...plan.checks } };
  const clearance = top + plan.clearance - machine.tipOffset;
  const contact = top - machine.tipOffset;
  const steps = machine.clearanceSteps();
  steps.push(
    { goal: { x: targets[0].x, y: targets[0].y }, label: 'Moving over the reference block' },
    { goal: { z: clearance }, label: 'Setting inspection clearance' },
  );
  for (const [index, target] of targets.entries()) {
    const { feature, ...xy } = target;
    steps.push(
      { goal: xy, label: `Positioning for sample ${index + 1}` },
      { goal: { z: contact + 3 }, label: `Approaching sample ${index + 1}` },
      { goal: { z: contact }, label: `Probing sample ${index + 1}`, rate: probingRate, contact: true, dwell: .2,
        action: () => {
          const point = machine.tipPosition;
          run.samples.push({ x: point.x - x, y: point.y - y, z: point.z, feature });
          machine.points.unshift({ ...point, kind: 'Inspection', tool: machine.loaded });
        } },
      { goal: { z: clearance }, label: 'Retracting to clearance' },
    );
  }
  steps.at(-1).action = () => { run.state = 'complete'; };
  machine.startPlan(steps, 'Reference block inspection complete.');
  run.motion = machine.plan;
  return run;
}

export function inspectionResults(run) {
  if (run.state !== 'complete') return [];
  const planes = run.samples.filter(sample => sample.feature === 'Plane').map(sample => sample.z);
  const point = run.samples.find(sample => sample.feature === 'Point');
  const height = point ? point.z : planes.reduce((sum, z) => sum + z, 0) / planes.length;
  const results = [];
  if (run.checks.height) results.push({ name: 'Top height', value: height, limit: `${workpiece.top.toFixed(3)} ± 0.050`, pass: Math.abs(height - workpiece.top) <= .05 });
  if (run.checks.variation) {
    const value = Math.max(...planes) - Math.min(...planes);
    results.push({ name: 'Sample Z range', value, limit: '≤ 0.050', pass: value <= .05 });
  }
  return results;
}
