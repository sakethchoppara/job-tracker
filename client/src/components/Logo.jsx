// Brand mark: three lanes of different heights, the board in miniature.
export default function Logo({ size = 28 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="8" className="logo-plate" />
      <rect x="7" y="7" width="3.5" height="14" rx="1.75" className="logo-lane" />
      <rect x="12.25" y="7" width="3.5" height="9" rx="1.75" className="logo-lane" />
      <rect x="17.5" y="7" width="3.5" height="11.5" rx="1.75" className="logo-lane accent" />
    </svg>
  );
}
