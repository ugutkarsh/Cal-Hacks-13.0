import { cn } from "@/lib/utils";

interface TrailmapMarkProps {
  className?: string;
}

/** Trailmap mark: a place pin set on map contour lines. */
export function TrailmapMark({ className }: TrailmapMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path
        d="M6.5 21.5c3.4-2.3 6.4-2.3 9.2 0 2.8 2.3 5.8 2.3 9.3 0"
        stroke="#ffffff"
        strokeOpacity="0.72"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M6.5 25.4c3.4-2.3 6.4-2.3 9.2 0 2.8 2.3 5.8 2.3 9.3 0"
        stroke="#ffffff"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M16 4.6c-3.2 0-5.5 2.4-5.5 5.35 0 3.95 5.5 9.7 5.5 9.7s5.5-5.75 5.5-9.7c0-2.95-2.3-5.35-5.5-5.35z"
        fill="#ffffff"
      />
      <circle cx="16" cy="9.85" r="1.9" fill="#e08a4f" />
    </svg>
  );
}
