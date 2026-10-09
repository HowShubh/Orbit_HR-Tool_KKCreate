"use client";

import * as React from "react";
import { cn, initials, avatarGradient } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  src?: string | null;
  ring?: boolean;
  /** Override the generated initials (e.g. team initials like "SF"). */
  fallbackText?: string;
}

const sizeMap = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
  xl: "h-14 w-14 text-base",
};

export function Avatar({ name, size = "md", src, ring, fallbackText, className, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white bg-gradient-to-br shadow-sm",
        avatarGradient(name),
        sizeMap[size],
        ring && "ring-2 ring-white",
        className
      )}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span>{fallbackText ?? initials(name)}</span>
      )}
    </div>
  );
}

export function AvatarStack({
  names,
  max = 4,
  size = "sm",
}: {
  names: string[];
  max?: number;
  size?: AvatarProps["size"];
}) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((n) => (
        <Avatar key={n} name={n} size={size} ring />
      ))}
      {overflow > 0 && (
        <div className="ring-2 ring-white inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          +{overflow}
        </div>
      )}
    </div>
  );
}
