/**
 * One stroke-based icon set, drawn on a 24×24 grid at 1.75 stroke so the whole
 * app shares a single weight. Everything inherits currentColor.
 */
const PATHS = {
  trophy: 'M7 4h10v6a5 5 0 0 1-10 0V4Zm10 1h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3M12 15v3m-4 3h8l-1-3H9l-1 3Z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16.5 11.5a3 3 0 0 0 0-6M18 20a6 6 0 0 0-2-4.5',
  bracket: 'M3 6h4a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3h4M3 18h4M17 12h4M17 6l4 3-4 3M17 15l4 3-4 3',
  settings: 'M6 5h12M6 12h12M6 19h12M9 5v0m0 0a1.5 1.5 0 1 0 0 .01M15 12a1.5 1.5 0 1 0 .01 0M9 19a1.5 1.5 0 1 0 .01 0',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M4 12.5 9.5 18 20 6.5',
  x: 'M6 6l12 12M18 6 6 18',
  chevronRight: 'm9 5 7 7-7 7',
  chevronLeft: 'm15 5-7 7 7 7',
  chevronDown: 'm5 9 7 7 7-7',
  chevronUp: 'm5 15 7-7 7 7',
  arrowUp: 'M12 19V5m0 0-6 6m6-6 6 6',
  arrowDown: 'M12 5v14m0 0 6-6m-6 6-6-6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  refresh: 'M20 11A8 8 0 0 0 6.3 6.3L4 8.5M4 5v3.5h3.5M4 13a8 8 0 0 0 13.7 4.7L20 15.5M20 19v-3.5h-3.5',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  sheet: 'M6 3h8l4 4v14H6V3Zm8 0v4h4M9 12h6M9 16h6',
  link: 'M10 13a4 4 0 0 0 6 .5l2-2A4 4 0 1 0 12.5 6L11 7.5M14 11a4 4 0 0 0-6-.5l-2 2A4 4 0 0 0 11.5 18L13 16.5',
  shuffle: 'M17 4l3 3-3 3M17 14l3 3-3 3M4 7h4l8 10h4M20 7h-4l-2 2.5M4 17h4l2-2.5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11Z',
  unlock: 'M7 11V8a5 5 0 0 1 9.5-2M5 11h14v10H5V11Z',
  alert: 'M12 4 2.5 20h19L12 4Zm0 6v5m0 3v.01',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14',
  edit: 'M4 20h4L20 8l-4-4L4 16v4Zm11-13 4 4',
  back: 'M20 12H4m0 0 6-6m-6 6 6 6',
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 20,
  className = '',
  strokeWidth = 1.75,
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
