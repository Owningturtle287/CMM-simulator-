import { icon } from './icons.js';
import { ports, stylusLabel, travel } from './machine.js';

const logo = `${import.meta.env.BASE_URL}zeiss.svg`;
export const axes = ['x', 'y', 'z'];

function consoleButton(id, x, y, label, title, classes = '') {
  return `<button type="button" class="console-key ${classes}" data-key="${id}" style="--x:${x}%;--y:${y}%" aria-label="${title}" title="${title}">${label}</button>`;
}

function lamp(id, x, y, style = '') {
  return `<i class="lamp ${style}" data-lamp="${id}" style="--x:${x}%;--y:${y}%"></i>`;
}

function console() {
  const button = consoleButton;
  return `<div class="console-scroll" tabindex="0" aria-label="BP26SE controller. Scroll horizontally on narrow screens.">
    <div class="console-body">
      <div class="console-face"></div>
      <img class="console-logo" src="${logo}" alt="ZEISS">
      <button class="stick left-stick" type="button" data-stick="z" title="Left joystick · Z up and down" aria-label="Left joystick, Z up and down">
        <span class="stick-gaiter"></span><span class="stick-knob"></span>
      </button>
      <button class="stick right-stick" type="button" data-stick="xy" title="Right joystick · X and Y. Click center to record an intermediate point." aria-label="Right joystick, X and Y. Click center to record an intermediate point.">
        <span class="stick-gaiter"></span><span class="stick-knob"></span>
      </button>
      <span class="stick-text stick-text-z">Z</span><span class="stick-text stick-text-x">X</span><span class="stick-text stick-text-y">Y</span>
      ${button('unlock-left', 11.1, 56.5, icon('unlock'), 'Left joystick unlock', 'unlock')}
      ${button('unlock-right', 89.1, 56.5, icon('unlock'), 'Right joystick unlock', 'unlock')}
      ${lamp('lock-left', 11.1, 47.8, 'amber')}${lamp('lock-right', 89.1, 47.8, 'amber')}
      ${button('side', 29.3, 15.0, icon('front'), 'Operating position · Front, Left, Rear, Right')}
      ${[0, 1, 2, 3].map((n) => lamp(`side-${n}`, [29.3, 26.7, 29.3, 31.9][n], [20.4, 15, 9.6, 15][n])).join('')}
      ${button('slow', 29.3, 31.2, icon('slow'), 'SLOW · probing speed and collision recovery')}
      ${lamp('slow', 29.3, 24.9)}
      <label class="dial" aria-label="Travel speed override" title="Travel speed override">
        <span class="dial-ring"></span><span class="dial-knob"></span>
        <input type="range" data-speed aria-label="Console speed override" min="0" max="100" value="35">
      </label>
      <span class="knob-symbol">${icon('knob')}</span>
      ${button('drives', 46.4, 15.0, '<span class="motor-glyph">M</span>', 'M · drives on or off')}
      ${lamp('drives', 46.4, 9.2)}
      ${button('swivel', 46.4, 31.2, icon('swivel'), 'Switch to articulating probe axes')}
      ${lamp('swivel', 46.4, 24.8)}
      ${button('estop', 57.1, 15.5, '<span>⟳</span>', 'Emergency stop · press to latch, press again to twist and release', 'estop')}
      <span class="estop-symbol">${icon('stop')}</span>
      ${['CNC','◯ ⧸','◉ ⧸','ERROR'].map((name, n) => `<span class="led-label" style="--x:${65 + n * 2.85}%;--y:13%">${name}</span>${lamp(['cnc','probing','contact','error'][n], 65 + n * 2.85, 9.2)}`).join('')}
      <span class="axis-symbol" style="--y:20.5%">↯</span><span class="axis-symbol" style="--y:25.3%">⌁</span>
      ${axes.map((a, n) => lamp(`force-${a}`, 65.25 + n * 4.45, 20.5) + lamp(`axis-${a}`, 65.25 + n * 4.45, 25.3) +
        button(a, 65.25 + n * 4.45, 31.2, a.toUpperCase(), `${a.toUpperCase()} · axis clamp or measuring force`)).join('')}
      ${button('stylus', 65.25, 40.9, `${icon('stylus')}<small>1–5</small>`, 'Select a stylus within the mounted system', 'micro')}
      ${button('point', 69.7, 40.9, `${icon('point')}<small>M-Point</small>`, 'M-Point · record a 3D point', 'micro')}
      ${button('insert', 74.15, 40.9, icon('sun'), 'Toggle insert and replacement mode')}
      <div id="lcd" class="lcd" aria-label="Controller display"></div>
      ${Array.from({ length: 8 }, (_, n) => button(`f${n + 1}`, n < 4 ? 26.55 : 57.15,
        45.0 + n % 4 * 10.1, `F${n + 1}`, `F${n + 1} · function key`)).join('')}
      ${button('f9', 32.5, 85.5, 'F9', 'F9 · function key')}
      ${button('f10', 37.2, 85.5, 'F10', 'F10 · function key')}
      ${button('up', 41.9, 85.5, '↑', 'Menu up', 'square arrow')}
      ${button('f11', 46.6, 85.5, 'F11', 'F11 · function key')}
      ${button('f12', 51.3, 85.5, 'F12', 'F12 · C99 reference travel with Shift + Return')}
      ${button('esc', 26.1, 95.5, 'ESC', 'Escape · close or cancel', 'small-print')}
      ${button('menu', 32.5, 95.5, 'Menu', 'Open the control console menu', 'square small-print')}
      ${button('left', 37.2, 95.5, '←', 'Menu left', 'square arrow')}
      ${button('down', 41.9, 95.5, '↓', 'Menu down', 'square arrow')}
      ${button('right', 46.6, 95.5, '→', 'Menu right', 'square arrow')}
      ${button('ok', 51.3, 95.5, 'OK', 'OK · confirm menu selection', 'square small-print')}
      ${button('-', 62, 54.6, '−', 'Minus or hyphen', 'square')}
      ${button('delete', 66.4, 54.6, '', 'Delete character', 'square')}
      ${button('.', 70.8, 54.6, '·', 'Decimal point', 'square')}
      ${button('num', 75.25, 54.6, 'Num', 'Num · toggle numeric and text input', 'small-print')}
      ${lamp('num', 75.25, 48.0)}
      ${['-,@','abc','def','ghi','jkl','mno','pqrs','tuv','wxyz'].map((letters, n) => button(String(n + 1),
        62 + n % 3 * 4.4, 64.7 + Math.floor(n / 3) * 10.1, `${n + 1}<small>${letters}</small>`, `${n + 1} / ${letters}`, 'square numeric')).join('')}
      ${button('shift', 75.25, 64.7, 'Shift', 'Shift modifier and joystick unlock', 'small-print')}
      ${button('tab', 75.25, 74.8, 'Tab', 'Tab · advance by four characters', 'small-print')}
      ${button('return', 75.25, 90.0, '<span>R<br>e<br>t<br>u<br>r<br>n</span>', 'Return · confirm input or select extended function with Shift', 'return small-print')}
      ${button('space', 64.3, 95.5, 'Space', 'Space', 'space small-print')}
      ${button('0', 70.8, 95.5, '0<small>+</small>', '0 or plus sign', 'numeric')}
    </div>
  </div>`;
}

export function layout() {
  const jog = (label, axis, direction) => `<button type="button" data-jog="${axis},${direction}" aria-label="Jog ${direction > 0 ? 'positive' : 'negative'} ${axis.toUpperCase()}">${label}</button>`;
  return `<header class="topbar">
    <div class="head-inner">
      <div class="brand"><img src="${logo}" alt="ZEISS"><div><b>ACCURA</b><span>CMM SIMULATOR</span></div></div>
      <div class="top-actions">
        <label class="tool-control" for="quick-actions">${icon('rack')}
          <select id="quick-actions" aria-label="Quick Actions">
            <option value="">Quick Actions</option>
            <option value="stylus">Change stylus system</option>
            <option value="calibrate">Calibrate master probe</option>
            <option value="cancel" hidden disabled>Cancel automatic travel</option>
          </select>
          ${icon('chevron')}
        </label>
        <button class="icon-button help" type="button" data-help aria-label="Simulator controls and help" title="Controls and help">${icon('help')}</button>
      </div>
    </div>
  </header>
  <main class="workspace">
    <div class="workbench">
      <section class="stage" aria-label="Machine view">
        <div class="stage-head"><div class="machine-id"><b>ZEISS ACCURA</b><span>9/12/8 · BRIDGE CMM</span></div>
          <div class="view-tools" aria-label="Camera views">
            <button data-view="iso" aria-label="Isometric view" title="Isometric view" aria-pressed="true">${icon('cube')}<span>Iso</span></button>
            <button data-view="front" aria-label="Front view" title="Front view" aria-pressed="false">${icon('front')}<span>Front</span></button>
            <button data-view="rack" aria-label="Rack view" title="Rack view" aria-pressed="false">${icon('rack')}<span>Rack</span></button>
            <button data-view="probe" aria-label="Probe close-up" title="Probe close-up" aria-pressed="false">${icon('probe')}<span>Probe</span></button>
          </div>
        </div>
        <div id="viewport" class="viewport">
          <div id="scene-error" role="status" hidden>Machine view is unavailable in this browser. The control console remains available.</div>
          <div class="stage-floor">
            <svg class="triad" viewBox="0 0 90 71" role="img" aria-label="Axis colors, X red, Y green, Z blue">
              <path d="M33 49V14m-4 5 4-5 4 5" stroke="#1b62bf"/><text x="30" y="11" fill="#1b62bf">Z</text>
              <path d="m33 49 31 11m-4-6 4 6-7 2" stroke="#ba403d"/><text x="69" y="66" fill="#ba403d">X</text>
              <path d="m33 49 23-19m-7 1 7-1-2 6" stroke="#23734e"/><text x="58" y="27" fill="#23734e">Y</text>
              <circle cx="33" cy="49" r="3" fill="#526477"/>
            </svg>
            <div class="stage-hint"><span class="mouse-hint">Scroll to zoom · Double-click to focus</span><span class="touch-hint">Pinch to zoom · Double-tap to focus</span></div>
            <button class="icon-button reset" data-reset aria-label="Reset camera" title="Reset camera">${icon('reset')}</button>
          </div>
        </div>
        <div class="mobile-readout" aria-hidden="true">
          ${axes.map(a => `<span class="${a}"><b>${a.toUpperCase()}</b> <code id="mobile-${a}"></code></span>`).join('')}
        </div>
        <div class="stage-status"><span class="status-diode" id="machine-diode"></span><span id="message" aria-live="polite"></span><span class="stage-frame">MACHINE FRAME</span></div>
      </section>
      <aside class="sidebar" aria-label="Machine information">
        <section class="card readout">
          <div class="card-heading"><h2>Machine position</h2><span>mm</span></div>
          <div class="coordinates">
            ${axes.map(a => `<div class="coordinate ${a}"><label>${a.toUpperCase()}</label><output id="coord-${a}" aria-label="${a.toUpperCase()} coordinate">0.000</output></div>`).join('')}
          </div>
          <div class="work-envelope"><span>Measuring range</span><b>${travel.x} × ${travel.y} × ${travel.z}</b></div>
        </section>
        <section class="card state">
          <div class="card-heading"><h2>Machine status</h2><span id="mode">AUTO</span></div>
          <div class="state-line"><span>Drives</span><b id="drive-status"></b></div>
          <div class="state-line"><span>Probe head</span><b>VAST XT gold</b></div>
          <div class="state-line"><span>Active stylus</span><b id="active-stylus"></b></div>
          <div class="state-line"><label for="speed">Speed override</label><b id="speed-value">35%</b></div>
          <input id="speed" type="range" data-speed min="0" max="100" value="35" aria-label="Speed override">
          <div id="calibration-result" class="calibration-result" aria-live="polite" hidden>
            <b>Master probe calibration</b>
            <span id="calibration-progress"></span>
            <code id="calibration-center" hidden></code>
          </div>
        </section>
        <section class="card point-log">
          <div class="card-heading"><h2>Point log</h2><button class="text-button" id="clear-points" hidden>Clear</button></div>
          <div id="points" aria-live="polite"></div>
        </section>
      </aside>
    </div>
    <section class="controls" aria-labelledby="controls-title">
      <div class="section-heading">
        <div class="section-title"><h2 id="controls-title">Control console</h2><span>BP26SE</span></div>
        <div class="shortcut-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>XY</span><kbd>Q</kbd><kbd>E</kbd><span>Z</span></div>
        <button class="text-button touch-notes" type="button" data-help>Control guide</button>
      </div>
      <div class="mobile-jog" aria-label="Touch jog controls">
        <div class="mobile-xy">${jog('↑', 'y', 1)}${jog('←', 'x', -1)}${jog('↓', 'y', -1)}${jog('→', 'x', 1)}</div>
        <div class="mobile-z">${jog('Z+', 'z', 1)}${jog('Z−', 'z', -1)}</div>
        <div class="mobile-actions"><button aria-label="Drives on or off" data-key="drives">${icon('power')}</button><button data-key="slow">Slow</button>
          <button aria-label="Unlock joysticks" data-key="unlock-left">${icon('unlock')}</button><button aria-label="Emergency stop" class="touch-stop" data-key="estop">Stop</button><button data-key="point">M-Point</button></div>
      </div>
      ${console()}
    </section>
    <footer><span>Independent simulator</span><label><input id="artifact" type="checkbox" checked> Show reference block</label></footer>
  </main>
  <dialog id="stylus-dialog" aria-labelledby="stylus-dialog-title">
    <div class="dialog-head">
      <h2 id="stylus-dialog-title">Choose stylus system</h2>
      <button type="button" class="icon-button" data-close-stylus aria-label="Close stylus picker">${icon('cross')}</button>
    </div>
    <select id="tool-select" aria-label="Choose stylus system">
      <option value="">Choose stylus system</option>
      ${ports.map(p => `<option value="${p.id}">${stylusLabel(p)}</option>`).join('')}
    </select>
  </dialog>
  <dialog id="help-dialog">
    <div class="dialog-head"><h2>Operating the simulator</h2><button type="button" class="icon-button" data-close aria-label="Close control guide">${icon('cross')}</button></div>
    <dl>
      <dt>Jog the machine</dt><dd>Hold and drag the right stick for X/Y and the left stick for Z. On desktop, use W/A/S/D and Q/E. Unlock either joystick after the console idles for a minute.</dd>
      <dt>Inspect the machine</dt><dd>Scroll over a spot or pinch around it to zoom. Double-click or double-tap a part to center it. Drag to orbit, or drag with the right mouse button or two fingers to pan.</dd>
      <dt>Machine coordinates</dt><dd>From the front, +X is right, +Y is away and +Z is up. Zero is at the front-left of the measuring area at granite height. The rear rack uses service travel beyond Y 1,200 mm.</dd>
      <dt>Change a stylus</dt><dd>With drives on and AUTO selected, open Quick Actions and choose Change stylus system. Each adapter slides into its socket from the front. The magnetic receiver releases the old plate and slides the selected plate out. Each system has a single downward tip.</dd>
      <dt>Calibrate the master probe</dt><dd>Select Calibrate master probe in Quick Actions. The machine mounts the master, locates the ceramic sphere, then performs slow and fast Dynamic Tensor demonstration scans. Use the Probe view to follow the tip.</dd>
      <dt>Power and reference</dt><dd>Press the red mushroom to stop. Press it again to simulate twisting it loose, then press M to enable drives. For reference travel, press Shift, Return, then F12.</dd>
      <dt>Record a point</dt><dd>Press M-Point to record the current 3D point. Click the center of the right stick to record an intermediate travel point.</dd>
      <dt>Console functions</dt><dd>Menu opens the built-in settings. Shift, Return, then F5 or F6 switches AUTO or MAN. The physical keypad uses the same shortcuts. The optional rotary table, articulated probe, and host function keys require their corresponding hardware or software.</dd>
    </dl>
  </dialog>`;
}
