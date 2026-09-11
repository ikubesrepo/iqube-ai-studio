import { FeatureCard } from "@/components/dashboard/feature-card";
import { DASHBOARD_FEATURES } from "@/lib/dashboard/nav-config";
import { getCurrentUser } from "@/lib/auth/utils";

export default async function DashboardHomePage() {
  const user = await getCurrentUser();
  const [agent, videoAvatar, avatar, voiceCloning, library] = DASHBOARD_FEATURES;

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-semibold tracking-[0.18em] text-primary/75">DASHBOARD</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">
          Welcome back, {user?.profile?.name || user?.email?.split("@")[0] || "creator"}.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Pick up where you left off, or start something new.</p>
      </header>

      <div className="grid auto-rows-[220px] gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <FeatureCard className="sm:col-span-2 lg:col-span-2 lg:row-span-2" feature={agent} />
        <FeatureCard className="lg:col-span-2" feature={videoAvatar} />
        <FeatureCard feature={avatar} />
        <FeatureCard feature={voiceCloning} />
        <FeatureCard className="sm:col-span-2 lg:col-span-4" feature={library} />
      </div>
    </div>
  );
}
