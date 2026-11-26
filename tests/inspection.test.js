import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Machine, masterStylus, workpiece } from '../src/machine.js';
import { defaultPlan, inspectionBlocker, inspectionResults, practicePlan, runInspection, savedPlan } from '../src/inspection.js';

test('the practice inspection uses the mounted stylus offset and records fixture and machine coordinates', () => {
  const machine = new Machine();
  machine.loaded = masterStylus.id;
  machine.speed = 100;
  const plan = practicePlan();
  const run = runInspection(machine, plan);
  assert.ok(run);
  for (let i = 0; i < 1000 && machine.plan; i++) machine.update(.05, {});
  assert.equal(machine.plan, null);
  assert.equal(run.state, 'complete');
  assert.equal(machine.position.z, workpiece.top + plan.clearance - machine.tipOffset);
  assert.equal(run.samples.length, 5);
  assert.deepEqual(run.samples[0], { x: 0, y: 0, z: workpiece.top, feature: 'Point' });
  assert.equal(machine.points.at(-1).x, workpiece.x);
  assert.equal(machine.points.at(-1).y, workpiece.y);
  assert.equal(machine.points.at(-1).z, workpiece.top);
  assert.deepEqual(inspectionResults(run).map(({ value, pass }) => [value, pass]), [[82, true], [0, true]]);
});

test('inspection checks the plan and machine state before scheduling motion', () => {
  const machine = new Machine();
  assert.match(inspectionBlocker(machine, defaultPlan()), /alignment/);
  assert.equal(runInspection(machine, { ...practicePlan(), clearance: 0 }), null);
  machine.artifact = false;
  assert.equal(runInspection(machine, practicePlan()), null);
  assert.match(machine.message, /reference block/);
  machine.artifact = true;
  machine.loaded = null;
  assert.match(inspectionBlocker(machine, practicePlan()), /Mount a stylus/);
  machine.loaded = 1;
  machine.speed = 0;
  assert.match(inspectionBlocker(machine, practicePlan()), /0%/);
  assert.equal(machine.plan, null);
});

test('interrupted inspections preserve completed samples and withhold characteristic results', () => {
  const machine = new Machine();
  machine.speed = 100;
  const run = runInspection(machine, practicePlan());
  for (let i = 0; i < 1000 && !run.samples.length; i++) machine.update(.05, {});
  assert.equal(run.samples.length, 1);
  machine.emergencyStop();
  for (let i = 0; i < 50; i++) machine.update(.05, {});
  assert.equal(machine.plan, null);
  assert.equal(run.samples.length, 1);
  assert.deepEqual(inspectionResults(run), []);
});

test('saved plans restore supported features and a valid clearance', () => {
  assert.deepEqual(savedPlan(practicePlan()), practicePlan());
  assert.equal(savedPlan(null), null);
  assert.deepEqual(savedPlan({ name: ' Test ', clearance: -4, features: { point: true }, checks: { variation: true } }),
    { ...defaultPlan(), name: 'Test', features: { point: true, plane: false } });
});
