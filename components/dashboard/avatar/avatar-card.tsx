"use client";

import { useTransition } from "react";
import { CheckIcon } from "lucide-react";

import { setActiveAvatarAction } from "@/app/actions/avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AvatarCardProps = {
  imageUrl: string;
  label: string;
  isActive?: boolean;
  avatarId?: string;
  defaultSrc?: string;
};

export function AvatarCard({ imageUrl, label, isActive = false, avatarId, defaultSrc }: AvatarCardProps) {
  const [isPending, startTransition] = useTransition();

  function handleSetActive() {
    startTransition(async () => {
      const formData = new FormData();
      if (avatarId) formData.set("avatarId", avatarId);
      if (defaultSrc) formData.set("defaultSrc", defaultSrc);
      await setActiveAvatarAction(formData);
    });
  }

  return (
    <div className="group relative overflow-hidden rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card shadow-xs transition-all duration-200 hover:border-primary/50 hover:shadow-[0_20px_45px_-30px_rgba(15,124,255,0.45)]">
      <div className="relative aspect-square w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={label}
          className="size-full object-cover object-[50%_15%] transition-[object-position] duration-700 group-hover:object-[50%_85%]"
          src={imageUrl}
        />
        {isActive ? (
          <Badge className="absolute top-2 right-2 gap-1" variant="secondary">
            <CheckIcon className="size-3" />
            Active
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        <Button disabled={isActive || isPending} onClick={handleSetActive} size="sm" variant={isActive ? "secondary" : "outline"}>
          {isActive ? "Active" : "Set as active"}
        </Button>
      </div>
    </div>
  );
}
