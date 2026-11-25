export const axes = ['x', 'y', 'z'];
export const travel = { x: 900, y: 1200, z: 800 };
export const maxRate = 250;
export const probingRate = 8;
export const frame = { originX: 450, originY: 840, ramLead: 132 };
export const rack = { y: 1460, approach: 1315, plate: 386, safe: 550, halfWidth: 454, latchGap: 1.4, separation: 28 };
export const axisTravel = { ...travel, y: rack.y };
export const vastXT = { width: 91, depth: 91, height: 100, plateDiameter: 70 };
export const stylusLength = 92;
export const rackSeat = rack.plate - stylusLength;
export const rackSlide = rackSeat + rack.latchGap;
const acceleration = 830;
const magnetMotion = 0.14;
export const ports = [110, 246, 382, 518, 654, 790].map((x, index) => ({
  id: index + 1, x, diameter: [3, 2, 4, 5, 6, 8][index],
}));
export const workpiece = { x: 450, y: 655, width: 280, depth: 190, top: 82 };
export const startingPosition = { x: 450, y: 655, z: 530 };
const referencePosition = { x: 0, y: 0, z: 800 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const worldPosition = ({ x, y, z }) => [(x - frame.originX) / 1000, z / 1000, (frame.originY - y) / 1000];

export function rackCoverOpening(y) {
  return clamp((y - (rack.y - 117)) / 94, 0, 1);
}

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

  get adapterTransfer() {
    const step = this.plan?.steps[this.plan.index];
    if (!step?.adapter) return null;
    const progress = clamp(1 - step.dwell / magnetMotion, 0, 1);
    return progress > 0 ? { ...step.adapter, offset: progress * rack.latchGap } : null;
  }

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
        steps.push(...this.dockingSteps(current, true));
        steps.push(...this.socketExitSteps(false));
      }
      steps.push(...this.dockingSteps(target, false));
      steps.push(...this.socketExitSteps(true));
    }
    steps.push({ goal: { y: travel.y }, label: 'Leaving rear service travel' });
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
    if (this.dock) steps.push(...this.socketExitSteps(Boolean(this.loaded)));
    steps.push({
      goal: { z: Math.max(rack.safe, this.dock ? rack.safe : this.position.z) },
      label: 'Raising to clearance height',
    });
    return steps;
  }

  socketExitSteps(loaded) {
    const steps = [];
    if (!loaded) {
      steps.push({ goal: { z: rackSeat + rack.separation }, label: 'Lifting the empty receiver', rate: 78 });
    }
    steps.push(
      { goal: { y: rack.approach }, label: loaded ? 'Sliding adapter out of socket' : 'Withdrawing the empty receiver',
        rate: 130, action: () => { this.dock = null; } },
      { goal: { z: rack.safe }, label: 'Returning to clearance height', rate: 202 },
    );
    return steps;
  }

  dockingSteps(port, storing) {
    return [
      { goal: { x: port.x, y: rack.approach }, label: `Approaching port ${port.id}` },
      { goal: { z: rackSlide }, label: `Aligning with slot ${port.id}`, rate: 180,
        action: () => { this.dock = port.id; } },
      { goal: { y: rack.y }, label: `Sliding into port ${port.id}`, rate: 115 },
      { goal: {}, label: storing ? `Releasing adapter at port ${port.id}` : `Coupling adapter at port ${port.id}`,
        dwell: 0.46, adapter: { id: port.id, releasing: storing }, action: () => { this.loaded = storing ? null : port.id; this.mountedStylus = 1; } },
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
    if (rate === 0) {
      step.velocity = 0;
      return;
    }
    const dx = (step.goal.x ?? this.position.x) - this.position.x;
    const dy = (step.goal.y ?? this.position.y) - this.position.y;
    const dz = (step.goal.z ?? this.position.z) - this.position.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > 0) {
      step.velocity = Math.min(rate, (step.velocity ?? 0) + acceleration * seconds, Math.sqrt(2 * acceleration * distance));
      const fraction = Math.min(1, step.velocity * seconds / distance);
      if (fraction < 1) {
        this.position.x += dx * fraction;
        this.position.y += dy * fraction;
        this.position.z += dz * fraction;
        return;
      }
      Object.assign(this.position, step.goal);
    }
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
      next[axis] = clamp(next[axis] + Math.sign(value) * Math.min(rate, cap) * seconds, 0, axisTravel[axis]);
    }
    this.applyJog(next);
  }

  applyJog(next) {
    if (axes.every(axis => next[axis] === this.position[axis])) return;
    const headHalf = vastXT.width / 2;
    const inRack = next.y > rack.y - 61 - headHalf &&
      Math.abs(next.x - frame.originX) < rack.halfWidth + headHalf &&
      next.z < rack.plate + 26 - (this.loaded ? 0 : stylusLength) &&
      next.z + stylusLength + vastXT.height > rack.plate - stylusLength;
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
