/** The purgeit mark: a list being swept away. Uses the theme's primary color. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20 30h60M20 50h45M20 70h30" />
      <path d="M75 55l10 15-10 15" />
    </svg>
  );
}
