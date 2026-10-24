import Image from "next/image";
import { Headphones } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { fileUrl } from "../catalog";

/**
 * A square space for art. A cover, or a headphones tile when there's none,
 * fills it; a photo (`contain`) is shown whole at its own shape, centred in it,
 * so its own corners are the ones rounded. `raised` gives the picture a shadow.
 */
export function BookArt({
  path,
  alt,
  fit = "cover",
  raised = false,
  sizes = "(max-width: 640px) 100vw, 28rem",
  className,
}: {
  path: string | undefined;
  alt: string;
  fit?: "cover" | "contain";
  raised?: boolean;
  sizes?: string;
  className?: string;
}) {
  if (path === undefined) {
    return (
      <div className={cn("relative aspect-square overflow-hidden rounded-lg", raised && "shadow-lg", className)}>
        <div className="flex size-full items-center justify-center bg-linear-to-br from-brand-pink/40 via-surface-elevated to-brand-blue/40">
          <Headphones className="size-1/3 text-text-primary/70" aria-label={alt} />
        </div>
      </div>
    );
  }
  // Unoptimised: the bucket serves the file as it is, so the image never goes through the server.
  if (fit === "cover") {
    return (
      <div className={cn("relative aspect-square overflow-hidden rounded-lg bg-surface-elevated", raised && "shadow-lg", className)}>
        <Image src={fileUrl(path)} alt={alt} fill unoptimized sizes={sizes} className="object-cover" />
      </div>
    );
  }
  return (
    <div className={cn("flex aspect-square items-center justify-center", className)}>
      {/* Width and height 0 leave the sizing to CSS: the photo's own shape, as large as the square allows. */}
      <Image
        src={fileUrl(path)}
        alt={alt}
        width={0}
        height={0}
        unoptimized
        sizes={sizes}
        className={cn("h-auto max-h-full w-auto max-w-full rounded-lg", raised && "shadow-lg")}
      />
    </div>
  );
}
