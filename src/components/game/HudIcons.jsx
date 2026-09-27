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
