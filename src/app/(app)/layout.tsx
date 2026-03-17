"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  if (pathname.startsWith("/reader/")) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      {/* Main content area, offset by sidebar width on desktop */}
      <div className="lg:pl-64">
        <Header onToggleSidebar={toggleSidebar} />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
