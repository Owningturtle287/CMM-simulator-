import './style.css';
import { Machine, axes, ports, travel } from './machine.js';
import { createScene } from './scene.js';
import { Console } from './console.js';
import { layout } from './layout.js';

document.querySelector('#app').innerHTML = layout();
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const machine = new Machine();
const controller = new Console(machine);
const select = $('#tool-select');
const dialog = $('#help-dialog');
const elements = {
  coordinates: Object.fromEntries(axes.map(axis => [axis, $(`#coord-${axis}`)])),
  mobile: Object.fromEntries(axes.map(axis => [axis, $(`#mobile-${axis}`)])),
  message: $('#message'),
  diode: $('#machine-diode'),
  frameLabel: $('.stage-frame'),
  mode: $('#mode'),
  drives: $('#drive-status'),
  stylus: $('#active-stylus'),
  speed: $('#speed-value'),
  speedControls: $$('[data-speed]'),
  dial: $('.dial'),
  lamps: $$('[data-lamp]'),
  lcd: $('#lcd'),
  points: $('#points'),
  clear: $('#clear-points'),
};

let scene;
try {
  scene = createScene($('#viewport'));
} catch (error) {
  $('#scene-error').hidden = false;
  console.error('Unable to start the 3D preview', error);
}

let view = 'iso';
function setView(name) {
  view = name;
  scene?.setView(name);
  $$('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
}
$$('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('[data-reset]').addEventListener('click', () => setView(view));

const pointers = new Map();
const activeJog = new Map();
const hotkeys = controller.keys;
const bindings = {
  KeyA: ['x', -1], KeyD: ['x', 1], KeyW: ['y', 1], KeyS: ['y', -1], KeyQ: ['z', 1], KeyE: ['z', -1],
};
const specials = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'return', Escape: 'esc', Delete: 'delete', Backspace: 'delete', Insert: 'insert',
  Tab: 'tab', ' ': 'space', '.': '.', '-': '-',
};
let audio;

function tone(frequency = 860) {
  if (!controller.beep) return;
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return;
  if (!audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.065, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.13);
}

function enableAudio() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return;
  try {
    audio ??= new AudioEngine();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch {
    // Motion and indicators remain available if audio is blocked.
  }
}
document.addEventListener('pointerdown', enableAudio, { once: true });
document.addEventListener('keydown', enableAudio, { once: true });

function command(key) {
  if (['estop', 'drives', 'side', 'esc'].includes(key)) releaseInputs();
  const result = controller.press(key);
  if (result && (key === 'point' || key === 'intermediate')) tone(710);
  updateUI();
}
const unlockers = new Set();
let lockChord = false;
$$('[data-key]').forEach(button => {
  const key = button.dataset.key;
  button.addEventListener('click', event => {
    if (lockChord && key.startsWith('unlock')) {
      event.preventDefault();
      return;
    }
    command(key);
  });
  if (key.startsWith('unlock') && button.closest('.console-body')) {
    button.addEventListener('pointerdown', () => {
      if (!unlockers.size) lockChord = false;
      unlockers.add(key);
      if (unlockers.size === 2) {
        lockChord = true;
        releaseInputs();
        machine.lock();
        updateUI();
      }
    });
    document.addEventListener('pointerup', () => unlockers.delete(key));
    document.addEventListener('pointercancel', () => unlockers.delete(key));
  }
});

elements.speedControls.forEach(input => input.addEventListener('input', () => {
  machine.speed = Number(input.value);
  updateUI();
}));
select.addEventListener('change', () => {
  const id = Number(select.value);
  if (id) {
    releaseInputs();
    machine.startChange(id);
  }
  select.value = '';
  updateUI();
});
$('#artifact').addEventListener('change', event => {
  machine.artifact = event.target.checked;
  machine.report(machine.artifact ? 'Reference block placed on the granite.' : 'Reference block removed.');
  updateUI();
});
elements.clear.addEventListener('click', () => {
  machine.points.length = 0;
  machine.report('Point log cleared.');
  updateUI();
});
$$('[data-help]').forEach(button => button.addEventListener('click', () => {
  releaseInputs();
  dialog.showModal();
}));
$('[data-close]').addEventListener('click', () => dialog.close());

function stickVector(element, x, y) {
  element.style.setProperty('--dx', `${x * 25}%`);
  element.style.setProperty('--dy', `${-y * 25}%`);
  element.style.setProperty('--tilt', `${x * 15}deg`);
}

function releaseInputs() {
  for (const { element } of pointers.values()) stickVector(element, 0, 0);
  pointers.clear();
  activeJog.clear();
  hotkeys.clear();
}

$$('[data-stick]').forEach(stick => {
  stick.addEventListener('pointerdown', event => {
    if (event.button !== 0 || [...pointers.values()].some(value => value.element === stick)) return;
    stick.setPointerCapture(event.pointerId);
    const grip = stick.querySelector('.stick-knob').getBoundingClientRect();
    const center = Math.hypot(event.clientX - grip.x - grip.width / 2, event.clientY - grip.y - grip.height / 2) < grip.width * 0.38;
    pointers.set(event.pointerId, {
      startX: event.clientX, startY: event.clientY, element: stick, center, moved: false, input: {},
    });
  });
  stick.addEventListener('pointermove', event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const length = stick.clientWidth * 0.32;
    const limit = value => Math.max(-1, Math.min(1, value / length));
    const dx = event.clientX - pointer.startX;
    const dy = pointer.startY - event.clientY;
    const x = stick.dataset.stick === 'xy' ? limit(dx) : 0;
    const y = limit(dy);
    pointer.moved ||= Math.hypot(dx, dy) > 5;
    pointer.input = stick.dataset.stick === 'xy' ? { x, y } : { z: y };
    stickVector(stick, x, y);
  });
  const end = (event, accept) => {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    stickVector(stick, 0, 0);
    if (accept && pointer?.center && !pointer.moved) {
      command(stick.dataset.stick === 'xy' ? 'intermediate' : 'rotary');
    }
  };
  stick.addEventListener('pointerup', event => end(event, true));
  stick.addEventListener('pointercancel', event => end(event, false));
  stick.addEventListener('lostpointercapture', event => {
    if (pointers.has(event.pointerId)) end(event, false);
  });
  stick.addEventListener('click', event => {
    if (event.detail === 0) command(stick.dataset.stick === 'xy' ? 'intermediate' : 'rotary');
  });
});

$$('[data-jog]').forEach(button => {
  const [axis, amount] = button.dataset.jog.split(',');
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    button.setPointerCapture(event.pointerId);
    activeJog.set(event.pointerId, [axis, Number(amount)]);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(event, pointer => activeJog.delete(pointer.pointerId));
  }
  button.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') activeJog.set(button, [axis, Number(amount)]);
  });
  button.addEventListener('keyup', () => activeJog.delete(button));
  button.addEventListener('blur', () => activeJog.delete(button));
});

document.addEventListener('keydown', event => {
  if (event.metaKey || event.altKey || event.ctrlKey || dialog.open) return;
  if (event.key === 'Escape' && machine.plan) {
    event.preventDefault();
    command('esc');
    return;
  }
  if (event.target.matches('input, select, textarea')) return;
  if (!event.shiftKey && ['Enter', ' '].includes(event.key) && event.target.closest('button')) return;
  if (bindings[event.code] && !controller.editor) {
    event.preventDefault();
    if (!event.repeat) hotkeys.add(event.code);
    return;
  }
  if (event.key === 'Shift') {
    hotkeys.add('Shift');
    if (machine.locked && !event.repeat) command('shift');
    return;
  }
  if (event.key === 'Enter' && event.shiftKey) {
    hotkeys.add('Enter');
    event.preventDefault();
    return;
  }
  const fn = /^F([1-9]|1[0-2])$/.test(event.key);
  const special = specials[event.key];
  const digit = /^\d$/.test(event.key);
  const inMenu = controller.page || controller.editor;
  if (event.key === 'Escape' || fn || (inMenu && (special || digit))) {
    event.preventDefault();
    if (!event.repeat || controller.editor) command(fn ? event.key.toLowerCase() : special ?? event.key);
  }
});
document.addEventListener('keyup', event => {
  hotkeys.delete(event.code);
  hotkeys.delete(event.key);
});
window.addEventListener('blur', releaseInputs);
document.addEventListener('visibilitychange', () => {
  lastFrame = performance.now();
  if (document.hidden) releaseInputs();
});

function readInput() {
  const input = { x: 0, y: 0, z: 0 };
  for (const { input: stick } of pointers.values()) {
    for (const [axis, value] of Object.entries(stick)) input[axis] += value;
  }
  for (const [axis, value] of activeJog.values()) input[axis] += value;
  for (const [key, [axis, value]] of Object.entries(bindings)) {
    if (hotkeys.has(key)) input[axis] += value;
  }
  for (const axis of axes) input[axis] = Math.max(-1, Math.min(1, input[axis]));
  return input;
}

const setText = (element, text) => {
  if (element.textContent !== text) element.textContent = text;
};
const pressed = {
  estop: () => machine.stopped, drives: () => machine.drives, slow: () => machine.slow,
  shift: () => controller.shift, return: () => controller.extended, num: () => controller.numeric,
  insert: () => controller.replace, x: () => machine.clamps.x, y: () => machine.clamps.y, z: () => machine.clamps.z,
};
const keyStates = $$('[data-key]').filter(button => button.dataset.key in pressed);
const portOptions = [...select.options].slice(1);
let previousMenu;
let positionDisplay;
let lastSettings;
let previousPoints = -1;
let previousTouch = false;
let previousFault = '';
let previousLock = false;
function updateConsoleDisplay(m, coordinates) {
  const menu = controller.menuDisplay();
  if (menu !== null) {
    if (menu !== previousMenu) elements.lcd.innerHTML = menu;
    previousMenu = menu;
    positionDisplay = null;
    return;
  }
  if (!positionDisplay) {
    elements.lcd.innerHTML = controller.defaultDisplay();
    positionDisplay = Object.fromEntries([...elements.lcd.querySelectorAll('[data-lcd]')]
      .map(node => [node.dataset.lcd, node]));
    previousMenu = null;
  }
  for (const axis of axes) setText(positionDisplay[axis], `+${coordinates[axis]}`);
  for (const [key, value] of Object.entries(controller.displayValues())) setText(positionDisplay[key], value);
  positionDisplay.tip.classList.toggle('active', Boolean(m.loaded));
}

function updateUI() {
  const m = machine;
  const coordinates = {};
  for (const axis of axes) {
    const value = m.position[axis].toFixed(3);
    setText(elements.coordinates[axis], value);
    setText(elements.mobile[axis], value);
    coordinates[axis] = value;
  }
  setText(elements.message, m.message);
  setText(elements.frameLabel, m.position.y > travel.y ? 'REAR SERVICE TRAVEL' : 'MACHINE FRAME');
  const settings = [m.mode, Boolean(m.plan), m.drives, m.stopped, Boolean(m.fault), m.loaded, m.manualTool, Boolean(m.dock), m.speed];
  if (!lastSettings || settings.some((value, index) => value !== lastSettings[index])) {
    lastSettings = settings;
    const port = ports[m.loaded - 1];
    setText(elements.mode, m.plan ? 'CNC' : m.mode);
    setText(elements.drives, m.stopped ? 'E-stop latched' : m.drives ? 'Enabled' : 'Disabled');
    elements.drives.dataset.active = m.stopped ? 'stop' : String(m.drives);
    elements.diode.dataset.state = m.stopped || m.fault ? 'error' : m.plan ? 'busy' : m.drives ? 'ready' : 'off';
    setText(elements.stylus, port ? `Port ${String(port.id).padStart(2, '0')} · Ø${port.diameter} mm` : 'Unloaded');
    setText(elements.speed, `${m.speed}%`);
    elements.speedControls.forEach(input => { if (Number(input.value) !== m.speed) input.value = m.speed; });
    elements.dial.style.setProperty('--angle', `${-135 + 2.7 * m.speed}deg`);
    select.disabled = !m.drives || m.stopped || Boolean(m.plan) || m.mode !== 'AUTO';
    for (const option of portOptions) {
      const id = Number(option.value);
      option.disabled = id === m.manualTool || (id === m.loaded && !m.dock);
      const status = id === m.loaded ? ' · mounted' : id === m.manualTool ? ' · held' : '';
      setText(option, `Port ${String(id).padStart(2, '0')} · Ø${ports[id - 1].diameter} mm${status}`);
    }
  }
  const lamps = {
    'lock-left': m.locked, 'lock-right': m.locked, [`side-${m.side}`]: true,
    slow: m.slow || (m.speed < 10 && Math.floor(performance.now() / 350) % 2 === 0),
    drives: m.drives, cnc: Boolean(m.plan), num: controller.numeric, error: m.stopped || Boolean(m.fault),
    probing: m.probing, contact: m.touching,
    ...Object.fromEntries(axes.flatMap(a => [[`axis-${a}`, m.clamps[a] || m.locks[a]], [`force-${a}`, m.force[a] !== 0]])),
  };
  for (const lamp of elements.lamps) lamp.classList.toggle('on', Boolean(lamps[lamp.dataset.lamp]));
  for (const button of keyStates) {
    const value = String(pressed[button.dataset.key]());
    if (button.getAttribute('aria-pressed') !== value) button.setAttribute('aria-pressed', value);
  }
  updateConsoleDisplay(m, coordinates);
  if (m.points.length !== previousPoints) {
    elements.clear.hidden = m.points.length === 0;
    elements.points.innerHTML = m.points.length ? `<ol>${m.points.map((point, index) => `<li>
      <b>${m.points.length - index} · ${point.kind}${point.tool ? ` · P${point.tool}` : ''}</b>
      <code>${axes.map(a => `${a.toUpperCase()} ${point[a].toFixed(3)}`).join('  ')}</code></li>`).join('')}</ol>` :
      '<p>Captured measurements and intermediate positions appear here.</p>';
    previousPoints = m.points.length;
  }
  if (m.touching && !previousTouch) tone();
  if ((m.fault && m.fault !== previousFault) || (m.locked && !previousLock)) tone(385);
  previousTouch = m.touching;
  previousFault = m.fault;
  previousLock = m.locked;
}

let lastFrame = performance.now();
let lastUI = 0;
function frame(now) {
  const seconds = Math.max(0, Math.min(0.50, (now - lastFrame) / 1000));
  lastFrame = now;
  const steps = Math.max(1, Math.ceil(seconds / 0.05));
  const input = readInput();
  for (let step = 0; step < steps; step++) machine.update(seconds / steps, input);
  scene?.render(machine, now);
  if (now - lastUI > 45) { updateUI(); lastUI = now; }
  window.requestAnimationFrame(frame);
}
updateUI();
window.requestAnimationFrame(frame);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(error => console.warn('Offline cache unavailable', error));
}
