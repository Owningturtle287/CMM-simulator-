import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine, axisTravel, masterStylus, orientJog, ports, rack, rackCoverOpening, rackSeat, rackSlide, startingPosition, travel, workpiece, worldPosition } from '../src/machine.js';
import { Console } from '../src/console.js';
import { referenceSphere } from '../src/calibration.js';

const still = { x: 0, y: 0, z: 0 };
function run(machine, predicate, seconds = 125) {
  for (let i = 0; i < seconds * 20 && !predicate(); i++) machine.update(0.05, still);
  assert.ok(predicate(), machine.message);
}

test('machine coordinates map right, away and up from the operating position', () => {
  assert.deepEqual(worldPosition({ x: 0, y: 0, z: 0 }), [-0.45, 0, 0.84]);
  assert.deepEqual(worldPosition(travel), [0.45, 0.8, -0.36]);
  assert.deepEqual(orientJog({ x: -1, y: 0, z: 1 }, 1), { x: 0, y: 1, z: 1 });
  assert.deepEqual(orientJog({ x: 0, y: -1, z: 0 }, 1), { x: -1, y: -0, z: 0 });
});

test('each axis obeys the jog lock, override, inactivity and soft limits', () => {
  const m = new Machine();
  m.speed = 100;
  m.locks.x = true;
  m.update(0.05, { x: 1, y: 1, z: 0 });
  assert.equal(m.position.x, 450);
  assert.ok(m.position.y > startingPosition.y);
  m.locks.x = false;
  for (let i = 0; i < 100; i++) m.update(0.05, { x: 1 });
  assert.equal(m.position.x, travel.x);
  m.update(60.1, still);
  assert.ok(m.locked);
  m.update(0.05, { x: -1 });
  assert.equal(m.position.x, travel.x);
  m.unlock();
  m.speed = 0;
  m.update(0.05, { x: -1 });
  assert.equal(m.position.x, travel.x);
});

test('front jogging reaches the revised datum and rear jogging still treats the rack as an obstruction', () => {
  const m = new Machine();
  m.speed = 100;
  for (let i = 0; i < 100; i++) m.update(0.05, { y: -1 });
  assert.equal(m.position.y, 0);
  assert.equal(worldPosition(m.position)[2], 0.84);

  for (let i = 0; i < 150; i++) m.update(0.05, { y: 1 });
  assert.equal(m.position.y, axisTravel.y);
  assert.equal(worldPosition(m.position)[2], -0.62);
  for (let i = 0; i < 60; i++) m.update(0.05, { z: -1 });
  assert.equal(m.fault, 'Rack obstruction');
  assert.ok(m.position.z > rack.plate);
  m.slow = true;
  m.update(0.05, { z: 1 });
  assert.equal(m.fault, '');
});

test('tool change stores the first tool and docks the requested tool before retracting', () => {
  const m = new Machine();
  m.speed = 100;
  assert.ok(m.startChange(6));
  run(m, () => m.message === 'Sliding into holder 1' && m.position.y > rack.approach + 40);
  assert.equal(m.position.z, rackSlide);
  assert.equal(m.loaded, 1);
  run(m, () => m.message === 'Releasing adapter at holder 1');
  assert.equal(m.loaded, 1);
  assert.equal(m.position.y, rack.y);
  assert.equal(m.position.z, rackSlide);
  assert.equal(rackCoverOpening(m.position.y), 1);
  run(m, () => m.loaded === null);
  assert.equal(m.dock, 1);
  assert.equal(m.position.y, rack.y);
  assert.equal(m.position.z, rackSlide);
  run(m, () => m.message === 'Sliding into holder 6' && m.position.y > rack.approach + 40);
  assert.equal(m.position.z, rackSlide);
  assert.equal(m.loaded, null);
  run(m, () => m.message === 'Coupling adapter at holder 6');
  assert.equal(m.loaded, null);
  assert.equal(m.position.z, rackSlide);
  run(m, () => m.loaded === 6);
  assert.equal(m.dock, 6);
  run(m, () => m.position.y < rack.y - 30);
  assert.equal(m.position.z, rackSlide);
  assert.equal(m.loaded, 6);
  run(m, () => !m.plan);
  assert.equal(m.dock, null);
  assert.deepEqual(m.position, { x: ports[5].x, y: travel.y, z: rack.safe });
  assert.equal(rackCoverOpening(m.position.y), 0);
});

test('emergency stop freezes interrupted changes and each transfer phase can recover', () => {
  for (const stage of [
    m => m.message === 'Sliding into holder 1' && m.position.y > rack.approach + 20,
    m => m.dock === 1 && m.loaded === null,
    m => m.dock === 4 && m.loaded === 4,
  ]) {
    const m = new Machine();
    m.speed = 100;
    m.startChange(4);
    run(m, () => stage(m));
    m.emergencyStop();
    const stopped = { ...m.position };
    assert.equal(m.startChange(4), false);
    m.update(0.05, { x: 1, y: -1, z: 1 });
    assert.deepEqual(m.position, stopped);
    m.releaseStop();
    assert.equal(m.drives, false);
    m.enableDrives();
    assert.ok(m.startChange(4));
    run(m, () => !m.plan);
    assert.equal(m.loaded, 4);
    assert.equal(m.dock, null);
  }
});

test('rack clearance recovery cannot push an interrupted pickup back into its port', () => {
  const m = new Machine();
  m.speed = 100;
  m.startChange(2);
  run(m, () => m.dock === 2 && m.loaded === null && m.position.y === rack.y && m.message === 'Coupling adapter at holder 2');
  m.abort();
  assert.equal(m.position.z, rackSlide);
  assert.ok(m.startChange(3));
  run(m, () => m.position.z === rackSeat + rack.separation);
  assert.equal(m.position.y, rack.y);
  run(m, () => !m.plan);
  assert.equal(m.loaded, 3);
  assert.equal(m.dock, null);
});

test('practice contact is limited to its top, and points keep their original coordinates', () => {
  const m = new Machine();
  m.speed = 100;
  for (let i = 0; i < 100; i++) m.update(0.05, { z: -1 });
  assert.equal(m.position.z, workpiece.top);
  assert.ok(m.touching);
  assert.ok(m.recordPoint('Measurement'));
  m.update(0.05, { z: 1 });
  assert.equal(m.points[0].z, workpiece.top);
  assert.ok(m.position.z > workpiece.top);
});

test('the master gauge length changes only the tip readout and every ruby clears its shaft', () => {
  assert.ok(ports.every(stylus => stylus.shaftDiameter < stylus.diameter));
  assert.equal(masterStylus.diameter, 8);
  assert.equal(masterStylus.shaftDiameter, 6);
  assert.equal(masterStylus.componentLength, 63.5);
  const m = new Machine();
  m.loaded = masterStylus.id;
  m.artifact = false;
  m.speed = 100;
  for (let i = 0; i < 100; i++) m.update(0.05, { z: -1 });
  assert.equal(m.tipPosition.z, 0);
  assert.equal(m.position.z, 10);
});

test('master calibration swaps the tool, contacts the sphere and scans the equator at two rates', () => {
  const m = new Machine();
  m.speed = 100;
  assert.ok(m.startMasterCalibration());
  const scanFrames = [0, 0];
  const radius = referenceSphere.diameter / 2 + masterStylus.diameter / 2;
  for (let i = 0; i < 2500 && m.plan; i++) {
    const step = m.plan.steps[m.plan.index];
    m.update(0.05, still);
    if (!step.circle) continue;
    const tip = m.tipPosition;
    const distance = Math.hypot(tip.x - referenceSphere.x, tip.y - referenceSphere.y);
    assert.ok(Math.abs(distance - radius) < 1e-8);
    assert.ok(Math.abs(tip.z + masterStylus.diameter / 2 - referenceSphere.z) < 1e-8);
    scanFrames[step.rate === 8 ? 0 : 1]++;
  }
  assert.equal(m.loaded, masterStylus.id);
  assert.ok(scanFrames[0] > 4 * scanFrames[1] && scanFrames[1] > 0);
  assert.equal(m.calibration.state, 'complete');
  assert.equal(m.calibration.contacts, 5);
  assert.equal(m.calibration.scans, 2);
  for (const axis of ['x', 'y', 'z', 'diameter']) {
    assert.ok(Math.abs(m.calibration.sphere[axis] - referenceSphere[axis]) < 1e-8);
  }
});

test('calibration cancelled on the equator preserves the mounted master and can restart', () => {
  const m = new Machine();
  m.loaded = masterStylus.id;
  m.speed = 100;
  assert.ok(m.startMasterCalibration());
  run(m, () => m.message.includes('Slow equator scan'));
  m.update(0.05, still);
  assert.ok(m.touching);
  m.emergencyStop();
  assert.equal(m.calibration.state, 'cancelled');
  assert.equal(m.touching, false);
  m.releaseStop();
  m.enableDrives();
  assert.ok(m.startMasterCalibration());
  run(m, () => !m.plan);
  assert.equal(m.calibration.state, 'complete');
});

test('console separates host keys, MAN probe clamps and travel direction locks', () => {
  const m = new Machine();
  const c = new Console(m);
  c.press('f6');
  assert.equal(m.mode, 'AUTO');
  c.press('shift');
  c.press('return');
  c.press('f6');
  c.press('z');
  assert.equal(m.mode, 'MAN');
  assert.equal(m.clamps.z, true);
  assert.equal(m.locks.z, false);
  c.press('shift');
  c.press('z');
  assert.equal(m.force.z, 1);
  c.press('shift');
  c.press('return');
  c.press('f12');
  run(m, () => !m.plan);
  assert.deepEqual(m.position, { x: 0, y: 0, z: 800 });
});
