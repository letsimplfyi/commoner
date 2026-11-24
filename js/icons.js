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
  link: 'M9 15l6-6M8 7l3-3a5 5 0 0 1 7 7l-3 3M16 17l-3 3a5 5 0 0 1-7-7l3-3',
  filter: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  play: 'M8 5l11 7-11 7z',
  audio: 'M3 9h4l5-4v14l-5-4H3zM16 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  pin: 'M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
};

export function Icon({ name, small }) {
  return h('svg', { class: `ls-icon${small ? ' ls-icon--sm' : ''}`, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, h('path', { d: paths[name] }));
}
