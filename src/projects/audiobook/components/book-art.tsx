import Image from "next/image";
import { Headphones } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { fileUrl } from "../catalog";

/** A square of art: a cover, a chapter's image or a photo, or a headphones tile when there's none.
 *  `contain` shows the whole picture, letterboxed, for photos that a square would crop. */
export function BookArt({
  path,
  alt,
  fit = "cover",
  sizes = "(max-width: 640px) 100vw, 28rem",
  className,
}: {
  path: string | undefined;
  alt: string;
  fit?: "cover" | "contain";
  sizes?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-xl", fit === "cover" ? "bg-surface-elevated" : "bg-surface-secondary", className)}>
      {path === undefined ? (
        <div className="flex size-full items-center justify-center bg-linear-to-br from-brand-pink/40 via-surface-elevated to-brand-blue/40">
          <Headphones className="size-1/3 text-text-primary/70" aria-label={alt} />
        </div>
      ) : (
        // Unoptimised: the bucket serves the file as it is, so the image never goes through the server.
        <Image src={fileUrl(path)} alt={alt} fill unoptimized sizes={sizes} className={fit === "cover" ? "object-cover" : "object-contain"} />
      )}
    </div>
  );
}
