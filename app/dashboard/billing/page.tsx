import { CreditCardIcon } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      description="Plans, invoices, and usage-based billing are on the way."
      icon={CreditCardIcon}
      label="Billing settings"
    />
  );
}
