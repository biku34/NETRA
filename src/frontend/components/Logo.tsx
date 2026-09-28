// Netra mark: an eye on the navy tile (from the mockup's favicon).
export default function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <rect width="64" height="64" rx="12" fill="#1B3A6B" />
      <path
        d="M8 32c6.5-10 14.5-15 24-15s17.5 5 24 15c-6.5 10-14.5 15-24 15S14.5 42 8 32z"
        fill="#fff"
      />
      <circle cx="32" cy="32" r="9.5" fill="#1B3A6B" />
      <circle cx="32" cy="32" r="3.5" fill="#fff" />
    </svg>
  );
}
