import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine, orientJog, ports, rack, stylusLength, travel, workpiece, worldPosition } from '../src/machine.js';
import { Console } from '../src/console.js';

const still = { x: 0, y: 0, z: 0 };
function run(machine, predicate, seconds = 125) {
  for (let i = 0; i < seconds * 20 && !predicate(); i++) machine.update(0.05, still);
  assert.ok(predicate(), machine.message);
}

test('machine coordinates map right, away and up from the operating position', () => {
  assert.deepEqual(worldPosition({ x: 0, y: 0, z: 0 }), [-0.45, 0, 0.6]);
  assert.deepEqual(worldPosition(travel), [0.45, 0.8, -0.6]);
  assert.deepEqual(orientJog({ x: -1, y: 0, z: 1 }, 1), { x: 0, y: 1, z: 1 });
  assert.deepEqual(orientJog({ x: 0, y: -1, z: 0 }, 1), { x: -1, y: -0, z: 0 });
});

test('each axis obeys the jog lock, override, inactivity and soft limits', () => {
  const m = new Machine();
  m.speed = 100;
  m.locks.x = true;
  m.update(0.05, { x: 1, y: 1, z: 0 });
  assert.equal(m.position.x, 450);
  assert.ok(m.position.y > 415);
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

test('tool change stores the first tool and docks the requested tool before retracting', () => {
  const m = new Machine();
  m.speed = 100;
  assert.ok(m.startChange(6));
  run(m, () => m.loaded === null);
  assert.equal(m.dock, 1);
  assert.equal(m.position.y, rack.y);
  assert.equal(m.position.z, rack.plate - stylusLength);
  run(m, () => m.loaded === 6);
  assert.equal(m.dock, 6);
  run(m, () => !m.plan);
  assert.equal(m.dock, null);
  assert.deepEqual(m.position, { x: ports[5].x, y: rack.approach, z: rack.safe });
});

test('emergency stop freezes interrupted changes and each transfer phase can recover', () => {
  for (const stage of [
    m => m.message === 'Docking at port 1' && m.position.y > rack.approach + 20,
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
  run(m, () => m.dock === 2 && m.loaded === null && m.position.y === rack.y && m.position.z < rack.plate - stylusLength + 25);
  m.abort();
  assert.ok(m.startChange(3));
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
