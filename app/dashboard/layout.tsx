import { cookies } from "next/headers";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toast";
import { requireUser } from "@/lib/auth/utils";
import { getCreditsBalance } from "@/lib/dashboard/voice-cloning/credits";
import { createInsforgeServerClient } from "@/lib/insforge/server";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const [user, cookieStore] = await Promise.all([requireUser(), cookies()]);
  const client = await createInsforgeServerClient();
  const credits = await getCreditsBalance(client, user.id);

  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = sidebarState === undefined ? true : sidebarState === "true";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Toaster />
      <AppSidebar billing={{ credits, plan: "Free" }} user={user} />
      <SidebarInset>
        <div className="flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-semibold">AI Studio</span>
        </div>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
