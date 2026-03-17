import type { ReactNode } from "react";

interface BookGridProps {
  children: ReactNode;
}

export function BookGrid({ children }: BookGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {children}
    </div>
  );
}
