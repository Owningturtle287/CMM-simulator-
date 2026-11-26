import { icon } from './icons.js';

function key(command, label, title = label) {
  return `<button type="button" data-key="${command}" aria-label="${title}" title="${title}">${label}</button>`;
}

function jog(label, axis, direction) {
  const name = `Jog ${direction > 0 ? 'positive' : 'negative'} ${axis.toUpperCase()}`;
  return `<button type="button" data-jog="${axis},${direction}" aria-label="${name}" title="${name}">${label}</button>`;
}

const digits = [
  ['1', '−,@'], ['2', 'abc'], ['3', 'def'],
  ['4', 'ghi'], ['5', 'jkl'], ['6', 'mno'],
  ['7', 'pqrs'], ['8', 'tuv'], ['9', 'wxyz'],
];

export function mobileConsole() {
  return `<section class="touch-console" aria-label="Mobile control console">
    <div class="touch-console-bar">
      <div class="touch-tabs" role="tablist" aria-label="Control panels">
        ${[['jog', 'Jog'], ['functions', 'Functions'], ['keypad', 'Keypad']].map(([id, title], i) =>
          `<button type="button" role="tab" id="touch-tab-${id}" data-touch-tab="${id}" aria-controls="touch-${id}"
            aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${title}</button>`).join('')}
      </div>
      ${key('estop', `${icon('stop')}<span id="touch-stop-label">E-stop</span>`, 'Emergency stop')}
    </div>
    <div id="mobile-lcd" class="touch-lcd" aria-label="Mobile controller display" hidden></div>
    <section id="touch-jog" class="touch-panel touch-jog-panel" role="tabpanel" aria-labelledby="touch-tab-jog">
      <div class="touch-speed">
        <label for="touch-speed">Speed override</label><output id="touch-speed-value" for="touch-speed">35%</output>
        <input id="touch-speed" type="range" data-speed min="0" max="100" value="35">
      </div>
      <div class="touch-motion">
        <div class="touch-motion-group" role="group" aria-label="XY jog">
          <div class="touch-motion-label">XY</div>
          <div class="touch-xy">
            ${jog('Y+', 'y', 1)}
            ${jog('X−', 'x', -1)}
            ${key('intermediate', icon('target'), 'Record intermediate point')}
            ${jog('X+', 'x', 1)}
            ${jog('Y−', 'y', -1)}
          </div>
        </div>
        <div class="touch-motion-group" role="group" aria-label="Z jog">
          <div class="touch-motion-label">Z</div>
          <div class="touch-z">${jog('Z+', 'z', 1)}${jog('Z−', 'z', -1)}</div>
        </div>
      </div>
      <div class="touch-action-row" role="group" aria-label="Machine controls">
        ${key('drives', 'Drives', 'Drives on or off')}
        ${key('lock-toggle', '<span id="touch-lock-label">Lock jog</span>', 'Lock jog controls')}
        ${key('slow', 'Slow', 'SLOW · probing speed and collision recovery')}
        ${key('point', 'M-Point', 'M-Point · record a 3D point')}
        ${key('side', 'Side<small id="touch-side-label">Front</small>', 'Change operating side')}
      </div>
    </section>
    <section id="touch-functions" class="touch-panel touch-keys touch-functions" role="tabpanel" aria-labelledby="touch-tab-functions" hidden>
      <div class="touch-function-grid" role="group" aria-label="Function keys">
        ${Array.from({ length: 12 }, (_, i) => key(`f${i + 1}`, `F${i + 1}`)).join('')}
      </div>
      <div class="touch-function-options" role="group" aria-label="Function modifiers and probe axes">
        ${key('shift', 'Shift')}${key('return', 'Return')}
        ${['x', 'y', 'z'].map(axis => key(axis, axis.toUpperCase(), `${axis.toUpperCase()} · axis clamp or measuring force`)).join('')}
      </div>
      <div class="touch-function-options" role="group" aria-label="Probe and rotary controls">
        ${key('stylus', 'Stylus', 'Select a stylus within the mounted system')}
        ${key('swivel', 'Head', 'Switch to articulating probe axes')}
        ${key('rotary', 'Rotary', 'Enable rotary table')}
        ${key('esc', 'ESC', 'Escape · close or cancel')}
      </div>
    </section>
    <section id="touch-keypad" class="touch-panel touch-keys touch-keypad" role="tabpanel" aria-labelledby="touch-tab-keypad" hidden>
      <div class="touch-navigation" role="group" aria-label="Menu and editing keys">
        ${key('menu', 'Menu')}${key('up', '↑', 'Menu up')}${key('ok', 'OK')}
        ${key('left', '←', 'Menu left')}${key('down', '↓', 'Menu down')}${key('right', '→', 'Menu right')}
        ${key('esc', 'ESC', 'Escape · close or cancel')}${key('shift', 'Shift')}${key('num', 'Num', 'Toggle numeric and text input')}
        ${key('insert', 'Insert', 'Toggle insert and replacement mode')}${key('tab', 'Tab')}${key('delete', 'Del', 'Delete character')}
      </div>
      <div class="touch-numeric" role="group" aria-label="Numeric and text keys">
        ${digits.map(([number, letters]) => key(number, `${number}<small>${letters}</small>`, `${number} / ${letters}`)).join('')}
        ${key('-', '−', 'Minus or hyphen')}${key('0', '0<small>+</small>', '0 or plus sign')}${key('.', '.', 'Decimal point')}
      </div>
      <div class="touch-edit-row">
        ${key('space', 'Space')}${key('return', 'Return')}
      </div>
    </section>
  </section>`;
}
