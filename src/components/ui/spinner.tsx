import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const sizeVariants = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-3",
} as const;

export interface SpinnerProps extends React.HTMLAttributes<HTMLOutputElement> {
  size?: keyof typeof sizeVariants;
}

const Spinner = forwardRef<HTMLOutputElement, SpinnerProps>(
  ({ className, size = "md", ...props }, ref) => {
    return (
      <output
        ref={ref}
        aria-label="Loading"
        className={cn(
          "animate-spin rounded-full border-muted-foreground/25 border-t-primary",
          sizeVariants[size],
          className,
        )}
        {...props}
      >
        <span className="sr-only">Loading…</span>
      </output>
    );
  },
);

Spinner.displayName = "Spinner";

export { Spinner };
