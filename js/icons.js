import { h } from '../vendor/preact.module.js';

// Small line icons on a 24 grid, drawn for this app (square caps and miters, like the brand's ls-icon).
const paths = {
  close: 'M5 5l14 14M19 5L5 19',
  back: 'M19 12H5M11 6l-6 6 6 6',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  share: 'M12 16V3M7 8l5-5 5 5M4 12v9h16v-9',
  external: 'M14 3h7v7M21 3L11 13M18 14v7H3V6h7',
  info: 'M3 3h18v18H3zM12 11v6M12 7v.01',
  alert: 'M12 3L2 21h20zM12 9v5M12 17v1',
  retry: 'M20 4v6h-6M4 20v-6h6M19 10A8 8 0 0 0 5 7M5 14a8 8 0 0 0 14 3',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  sun: 'M7 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
};

export function Icon({ name, small }) {
  return h('svg', { class: `ls-icon${small ? ' ls-icon--sm' : ''}`, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, h('path', { d: paths[name] }));
}
