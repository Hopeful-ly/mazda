import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const colorVariants = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  color?: keyof typeof colorVariants;
  label?: string;
}

const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, value, color = "primary", label, ...props }, ref) => {
    const clamped = Math.max(0, Math.min(100, value));

    return (
      <div ref={ref} className={cn("w-full", className)} {...props}>
        {label && (
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{label}</span>
            <span className="text-muted-foreground">
              {Math.round(clamped)}%
            </span>
          </div>
        )}
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label ?? "Progress"}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300 ease-out",
              colorVariants[color],
            )}
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>
    );
  },
);

ProgressBar.displayName = "ProgressBar";

export { ProgressBar };
