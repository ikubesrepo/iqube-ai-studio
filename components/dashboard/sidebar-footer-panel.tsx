import Link from "next/link";
import { CreditCardIcon, LogOutIcon, ZapIcon } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

type SidebarUser = {
  email: string;
  profile?: { name?: string | null; avatar_url?: string | null } | null;
};

type BillingInfo = {
  credits: number;
  plan?: string;
};

const DEFAULT_BILLING: BillingInfo = { credits: 250, plan: "Free" };

function getInitial(user: SidebarUser) {
  const source = user.profile?.name || user.email;
  return source?.charAt(0)?.toUpperCase() || "?";
}

export function SidebarFooterPanel({
  user,
  billing = DEFAULT_BILLING,
}: {
  user: SidebarUser;
  billing?: BillingInfo;
}) {
  const displayName = user.profile?.name || user.email?.split("@")[0] || "Account";

  return (
    <SidebarFooter>
      <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2 text-sidebar-foreground/80">
          <ZapIcon className="size-4 text-primary" />
          <span className="text-xs font-medium group-data-[collapsible=icon]:hidden">Available credits</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:justify-center">
          <span className="text-lg font-semibold tracking-[-0.02em] text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            {billing.credits}
          </span>
          {billing.plan ? (
            <Badge className="group-data-[collapsible=icon]:hidden" variant="secondary">
              {billing.plan}
            </Badge>
          ) : null}
        </div>
      </div>

      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton render={<Link href="/dashboard/billing" />} tooltip="Billing settings">
            <CreditCardIcon />
            <span>Billing settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <SidebarSeparator />

      <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <Avatar size="sm">
          <AvatarImage src={user.profile?.avatar_url ?? undefined} />
          <AvatarFallback>{getInitial(user)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</p>
          <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
        </div>
        <form action={signOutAction}>
          <Button aria-label="Sign out" className="shrink-0" size="icon-sm" type="submit" variant="ghost">
            <LogOutIcon />
          </Button>
        </form>
      </div>
    </SidebarFooter>
  );
}
