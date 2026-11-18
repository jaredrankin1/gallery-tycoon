// Small stroke icon set, drawn on a 24px grid. Colour comes from currentColor.
import type { JSX } from 'preact';

const paths: Record<string, JSX.Element> = {
  build: (
    <>
      <path d="M4 20l9-9" />
      <path d="M12 6l3-3 6 6-3 3z" />
      <path d="M11 7l6 6" />
    </>
  ),
  art: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 16l5-5 4 4 3-3 6 6" />
      <circle cx="16" cy="9" r="1.6" />
    </>
  ),
  artists: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5" />
    </>
  ),
  events: (
    <>
      <path d="M7 3h10c0 5-2 8-5 8s-5-3-5-8z" />
      <path d="M12 11v8" />
      <path d="M8 21h8" />
    </>
  ),
  books: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  pause: (
    <>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </>
  ),
  play1: <path d="M8 5l10 7-10 7z" />,
  play2: (
    <>
      <path d="M4 5l8 7-8 7z" />
      <path d="M12 5l8 7-8 7z" />
    </>
  ),
  play3: (
    <>
      <path d="M2 6l6 6-6 6z" />
      <path d="M9 6l6 6-6 6z" />
      <path d="M16 6l6 6-6 6z" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  star: <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M3 20c.6-3.5 3-5.5 6-5.5s5.4 2 6 5.5" />
      <path d="M15.5 14.6c2.6 0 4.6 1.6 5.2 4.6" />
    </>
  ),
  wine: (
    <>
      <path d="M10 2h4v4c2 1 2.5 2.5 2.5 4.5V21h-9V10.5C7.5 8.5 8 7 10 6z" />
      <path d="M7.5 13h9" />
    </>
  ),
  cheese: (
    <>
      <path d="M3 17l15-9 3 3v6z" />
      <path d="M3 17h18" />
      <circle cx="10" cy="15" r="1" />
      <circle cx="16" cy="14" r="1" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  check: <path d="M5 12l5 5 9-10" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
};

export function Icon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
