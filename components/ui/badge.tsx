import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-[var(--surface-elevated)] text-[var(--foreground)]",
        mock: "bg-[var(--mock-bg)] text-[var(--mock-fg)] border border-[var(--mock-border)]",
        place: "bg-[var(--marker-place-soft)] text-[var(--marker-place)]",
        event: "bg-[var(--marker-event-soft)] text-[var(--marker-event)]",
        person: "bg-[var(--marker-person-soft)] text-[var(--marker-person)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
