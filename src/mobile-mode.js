export function setupMobileMode(releaseInputs) {
  const root = document.documentElement;
  const landscape = window.matchMedia('(orientation: landscape) and (min-width: 500px)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const toggle = document.querySelector('#mobile-mode');
  const header = document.querySelector('.head-inner');
  const actions = header.querySelector('.top-actions');
  const touchUtilities = document.querySelector('.touch-utilities');
  const info = document.querySelector('#machine-info');
  const infoBody = document.querySelector('#machine-info-content');
  const sidebar = document.querySelector('.sidebar');
  const workbench = document.querySelector('.workbench');
  const artifact = document.querySelector('.artifact-option');
  const footer = document.querySelector('.workspace footer');
  const tabs = [...document.querySelectorAll('[data-touch-tab]')];
  const lcd = document.querySelector('#mobile-lcd');
  const preference = 'accura.mobile-mode';
  let saved = null;
  try { saved = localStorage.getItem(preference); } catch {}
  let active = false;

  function refresh() {
    const on = saved === null ? coarsePointer.matches : saved === 'on';
    toggle.setAttribute('aria-pressed', String(on));
    toggle.title = on && !landscape.matches ? 'Mobile Mode on. Rotate for landscape controls.' : 'Mobile Mode';
    const next = on && landscape.matches;
    if (next === active) return;
    const restoreToggleFocus = document.activeElement === toggle;
    releaseInputs();
    active = next;
    root.toggleAttribute('data-mobile-layout', active);
    if (active) {
      touchUtilities.append(actions);
      infoBody.append(sidebar, artifact);
      window.scrollTo(0, 0);
    } else {
      if (info.open) info.close();
      header.append(actions);
      workbench.append(sidebar);
      footer.append(artifact);
    }
    if (restoreToggleFocus) toggle.focus({ preventScroll: true });
  }

  function selectTab(tab) {
    releaseInputs();
    for (const button of tabs) {
      const selected = button === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
    }
    lcd.hidden = tab.dataset.touchTab === 'jog';
  }

  toggle.addEventListener('click', () => {
    saved = toggle.getAttribute('aria-pressed') === 'true' ? 'off' : 'on';
    try { localStorage.setItem(preference, saved); } catch {}
    refresh();
  });
  landscape.addEventListener('change', refresh);
  coarsePointer.addEventListener('change', refresh);

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const indices = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length,
        Home: 0, End: tabs.length - 1 };
      if (!(event.key in indices)) return;
      event.preventDefault();
      event.stopPropagation();
      const next = tabs[indices[event.key]];
      selectTab(next);
      next.focus();
    });
  }
  document.querySelector('[data-info]').addEventListener('click', () => {
    releaseInputs();
    info.showModal();
  });
  document.querySelector('[data-close-info]').addEventListener('click', () => info.close());
  refresh();
}
