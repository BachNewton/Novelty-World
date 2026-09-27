import Image from "next/image";
import type { CSSProperties } from "react";
import { FLAGS } from "../flags";
import type { HeritageCode } from "../heritages";

interface FlagProps {
  code: HeritageCode;
  // Size one dimension; the other follows the flag's official proportions.
  className?: string;
  style?: CSSProperties;
}

export function Flag({ code, className, style }: FlagProps) {
  const flag = FLAGS[code];
  return (
    <Image
      src={flag.src}
      width={flag.width}
      height={flag.height}
      alt=""
      aria-hidden
      draggable={false}
      className={className}
      style={{ aspectRatio: `${flag.width} / ${flag.height}`, ...style }}
    />
  );
}
