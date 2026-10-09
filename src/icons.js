// Icônes en trait (24×24), dessinées pour Plume.
const P = (d) => `<path d="${d}"/>`;
const ICONS = {
  menu: P('M4 7h16M4 12h16M4 17h10'),
  plus: P('M12 5v14M5 12h14'),
  search: P('M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM16 16l4.5 4.5'),
  pin: P('M9 4h6l-1 5 3 3v1H7v-1l3-3-1-5zM12 13v7'),
  trash: P('M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10 11v5M14 11v5'),
  check: P('M5 12.5l4.5 4.5L19 7.5'),
  folder: P('M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V7z'),
  tag: P('M4 12.2V5a1 1 0 0 1 1-1h7.2a1 1 0 0 1 .7.3l7.3 7.3a1 1 0 0 1 0 1.4l-6.6 6.6a1 1 0 0 1-1.4 0L4.3 12.9a1 1 0 0 1-.3-.7zM8.5 8.5h.01'),
  sun: P('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'),
  tasks: P('M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5zM8.5 12l2.5 2.5 4.5-5'),
  mic: P('M12 3.5a3 3 0 0 0-3 3V12a3 3 0 0 0 6 0V6.5a3 3 0 0 0-3-3zM6 11.5a6 6 0 0 0 12 0M12 17.5V21'),
  image: P('M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5zM3.5 16l5-5 4 4 3-3 5 5M9 9h.01'),
  clip: P('M19 11.5l-7 7a4.5 4.5 0 0 1-6.4-6.4l7.5-7.5a3 3 0 0 1 4.2 4.2L9.7 16.3a1.5 1.5 0 0 1-2.1-2.1l6.8-6.8'),
  more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  back: P('M14.5 5.5L8 12l6.5 6.5'),
  x: P('M6 6l12 12M18 6L6 18'),
  bold: P('M7 4.5h6a3.5 3.5 0 0 1 0 7H7zM7 11.5h7a3.5 3.5 0 0 1 0 7H7z'),
  italic: P('M10 4.5h7M7 19.5h7M14.5 4.5l-5 15'),
  list: P('M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01'),
  heading: P('M6 5v14M18 5v14M6 12h12'),
  link: P('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'),
  settings: P('M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5'),
  restore: P('M4 12a8 8 0 1 0 2.5-5.8M4 4.5v4h4'),
  ext: P('M8 16L16 8M9 8h7v7'),
  play: '<path d="M8.5 5.8v12.4l10-6.2z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="2.6"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
  download: P('M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14'),
  upload: P('M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14'),
  bell: P('M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5zM10 20.5a2 2 0 0 0 4 0'),
  calendar: P('M5 6.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1zM4 11h16M8.5 4v4M15.5 4v4'),
  file: P('M7 3.5h6.5L19 9v10.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM13.5 3.5V9H19'),
  at: P('M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1'),
  hash: P('M9.5 4L8 20M16 4l-1.5 16M5 9h15M4 15h15'),
  code: P('M8.5 7L4 12l4.5 5M15.5 7L20 12l-4.5 5'),
  sort: P('M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3'),
  chevron: P('M9 6l6 6-6 6'),
  down: P('M6 9l6 6 6-6'),
  copy: P('M9 9h10v10H9zM5 15V5h10'),
  quote: P('M5 6v12M9 8h10M9 12h8M9 16h6'),
  cloud: P('M7.5 18.5h9a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 9.7 4.4 4.4 0 0 0 7.5 18.5z'),
  info: P('M12 11v5M12 8h.01M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z'),
  nib: '<path d="M12 2.8c3.4 2.9 5.6 6.3 5.6 9.9 0 2.1-.8 3.9-2.3 5.3L12 21.2l-3.3-3.2c-1.5-1.4-2.3-3.2-2.3-5.3 0-3.6 2.2-7 5.6-9.9z" fill="currentColor" stroke="none"/><path d="M12 11v7.4" stroke="var(--nib-cut, #121110)" stroke-width="1.6"/><circle cx="12" cy="10.2" r="1.3" fill="var(--nib-cut, #121110)" stroke="none"/>',
};

export function icon(name, size = 20, cls = '') {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
