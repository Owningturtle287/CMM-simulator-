import { demonstrationScans, fitSphere, qualificationModes, qualificationSteps, sphereOrientations, systemStyli, tensorScans } from './calibration.js';

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
const masterMount = 38.5;
const masterLength = 63.5;
export const masterStylus = {
  id: 6, name: 'Master probe', diameter: 8, shaftDiameter: 6, bodyDiameter: 11,
  componentLength: masterLength, measuringLength: 50.5, mount: masterMount, length: masterMount + masterLength,
};
export const ports = [
  { x: 110, diameter: 3, shaftDiameter: 2.2 },
  { x: 246, diameter: 2, shaftDiameter: 1.4 },
  { x: 382, diameter: 4, shaftDiameter: 2.9 },
  { x: 518, diameter: 5, shaftDiameter: 3.8 },
  { x: 654, diameter: 6, shaftDiameter: 4.5 },
  { x: 790, ...masterStylus },
].map((stylus, index) => ({
  id: index + 1, name: `Stylus ${String(index + 1).padStart(2, '0')}`, length: stylusLength, ...stylus,
}));

export const stylusLabel = stylus => `${stylus.name} · Ø${stylus.diameter} mm`;

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
  calibration = null;
  sphereNumber = 1;
  sphereRecords = {};
  stylusQualifications = {};
  qualification = null;
  qualificationLimits = { sigma: .005, radiusError: .05 };

  get referenceSphere() {
    return sphereOrientations[this.sphereNumber - 1];
  }

  get tipOffset() {
    return stylusLength - (ports[this.loaded - 1]?.length ?? stylusLength);
  }

  get tipPosition() {
    return { ...this.position, z: this.position.z + this.tipOffset };
  }


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
    if (!this.plan && this.qualification?.state !== 'manual') return false;
    if (this.plan?.calibrating) this.calibration.state = 'cancelled';
    if (['running', 'manual'].includes(this.qualification?.state)) this.qualification.state = 'cancelled';
    this.plan = null;
    this.touching = false;
    this.clearVelocity();
    this.report('Automatic travel cancelled.');
    return true;
  }

  canStart() {
    if (!this.drives || this.stopped) return this.report('Enable the drives before automatic travel.');
    if (this.plan) return this.report('Automatic travel is already in progress.');
    if (this.qualification?.state === 'manual') return this.report('Finish or cancel the manual qualification first.');
    if (this.fault) return this.report('Clear the collision using SLOW and jog away.');
    return true;
  }

  canSelectStylus(id) {
    if (!this.canStart()) return false;
    if (this.mode !== 'AUTO') return this.report('Switch to AUTO before starting a stylus action.');
    if (this.manualTool === id) return this.report('Remount the hand-held stylus system before continuing.');
    return true;
  }

  startChange(id) {
    const target = ports.find(port => port.id === id);
    if (!target || !this.canSelectStylus(id)) return false;
    if (this.loaded === id && !this.dock) return this.report('That stylus system is already mounted.');
    const steps = this.changeSteps(target);
    steps.push({ goal: { y: travel.y }, label: 'Leaving rear service travel' });
    return this.startPlan(steps, 'Stylus change complete.');
  }

  startMasterCalibration() {
    if (!this.canSelectStylus(masterStylus.id)) return false;
    const contacts = [];
    const calibration = { state: 'running', contacts: 0, scans: 0, sphere: null };
    const sphere = this.referenceSphere;
    const tipOffset = stylusLength - masterStylus.length;
    const steps = this.changeSteps(ports[masterStylus.id - 1]);
    steps.push(...this.sphereApproach(sphere, tipOffset));
    steps.push(...qualificationSteps(sphere, masterStylus, tipOffset, { locate: true, scans: demonstrationScans }, () => {
      contacts.push({ ...this.position });
      calibration.contacts = contacts.length;
      if (contacts.length === 5) calibration.sphere = this.locatedSphere(sphere, contacts);
    }, () => { calibration.scans++; }));
    steps.at(-1).action = () => {
      this.sphereRecords[sphere.number] = calibration.sphere;
      this.storeStylusQualification({ sphere, mode: 'dynamic', tip: 1, system: masterStylus.id, samples: contacts });
    };
    this.calibration = calibration;
    return this.startPlan(steps, 'Master probe calibration complete.', true);
  }

  setSphereOrientation(number) {
    if (!sphereOrientations[number - 1]) return this.report('Select one of the four reference sphere positions.');
    if (number === this.sphereNumber) return true;
    if (this.plan || this.qualification?.state === 'manual') return this.report('Finish or stop the current operation before rotating the sphere.');
    const { pivot, z } = this.referenceSphere;
    const tip = this.tipPosition;
    if (Math.hypot(tip.x - pivot.x, tip.y - pivot.y) < 100 && tip.z < z + 35) {
      return this.report('Raise the probe clear of the reference fixture before rotating the sphere.');
    }
    this.sphereNumber = number;
    this.report(`Reference sphere position ${number} selected.`);
    return true;
  }

  stylusQualification(tip = this.mountedStylus) {
    return this.stylusQualifications[`${this.loaded}:${tip}`];
  }

  selectStylusTip(tip) {
    const match = systemStyli(ports[this.loaded - 1]).find(item => item.no === tip);
    if (!match || this.plan || this.qualification?.state === 'manual') return false;
    this.mountedStylus = tip;
    this.report(`Stylus ${match.name} selected.`);
    return true;
  }

  qualificationBlocker(mode, tip, locate = false) {
    if (!this.drives || this.stopped) return 'Enable the drives before qualifying.';
    if (this.mode !== 'AUTO') return 'Set the controller to AUTO to start qualification.';
    if (this.plan) return 'Wait for the current automatic travel to finish.';
    if (this.fault) return 'Clear the machine obstruction first.';
    if (this.qualification?.state === 'manual') return 'Finish or cancel the manual qualification first.';
    if (!this.loaded) return 'Mount a stylus system first.';
    if (this.speed === 0) return 'Increase the speed override above 0%.';
    if (locate) return this.loaded === masterStylus.id ? '' : 'Mount the MasterProbe to locate the reference sphere.';
    if (tip !== this.mountedStylus) return 'Activate the selected stylus first.';
    if (this.loaded === masterStylus.id && !this.sphereRecords[this.sphereNumber]) {
      return 'Set and locate this reference sphere position before qualifying the MasterProbe.';
    }
    if (qualificationModes[mode]?.repeat && !this.stylusQualification(tip)?.passed) return 'First complete an initial qualification for this stylus.';
    if (mode === 'dynamic-repeat' && !this.stylusQualification(tip)?.dynamic) return 'First complete a dynamic qualification for this stylus.';
    return '';
  }

  sphereApproach(sphere, tipOffset = this.tipOffset) {
    return [
      { goal: { x: sphere.x, y: sphere.y }, label: 'Travelling to the reference sphere' },
      { goal: { z: sphere.z + 75 - tipOffset }, label: 'Setting reference sphere clearance' },
    ];
  }

  locatedSphere(sphere, samples) {
    const fit = fitSphere(samples);
    if (!fit) return null;
    return { x: fit.x, y: fit.y, z: fit.z + stylusLength - masterStylus.length + masterStylus.diameter / 2,
      diameter: sphere.diameter, sigma: fit.sigma, at: Date.now() };
  }

  startSphereLocation() {
    const blocked = this.qualificationBlocker('tensor', 1, true);
    if (blocked) return this.report(blocked);
    const sphere = this.referenceSphere;
    const run = { kind: 'sphere', state: 'running', sphere, touches: 5, scans: 0, scanTotal: 0, samples: [] };
    const steps = [...this.clearanceSteps(), ...this.sphereApproach(sphere),
      ...qualificationSteps(sphere, masterStylus, this.tipOffset, { locate: true }, () => run.samples.push({ ...this.position }))];
    steps.at(-1).action = () => {
      const located = this.locatedSphere(sphere, run.samples);
      if (!located) {
        run.state = 'failed';
        this.plan.finish = 'The reference sphere position could not be fit. Retry location.';
        return;
      }
      this.sphereRecords[sphere.number] = located;
      run.state = 'complete';
    };
    this.qualification = run;
    return this.startPlan(steps, 'Reference sphere position located.');
  }

  startStylusQualification({ mode, tip, coverage, dynamics, force }) {
    const blocked = this.qualificationBlocker(mode, tip);
    if (blocked) return this.report(blocked);
    const type = qualificationModes[mode];
    if (!type || !(coverage >= 60 && coverage <= 180) || !(dynamics >= 10 && dynamics <= 100) || !(force >= 50 && force <= 400)) {
      return this.report('Enter valid qualification parameters.');
    }
    const sphere = this.referenceSphere;
    const scans = type.dynamic ? tensorScans() : [];
    const run = { kind: 'stylus', state: 'running', sphere, mode, tip, system: this.loaded, touches: type.touches ?? 5,
      scans: 0, scanTotal: scans.length, samples: [], dynamics, force, coverage };
    const steps = [...this.clearanceSteps(), ...this.sphereApproach(sphere)];
    this.qualification = run;
    if (type.manual) {
      steps.at(-1).action = () => { run.state = 'manual'; };
      return this.startPlan(steps, 'Jog to the sphere and record touches with M-Point.');
    }
    steps.push(...qualificationSteps(sphere, ports[this.loaded - 1], this.tipOffset, { touches: run.touches, coverage, dynamics, scans },
      () => run.samples.push({ ...this.position }), () => { run.scans++; }));
    steps.at(-1).action = () => {
      if (!this.storeStylusQualification(run)) {
        run.state = 'failed';
        this.plan.finish = 'The stylus ball could not be fit. Retry qualification.';
      }
    };
    return this.startPlan(steps, 'Stylus qualification complete.');
  }

  finishManualQualification() {
    const run = this.qualification;
    if (run?.state !== 'manual') return false;
    if (!this.storeStylusQualification(run)) {
      return this.report('Collect at least four distinct touches at different heights around the sphere.');
    }
    this.report('Manual qualification complete.');
    return true;
  }

  storeStylusQualification(run) {
    const fitted = fitSphere(run.samples);
    if (!fitted) return false;
    const sphere = this.sphereRecords[run.sphere.number] ?? run.sphere;
    const radius = fitted.radius - run.sphere.radius;
    const nominal = ports[run.system - 1].diameter / 2;
    const masterCenterOffset = stylusLength - masterStylus.length + masterStylus.diameter / 2;
    const result = {
      radius, sigma: fitted.sigma, x: sphere.x - fitted.x, y: sphere.y - fitted.y, z: sphere.z - fitted.z - masterCenterOffset,
      at: Date.now(), mode: run.mode, dynamic: Boolean(qualificationModes[run.mode]?.dynamic),
      passed: radius > 0 && fitted.sigma <= this.qualificationLimits.sigma + 1e-9 &&
        Math.abs(radius - nominal) <= this.qualificationLimits.radiusError + 1e-9,
    };
    this.stylusQualifications[`${run.system}:${run.tip}`] = result;
    run.state = 'complete';
    return true;
  }

  changeSteps(target) {
    const steps = this.clearanceSteps();
    if (this.loaded === target.id) return steps;
    if (this.loaded) {
      steps.push(...this.dockingSteps(ports[this.loaded - 1], true), ...this.socketExitSteps(false));
    }
    steps.push(...this.dockingSteps(target, false), ...this.socketExitSteps(true));
    return steps;
  }

  startPlan(steps, finish, calibrating = false) {
    this.touching = false;
    this.plan = { steps, index: 0, finish, calibrating };
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
    return this.startPlan(steps, 'Reference position reached.');
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
      { goal: { x: port.x, y: rack.approach }, label: `Approaching holder ${port.id}` },
      { goal: { z: rackSlide }, label: `Aligning with slot ${port.id}`, rate: 180,
        action: () => { this.dock = port.id; } },
      { goal: { y: rack.y }, label: `Sliding into holder ${port.id}`, rate: 115 },
      { goal: {}, label: storing ? `Releasing adapter at holder ${port.id}` : `Coupling adapter at holder ${port.id}`,
        dwell: 0.46, adapter: { id: port.id, releasing: storing }, action: () => { this.loaded = storing ? null : port.id; this.mountedStylus = 1; } },
    ];
  }

  manualStylus(mount) {
    if (this.plan || this.dock) return this.report('Clear the rack before handling a stylus.');
    if (this.qualification?.state === 'manual') return this.report('Finish or cancel the manual qualification before handling a stylus.');
    if (mount && !this.loaded && this.manualTool) {
      if (this.position.z + stylusLength < ports[this.manualTool - 1].length) {
        return this.report('Raise Z before mounting the stylus system.');
      }
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
    if (kind === 'Measurement' && this.qualification?.state === 'manual') {
      const run = this.qualification;
      const ruby = ports[this.loaded - 1].diameter / 2;
      const point = this.tipPosition;
      const surface = Math.hypot(point.x - run.sphere.x, point.y - run.sphere.y, point.z + ruby - run.sphere.z);
      if (Math.abs(surface - run.sphere.radius - ruby) > .05) return this.report('Touch the reference sphere before recording a qualification point.');
      if (run.samples.some(sample => Math.hypot(sample.x - this.position.x, sample.y - this.position.y, sample.z - this.position.z) < .1)) {
        return this.report('Move to another spot on the sphere before recording.');
      }
      run.samples.push({ ...this.position });
    }
    this.points.unshift({ ...this.tipPosition, kind, tool: this.loaded });
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
    this.touching = false;
    if (step.circle) {
      const circle = step.circle;
      const length = 2 * Math.PI * circle.radius;
      circle.distance = Math.min(length, circle.distance + rate * seconds);
      const angle = circle.direction * circle.distance / circle.radius;
      const a = circle.radius * Math.cos(angle), b = circle.radius * Math.sin(angle);
      this.position.x = circle.x + a * circle.u[0] + b * circle.v[0];
      this.position.y = circle.y + a * circle.u[1] + b * circle.v[1];
      this.position.z = circle.z + a * circle.u[2] + b * circle.v[2];
      this.touching = true;
      this.probing = true;
      if (circle.distance < length) return;
    } else {
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
      this.touching = Boolean(step.contact);
      this.probing = this.touching;
    }
    step.dwell = (step.dwell ?? 0) - seconds;
    if (step.dwell > 0) return;
    step.action?.();
    this.plan.index += 1;
    if (this.plan.index === steps.length) {
      if (this.plan.calibrating) this.calibration.state = 'complete';
      this.touching = false;
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
      const minimum = axis === 'z' ? Math.max(0, -this.tipOffset) : 0;
      next[axis] = clamp(next[axis] + Math.sign(value) * Math.min(rate, cap) * seconds, minimum, axisTravel[axis]);
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
    const tipOffset = this.tipOffset;
    const stylus = ports[this.loaded - 1];
    const referenceSphere = this.referenceSphere;
    const sphereRadius = referenceSphere.diameter / 2;
    const horizontal = Math.hypot(next.x - referenceSphere.x, next.y - referenceSphere.y);
    if (horizontal < sphereRadius + headHalf && next.z + stylusLength < referenceSphere.z + sphereRadius) {
      this.fault = 'Reference sphere obstruction';
      this.report('Reference sphere obstruction. Select SLOW and jog away.');
      return;
    }
    if (stylus) {
      const rubyRadius = stylus.diameter / 2;
      const ballZ = next.z + tipOffset + rubyRadius;
      const contactRadius = sphereRadius + rubyRadius;
      const touchesSphere = Math.hypot(horizontal, ballZ - referenceSphere.z) < contactRadius;
      if (touchesSphere && next.z < this.position.z && next.x === this.position.x && next.y === this.position.y &&
          this.position.z + tipOffset + rubyRadius >= referenceSphere.z) {
        next.z = referenceSphere.z + Math.sqrt(contactRadius ** 2 - horizontal ** 2) - rubyRadius - tipOffset;
        this.position = next;
        if (!this.touching) this.report('Stylus contacted the reference sphere.');
        this.touching = true;
        return;
      }
      const { pivot, axis, stem } = referenceSphere;
      const fromPivot = [next.x - pivot.x, next.y - pivot.y, ballZ - pivot.z];
      const along = clamp(fromPivot[0] * axis.x + fromPivot[1] * axis.y + fromPivot[2] * axis.z, 0, stem - sphereRadius);
      const touchesStem = Math.hypot(fromPivot[0] - along * axis.x, fromPivot[1] - along * axis.y, fromPivot[2] - along * axis.z) < rubyRadius + 5;
      const holderDistance = Math.hypot(next.x - pivot.x, next.y - pivot.y);
      const hitsBase = holderDistance < referenceSphere.baseRadius + rubyRadius && next.z + tipOffset < 18;
      const hitsHolder = holderDistance < 22 + rubyRadius && next.z + tipOffset < pivot.z + 12;
      const shaftInterference = horizontal < sphereRadius + stylus.shaftDiameter / 2 && ballZ < referenceSphere.z;
      if (touchesSphere || hitsBase || hitsHolder || touchesStem || shaftInterference) {
        this.fault = 'Reference sphere obstruction';
        this.report('Reference sphere obstruction. Select SLOW and jog away.');
        return;
      }
    }
    const inWorkpiece = stylus && this.artifact &&
      Math.abs(next.x - workpiece.x) <= workpiece.width / 2 &&
      Math.abs(next.y - workpiece.y) <= workpiece.depth / 2;
    if (inWorkpiece && next.z + tipOffset < workpiece.top) {
      if (this.position.z + tipOffset >= workpiece.top) {
        this.position = { ...next, z: workpiece.top - tipOffset };
        if (!this.touching) this.report('Stylus contact. Press M-Point to accept the point.');
        this.touching = true;
      } else {
        this.fault = 'Workpiece obstruction';
        this.report('Workpiece obstruction. Select SLOW and jog away.');
      }
      return;
    }
    this.touching = false;
    if (this.fault) {
      this.fault = '';
      this.report('Collision cleared.');
    }
    this.position = next;
  }
}
