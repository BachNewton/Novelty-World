import { cn } from "@/shared/lib/utils";
import { type HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 border-border-default bg-surface-secondary",
        className
      )}
      {...props}
    />
  );
}
