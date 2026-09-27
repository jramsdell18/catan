/** Small inline SVG icons for the board overlay controls (no text, so labels stay exact). */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.1,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

export function DiceIcon({ size = 28 }) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function EndTurnIcon({ size = 28 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M5 5l8 7-8 7z" />
      <path d="M17 5v14" />
    </svg>
  );
}

export function RoadIcon({ size = 26 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M5 19L19 5" strokeWidth="4.2" />
    </svg>
  );
}

export function SettlementIcon({ size = 26 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 11l8-7 8 7v9H4z" />
    </svg>
  );
}

export function CityIcon({ size = 26 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M3 20V11l5-4 5 4v9z" />
      <path d="M13 20V9h8v11z" />
    </svg>
  );
}

export function CardsIcon({ size = 26 }) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="7" y="3.5" width="12" height="16" rx="2" />
      <path d="M5 7v12a2 2 0 0 0 2 2h9" />
    </svg>
  );
}

export function CameraResetIcon({ size = 22 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function RestartIcon({ size = 22 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

export function GearIcon({ size = 22 }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function HammerIcon({ size = 26 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M14 7l-9.5 9.5a1.8 1.8 0 0 0 2.5 2.5L16.5 9.5" />
      <path d="M12.5 5.5L15 3l6 6-2.5 2.5-2-2-1.5 1.5-3-3 1.5-1.5z" />
    </svg>
  );
}

export function LinkIcon({ size = 20 }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}
