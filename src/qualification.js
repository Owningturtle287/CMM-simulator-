import { icon } from './icons.js';
import { masterStylus, ports, stylusLabel } from './machine.js';
import { formatMeasurement, millimetersPerInch, qualificationModes, sphereOrientations, systemStyli } from './calibration.js';

const modes = Object.entries(qualificationModes);
const fixed = (value, divisor = 1) => formatMeasurement(value / divisor);
const date = value => value ? new Date(value).toLocaleDateString() : '—';

function readout(group, rows) {
  return `<dl class="qualification-readout">${rows.map(([id, label, tip]) =>
    `<div><dt${tip ? ` title="${tip}"` : ''}>${label}</dt><dd id="qual-${group}-${id}">—</dd></div>`).join('')}</dl>`;
}

const offsets = [
  ['x', 'X', 'X offset in the configured coordinate frame'],
  ['y', 'Y', 'Y offset in the configured coordinate frame'],
  ['z', 'Z', 'Z offset in the configured coordinate frame'],
];

export function qualificationLayout() {
  return `<dialog id="qualification-dialog" aria-labelledby="qualification-title">
    <header class="qualification-head">
      <div><h2 id="qualification-title">Probing system qualification</h2><p>VAST XT gold · Sphere geometry</p></div>
      <button type="button" class="icon-button" id="close-qualification" aria-label="Close qualification">${icon('cross')}</button>
    </header>
    <div class="qualification-toolbar" aria-label="Qualification tools">
      <button type="button" id="qual-change-system" title="Mount another stylus system from the rack">${icon('rack')} Change system</button>
      <button type="button" id="qual-cnc" title="Automatically re-qualify a previously qualified stylus">${icon('play')} CNC re-qualify</button>
      <button type="button" id="qual-limit-toggle">${icon('range')} Set Limit Values</button>
      <button type="button" id="qual-watch">${icon('front')} View machine</button>
    </div>
    <div class="qualification-body">
      <div class="qualification-setup">
        <div><span class="qualification-label">Stylus system</span><b class="qualification-mounted" id="qual-system">No stylus mounted</b></div>
        <label>Mode <select id="qual-mode">${modes.map(([id, spec]) => `<option value="${id}">${spec.label}</option>`).join('')}</select></label>
        <label>Parameter <select id="qual-parameter"><option value="standard">Standard</option><option value="custom">Custom</option></select></label>
        <label>Stylus name / no. <span class="qualification-tip"><select id="qual-tip" aria-label="Stylus name / no."></select><output id="qual-tip-no" for="qual-tip">—</output></span></label>
        <label>Sphere No. / orientation
          <select id="qual-orientation">${sphereOrientations.map(pose =>
            `<option value="${pose.number}">Position ${pose.number} · ${pose.rotate}°</option>`).join('')}</select>
        </label>
        <label>Sphere coverage (°) <input type="number" id="qual-coverage" min="60" max="180" step="any" value="180.000000"></label>
      </div>
      <div class="qualification-parameters" id="qual-custom" hidden>
        <label>Probing force (mN) <input type="number" id="qual-force" min="50" max="400" step="any" value="200.000000"></label>
        <label>Probing dynamics (%) <input type="number" id="qual-dynamics" min="10" max="100" step="any" value="100.000000"></label>
      </div>
      <div class="qualification-commands">
        <button type="button" id="qual-run">Qualify stylus</button>
        <button type="button" id="qual-activate">Change stylus pos.</button>
        <button type="button" id="qual-locate">Ref. sphere position</button>
        <button type="button" id="qual-cancel" hidden>Stop qualification</button>
      </div>
      <form id="qualification-limits" class="qualification-parameters" hidden>
        <label>Maximum sigma (in) <input type="number" id="qual-limit-sigma" min="0" step="any" required></label>
        <label>Maximum radius error (in) <input type="number" id="qual-limit-radius" min="0" step="any" required></label>
        <button type="submit">Apply limits</button>
      </form>

      <div class="qualification-results">
        <section class="qualification-card" aria-labelledby="qual-stylus-heading">
          <h3 id="qual-stylus-heading">Stylus <small>Lengths in inches</small></h3>
          <p id="qual-result-state">Not qualified</p>
          ${readout('result', [
            ['name', 'Name'], ['date', 'Date'],
            ['dynamic', 'Dynamic qualification', 'Whether a dynamic scan was completed during qualification'],
            ['r', 'R · Ball radius', 'Fitted stylus ball radius'],
            ['s', 'S · Sigma', 'Standard deviation of the sphere-fit residuals'],
            ...offsets.map(([id, label]) => [id, label, 'Stylus ball-center offset relative to the MasterProbe']),
            ['type', 'Type'],
          ])}
        </section>
        <section class="qualification-card" aria-labelledby="qual-sphere-heading">
          <h3 id="qual-sphere-heading">Reference sphere <small>Lengths in inches</small></h3>
          <p id="qual-sphere-state"></p>
          ${readout('sphere', [
            ['temperature', 'Temp. (°C)'], ['serial', 'Serial No.'], ['date', 'Date'],
            ['r', 'R · Radius', 'Certified reference sphere radius used by the simulator'],
            ['s', 'S · Sigma', 'Standard deviation of the locating touches'],
            ...offsets.map(([id, label]) => [id, label, 'Located sphere center in the machine frame']),
            ['tilt', 'Tilt (°)'], ['rotate', 'Rotate (°)'],
          ])}
        </section>
      </div>
    </div>
    <footer class="qualification-footer">
      <div id="qual-message" role="status"></div>
      <button type="button" id="qual-done">OK</button>
    </footer>
  </dialog>`;
}

export function setupQualification(machine, changeSystem, leaveWorkstation, releaseInputs) {
  const dialog = document.querySelector('#qualification-dialog');
  const find = id => dialog.querySelector('#qual-' + id);
  const elements = Object.fromEntries([
    'system', 'mode', 'parameter', 'tip', 'tip-no', 'coverage', 'custom', 'force', 'dynamics', 'run', 'activate',
    'locate', 'orientation', 'limit-sigma', 'limit-radius', 'limit-toggle', 'change-system', 'cnc', 'watch', 'cancel',
    'message', 'result-state', 'sphere-state',
  ].map(id => [id, find(id)]));
  const modeOptions = [...elements.mode.options];
  const limits = dialog.querySelector('#qualification-limits');
  const drawers = {
    result: ['name', 'date', 'dynamic', 'r', 's', 'x', 'y', 'z', 'type'],
    sphere: ['temperature', 'serial', 'date', 'r', 's', 'x', 'y', 'z', 'tilt', 'rotate'],
  };
  const fields = Object.fromEntries(Object.entries(drawers).map(([group, keys]) =>
    [group, Object.fromEntries(keys.map(id => [id, find(`${group}-${id}`)]))]));
  let mounted;
  let feedback = '';

  function write(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function writeFields(group, values) {
    for (const [id, value] of Object.entries(values)) write(fields[group][id], value);
  }

  function close() {
    dialog.close();
  }

  function watch() {
    close();
    leaveWorkstation();
  }

  function start(mode = elements.mode.value) {
    releaseInputs();
    feedback = '';
    const type = qualificationModes[mode];
    const custom = elements.parameter.value === 'custom';
    if (machine.startStylusQualification({ mode, tip: Number(elements.tip.value), coverage: elements.coverage.valueAsNumber,
      force: custom ? elements.force.valueAsNumber : 200, dynamics: custom ? elements.dynamics.valueAsNumber : 100 })) {
      if (type.manual) watch();
    } else feedback = machine.message;
    update();
  }

  elements['change-system'].addEventListener('click', changeSystem);
  elements.watch.addEventListener('click', watch);
  elements.cnc.addEventListener('click', () => {
    const previous = machine.stylusQualification(Number(elements.tip.value));
    const method = previous?.dynamic ? 'dynamic-repeat' : previous?.mode === 'tensor' || previous?.mode === 'tensor-repeat' ? 'tensor-repeat' : 'geometry-repeat';
    elements.mode.value = method;
    start(method);
  });
  elements.run.addEventListener('click', () => {
    if (machine.qualification?.state === 'manual') {
      if (!machine.finishManualQualification()) feedback = machine.message;
      update();
    } else start();
  });
  elements.activate.addEventListener('click', () => {
    if (machine.selectStylusTip(Number(elements.tip.value))) feedback = machine.message;
    update();
  });
  elements.locate.addEventListener('click', () => {
    releaseInputs();
    feedback = machine.startSphereLocation() ? '' : machine.message;
    update();
  });
  elements.cancel.addEventListener('click', () => {
    if (['manual', 'running'].includes(machine.qualification?.state)) machine.abort();
    feedback = '';
    update();
  });
  elements.orientation.addEventListener('change', () => {
    machine.setSphereOrientation(Number(elements.orientation.value));
    feedback = machine.message;
    if (elements.orientation.value !== String(machine.sphereNumber)) elements.orientation.value = String(machine.sphereNumber);
    update();
  });
  elements.parameter.addEventListener('change', () => { feedback = ''; update(); });
  elements.mode.addEventListener('change', () => { feedback = ''; update(); });
  elements.tip.addEventListener('change', () => { feedback = ''; update(); });
  for (const input of [elements.coverage, elements.force, elements.dynamics]) {
    input.addEventListener('change', () => {
      if (Number.isFinite(input.valueAsNumber)) input.value = formatMeasurement(input.valueAsNumber);
      feedback = '';
      update();
    });
  }
  elements['limit-toggle'].addEventListener('click', () => {
    limits.hidden = !limits.hidden;
    if (!limits.hidden) {
      elements['limit-sigma'].value = fixed(machine.qualificationLimits.sigma, millimetersPerInch);
      elements['limit-radius'].value = fixed(machine.qualificationLimits.radiusError, millimetersPerInch);
      elements['limit-sigma'].focus();
    }
  });
  limits.addEventListener('submit', event => {
    event.preventDefault();
    if (machine.plan || machine.qualification?.state === 'manual') return;
    const next = {
      sigma: elements['limit-sigma'].valueAsNumber * millimetersPerInch,
      radiusError: elements['limit-radius'].valueAsNumber * millimetersPerInch,
    };
    if (Object.values(next).some(value => !Number.isFinite(value) || value < 0)) {
      feedback = 'Enter finite, nonnegative limit values.';
      update();
      return;
    }
    machine.qualificationLimits = next;
    limits.hidden = true;
    feedback = 'Qualification limits saved for the next run.';
    update();
  });
  dialog.querySelector('#close-qualification').addEventListener('click', close);
  dialog.querySelector('#qual-done').addEventListener('click', close);

  function update() {
    if (!dialog.open) return;
    const system = ports[machine.loaded - 1];
    if (mounted !== machine.loaded) {
      elements.tip.replaceChildren(...systemStyli(system).map(tip => new Option(`${tip.name} · ${tip.direction}`, tip.no)));
      elements.tip.value = String(machine.mountedStylus);
      elements.mode.value = 'tensor';
      mounted = machine.loaded;
    }
    const tip = Number(elements.tip.value);
    const run = machine.qualification;
    const manual = run?.state === 'manual';
    const running = run?.state === 'running';
    const busy = Boolean(machine.plan) || manual;
    const result = machine.stylusQualification(tip);
    const sphere = machine.referenceSphere;
    const located = machine.sphereRecords[sphere.number];
    const ready = machine.qualificationBlocker(elements.mode.value, tip);
    const locateBlocker = machine.qualificationBlocker('tensor', 1, true);
    const custom = elements.parameter.value === 'custom';

    for (const option of modeOptions) {
      const spec = qualificationModes[option.value];
      const disabled = Boolean(spec.repeat && (!result?.passed || (spec.dynamic && !result.dynamic)));
      if (option.disabled !== disabled) option.disabled = disabled;
    }
    write(elements.system, system ? stylusLabel(system) : 'No stylus mounted');
    write(elements['tip-no'], tip ? String(tip) : '—');
    if (elements.orientation.value !== String(sphere.number)) elements.orientation.value = String(sphere.number);
    elements.tip.disabled = busy || !system;
    elements.mode.disabled = elements.parameter.disabled = elements.coverage.disabled = elements.orientation.disabled = busy;
    elements.force.disabled = elements.dynamics.disabled = busy;
    elements.custom.hidden = !custom;
    elements.activate.disabled = busy || !tip || tip === machine.mountedStylus;
    elements.activate.title = elements.tip.options.length <= 1 ? 'This stylus system has one tip.' : 'Activate the selected tip.';
    elements.locate.disabled = Boolean(locateBlocker);
    elements.locate.title = locateBlocker || 'Locate the selected reference sphere position with the MasterProbe.';
    elements['change-system'].disabled = busy || !machine.drives || machine.stopped || machine.mode !== 'AUTO' || Boolean(machine.fault);
    elements['limit-toggle'].disabled = busy;
    if (busy) limits.hidden = true;
    elements.cnc.disabled = busy || !result?.passed || Boolean(ready);
    elements.cancel.hidden = !running && !manual;
    elements.run.disabled = manual ? run.samples.length < 4 : Boolean(ready);
    elements.run.title = manual ? 'Fit the collected reference sphere touches.' : ready || 'Run the selected qualification mode.';
    write(elements.run, manual ? 'Finish manual qualification' : 'Qualify stylus');

    write(elements['result-state'], result ? result.passed ? 'Qualified · Within limits' : 'Qualification outside limits' : 'Not qualified');
    elements['result-state'].dataset.status = result ? result.passed ? 'pass' : 'fail' : '';
    write(elements['sphere-state'], located ? 'Located with MasterProbe' : 'Position selected · awaiting location');
    writeFields('result', {
      name: elements.tip.selectedOptions[0]?.textContent.split(' · ')[0] ?? '—',
      date: date(result?.at), dynamic: result ? result.dynamic ? 'Complete' : 'Static' : '—',
      r: fixed(result?.radius, millimetersPerInch), s: fixed(result?.sigma, millimetersPerInch),
      x: fixed(result?.x, millimetersPerInch), y: fixed(result?.y, millimetersPerInch), z: fixed(result?.z, millimetersPerInch),
      type: 'VAST-XT',
    });
    writeFields('sphere', {
      temperature: fixed(20), serial: '—', date: date(located?.at),
      r: fixed(sphere.radiusInches), s: fixed(located?.sigma, millimetersPerInch),
      x: fixed(located?.x, millimetersPerInch), y: fixed(located?.y, millimetersPerInch), z: fixed(located?.z, millimetersPerInch),
      tilt: fixed(sphere.tilt), rotate: fixed(sphere.rotate),
    });
    const progress = running ? ` · ${run.samples.length}/${run.touches} touches${run.scanTotal ? ` · ${run.scans}/${run.scanTotal} scans` : ''}` : '';
    write(elements.message, manual ? feedback || `Manual qualification · ${run.samples.length} touches. Use SLOW and M-Point at the sphere.`
      : machine.plan ? machine.message + progress
        : feedback || (['complete', 'cancelled', 'failed'].includes(run?.state) ? machine.message : '')
          || ready || (!located && machine.loaded !== masterStylus.id ? 'Ready to qualify using the simulator’s nominal sphere position.' : 'Ready to qualify.'));
  }

  return {
    open() {
      releaseInputs();
      if (!dialog.open) dialog.showModal();
      feedback = '';
      update();
    },
    update,
  };
}
