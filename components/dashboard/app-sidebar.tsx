"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon } from "lucide-react";

import { SidebarFooterPanel } from "@/components/dashboard/sidebar-footer-panel";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { DASHBOARD_FEATURES } from "@/lib/dashboard/nav-config";

type SidebarUser = {
  email: string;
  profile?: { name?: string | null; avatar_url?: string | null } | null;
};

export function AppSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          className="flex items-center gap-3 px-1 py-1.5 text-sm font-semibold tracking-[0.18em] text-sidebar-foreground/85"
          href="/dashboard"
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),color-mix(in_oklch,var(--accent),white_12%))] text-sm font-bold text-primary-foreground shadow-[0_24px_60px_-26px_rgba(15,124,255,0.85)]">
            AI
          </span>
          <span className="group-data-[collapsible=icon]:hidden">STUDIO</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={pathname === "/dashboard"} render={<Link href="/dashboard" />} tooltip="Home">
                <HomeIcon />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {DASHBOARD_FEATURES.map((feature) => (
              <SidebarMenuItem key={feature.slug}>
                <SidebarMenuButton
                  isActive={pathname === feature.href}
                  render={<Link href={feature.href} />}
                  tooltip={feature.label}
                >
                  <feature.icon />
                  <span>{feature.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooterPanel user={user} />

      <SidebarRail />
    </Sidebar>
  );
}
