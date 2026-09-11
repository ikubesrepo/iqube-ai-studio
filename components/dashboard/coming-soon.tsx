import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type ComingSoonProps = {
  label: string;
  description: string;
  icon: LucideIcon;
};

export function ComingSoon({ label, description, icon: Icon }: ComingSoonProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-[calc(var(--radius)*2)] border border-border/60 bg-card/60 p-10 text-center">
      <div className="mb-5 inline-flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon className="size-6" />
      </div>
      <h1 className="font-heading text-2xl font-semibold tracking-[-0.03em]">{label}</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      <Badge className="mt-6" variant="secondary">
        Coming soon
      </Badge>
    </div>
  );
}
