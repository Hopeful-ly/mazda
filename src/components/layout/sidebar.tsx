"use client";

import {
  BookOpen,
  LayoutDashboard,
  Library,
  LogOut,
  Plus,
  Settings,
  Shield,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/library", label: "Library", icon: Library },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const overlayRef = useRef<HTMLButtonElement>(null);

  const { data: user } = trpc.auth.me.useQuery();
  const { data: collections } = trpc.collections.list.useQuery(undefined, {
    enabled: !!user,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await fetch("/api/auth/session", { method: "DELETE" });
      router.push("/login");
    },
  });

  function handleLogout() {
    logoutMutation.mutate();
  }

  function handleNavClick(href: string) {
    router.push(href);
    onClose();
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) {
      onClose();
    }
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <button
          ref={overlayRef}
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={handleOverlayClick}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 flex h-full w-64 flex-col border-r border-border bg-background transition-transform duration-200 lg:translate-x-0 lg:z-30",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <button
            type="button"
            onClick={() => handleNavClick("/dashboard")}
            className="flex items-center gap-2"
          >
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold text-foreground">Mazda</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-accent lg:hidden"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => handleNavClick(item.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}

            {/* Admin link - only for ADMIN role */}
            {user?.role === "ADMIN" && (
              <button
                type="button"
                onClick={() => handleNavClick("/admin")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Shield className="h-4 w-4" />
                Admin
              </button>
            )}
          </div>

          {/* Collections section */}
          <div className="mt-6">
            <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Collections
            </h3>
            <div className="space-y-1">
              {collections?.map(
                (collection: {
                  id: string;
                  name: string;
                  color: string | null;
                  _count: { items: number };
                }) => (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() =>
                      handleNavClick(`/library?collection=${collection.id}`)
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: collection.color ?? "#6366f1",
                      }}
                    />
                    <span className="truncate">{collection.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {collection._count.items}
                    </span>
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              onClick={() => handleNavClick("/library?newCollection=true")}
              className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              New Collection
            </button>
          </div>
        </nav>

        {/* User info + logout */}
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.username ?? "..."}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email ?? ""}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
