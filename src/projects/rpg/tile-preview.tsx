import { useEffect, useState } from "react";
import type { TileSheet } from "./tiles";
import { animSrcCol, sheetForTileSrc } from "./tile-anim";
import { familyDisplayName, getTileImage, isVariantSrc } from "./tile-variants";
import type { SelectedTile } from "./tile-selection";

/** Ticker driving animated tile previews; idle when inactive. */
export function useAnimTick(active: boolean, fps: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(performance.now()), 1000 / fps);
    return () => window.clearInterval(id);
  }, [active, fps]);
  return now;
}

/** Image URL for a palette cell, following synthesized variants (async). */
function useTileImageUrl(src: string): string {
  const [prevSrc, setPrevSrc] = useState(src);
  const [url, setUrl] = useState(() => (isVariantSrc(src) ? "" : src));
  // Plain sheets resolve synchronously during render (the documented
  // render-time state adjustment, not an effect cascade); variant sheets
  // resolve async via the effect below.
  if (prevSrc !== src) {
    setPrevSrc(src);
    setUrl(isVariantSrc(src) ? "" : src);
  }
  useEffect(() => {
    if (!isVariantSrc(src)) return;
    let live = true;
    const img = getTileImage(src);
    const update = () => {
      if (live && img.complete && img.naturalWidth > 0) setUrl(img.src);
    };
    update();
    img.addEventListener("load", update);
    return () => {
      live = false;
      img.removeEventListener("load", update);
    };
  }, [src]);
  return url;
}

export function CellPreview({
  src,
  width,
  height,
  offsetX,
  offsetY,
}: {
  src: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}) {
  const url = useTileImageUrl(src);
  if (url === "") return <span className="block" style={{ width, height }} />;
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- sprite-sheet cell previews need raw offsets that next/image cannot express */
    <img
      src={url}
      alt=""
      draggable={false}
      className="block max-w-none"
      style={{ width, height, marginLeft: offsetX, marginTop: offsetY }}
    />
  );
}

/** Selected-tile preview; cycles frames when the selected src is an animated
 * sheet (same global-clock math as the palette cells). */
function SelectedPreview({
  selected,
  sheet,
}: {
  selected: SelectedTile;
  sheet: TileSheet;
}) {
  const anim = sheet.anim;
  const now = useAnimTick(anim !== undefined, anim?.fps ?? 1);
  const srcCol =
    anim === undefined
      ? selected.sx
      : animSrcCol(sheet, selected.sx, now, selected.sx, selected.sy);
  return (
    <span
      className="block overflow-hidden rounded-sm border border-brand-orange"
      style={{ width: 32, height: 32 }}
    >
      <CellPreview
        src={selected.src}
        width={sheet.cols * 32}
        height={sheet.rows * 32}
        offsetX={-srcCol * 32}
        offsetY={-selected.sy * 32}
      />
    </span>
  );
}

function selectedTileLabel(selected: SelectedTile | null): string {
  if (selected === null) return "No tile selected";
  const name =
    selected.src === selected.sheet.src
      ? (familyDisplayName(selected.sheet.src) ?? selected.sheet.name)
      : (selected.src.split("/").pop()?.replace(/\.png$/, "") ??
        selected.sheet.name);
  return `${name} (${selected.sx}, ${selected.sy})`;
}

/** Header readout of the brush tile: animated preview plus name and cell. */
export function SelectedTileSummary({
  selected,
}: {
  selected: SelectedTile | null;
}) {
  const label = selectedTileLabel(selected);
  return (
    <>
      <span
        data-testid="selected-preview"
        className="flex items-center"
        title={label}
      >
        {selected === null ? (
          <span
            data-testid="selected-preview-empty"
            aria-label="No tile selected"
            className="flex items-center justify-center rounded-sm border border-dashed border-border-default text-sm text-text-muted"
            style={{ width: 32, height: 32 }}
          >
            –
          </span>
        ) : (
          <SelectedPreview
            selected={selected}
            sheet={sheetForTileSrc(selected.src) ?? selected.sheet}
          />
        )}
      </span>
      <span data-testid="selected-tile" className="text-sm text-text-secondary">
        {label}
      </span>
    </>
  );
}
