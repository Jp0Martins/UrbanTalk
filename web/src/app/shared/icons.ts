// ícones em traço (24x24, stroke 1.75). Categorias usam o mesmo conjunto,
// então o mapa e as listas sempre mostram o mesmo desenho para cada tipo de problema
export const ICONS: Record<string, string> = {
  // categorias
  pothole: '<path d="M3 15.5c0-2.3 4-4 9-4s9 1.7 9 4-4 4-9 4-9-1.7-9-4z"/><path d="m7.5 15 2.5-1.5 1.5 2 2-2.5 1.5 1.5 1.5-.5"/><path d="M5 9l2-2M12 7V4M19 9l-2-2"/>',
  streetlight: '<path d="M8 21h6"/><path d="M11 21V6a2 2 0 0 1 2-2h4"/><path d="M14.5 6.5h5l-1 2.5h-3z"/><path d="M17 12v1.5M14 11.5l-.8 1.2M20 11.5l.8 1.2"/>',
  sidewalk: '<path d="M3 19h18"/><path d="M3 14h7l1.5 2.5L14 14h7"/><path d="M8 14v5M16 14v5"/><path d="M11.5 16.5 10 19"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>',
  sign: '<path d="M12 3.5 21 19H3z"/><path d="M12 10v4"/><path d="M12 16.5v.5"/>',
  other: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h.01M12 12h.01M16 12h.01" stroke-width="2.6"/>',
  bus: '<rect x="5" y="3.5" width="14" height="13" rx="2"/><path d="M5 10h14"/><path d="M8.5 13.5h.01M15.5 13.5h.01"/><path d="M7.5 16.5V20M16.5 16.5V20"/>',

  // interface
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'arrow-left': '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.5v.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.5 0-4-1.2-5.2-3l-2-3.3a1.5 1.5 0 0 1 2.5-1.6L8 14"/>',

  chat: '<path d="M20 12.5c0 3.9-3.6 7-8 7-1.2 0-2.4-.2-3.4-.6L4 20l1.2-3.6C4.4 15.3 4 13.9 4 12.5 4 8.6 7.6 5.5 12 5.5s8 3.1 8 7z"/><path d="M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01" stroke-width="2.2"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  'heart-fill': '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" fill="currentColor"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.8-3.4 3.3-5.5 6.5-5.5s5.7 2.1 6.5 5.5"/><path d="M15.5 5.3a3.5 3.5 0 0 1 0 6.4"/><path d="M17.5 14.8c2 .7 3.4 2.5 4 5.2"/>',
  inbox: '<path d="M4 13.5 6.5 5h11l2.5 8.5V19H4z"/><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20"/>',
  sliders: '<path d="M5 6h9M18 6h1M5 12h3M12 12h7M5 18h11M20 18h-1"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  send: '<path d="M4.5 12 20 4.5 15 20l-3-6.5z"/><path d="m12 13.5 8-9"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  delete: '<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/>',
  'arrow-up': '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  tag: '<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><path d="M8 8h.01" stroke-width="2.6"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  sparkle: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><path d="m7 7 2 2M15 15l2 2M17 7l-2 2M9 15l-2 2"/>',
  megaphone: '<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.5 9a4 4 0 0 1 0 6"/><path d="M7 14l1.5 5h2.5l-1-4.5"/>',

  // status: formas diferentes, além da cor
  'status-registrada': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>',
  'status-encaminhada': '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h7.5"/><path d="m12.5 8.8 3.2 3.2-3.2 3.2"/>',
  'status-resolvida': '<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.3 2.6 2.6 4.9-5.2"/>',
  'status-encerrada': '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>',
};

export function iconSvg(name: string, size = 20) {
  const body = ICONS[name] ?? ICONS['info'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
