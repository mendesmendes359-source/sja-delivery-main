import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type BrandLogoProps = Omit<ComponentProps<"img">, "src" | "width" | "height">;

export function BrandLogo({ alt = "", className, ...props }: BrandLogoProps) {
  return (
    <img
      src="/images/brand/sja-logo.png"
      width={512}
      height={512}
      alt={alt}
      className={cn("shrink-0 object-contain", className)}
      {...props}
    />
  );
}
