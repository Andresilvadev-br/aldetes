import type { SVGProps } from 'react';

// Original stroke icon set for Aldetes (24x24, currentColor).
const paths: Record<string, string> = {
  hash: 'M5 9h14M4 15h14M10 3 8 21M16 3l-2 18',
  send: 'M4 12 20 4l-4 16-4-7-8-1Zm8 1 8-9',
  chat: 'M4 5h16v11H9l-5 4V5Z',
  servers: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7',
  play: 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  pip: 'M3 5h18v14H3zM12 12h7v5h-7z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  speaker: 'M4 9v6h4l5 4V5L8 9H4Zm12.5-.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm8-5 9-3v18l-9-3M7 14v4a2 2 0 0 0 4 0',
  forum: 'M4 5h12v9H8l-4 3V5Zm6 12h6l4 3V9h-2',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0M12 19v3',
  micOff: 'M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M19 12a7 7 0 0 1-1.2 3.9M5 12a7 7 0 0 0 11 5.7M12 19v3',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2v-3Zm16 0a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2v-3Z',
  headphonesOff: 'M3 3l18 18M4 15v-3a8 8 0 0 1 12.7-6.5M20 12v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2v-3Zm13-2h1a2 2 0 0 1 2 2v3',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  camera: 'M3 7h12v10H3zM15 10l6-3v10l-6-3',
  cameraOff: 'M3 3l18 18M15 10l6-3v10l-3-1.5M9 7h6v6M3 7h2v10h10v-2',
  screen: 'M3 4h18v12H3zM8 20h8M12 16v4',
  screenOff: 'M3 4h18v12H3zM8 20h8M12 16v4M9 8l6 4M15 8l-6 4',
  hangup: 'M3 15.5c5-4.7 13-4.7 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-5 0v2.5l-3 1.5L3 15.5Z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-1a6 6 0 0 1 12 0v1M16 3.1a4 4 0 0 1 0 7.8M22 21v-1a6 6 0 0 0-4-5.6',
  user: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-8 10a8 8 0 0 1 16 0',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  pin: 'M15 3 21 9l-4 1-4 4 1 5-2 2-4-4-5 5M5 13l6 6M9 9l4-4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm10 3-5-5',
  at: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  reply: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v4',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  moreH: 'M6 12h.01M12 12h.01M18 12h.01',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5L20 7',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z',
  inbox: 'M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6l2-8Z',
  signal: 'M4 20v-3M9 20v-7M14 20v-11M19 20V4',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  thread: 'M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  file: 'M6 2h8l5 5v15H6V2Zm8 0v5h5',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8Z',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z',
  logout: 'M15 4h4v16h-4M10 17l-5-5 5-5M5 12h11',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  focus: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4',
  maximize: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  volume: 'M4 9v6h4l5 4V5L8 9H4Zm12.5-.5a5 5 0 0 1 0 7',
  volumeOff: 'M4 9v6h4l5 4V5L8 9H4Zm13 0 4 6m0-6-4 6',
  wifiOff: 'M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 4.2-2.4M19 12.6a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.3-2.5M22 8.8A15 15 0 0 0 11 5M12 20h.01',
  palette: 'M12 3a9 9 0 0 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.5 1-2.5 2.5-2.5H18a3 3 0 0 0 3-3c0-6-4-11-9-11ZM7.5 11h.01M10 7h.01M15 7h.01',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  gamepad: 'M7 8h10a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.2 2.2L14 15h-4l-.8.7A3.5 3.5 0 0 1 3 13.5V12a4 4 0 0 1 4-4Zm1 2.5v3M6.5 12h3M15 11h.01M17 13h.01',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z',
  pencilDraft: 'M4 20h4L19 9l-4-4L4 16v4ZM14 20h6',
  sidebar: 'M3 4h18v16H3zM9 4v16',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  flip: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, strokeWidth = 2, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      <path d={paths[name]} />
    </svg>
  );
}

/** Aldetes mark: two leaning capsules form an "A"; the crossbar is a voice dot. Uses currentColor. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Aldetes">
      <rect x="17" y="10" width="10.5" height="44" rx="5.25" fill="currentColor" transform="rotate(21 22.25 32)" />
      <rect x="36.5" y="10" width="10.5" height="44" rx="5.25" fill="currentColor" fillOpacity=".88" transform="rotate(-21 41.75 32)" />
      <circle cx="32" cy="38" r="4.8" fill="none" stroke="currentColor" strokeWidth="3.2" />
    </svg>
  );
}
