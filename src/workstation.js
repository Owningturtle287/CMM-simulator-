import { axes, ports, stylusLabel } from './machine.js';
import { defaultPlan, inspectionBlocker, inspectionResults, practicePlan, runInspection, savedPlan } from './inspection.js';

const sections = { setup: 'Setup', features: 'Features', checks: 'Characteristics', results: 'Results' };
const storageKey = 'accura.inspection.plan';

export function workstationLayout() {
  return `<dialog id="inspection-workstation" aria-labelledby="workstation-title">
    <div class="workstation-shell">
      <header class="workstation-head">
        <div><h2 id="workstation-title">Inspection workstation</h2><p>CALYPSO 2025 workflow trainer</p></div>
        <div class="workstation-head-actions">
          <select id="inspection-file" aria-label="Plan actions">
            <option value="">Plan actions</option><option value="new">New plan</option>
            <option value="practice">Load practice plan</option><option value="open">Open saved plan</option>
            <option value="save">Save plan</option>
          </select>
          <button type="button" id="workstation-close" autofocus>View machine</button>
        </div>
      </header>
      <div class="workstation-content">
        <nav class="workstation-nav" aria-label="Measurement plan sections">
          ${Object.entries(sections).map(([id, label]) => `<button type="button" data-inspection-pane="${id}" aria-controls="inspection-${id}">${label}</button>`).join('')}
          <div class="workstation-live"><span id="inspection-state"></span><small id="inspection-stylus"></small></div>
        </nav>
        <div class="workstation-editor">
          <section id="inspection-setup" class="inspection-pane">
            <div class="inspection-title"><h3>Measurement plan</h3><button type="button" id="inspection-practice">Load practice plan</button></div>
            <label class="inspection-field">Plan name <input id="inspection-name" type="text" maxlength="64"></label>
            <fieldset>
              <legend>Base alignment</legend>
              <label class="inspection-check"><input type="checkbox" id="inspection-align"> Use reference block fixture alignment</label>
              <p>XY origin at the block center. Z zero at the granite. The fixture axes follow the machine axes.</p>
            </fieldset>
            <label class="inspection-field">Clearance above block (mm)
              <input type="number" id="inspection-clearance" min="10" max="150" step="1" inputmode="numeric">
            </label>
            <button type="button" class="workstation-primary" data-inspection-next="features">Define features</button>
          </section>
          <section id="inspection-features" class="inspection-pane" hidden>
            <h3>Reference block features</h3>
            <div class="inspection-feature-layout">
              <div class="inspection-feature-options">
                <label class="inspection-card"><input type="checkbox" data-inspection-feature="point"><span><b>Top point</b><small>One touch at the center of the top face.</small></span></label>
                <label class="inspection-card"><input type="checkbox" data-inspection-feature="plane"><span><b>Top plane</b><small>Four touches in an inset rectangle.</small></span></label>
              </div>
              <div class="inspection-block" role="img" aria-label="Top view of the reference block and selected probing points">
                <div class="inspection-block-face"><i class="inspection-probe-point" hidden></i><span class="inspection-plane-points" hidden><i></i><i></i><i></i><i></i></span></div>
              </div>
            </div>
            <button type="button" class="workstation-primary" data-inspection-next="checks">Set characteristics</button>
          </section>
          <section id="inspection-checks" class="inspection-pane" hidden>
            <h3>Characteristics</h3>
            <label class="inspection-card"><input type="checkbox" data-inspection-check="height"><span><b>Top height</b><small>82.000 ± 0.050 mm from the Z datum. Uses the point or the mean plane height.</small></span></label>
            <label class="inspection-card"><input type="checkbox" data-inspection-check="variation"><span><b>Sample Z range</b><small>Maximum spread of 0.050 mm across the four plane samples.</small></span></label>
          </section>
          <section id="inspection-results" class="inspection-pane" hidden>
            <h3>Measurement results</h3>
            <p id="inspection-run-status"></p>
            <div id="inspection-result-table"></div>
            <div id="inspection-samples"></div>
          </section>
        </div>
      </div>
      <footer class="workstation-footer">
        <div class="workstation-positions" aria-label="Live machine coordinates in millimeters">
          ${axes.map(axis => `<span><b>${axis.toUpperCase()}</b> <code data-inspection-axis="${axis}"></code></span>`).join('')}
        </div>
        <div id="inspection-message" role="status"></div>
        <div class="workstation-run-actions">
          <button type="button" id="inspection-stop" hidden>Stop run</button>
          <button type="button" class="workstation-primary" id="inspection-run">Run plan</button>
        </div>
      </footer>
    </div>
  </dialog>`;
}

export function setupWorkstation(machine, close, releaseInputs) {
  const dialog = document.querySelector('#inspection-workstation');
  const query = selector => dialog.querySelector(selector);
  const all = selector => [...dialog.querySelectorAll(selector)];
  const button = query('#inspection-run');
  const stop = query('#inspection-stop');
  const planInput = query('#inspection-name');
  const align = query('#inspection-align');
  const clearance = query('#inspection-clearance');
  const featureFields = all('[data-inspection-feature]');
  const checkFields = all('[data-inspection-check]');
  const state = query('#inspection-state');
  const stylus = query('#inspection-stylus');
  const message = query('#inspection-message');
  const status = query('#inspection-run-status');
  const resultTable = query('#inspection-result-table');
  const samples = query('#inspection-samples');
  const positions = all('[data-inspection-axis]');
  let plan = defaultPlan(), run, pane = 'setup', notice = '';
  let reportKey, screenKey;
  let saved;
  try { saved = savedPlan(JSON.parse(localStorage.getItem(storageKey))); } catch {}

  function text(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function showPane(id) {
    pane = id;
    for (const nav of all('[data-inspection-pane]')) {
      const selected = nav.dataset.inspectionPane === pane;
      nav.setAttribute('aria-current', selected ? 'page' : 'false');
      query('#' + nav.getAttribute('aria-controls')).hidden = !selected;
    }
    query('.workstation-editor').scrollTop = 0;
  }

  function syncPlan() {
    planInput.value = plan.name;
    align.checked = plan.aligned;
    clearance.value = plan.clearance;
    for (const input of featureFields) input.checked = plan.features[input.dataset.inspectionFeature];
    if (!plan.features.point && !plan.features.plane) plan.checks.height = false;
    if (!plan.features.plane) plan.checks.variation = false;
    for (const input of checkFields) {
      const check = input.dataset.inspectionCheck;
      input.checked = plan.checks[check];
    }
    query('.inspection-probe-point').hidden = !plan.features.point;
    query('.inspection-plane-points').hidden = !plan.features.plane;
  }

  function replacePlan(next, feedback) {
    if (run?.state === 'running') return;
    plan = next;
    run = null;
    notice = feedback;
    syncPlan();
    showPane('setup');
  }

  function save() {
    if (!plan.name.trim() || !(plan.clearance >= 10 && plan.clearance <= 150)) {
      notice = 'Enter a plan name and a valid clearance before saving.';
      showPane('setup');
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(plan));
      saved = savedPlan(plan);
      notice = 'Plan saved on this device.';
    } catch {
      notice = 'This browser could not save the plan.';
    }
  }

  for (const nav of all('[data-inspection-pane], [data-inspection-next]')) {
    nav.addEventListener('click', () => showPane(nav.dataset.inspectionPane ?? nav.dataset.inspectionNext));
  }
  query('#inspection-practice').addEventListener('click', () => replacePlan(practicePlan(), 'Practice plan loaded. Select Run plan to measure it.'));
  query('#inspection-file').addEventListener('change', event => {
    const action = event.target.value;
    event.target.value = '';
    if (action === 'new') replacePlan(defaultPlan(), 'New plan created.');
    if (action === 'practice') replacePlan(practicePlan(), 'Practice plan loaded. Select Run plan to measure it.');
    if (action === 'open' && saved) replacePlan(savedPlan(saved), 'Saved plan opened.');
    if (action === 'save') save();
  });
  planInput.addEventListener('input', () => { plan.name = planInput.value; notice = ''; });
  align.addEventListener('change', () => { plan.aligned = align.checked; notice = ''; });
  clearance.addEventListener('input', () => { plan.clearance = clearance.valueAsNumber; notice = ''; });
  for (const input of featureFields) {
    input.addEventListener('change', () => { plan.features[input.dataset.inspectionFeature] = input.checked; notice = ''; syncPlan(); });
  }
  for (const input of checkFields) input.addEventListener('change', () => { plan.checks[input.dataset.inspectionCheck] = input.checked; notice = ''; });
  query('#workstation-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', close);
  button.addEventListener('click', () => {
    releaseInputs();
    const next = runInspection(machine, plan);
    if (next) {
      run = next;
      reportKey = undefined;
      notice = '';
      showPane('results');
    } else notice = machine.message;
  });
  stop.addEventListener('click', () => { if (machine.plan === run?.motion) machine.abort(); });

  syncPlan();
  showPane('setup');

  function updateReport() {
    const key = run ? `${run.state}:${run.samples.length}` : 'empty';
    if (key === reportKey) return;
    reportKey = key;
    text(status, !run ? 'Run the plan to capture samples from the simulator.' :
      `${run.name} · ${run.state === 'running' ? 'Measuring' : run.state === 'complete' ? 'Complete' : 'Stopped'} · ${run.samples.length}/${run.count} samples`);
    const results = run ? inspectionResults(run) : [];
    resultTable.innerHTML = results.length ? `<table><thead><tr><th scope="col">Characteristic</th><th scope="col">Actual (mm)</th><th scope="col">Limit (mm)</th><th scope="col">Result</th></tr></thead>
      <tbody>${results.map(item => `<tr><th scope="row">${item.name}</th><td>${item.value.toFixed(3)}</td><td>${item.limit}</td><td>${item.pass ? 'Pass' : 'Fail'}</td></tr>`).join('')}</tbody></table>` : '';
    samples.innerHTML = run?.samples.length ? `<table><caption>Fixture coordinates (mm)</caption><thead><tr><th scope="col">Sample</th><th scope="col">X</th><th scope="col">Y</th><th scope="col">Z</th></tr></thead>
      <tbody>${run.samples.map(sample => `<tr><th scope="row">${sample.feature}</th>${axes.map(a => `<td>${sample[a].toFixed(3)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
  }

  return {
    open() { if (!dialog.open) dialog.showModal(); },
    fixtureRemoved() { if (run?.state === 'running' && machine.plan === run.motion) machine.abort(); },
    update(paint) {
      if (run?.state === 'running' && machine.plan !== run.motion) run.state = 'stopped';
      const running = run?.state === 'running';
      const driveStatus = machine.stopped ? 'E-stop latched' : machine.fault ? 'Obstruction' :
        machine.plan ? machine.speed ? 'Automatic travel' : 'Speed override at 0%' : machine.drives ? `Machine ready · ${machine.mode}` : 'Drives disabled';
      const screen = [plan.name, driveStatus, sections[pane]];
      const key = screen.join('\n');
      if (screenKey !== key) {
        paint?.(...screen);
        screenKey = key;
      }
      if (!dialog.open) return;
      const blocker = inspectionBlocker(machine, plan);
      text(state, driveStatus);
      text(stylus, machine.loaded ? stylusLabel(ports[machine.loaded - 1]) : 'No stylus mounted');
      text(message, running ? machine.message : notice || blocker || 'Ready to run the measurement plan.');
      const tip = machine.tipPosition;
      for (const position of positions) text(position, tip[position.dataset.inspectionAxis].toFixed(3));
      button.disabled = Boolean(blocker);
      button.hidden = running;
      stop.hidden = !running;
      planInput.disabled = align.disabled = clearance.disabled = query('#inspection-file').disabled = query('#inspection-practice').disabled = running;
      query('#inspection-file option[value="open"]').disabled = !saved;
      for (const field of featureFields) field.disabled = running;
      for (const field of checkFields) field.disabled = running || (field.dataset.inspectionCheck === 'height' ?
        !plan.features.point && !plan.features.plane : !plan.features.plane);
      updateReport();
    },
  };
}
