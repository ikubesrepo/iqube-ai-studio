import { ComingSoon } from "@/components/dashboard/coming-soon";
import { DASHBOARD_FEATURES } from "@/lib/dashboard/nav-config";

const feature = DASHBOARD_FEATURES.find((item) => item.slug === "avatar")!;

export default function Page() {
  return <ComingSoon description={feature.description} icon={feature.icon} label={feature.label} />;
}
