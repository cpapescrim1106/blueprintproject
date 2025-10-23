"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  Gauge,
  Layers3,
  LineChart,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/appointments", label: "Appointments", icon: CalendarRange },
  { href: "/revenue", label: "Revenue", icon: LineChart },
  { href: "/recalls", label: "Recalls", icon: UsersRound },
  { href: "/ingestions", label: "Ingestions", icon: Layers3 },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-col border-r bg-background/95">
      <div className="flex h-14 items-center justify-between px-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Blueprint Ops
        </Link>
        <ThemeToggle />
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2 pb-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
                isActive && "bg-muted text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
        <div className="mt-auto px-3 pt-2 text-xs text-muted-foreground">
          <div className="font-medium uppercase tracking-wide text-muted-foreground/70">
            Resources
          </div>
          <Link
            href="/product"
            className="mt-1 inline-flex text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Product tour
          </Link>
        </div>
      </nav>
    </aside>
  );
}
