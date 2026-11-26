import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Machine, masterStylus, ports } from '../src/machine.js';
import { formatMeasurement, millimetersPerInch, sphereOrientations, systemStyli } from '../src/calibration.js';

const standard = { mode: 'tensor', tip: 1, coverage: 180, force: 200, dynamics: 100 };
function finish(machine) {
  for (let i = 0; i < 6000 && machine.plan; i++) machine.update(.05, {});
  assert.equal(machine.plan, null);
}

test('the sphere keeps its inch radius and all four positions share a 45-degree tilted shaft', () => {
  assert.deepEqual(sphereOrientations.map(sphere => sphere.rotate), [45, 135, 225, 315]);
  assert.equal(new Set(sphereOrientations.map(sphere => [sphere.x, sphere.y].join(','))).size, 4);
  for (const sphere of sphereOrientations) {
    assert.equal(formatMeasurement(sphere.radius / millimetersPerInch), '0.590600');
    assert.equal(formatMeasurement(sphere.diameter), '30.002480');
    assert.equal(sphere.tilt, 135);
    assert.ok(Math.abs(sphere.axis.z - Math.SQRT1_2) < 1e-12);
    assert.ok(Math.abs(Math.abs(sphere.axis.x) - .5) < 1e-12);
    assert.ok(Math.abs(Math.abs(sphere.axis.y) - .5) < 1e-12);
  }
  assert.deepEqual(systemStyli(ports[0]).map(tip => tip.no), [1]);
  assert.deepEqual(systemStyli({ styli: [5, 2, 4, 3, 1] }).map(tip => [tip.no, tip.direction]),
    [[1, 'Down'], [2, 'Back'], [3, 'Right'], [4, 'Front'], [5, 'Left']]);
});

test('ordinary qualification starts against the nominal sphere and re-qualification uses the previous record', () => {
  const machine = new Machine();
  machine.speed = 100;
  assert.ok(machine.startStylusQualification({ ...standard, mode: 'six' }));
  finish(machine);
  const result = machine.stylusQualification();
  assert.equal(machine.qualification.samples.length, 6);
  assert.equal(formatMeasurement(result.radius / millimetersPerInch), '0.059055');
  assert.equal(formatMeasurement(result.sigma), '0.000000');
  assert.ok(result.passed);
  assert.equal(machine.startStylusQualification({ ...standard, mode: 'dynamic-repeat' }), false);
  assert.ok(machine.startStylusQualification({ ...standard, mode: 'geometry-repeat' }));
  finish(machine);
  assert.equal(machine.stylusQualification().mode, 'geometry-repeat');
});

test('the master must locate each position and can then qualify using its fit', () => {
  const machine = new Machine();
  machine.loaded = masterStylus.id;
  machine.speed = 100;
  assert.ok(machine.setSphereOrientation(2));
  assert.equal(machine.startStylusQualification(standard), false);
  assert.match(machine.message, /locate/);
  assert.ok(machine.startSphereLocation());
  assert.equal(machine.setSphereOrientation(3), false);
  finish(machine);
  const match = machine.sphereRecords[2];
  assert.ok(Math.abs(match.x - machine.referenceSphere.x) < 1e-9);
  assert.ok(Math.abs(match.y - machine.referenceSphere.y) < 1e-9);
  assert.ok(Math.abs(match.z - machine.referenceSphere.z) < 1e-9);
  assert.ok(machine.startStylusQualification(standard));
  finish(machine);
  assert.equal(formatMeasurement(machine.stylusQualification().z), '0.000000');
  assert.ok(machine.setSphereOrientation(3));
  assert.equal(machine.startStylusQualification(standard), false);
});

test('dynamic qualification completes all six physical scan passes before flagging the result', () => {
  const machine = new Machine();
  machine.speed = 100;
  assert.ok(machine.startStylusQualification({ ...standard, mode: 'dynamic' }));
  const tracks = machine.plan.steps.filter(step => step.circle);
  assert.deepEqual(tracks.map(step => step.rate), [5, 50, 5, 50, 5, 50]);
  assert.equal(machine.stylusQualification(), undefined);
  finish(machine);
  assert.equal(machine.qualification.scans, 6);
  assert.ok(machine.stylusQualification().dynamic);
});

test('manual qualification records sphere touches and rejects duplicate samples', () => {
  const machine = new Machine();
  machine.speed = 100;
  assert.ok(machine.startStylusQualification({ ...standard, mode: 'manual' }));
  finish(machine);
  assert.equal(machine.qualification.state, 'manual');
  assert.equal(machine.recordPoint('Measurement'), false);
  const { x, y, z, radius } = machine.referenceSphere;
  const ruby = ports[0].diameter / 2;
  for (const [dx, dy] of [[0, 0], [.5, 0], [-.5, 0], [0, .5], [0, -.5]]) {
    const lx = x + dx * (radius + ruby), ly = y + dy * (radius + ruby);
    machine.position = { x: lx, y: ly, z: z + 55 };
    machine.applyJog({ x: lx, y: ly, z: z - ruby + (radius + ruby) * Math.sqrt(1 - dx ** 2 - dy ** 2) - .01 });
    assert.ok(machine.recordPoint('Measurement'));
    assert.equal(machine.recordPoint('Measurement'), false);
  }
  assert.ok(machine.finishManualQualification());
  assert.ok(machine.stylusQualification().passed);
});
