"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
};

export function SubmitButton({
  children,
  pendingLabel,
  variant = "default",
  size = "lg",
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button className={className} disabled={pending} size={size} variant={variant} type="submit">
      {pending ? (
        <>
          <Spinner className="size-4" />
          {pendingLabel || children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
