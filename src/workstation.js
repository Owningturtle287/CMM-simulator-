import { axes, ports, stylusLabel } from './machine.js';
import { icon } from './icons.js';
import { defaultPlan, inspectionBlocker, inspectionResults, practicePlan, runInspection, savedPlan } from './inspection.js';
import { createInspectionView } from './inspection-view.js';

const sections = {
  cmm: ['CMM', 'front'], plan: ['Measurement Plan', 'document'],
  checks: ['Characteristics', 'report'], features: ['Features', 'tree'],
};
const featureNames = { point: 'Top point', plane: 'Top plane' };
const checkNames = { height: 'Top height', variation: 'Sample Z range' };
const cameraNames = { iso: 'Isometric', top: 'Top', front: 'Front' };
const storageKey = 'accura.inspection.plan';

function tool(action, glyph, label, title = label, extra = '') {
  return `<button type="button" class="ribbon-tool" data-inspection-action="${action}" title="${title}" aria-label="${title}" ${extra}>${icon(glyph)}<span>${label}</span></button>`;
}

function row(key, glyph, label, detail = '') {
  return `<li><button type="button" data-inspection-node="${key}">${icon(glyph)}<span>${label}</span>${detail}</button></li>`;
}

function tree(glyph, title, content) {
  return `<details class="inspection-tree" open><summary>${icon(glyph)}<span>${title}</span></summary><ul>${content}</ul></details>`;
}

export function workstationLayout() {
  return `<dialog id="inspection-workstation" aria-labelledby="workstation-title">
    <div class="workstation-shell">
      <header class="workstation-head">
        <div class="workstation-brand"><span>${icon('cube')}</span><div><h2 id="workstation-title">Inspection workstation</h2><p>CALYPSO 2025 workflow trainer</p></div></div>
        <div class="workstation-head-actions">
          <span id="inspection-state" class="inspection-machine-state"></span>
          <button type="button" id="workstation-close" autofocus>${icon('front')}<span>View machine</span></button>
        </div>
      </header>
      <div class="workstation-ribbon" aria-label="Inspection tools">
        <div class="ribbon-group" role="group" aria-label="Plan tools"><div>
          ${tool('new', 'document', 'New', 'New plan')}${tool('open', 'folder', 'Open', 'Open saved plan')}
          ${tool('save', 'save', 'Save', 'Save plan')}${tool('practice', 'cube', 'Practice', 'Load practice plan')}
        </div><span aria-hidden="true">Plan</span></div>
        <div class="ribbon-group" role="group" aria-label="Definition tools"><div>
          ${tool('point', 'target', 'Point', 'Define top point')}${tool('plane', 'plane', 'Plane', 'Define top plane')}
          ${tool('height', 'height', 'Height', 'Define top height')}${tool('variation', 'range', 'Z range', 'Define sample Z range')}
        </div><span aria-hidden="true">Definition</span></div>
        <div class="ribbon-group" role="group" aria-label="View tools"><div>
          ${tool('iso', 'cube', 'Iso', 'Isometric inspection view', 'aria-pressed="true"')}
          ${tool('top', 'top', 'Top', 'Top inspection view', 'aria-pressed="false"')}
          ${tool('front', 'front', 'Front', 'Front inspection view', 'aria-pressed="false"')}
          ${tool('fit', 'expand', 'Fit', 'Fit inspection view')}
        </div><span aria-hidden="true">View</span></div>
        <div class="ribbon-group ribbon-inspection" role="group" aria-label="Run tools"><div>
          ${tool('run', 'play', 'Run', 'Run plan', 'id="inspection-run"')}
          ${tool('stop', 'stop', 'Stop', 'Stop run', 'id="inspection-stop" hidden')}
          ${tool('results', 'report', 'Results', 'Results', 'aria-pressed="false"')}
        </div><span aria-hidden="true">Inspection</span></div>
      </div>
      <div class="workstation-content">
        <aside class="workstation-navigator" aria-label="Inspection tree">
          <div class="workstation-tabs" role="tablist" aria-label="Measurement plan sections">
            ${Object.entries(sections).map(([id, [label, glyph]]) => `<button type="button" role="tab" id="inspection-tab-${id}" data-inspection-pane="${id}" aria-controls="inspection-${id}">${icon(glyph)}<span>${label}</span></button>`).join('')}
          </div>
          <div class="workstation-editor">
            <section id="inspection-cmm" class="inspection-pane" role="tabpanel" aria-labelledby="inspection-tab-cmm" hidden>
              ${tree('front', 'ACCURA 9/12/8', `
                <li><dl class="machine-tree">
                  <div><dt>Drives</dt><dd id="inspection-drives"></dd></div>
                  <div><dt>Operating mode</dt><dd id="inspection-mode"></dd></div>
                  <div><dt>Stylus system</dt><dd id="inspection-stylus"></dd></div>
                  <div><dt>Speed override</dt><dd id="inspection-speed"></dd></div>
                  <div><dt>Reference block</dt><dd id="inspection-fixture"></dd></div>
                </dl></li>`)}
            </section>
            <section id="inspection-plan" class="inspection-pane" role="tabpanel" aria-labelledby="inspection-tab-plan">
              ${tree('document', '<span id="inspection-tree-name"></span>',
                row('plan', 'document', 'Plan properties') + row('alignment', 'axes', 'Base alignment', '<small id="inspection-align-state"></small>') +
                row('clearance', 'plane', 'Clearance plane', '<small id="inspection-clearance-state"></small>'))}
              <div class="node-properties">
                <div data-inspection-properties="plan">
                  <label class="inspection-field">Plan name <input id="inspection-name" type="text" maxlength="64"></label>
                </div>
                <div data-inspection-properties="alignment" hidden>
                  <h3>Base alignment</h3><label class="inspection-check"><input type="checkbox" id="inspection-align"> Use reference block alignment</label>
                  <p>XY origin at block center. Z zero at the granite.</p>
                </div>
                <div data-inspection-properties="clearance" hidden>
                  <label class="inspection-field">Clearance above block (mm)
                    <input type="number" id="inspection-clearance" min="10" max="150" step="1" inputmode="numeric">
                  </label>
                </div>
              </div>
            </section>
            <section id="inspection-checks" class="inspection-pane" role="tabpanel" aria-labelledby="inspection-tab-checks" hidden>
              ${tree('report', 'Characteristics <small id="inspection-check-count"></small>',
                row('height', 'height', checkNames.height) + row('variation', 'range', checkNames.variation) +
                '<li id="inspection-no-checks" class="tree-empty">Define a characteristic from the ribbon.</li>')}
              <div class="node-properties" data-inspection-properties="height" hidden>
                <h3>Top height</h3><p>82.000 ± 0.050 mm from Z zero. Uses the point or the mean plane height.</p>
                <button type="button" class="inspection-inline" data-inspection-action="remove-height">Remove characteristic</button>
              </div>
              <div class="node-properties" data-inspection-properties="variation" hidden>
                <h3>Sample Z range</h3><p>Maximum spread of 0.050 mm across the four plane samples.</p>
                <button type="button" class="inspection-inline" data-inspection-action="remove-variation">Remove characteristic</button>
              </div>
            </section>
            <section id="inspection-features" class="inspection-pane" role="tabpanel" aria-labelledby="inspection-tab-features" hidden>
              ${tree('tree', 'Features <small id="inspection-feature-count"></small>',
                row('point', 'target', featureNames.point, '<small>1 touch</small>') +
                row('plane', 'plane', featureNames.plane, '<small>4 touches</small>') +
                '<li id="inspection-no-features" class="tree-empty">Add a point or plane from the ribbon.</li>')}
              <div class="node-properties" data-inspection-properties="point" hidden>
                <h3>Top point</h3><p>One touch at the center of the block.</p>
                <button type="button" class="inspection-inline" data-inspection-action="remove-point">Remove feature</button>
              </div>
              <div class="node-properties" data-inspection-properties="plane" hidden>
                <h3>Top plane</h3><p>Four touches in an inset rectangle.</p>
                <button type="button" class="inspection-inline" data-inspection-action="remove-plane">Remove feature</button>
              </div>
            </section>
          </div>
        </aside>
        <section class="inspection-viewport" aria-label="3D inspection workspace">
          <div id="inspection-model">
            <p id="inspection-view-error" hidden>3D preview unavailable. Plan tools are available.</p>
            <div class="inspection-view-label"><b>Reference block</b><span id="inspection-view-name">Isometric · Fixture frame</span></div>
            <button type="button" class="inspection-clearance-toggle" data-inspection-action="show-clearance" aria-pressed="false">${icon('plane')}<span>Clearance</span></button>
            <div class="inspection-view-key" aria-label="Axis colors"><span>X</span><span>Y</span><span>Z</span></div>
            <div class="inspection-point-key" aria-hidden="true"><span>Planned touches</span><span>Measured</span></div>
          </div>
          <section id="inspection-results" class="inspection-results" aria-labelledby="inspection-results-title" hidden>
            <div class="inspection-results-head"><h3 id="inspection-results-title">Measurement results</h3><button type="button" data-inspection-action="results" aria-label="Close results">${icon('cross')}</button></div>
            <p id="inspection-run-status"></p><div id="inspection-result-table"></div><div id="inspection-samples"></div>
          </section>
        </section>
      </div>
      <footer class="workstation-footer">
        <div class="workstation-positions" aria-label="Live machine coordinates in millimeters">
          ${axes.map(axis => `<span><b>${axis.toUpperCase()}</b> <code data-inspection-axis="${axis}"></code></span>`).join('')}
        </div>
        <div id="inspection-message" role="status"></div>
        <span class="workstation-units">mm</span>
      </footer>
    </div>
  </dialog>`;
}

export function setupWorkstation(machine, close, releaseInputs) {
  const dialog = document.querySelector('#inspection-workstation');
  const query = selector => dialog.querySelector(selector);
  const all = selector => [...dialog.querySelectorAll(selector)];
  const tabs = all('[data-inspection-pane]');
  const nodes = Object.fromEntries(all('[data-inspection-node]').map(item => [item.dataset.inspectionNode, item]));
  const properties = all('[data-inspection-properties]');
  const runButton = query('#inspection-run');
  const stop = query('#inspection-stop');
  const machineState = query('#inspection-state');
  const planInput = query('#inspection-name');
  const align = query('#inspection-align');
  const clearance = query('#inspection-clearance');
  const message = query('#inspection-message');
  const resultPanel = query('#inspection-results');
  const ribbonResult = query('.ribbon-tool[data-inspection-action="results"]');
  const viewName = query('#inspection-view-name');
  const positions = all('[data-inspection-axis]');
  let plan = defaultPlan(), run, pane = 'plan', selected = 'plan', notice = '';
  let view, showClearance = false, reportKey, screenKey, viewKey, saved;
  try { saved = savedPlan(JSON.parse(localStorage.getItem(storageKey))); } catch {}

  function text(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function selectNode(id) {
    selected = id;
    for (const item of Object.values(nodes)) item.setAttribute('aria-current', String(item.dataset.inspectionNode === selected));
    for (const panel of properties) panel.hidden = panel.dataset.inspectionProperties !== selected;
  }

  function showPane(id, node = id === 'plan' ? 'plan' : '') {
    pane = id;
    for (const tab of tabs) {
      const active = tab.dataset.inspectionPane === pane;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      query('#' + tab.getAttribute('aria-controls')).hidden = !active;
    }
    if (node) query(`#inspection-${id} .inspection-tree`).open = true;
    selectNode(node);
    query('.workstation-editor').scrollTop = 0;
  }

  function showResults(show) {
    resultPanel.hidden = !show;
    ribbonResult.setAttribute('aria-pressed', String(show));
  }

  function syncPlan() {
    if (!plan.features.point && !plan.features.plane) plan.checks.height = false;
    if (!plan.features.plane) plan.checks.variation = false;
    for (const [key, value] of Object.entries({ ...plan.features, ...plan.checks })) nodes[key].parentElement.hidden = !value;
    const features = Object.values(plan.features).filter(Boolean).length;
    const checks = Object.values(plan.checks).filter(Boolean).length;
    text(query('#inspection-feature-count'), String(features));
    text(query('#inspection-check-count'), String(checks));
    query('#inspection-no-features').hidden = Boolean(features);
    query('#inspection-no-checks').hidden = Boolean(checks);
    text(query('#inspection-tree-name'), plan.name.trim() || 'Untitled measurement plan');
    text(query('#inspection-align-state'), plan.aligned ? 'Set' : 'Unset');
    const validClearance = plan.clearance >= 10 && plan.clearance <= 150;
    text(query('#inspection-clearance-state'), validClearance ? `${plan.clearance} mm` : 'Unset');
  }

  function replacePlan(next, feedback) {
    if (run?.state === 'running') return;
    plan = next;
    run = null;
    notice = feedback;
    planInput.value = plan.name;
    align.checked = plan.aligned;
    clearance.value = plan.clearance;
    syncPlan();
    showPane('plan');
    showResults(false);
  }

  function save() {
    if (!plan.name.trim() || !(plan.clearance >= 10 && plan.clearance <= 150)) {
      notice = 'Enter a plan name and a valid clearance before saving.';
      showPane('plan', plan.name.trim() ? 'clearance' : 'plan');
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

  function define(kind, id, enabled) {
    if (run?.state === 'running') return;
    plan[kind][id] = enabled;
    syncPlan();
    notice = '';
    showPane(kind, enabled ? id : '');
  }

  function setCamera(name) {
    view?.setView(name);
    text(viewName, `${cameraNames[name]} · Fixture frame`);
    for (const id of Object.keys(cameraNames)) query(`[data-inspection-action="${id}"]`).setAttribute('aria-pressed', String(id === name));
  }

  function toggleClearance(show) {
    showClearance = show;
    query('[data-inspection-action="show-clearance"]').setAttribute('aria-pressed', String(show));
  }

  function startRun() {
    releaseInputs();
    const next = runInspection(machine, plan);
    if (!next) {
      notice = machine.message;
      return;
    }
    run = next;
    reportKey = undefined;
    notice = '';
    showPane('features', plan.features.point ? 'point' : 'plane');
    showResults(false);
  }

  const actions = {
    new: () => replacePlan(defaultPlan(), 'New plan created.'),
    practice: () => replacePlan(practicePlan(), 'Practice plan loaded. Select Run to measure it.'),
    open: () => { if (saved) replacePlan(savedPlan(saved), 'Saved plan opened.'); },
    save,
    point: () => define('features', 'point', true),
    plane: () => define('features', 'plane', true),
    height: () => define('checks', 'height', true),
    variation: () => define('checks', 'variation', true),
    'remove-point': () => define('features', 'point', false),
    'remove-plane': () => define('features', 'plane', false),
    'remove-height': () => define('checks', 'height', false),
    'remove-variation': () => define('checks', 'variation', false),
    iso: () => setCamera('iso'), top: () => setCamera('top'), front: () => setCamera('front'),
    fit: () => view?.fit(),
    'show-clearance': () => toggleClearance(!showClearance),
    run: startRun,
    stop: () => { if (machine.plan === run?.motion) machine.abort(); },
    results: () => showResults(resultPanel.hidden),
  };
  for (const btn of all('[data-inspection-action]')) btn.addEventListener('click', actions[btn.dataset.inspectionAction]);
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => showPane(tab.dataset.inspectionPane));
    tab.addEventListener('keydown', event => {
      const next = { ArrowLeft: (index + tabs.length - 1) % tabs.length,
        ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      showPane(tabs[next].dataset.inspectionPane);
      tabs[next].focus();
    });
  }
  for (const [name, btn] of Object.entries(nodes)) {
    btn.addEventListener('click', () => {
      selectNode(name);
      if (name === 'clearance') toggleClearance(true);
    });
  }
  planInput.addEventListener('input', () => { plan.name = planInput.value; notice = ''; syncPlan(); });
  align.addEventListener('change', () => { plan.aligned = align.checked; notice = ''; syncPlan(); });
  clearance.addEventListener('input', () => { plan.clearance = clearance.valueAsNumber; notice = ''; syncPlan(); });
  query('#workstation-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', close);
  replacePlan(plan, '');

  function updateReport() {
    const key = run ? `${run.state}:${run.samples.length}` : 'empty';
    if (key === reportKey) return;
    reportKey = key;
    text(query('#inspection-run-status'), !run ? 'Run the plan to capture samples from the simulator.' :
      `${run.name} · ${run.state === 'running' ? 'Measuring' : run.state === 'complete' ? 'Complete' : 'Stopped'} · ${run.samples.length}/${run.count} samples`);
    const results = run ? inspectionResults(run) : [];
    query('#inspection-result-table').innerHTML = results.length ? `<table><thead><tr><th scope="col">Characteristic</th><th scope="col">Actual (mm)</th><th scope="col">Limit (mm)</th><th scope="col">Result</th></tr></thead>
      <tbody>${results.map(item => `<tr><th scope="row">${item.name}</th><td>${item.value.toFixed(3)}</td><td>${item.limit}</td><td class="${item.pass ? 'result-pass' : 'result-fail'}">${item.pass ? 'Pass' : 'Fail'}</td></tr>`).join('')}</tbody></table>` : '';
    query('#inspection-samples').innerHTML = run?.samples.length ? `<table><caption>Fixture coordinates (mm)</caption><thead><tr><th scope="col">Sample</th><th scope="col">X</th><th scope="col">Y</th><th scope="col">Z</th></tr></thead>
      <tbody>${run.samples.map(sample => `<tr><th scope="row">${sample.feature}</th>${axes.map(a => `<td>${sample[a].toFixed(3)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
    if (run?.state === 'complete' || run?.state === 'stopped') showResults(true);
  }

  const editButtons = all('[data-inspection-action]').filter(btn => ['new', 'practice', 'save', 'open', 'point', 'plane',
    'height', 'variation', 'remove-point', 'remove-plane', 'remove-height', 'remove-variation'].includes(btn.dataset.inspectionAction));
  let viewUnavailable = false;
  return {
    open() {
      if (dialog.open) return;
      dialog.showModal();
      if (view || viewUnavailable) return;
      try {
        view = createInspectionView(query('#inspection-model'), feature => showPane('features', plan.features[feature] ? feature : ''));
        setCamera('iso');
      } catch (error) {
        viewUnavailable = true;
        query('#inspection-view-error').hidden = false;
        console.warn('Unable to open the inspection model', error);
      }
    },
    fixtureRemoved() { if (run?.state === 'running' && machine.plan === run.motion) machine.abort(); },
    update(paint) {
      if (run?.state === 'running' && machine.plan !== run.motion) run.state = 'stopped';
      const running = run?.state === 'running';
      const status = machine.stopped ? 'E-stop latched' : machine.fault ? 'Obstruction' :
        machine.plan ? machine.speed ? 'Automatic travel' : 'Speed override at 0%' : machine.drives ? `Machine ready · ${machine.mode}` : 'Drives disabled';
      const screen = [plan.name, status, sections[pane][0]];
      const key = screen.join('\n');
      if (screenKey !== key) {
        paint?.(...screen);
        screenKey = key;
      }
      if (!dialog.open) return;
      const blocker = inspectionBlocker(machine, plan);
      text(machineState, status);
      const state = machine.stopped || machine.fault ? 'fault' : machine.plan ? 'motion' : machine.drives ? 'ready' : 'off';
      if (machineState.dataset.state !== state) machineState.dataset.state = state;
      text(query('#inspection-drives'), machine.drives ? 'Enabled' : 'Disabled');
      text(query('#inspection-mode'), machine.mode);
      text(query('#inspection-stylus'), machine.loaded ? stylusLabel(ports[machine.loaded - 1]) : 'No stylus mounted');
      text(query('#inspection-speed'), `${machine.speed}%`);
      text(query('#inspection-fixture'), machine.artifact ? 'On granite' : 'Removed');
      text(message, running ? machine.message : notice || blocker || 'Ready to run the measurement plan.');
      const tip = machine.tipPosition;
      for (const position of positions) text(position, tip[position.dataset.inspectionAxis].toFixed(3));
      runButton.disabled = Boolean(blocker);
      runButton.hidden = running;
      stop.hidden = !running;
      planInput.disabled = align.disabled = clearance.disabled = running;
      for (const btn of editButtons) {
        const action = btn.dataset.inspectionAction;
        btn.disabled = running || (action === 'open' && !saved) ||
          (action === 'height' && !plan.features.point && !plan.features.plane) || (action === 'variation' && !plan.features.plane);
      }
      updateReport();
      const modelKey = [machine.artifact, showClearance, plan.clearance, plan.features.point, plan.features.plane, selected,
        reportKey, running ? [tip.x, tip.y, tip.z].join(',') : ''].join(':');
      if (view && modelKey !== viewKey) {
        view.update({ plan, selected, run, showClearance, machine });
        viewKey = modelKey;
      }
    },
  };
}
