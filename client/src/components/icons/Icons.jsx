const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function HomeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function RssIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CalendarIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4.5" width="18" height="17" rx="3" />
      <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
    </svg>
  );
}

export function IdIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8" cy="11" r="2" />
      <path d="M5.5 16c.6-1.6 1.5-2.3 2.5-2.3s1.9.7 2.5 2.3" />
      <path d="M13.5 9.5H19M13.5 12.5H17" />
    </svg>
  );
}

export function BotIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4.5M9 4.5h6" />
      <circle cx="9" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
      <path d="M9.5 16.5h5" />
    </svg>
  );
}

export function ShieldIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.5 4.5 5.5v6c0 4.5 3.2 7.8 7.5 9.5 4.3-1.7 7.5-5 7.5-9.5v-6L12 2.5Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </svg>
  );
}

export function UsersIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.7-3 2.8-4.5 5.5-4.5s4.8 1.5 5.5 4.5" />
      <path d="M16 5.4a3.2 3.2 0 0 1 0 5.2M17.8 14.8c1.7.8 2.7 2.2 3 4.2" />
    </svg>
  );
}

export function BellIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 4 .8 5.8 2 7h-16c1.2-1.2 2-3 2-7" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

export function SearchIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function LogOutIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="m9.5 8-4 4 4 4M5.5 12H16" />
    </svg>
  );
}

export function XIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function PlusIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function QrIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M18 18h3v3h-3z" />
    </svg>
  );
}

export function CameraIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h1.2l1.6-2h6.4l1.6 2H18a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-8Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );
}

export function FlashIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M13 2.5 4.5 13.5H11l-1 8L18.5 10.5H12l1-8Z" />
    </svg>
  );
}

export function HeartIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 20.5S3.5 15.5 3.5 9.2A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.5 2.6c0 6.3-8.5 11.3-8.5 11.3Z" />
    </svg>
  );
}

export function ShareIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="m8.2 10.8 7.6-4.3M8.2 13.2l7.6 4.3" />
    </svg>
  );
}

export function ExternalIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10.5 13.5" />
      <path d="M19 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5" />
    </svg>
  );
}

export function StarIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />
    </svg>
  );
}

export function ClockIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function MapPinIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function AlertIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 9.5v5M12 17.2v.01" />
    </svg>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m14.5 5-7 7 7 7" />
    </svg>
  );
}

export function ChevronRightIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m9.5 5 7 7-7 7" />
    </svg>
  );
}

export function GithubIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.25 10.25 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export function TerminalIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m7 9 3 3-3 3M12.5 15H17" />
    </svg>
  );
}

export function SendIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20.5 3.5 3 11.5l6.5 2.5M20.5 3.5 13.5 21l-4-7M20.5 3.5 9.5 14" />
    </svg>
  );
}

export function SparkIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.5 14.5 9l6.5 2.5L14.5 14 12 20.5 9.5 14 3 11.5 9.5 9 12 2.5Z" />
    </svg>
  );
}

export function BoxIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m12 2.5 8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5L12 2.5Z" />
      <path d="m3.7 7.3 8.3 4.6 8.3-4.6M12 21v-9" />
    </svg>
  );
}
