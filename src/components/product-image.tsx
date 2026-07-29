import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ProductImageProps = {
  src?: string | null;
  name: string;
  className?: string;
  imageClassName?: string;
  eager?: boolean;
  sizes?: string;
};

export function ProductImage({
  src,
  name,
  className,
  imageClassName,
  eager = false,
  sizes,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className={cn(
        "relative grid overflow-hidden bg-gradient-to-br from-accent to-muted",
        className,
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
          sizes={sizes}
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-cover", imageClassName)}
        />
      ) : (
        <span className="m-auto font-display text-3xl font-bold text-brand/60">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}
