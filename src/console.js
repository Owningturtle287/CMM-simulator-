import { axes, maxRate, probingRate } from './machine.js';

const sides = ['Front', 'Left', 'Rear', 'Right'];
const keyLetters = { 0: '+0', 1: '-,@', 2: 'abc', 3: 'def', 4: 'ghi', 5: 'jkl', 6: 'mno', 7: 'pqrs', 8: 'tuv', 9: 'wxyz' };
const display = (name, read) => ({ name, read });
const item = (name, action) => ({ name, action });
const menu = (name, children) => ({ name, children });
const formatAxis = (value) => value.toFixed(3);

export class Console {
  numeric = true;
  replace = false;
  shift = false;
  extended = false;
  beep = true;
  page = null;
  stack = [];
  editor = null;
  sessionName = 'ACCURA';
  keys = new Set();

  constructor(machine) {
    this.machine = machine;
    this.root = this.menuTree();
  }

  menuTree() {
    const m = this.machine;
    return menu('Main menu', [
      menu('Display data', [
        display('Position D17', () => axes.map(a => `${a.toUpperCase()}  ${formatAxis(m.position[a])} mm`)),
        display('Velocity D18', () => axes.map(a => `${a.toUpperCase()}  ${m.velocity[a].toFixed(2)} mm/s`)),
        display('Status D16X', () => [m.drives ? 'DRIVES ON' : 'DRIVES OFF', m.plan ? 'CNC TRAVEL' : m.mode, m.fault || sides[m.side]]),
        display('Probe data', () => [m.loaded ? `System ${m.loaded} / stylus 1` : 'No stylus mounted', 'VAST XT gold', m.scan ? 'Scanning enabled' : 'Scanning disabled']),
        display('Scales', () => ['Machine frame', '+X right · +Y rear', '+Z up · mm']),
      ]),
      menu('CMM menu', [
        item('Reference travel', () => this.extendedFunction(12)),
        menu('Probe', [
          item('Mount stylus', () => this.extendedFunction(1)),
          item('Release stylus', () => this.extendedFunction(2)),
          item('Reseat stylus', () => this.extendedFunction(3)),
          item('Balance probe', () => this.extendedFunction(4)),
        ]),
        menu('Operating mode', [
          item('AUTO', () => this.extendedFunction(5)), item('MAN', () => this.extendedFunction(6)),
          item('Scan on', () => this.extendedFunction(7)), item('Scan off', () => this.extendedFunction(8)),
        ]),
      ]),
      menu('Console menu', [
        display('Lock directions', () => axes.map(a => `${a.toUpperCase()} → ${m.locks[a] ? 'locked' : 'unlocked'}`)),
        display('Version', () => ['BP26SE simulation', 'C99 motion profile', 'Simulator v1.0']),
        item('Probe beep on/off', () => { this.beep = !this.beep; m.report(`Probe beep ${this.beep ? 'on' : 'off'}.`); }),
        menu('Console settings', [
          menu('User location', sides.map((side, index) => item(side, () => this.setSide(index)))),
          item('Session label', () => { this.editor = { text: this.sessionName, at: this.sessionName.length, last: null }; }),
          item('Reset console settings', () => this.resetSettings()),
        ]),
      ]),
    ]);
  }

  resetSettings() {
    this.numeric = true;
    this.replace = false;
    this.shift = false;
    this.extended = false;
    this.beep = true;
    this.sessionName = 'ACCURA';
    this.setSide(0);
    this.machine.locks = { x: false, y: false, z: false };
    this.machine.report('Console settings reset.');
  }

  setSide(side) {
    this.machine.side = side;
    this.machine.report(`Operating position: ${sides[side]}.`);
  }

  extendedFunction(number) {
    const m = this.machine;
    if (m.plan) return m.report('Wait until automatic travel finishes.');
    switch (number) {
      case 1: return m.manualStylus(true);
      case 2: return m.manualStylus(false);
      case 3: return m.report(m.loaded ? 'Mounted stylus reseated.' : 'Mount a stylus before reseating.');
      case 4:
        if (!m.drives || !m.loaded) return m.report('Enable drives and mount a stylus to balance the probe.');
        m.force = { x: 0, y: 0, z: 0 };
        return m.report('Measuring probe balanced.');
      case 5:
      case 6:
        m.mode = number === 5 ? 'AUTO' : 'MAN';
        if (m.mode === 'AUTO') {
          m.clamps = { x: false, y: false, z: false };
          m.force = { x: 0, y: 0, z: 0 };
        }
        return m.report(`Operating mode: ${m.mode}.`);
      case 7:
      case 8:
        if (number === 7 && !m.loaded) return m.report('Mount a stylus before enabling scanning.');
        m.scan = number === 7;
        return m.report(`Scanning ${m.scan ? 'enabled' : 'disabled'}.`);
      case 9:
      case 10: return m.report(`F${number} is reserved for ZEISS service.`);
      case 11: return m.report('This C99 profile uses F12 for reference travel.');
      case 12: return m.startReference();
      default: return false;
    }
  }

  controlAxis(axis) {
    const m = this.machine;
    if (this.page?.name === 'Lock directions') {
      m.locks[axis] = !m.locks[axis];
      return m.report(`Jog ${axis.toUpperCase()} ${m.locks[axis] ? 'locked' : 'unlocked'}.`);
    }
    const shifted = this.shift;
    this.shift = false;
    if (m.mode !== 'MAN') return m.report('Switch to MAN to adjust probe clamping or measuring force.');
    if (!m.loaded) return m.report('Mount a stylus to adjust probe settings.');
    if (shifted) m.force[axis] = (m.force[axis] + 1) % 2;
    else m.clamps[axis] = !m.clamps[axis];
    const active = shifted ? m.force[axis] !== 0 : m.clamps[axis];
    return m.report(`${axis.toUpperCase()} ${shifted ? 'measuring force' : 'probe clamping'} ${active ? 'enabled' : 'disabled'}.`);
  }

  press(key) {
    const m = this.machine;
    if (/^f\d+$/.test(key)) {
      const number = Number(key.slice(1));
      const extended = this.extended || (this.keys.has('Shift') && this.keys.has('Enter'));
      this.shift = this.extended = false;
      return extended ? this.extendedFunction(number) : m.report(`F${number} sent to the host. Connect measuring software to assign it.`);
    }
    if (key === 'return' && this.shift) {
      this.extended = true;
      return m.report('Extended functions armed. Select F1–F12.');
    }
    switch (key) {
      case 'unlock-left':
      case 'unlock-right': return m.unlock();
      case 'estop': return m.stopped ? m.releaseStop() : m.emergencyStop();
      case 'drives': return m.enableDrives();
      case 'side': return this.setSide((m.side + 1) % sides.length);
      case 'slow':
        m.slow = !m.slow;
        return m.report(m.slow ? 'SLOW on. Travel limited to probing speed.' : 'SLOW off.');
      case 'swivel': return m.report('The VAST XT gold head has fixed orientation.');
      case 'rotary': return m.report('This setup has no rotary table.');
      case 'intermediate': return m.recordPoint('Intermediate');
      case 'point': return m.recordPoint('Measurement');
      case 'x':
      case 'y':
      case 'z': return this.controlAxis(key);
      case 'stylus':
        if (!m.loaded) return m.report('Mount a stylus system first.');
        return m.report('Stylus 1 selected. This system has one straight-down tip.');
      case 'num': this.numeric = !this.numeric; return m.report(this.numeric ? 'Numeric input.' : 'Text input.');
      case 'shift':
        if (m.locked) { m.unlock(); return; }
        this.shift = !this.shift;
        this.extended = false;
        return m.report(this.shift ? 'Shift armed.' : 'Shift released.');
      case 'insert': this.replace = !this.replace; return m.report(this.replace ? 'Replacement mode.' : 'Insert mode.');
      case 'menu':
        this.editor = null;
        this.stack = [];
        this.page = this.page ? null : { ...this.root, index: 0 };
        return;
      case 'esc':
        this.shift = this.extended = false;
        if (m.abort()) return;
        return this.back();
      default:
        if (this.editor) return this.edit(key);
        if (this.page) return this.navigate(key);
    }
    return undefined;
  }

  back() {
    if (this.editor) this.editor = null;
    else this.page = this.stack.pop() ?? null;
  }

  navigate(key) {
    const page = this.page;
    if (key === 'left') return this.back();
    const options = page.children;
    if (!options) {
      if (key === 'ok' || key === 'return') this.back();
      return;
    }
    if (key === 'up' || key === 'down') {
      page.index = (page.index + options.length + (key === 'up' ? -1 : 1)) % options.length;
    }
    if (key === 'right' || key === 'ok' || key === 'return') {
      const selected = options[page.index];
      if (selected.action) selected.action();
      else {
        this.stack.push(page);
        this.page = { ...selected, index: 0 };
      }
    }
  }

  edit(key) {
    const e = this.editor;
    if (key === 'ok' || key === 'return') {
      this.sessionName = e.text.trim() || 'ACCURA';
      this.editor = null;
      this.machine.report('Session label saved.');
      return;
    }
    if (key === 'left' || key === 'right') {
      e.at = Math.min(e.text.length, Math.max(0, e.at + (key === 'left' ? -1 : 1)));
    } else if (key === 'delete') {
      const at = this.replace ? e.at : Math.max(0, e.at - 1);
      if (this.replace || e.at > 0) e.text = e.text.slice(0, at) + e.text.slice(at + 1);
      e.at = at;
    } else if (keyLetters[key] || ['-', '.', 'space', 'tab'].includes(key)) {
      let value = key === 'space' ? ' ' : key === 'tab' ? '    ' : key;
      const now = performance.now();
      const multi = !this.numeric && keyLetters[key];
      const repeat = multi && e.last?.key === key && now - e.last.time < 800;
      const index = repeat ? (e.last.index + 1) % keyLetters[key].length : 0;
      if (multi) value = keyLetters[key][index];
      if (this.shift) value = value.toUpperCase();
      this.shift = false;
      const at = repeat ? e.at - 1 : e.at;
      const skip = repeat || this.replace ? value.length : 0;
      e.text = (e.text.slice(0, at) + value + e.text.slice(at + skip)).slice(0, 18);
      e.at = Math.min(at + value.length, e.text.length);
      e.last = { key, time: now, index };
      return;
    }
    e.last = null;
  }

  menuDisplay() {
    const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    if (this.editor) {
      const { text, at } = this.editor;
      return `<div class="lcd-menu"><b>Session label</b><span class="lcd-setting">${escape(text.slice(0,at))}<i>${this.replace ? '_' : '│'}</i>${escape(text.slice(at))}</span><small>Return · save</small></div>`;
    }
    if (this.page) {
      const { name, children, index, read } = this.page;
      const start = Math.max(0, index - 2);
      return `<div class="lcd-menu"><b>${name}</b>${children ? children.slice(start, start + 3).map((child, i) =>
        `<span class="${index === start + i ? 'selected' : ''}">${child.name}${child.children ? ' ›' : ''}</span>`).join('') :
        read().map(line => `<span>${escape(line)}</span>`).join('')}</div>`;
    }
    return null;
  }

  defaultDisplay() {
    return `<div class="lcd-top"><span data-lcd="mode"></span><span data-lcd="stylus"></span></div>
      <div class="lcd-data">${axes.map(a => `<div><span>${a.toUpperCase()}</span><b data-lcd="${a}"></b></div>`).join('')}</div>
      <svg class="lcd-probe" viewBox="0 0 62 53" aria-hidden="true">
        <path d="M31 3v43m-14-18h28m-22 7 16-15m-12-17h8" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="31" cy="46" r="5" data-lcd="tip"/><circle cx="17" cy="28" r="4"/>
        <circle cx="45" cy="28" r="4"/><circle cx="22" cy="36" r="4"/><circle cx="40" cy="19" r="4"/>
      </svg>
      <div class="lcd-bottom"><span data-lcd="session"></span><span data-lcd="speed"></span></div>`;
  }

  displayValues() {
    const m = this.machine;
    return {
      mode: m.stopped ? 'E-STOP' : m.plan ? 'CNC' : m.drives ? m.mode : 'DRIVES OFF',
      stylus: m.loaded ? 'STYLUS 1' : 'NO STYLUS',
      session: this.sessionName,
      speed: `${m.scan ? 'SCAN · ' : ''}${m.speed}% · ${m.slow ? probingRate : maxRate}`,
    };
  }
}
