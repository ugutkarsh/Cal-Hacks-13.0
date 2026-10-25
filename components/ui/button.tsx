import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[transform,background-color,box-shadow,color,border-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] hover:shadow-md active:translate-y-0 motion-reduce:transform-none",
        secondary:
          "bg-[var(--surface-elevated)] text-[var(--foreground)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:-translate-y-0.5 motion-reduce:transform-none",
        ghost: "hover:bg-[var(--surface-hover)] text-[var(--foreground)]",
        outline:
          "border border-[var(--border)] bg-transparent hover:bg-[var(--surface-hover)] hover:-translate-y-0.5 motion-reduce:transform-none",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";
