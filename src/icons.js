const paths = {
  rack: '<path d="M3 19v-5h18v5M5 19v-5m14 5v-5M7 6v5m5-5v5m5-5v5M5 6h4m1 0h4m1 0h4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5m8 4.5v9"/>',
  front: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 19V9h8v10m-4-10v5"/>',
  reset: '<path d="M3 12a9 9 0 1 1 3 6.7M3 5v7h7"/>',
  expand: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  probe: '<path d="M9 3h6v8H9zM12 11v6"/><circle cx="12" cy="19" r="2"/>',
  menu: '<path d="M5 6h14M5 12h14M5 18h14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 8.6a2.4 2.4 0 1 1 3.6 2.7c-1.4.8-1.4 1.3-1.4 2.5m0 2.8h.01"/>',
  power: '<path d="M12 3v5m-5.3-3a8 8 0 1 0 10.6 0"/>',
  unlock: '<rect x="5" y="10" width="13" height="10" rx="2"/><path d="M9 10V7a4 4 0 0 1 7-2.6M12 14v2"/>',
  slow: '<path d="M5 13a6 6 0 0 1 12 0c-1.5 2-4 3-6 3s-4.5-1-6-3Zm12 0 3-3 2 1v2l-5 1M5 13l-3-1m6 3-1 4m7-4 2 4"/>',
  swivel: '<path d="M8 3h8v9l-4 4-4-4zM8 7h8m-4 9-4 4m0-4 3 3m-5 2h.01"/>',
  stylus: '<path d="M12 3v16m-6-6h12m-6 2-3 3"/><circle cx="6" cy="13" r="1"/><circle cx="18" cy="13" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="9" cy="18" r="1"/>',
  point: '<path d="M10 3h4v9h-4zM12 12v4m-6 3h12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M19 5l-3 3m-8 8-3 3"/>',
  knob: '<path d="m2 15 3-7 3 11 4-14 4 13 3-10 3 7"/>',
  stop: '<path d="m7 4-3 3v10l3 3h10l3-3V7l-3-3z"/><path d="M12 7v6m0 3h.01"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
};

export function icon(name, extra = '') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths[name]}</svg>`;
}
