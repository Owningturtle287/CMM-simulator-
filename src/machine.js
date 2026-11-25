export const axes = ['x', 'y', 'z'];
export const travel = { x: 900, y: 1200, z: 800 };
export const maxRate = 250;
export const probingRate = 8;
export const rack = { y: 1080, approach: 935, plate: 386, safe: 615, halfWidth: 438 };
export const stylusLength = 92;
export const ports = [110, 246, 382, 518, 654, 790].map((x, index) => ({
  id: index + 1, x, diameter: [3, 2, 4, 5, 6, 8][index],
}));
export const workpiece = { x: 450, y: 415, width: 280, depth: 190, top: 82 };
export const startingPosition = { x: 450, y: 415, z: 530 };
const referencePosition = { x: 0, y: 0, z: 800 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toward = (value, target, distance) => value + clamp(target - value, -distance, distance);

export const worldPosition = ({ x, y, z }) => [(x - 450) / 1000, z / 1000, (600 - y) / 1000];

export function orientJog({ x = 0, y = 0, z = 0 }, side) {
  switch (side) {
    case 1: return { x: y, y: -x, z };
    case 2: return { x: -x, y: -y, z };
    case 3: return { x: -y, y: x, z };
    default: return { x, y, z };
  }
}

export class Machine {
  position = { ...startingPosition };
  velocity = { x: 0, y: 0, z: 0 };
  speed = 35;
  drives = true;
  stopped = false;
  slow = false;
  locked = false;
  idle = 0;
  side = 0;
  mode = 'AUTO';
  scan = false;
  locks = { x: false, y: false, z: false };
  clamps = { x: false, y: false, z: false };
  force = { x: 0, y: 0, z: 0 };
  loaded = 1;
  manualTool = null;
  mountedStylus = 1;
  artifact = true;
  points = [];
  plan = null;
  dock = null;
  fault = '';
  touching = false;
  probing = false;
  message = 'Manual jog available. Drives on.';

  enableDrives() {
    if (this.stopped) return this.report('Release the emergency stop before enabling drives.');
    this.drives = !this.drives;
    if (!this.drives) {
      this.abort();
      this.clearVelocity();
    }
    this.report(this.drives ? 'Drives enabled.' : 'Drives disabled.');
  }

  emergencyStop() {
    this.stopped = true;
    this.drives = false;
    this.abort();
    this.clearVelocity();
    this.report('Emergency stop engaged. Motion halted.');
  }

  releaseStop() {
    this.stopped = false;
    this.report('Emergency stop released. Press M to enable drives.');
  }

  unlock() {
    this.idle = 0;
    this.locked = false;
    this.report('Joysticks unlocked.');
  }

  lock() {
    this.locked = true;
    this.clearVelocity();
    this.report('Joysticks locked.');
  }

  report(message) {
    this.message = message;
    return false;
  }

  clearVelocity() {
    this.velocity = { x: 0, y: 0, z: 0 };
    this.probing = false;
  }

  abort() {
    if (!this.plan) return false;
    this.plan = null;
    this.clearVelocity();
    this.report('Automatic travel cancelled.');
    return true;
  }

  canStart() {
    if (!this.drives || this.stopped) return this.report('Enable the drives before automatic travel.');
    if (this.plan) return this.report('Automatic travel is already in progress.');
    if (this.fault) return this.report('Clear the collision using SLOW and jog away.');
    return true;
  }

  startChange(id) {
    const target = ports.find(port => port.id === id);
    if (!target || !this.canStart()) return false;
    if (this.mode !== 'AUTO') return this.report('Switch to AUTO before changing stylus systems.');
    if (this.manualTool === id) return this.report('Remount the hand-held stylus before using its port.');
    if (this.loaded === id && !this.dock) return this.report('That stylus is already mounted.');
    const steps = this.clearanceSteps();
    if (this.loaded !== id) {
      if (this.loaded) {
        const current = ports.find(port => port.id === this.loaded);
        steps.push(...this.dockingSteps(current, 'store'));
      }
      steps.push(...this.dockingSteps(target, 'pick up'));
    }
    this.plan = { steps, index: 0, finish: 'Stylus change complete.' };
    this.report(steps[0].label);
    return true;
  }

  startReference() {
    if (!this.canStart()) return false;
    const steps = this.clearanceSteps();
    steps.push(
      { goal: { z: travel.z }, label: 'Referencing Z' },
      { goal: { y: referencePosition.y }, label: 'Referencing Y' },
      { goal: { x: referencePosition.x }, label: 'Referencing X' },
    );
    this.plan = { steps, index: 0, finish: 'Reference position reached.' };
    this.report(steps[0].label);
    return true;
  }

  clearanceSteps() {
    const steps = [];
    if (this.dock) {
      steps.push({ goal: { z: rack.plate - stylusLength + (this.loaded ? 0 : 34) }, label: 'Recovering rack clearance' });
      steps.push({ goal: { y: rack.approach }, label: 'Exiting rack', action: () => { this.dock = null; } });
    }
    steps.push({ goal: { z: Math.max(rack.safe, this.dock ? rack.safe : this.position.z) }, label: 'Raising to clearance height' });
    return steps;
  }

  dockingSteps(port, action) {
    const storing = action === 'store';
    const height = rack.plate - stylusLength;
    return [
      { goal: { x: port.x, y: rack.approach }, label: `Approaching port ${port.id}` },
      { goal: { z: height + (storing ? 0 : 34) }, label: `Aligning with port ${port.id}`, rate: 135,
        action: () => { this.dock = port.id; } },
      { goal: { y: rack.y }, label: `Docking at port ${port.id}`, rate: 80 },
      { goal: { z: height }, label: `${storing ? 'Storing' : 'Picking up'} stylus ${port.id}`, rate: 22,
        dwell: 0.32, action: () => { this.loaded = storing ? null : port.id; this.mountedStylus = 1; } },
      { goal: { z: height + (storing ? 34 : 0) }, label: 'Clearing the holder', rate: 60 },
      { goal: { y: rack.approach }, label: 'Retracting from rack', rate: 115, action: () => { this.dock = null; } },
      { goal: { z: rack.safe }, label: 'Returning to clearance height', rate: 160 },
    ];
  }

  manualStylus(mount) {
    if (this.plan || this.dock) return this.report('Clear the rack before handling a stylus.');
    if (mount && !this.loaded && this.manualTool) {
      this.loaded = this.manualTool;
      this.manualTool = null;
      this.mountedStylus = 1;
      return this.report('Hand-held stylus mounted.');
    }
    if (!mount && this.loaded && !this.manualTool) {
      this.manualTool = this.loaded;
      this.loaded = null;
      return this.report('Stylus released to hand.');
    }
    return this.report(mount ? 'No hand-held stylus to mount.' : 'No stylus available to release.');
  }

  recordPoint(kind) {
    if (this.plan || this.stopped || this.fault || !this.drives) return this.report('Point recording is unavailable in the current machine state.');
    if (kind === 'Measurement' && !this.loaded) return this.report('Mount a stylus before recording a point.');
    this.points.unshift({ ...this.position, kind, tool: this.loaded });
    this.report(`${kind} point recorded.`);
    return true;
  }

  update(seconds, input) {
    const previous = { ...this.position };
    this.probing = false;
    if (this.drives && !this.stopped) {
      if (this.plan) this.advancePlan(seconds);
      else this.jog(seconds, input);
    }
    const delta = seconds || 1;
    for (const axis of axes) this.velocity[axis] = (this.position[axis] - previous[axis]) / delta;
  }

  advancePlan(seconds) {
    const { steps, index } = this.plan;
    const step = steps[index];
    const rate = Math.min(maxRate * this.speed / 100, step.rate ?? maxRate);
    for (const axis of axes) {
      if (step.goal[axis] !== undefined) this.position[axis] = toward(this.position[axis], step.goal[axis], rate * seconds);
    }
    if (rate === 0 || !Object.keys(step.goal).every(axis => this.position[axis] === step.goal[axis])) return;
    step.dwell = (step.dwell ?? 0) - seconds;
    if (step.dwell > 0) return;
    step.action?.();
    this.plan.index += 1;
    if (this.plan.index === steps.length) {
      this.report(this.plan.finish);
      this.plan = null;
    } else this.report(steps[this.plan.index].label);
  }

  jog(seconds, input) {
    const isActive = axes.some(axis => Math.abs(input[axis] ?? 0) > 0.09);
    this.idle = isActive && !this.locked ? 0 : this.idle + seconds;
    if (this.idle >= 60 && !this.locked) this.lock();
    if (!isActive) this.touching = false;
    if (!isActive || this.locked || this.dock || (this.fault && !this.slow)) return;
    const direction = orientJog(input, this.side);
    const next = { ...this.position };
    const cap = maxRate * this.speed / 100;
    for (const axis of axes) {
      if (this.locks[axis]) continue;
      const value = direction[axis];
      const magnitude = Math.abs(value);
      if (magnitude <= 0.09) continue;
      const rate = this.slow ? probingRate * magnitude :
        magnitude < 0.37 ? probingRate * (magnitude - 0.09) / 0.28 :
          magnitude <= 0.58 ? probingRate : probingRate + (maxRate - probingRate) * (magnitude - 0.58) / 0.42;
      this.probing ||= rate <= probingRate && cap > 0;
      next[axis] = clamp(next[axis] + Math.sign(value) * Math.min(rate, cap) * seconds, 0, travel[axis]);
    }
    this.applyJog(next);
  }

  applyJog(next) {
    if (axes.every(axis => next[axis] === this.position[axis])) return;
    const inRack = next.y > 1016 && Math.abs(next.x - 450) < rack.halfWidth &&
      next.z < rack.plate + 40 && next.z + 185 > rack.plate - (this.loaded ? stylusLength : 0);
    if (inRack) {
      this.fault = 'Rack obstruction';
      this.report('Rack obstruction. Select SLOW and jog away.');
      return;
    }
    const inWorkpiece = this.loaded && this.artifact &&
      Math.abs(next.x - workpiece.x) <= workpiece.width / 2 &&
      Math.abs(next.y - workpiece.y) <= workpiece.depth / 2;
    if (inWorkpiece && next.z < workpiece.top) {
      const descending = this.position.z >= workpiece.top;
      if (descending) {
        this.position = { ...next, z: workpiece.top };
        if (!this.touching) this.report('Stylus contact. Press M-Point to accept the point.');
        this.touching = true;
      } else {
        this.fault = 'Workpiece obstruction';
        this.report('Workpiece obstruction. Select SLOW and jog away.');
      }
      return;
    }
    if (!inWorkpiece || next.z > workpiece.top) this.touching = false;
    if (this.fault) {
      this.fault = '';
      this.report('Collision cleared.');
    }
    this.position = next;
  }
}
