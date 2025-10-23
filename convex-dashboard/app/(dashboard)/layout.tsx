import type { ReactNode } from "react";
import { SidebarNav } from "@/components/SidebarNav";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-muted/30 text-foreground">
      <SidebarNav />
      <div className="flex min-h-screen flex-1 flex-col bg-background">
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
