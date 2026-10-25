"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PanelShellVariant = "center" | "sheet-right" | "compose";

interface PanelShellProps {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  /** Visual motion + placement. Defaults to centered modal. */
  variant?: PanelShellVariant;
  /** Max width of the panel surface. */
  size?: "md" | "lg";
  /** Optional labelled close control; backdrop always closes. */
  showClose?: boolean;
  className?: string;
  surfaceClassName?: string;
}

/**
 * Shared discovery overlay shell — backdrop fade + panel enter motion.
 * Variants map to the motion spec (center, right slide, compose scale).
 */
export function PanelShell({
  titleId,
  onClose,
  children,
  variant = "center",
  size = "md",
  showClose = true,
  className,
  surfaceClassName,
}: PanelShellProps) {
  const isRight = variant === "sheet-right";
  const isCompose = variant === "compose";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex",
        isRight
          ? "items-stretch justify-end"
          : "items-end justify-center sm:items-center sm:p-4",
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="discovery-backdrop absolute inset-0"
        aria-label="Close panel"
        onClick={onClose}
      />

      <div
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-[var(--shadow-panel)]",
          size === "lg" ? "max-w-lg" : "max-w-md",
          isRight
            ? "discovery-slide-right h-full max-h-none rounded-none border-y-0 border-r-0 sm:rounded-l-3xl"
            : isCompose
              ? "discovery-scale-in rounded-t-3xl sm:rounded-3xl"
              : "discovery-slide-up rounded-t-3xl sm:rounded-3xl",
          surfaceClassName,
        )}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
