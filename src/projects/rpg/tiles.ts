export interface TileAnim {
  frames: number;
  frameW: number;
  mode: "loop" | "pingpong";
  fps: number;
  sync?: boolean;
}

export interface TileSheet {
  src: string;
  name: string;
  category: string;
  cols: number;
  rows: number;
  anim?: TileAnim;
}

export const CELL_PX = 16;

/** Rewrite pre-move `/tiles/...` stored paths to their `/rpg/tiles/...` home. */
export function migrateTileSrc(src: string): string {
  return src.startsWith('/tiles/') ? `/rpg${src}` : src;
}

export const TILE_SHEETS: TileSheet[] = [
  { src: "/rpg/tiles/Beach/Beach_Decor_Tiles.png", name: "Beach_Decor_Tiles", category: "Beach", cols: 2, rows: 2 },
  { src: "/rpg/tiles/Beach/Beach_Tiles.png", name: "Beach_Tiles", category: "Beach", cols: 30, rows: 3, anim: { frames: 6, frameW: 5, mode: "loop", fps: 6, sync: true } },
  { src: "/rpg/tiles/Bridge/Bridge_Stone_Horizontal.png", name: "Bridge_Stone_Horizontal", category: "Bridge", cols: 12, rows: 7 },
  { src: "/rpg/tiles/Bridge/Bridge_Stone_Vertical.png", name: "Bridge_Stone_Vertical", category: "Bridge", cols: 4, rows: 6 },
  { src: "/rpg/tiles/Bridge/Bridge_Wood.png", name: "Bridge_Wood", category: "Bridge", cols: 9, rows: 4 },
  { src: "/rpg/tiles/Bridge/Bridge_Wood_1.png", name: "Bridge_Wood_1", category: "Bridge", cols: 6, rows: 4 },
  { src: "/rpg/tiles/Cave/Cave_Doorway_1.png", name: "Cave_Doorway_1", category: "Cave", cols: 2, rows: 6 },
  { src: "/rpg/tiles/Cave/Cave_Floor_1.png", name: "Cave_Floor_1", category: "Cave", cols: 3, rows: 5 },
  { src: "/rpg/tiles/Cave/Cave_Floor_2.png", name: "Cave_Floor_2", category: "Cave", cols: 3, rows: 5 },
  { src: "/rpg/tiles/Cave/Cave_Floor_Decoration.png", name: "Cave_Floor_Decoration", category: "Cave", cols: 3, rows: 1 },
  { src: "/rpg/tiles/Cave/Cave_Floor_Ladder.png", name: "Cave_Floor_Ladder", category: "Cave", cols: 1, rows: 1 },
  { src: "/rpg/tiles/Cave/Cave_Floor_Middle.png", name: "Cave_Floor_Middle", category: "Cave", cols: 1, rows: 1 },
  { src: "/rpg/tiles/Cave/Cave_Support_1.png", name: "Cave_Support_1", category: "Cave", cols: 5, rows: 6 },
  { src: "/rpg/tiles/Cave/Cave_Support_2.png", name: "Cave_Support_2", category: "Cave", cols: 3, rows: 7 },
  { src: "/rpg/tiles/Cave/Cave_Wall_Support.png", name: "Cave_Wall_Support", category: "Cave", cols: 5, rows: 2 },
  { src: "/rpg/tiles/Cave/Cave_Walls.png", name: "Cave_Walls", category: "Cave", cols: 7, rows: 8 },
  { src: "/rpg/tiles/Cave/Cave_Water.png", name: "Cave_Water", category: "Cave", cols: 7, rows: 5 },
  { src: "/rpg/tiles/Cave/Cave_Water_Animation.png", name: "Cave_Water_Animation", category: "Cave", cols: 56, rows: 5, anim: { frames: 8, frameW: 7, mode: "pingpong", fps: 8 } },
  { src: "/rpg/tiles/Cave/Rails.png", name: "Rails", category: "Cave", cols: 7, rows: 3 },
  { src: "/rpg/tiles/Cliff/Cave_Entrance.png", name: "Cave_Entrance", category: "Cliff", cols: 2, rows: 3 },
  { src: "/rpg/tiles/Cliff/Stone_Cliff_1_Cave_Entrance.png", name: "Stone_Cliff_1_Cave_Entrance", category: "Cliff", cols: 3, rows: 3 },
  { src: "/rpg/tiles/Cliff/Stone_Cliff_1_Tile.png", name: "Stone_Cliff_1_Tile", category: "Cliff", cols: 14, rows: 6 },
  { src: "/rpg/tiles/Cobble_Road/Cobble_Road_1.png", name: "Cobble_Road_1", category: "Cobble_Road", cols: 3, rows: 5 },
  { src: "/rpg/tiles/FarmLand/FarmLand_Tile.png", name: "FarmLand_Tile", category: "FarmLand", cols: 7, rows: 8 },
  { src: "/rpg/tiles/FarmLand/FarmLand_Wet_Tile.png", name: "FarmLand_Wet_Tile", category: "FarmLand", cols: 7, rows: 8 },
  { src: "/rpg/tiles/Grass/Grass_1_Middle.png", name: "Grass_1_Middle", category: "Grass", cols: 1, rows: 1 },
  { src: "/rpg/tiles/Grass/Grass_Tiles_1.png", name: "Grass_Tiles_1", category: "Grass", cols: 16, rows: 10 },
  { src: "/rpg/tiles/Grass/Path_Decoration.png", name: "Path_Decoration", category: "Grass", cols: 3, rows: 1 },
  { src: "/rpg/tiles/Grass/Path_Middle.png", name: "Path_Middle", category: "Grass", cols: 1, rows: 1 },
  { src: "/rpg/tiles/Hedge_Tiles.png", name: "Hedge_Tiles", category: "Misc", cols: 4, rows: 4 },
  { src: "/rpg/tiles/Pavement_Tiles.png", name: "Pavement_Tiles", category: "Misc", cols: 9, rows: 8 },
  { src: "/rpg/tiles/Picnic_Blankets.png", name: "Picnic_Blankets", category: "Misc", cols: 6, rows: 6 },
  { src: "/rpg/tiles/Water/Fish_Animated_Tile.png", name: "Fish_Animated_Tile", category: "Water", cols: 16, rows: 1, anim: { frames: 16, frameW: 1, mode: "loop", fps: 8 } },
  { src: "/rpg/tiles/Water/Water_Decoration.png", name: "Water_Decoration", category: "Water", cols: 3, rows: 1 },
  { src: "/rpg/tiles/Water/Water_Foam_Animation.png", name: "Water_Foam_Animation", category: "Water", cols: 20, rows: 3, anim: { frames: 4, frameW: 5, mode: "loop", fps: 6 } },
  { src: "/rpg/tiles/Water/Water_Middle.png", name: "Water_Middle", category: "Water", cols: 1, rows: 1 },
  { src: "/rpg/tiles/Water/Water_Middle_Anim_1.png", name: "Water_Middle_Anim_1", category: "Water", cols: 8, rows: 1, anim: { frames: 8, frameW: 1, mode: "loop", fps: 6 } },
  { src: "/rpg/tiles/Water/Water_Middle_Anim_2.png", name: "Water_Middle_Anim_2", category: "Water", cols: 14, rows: 1, anim: { frames: 14, frameW: 1, mode: "loop", fps: 6 } },
  { src: "/rpg/tiles/Water/Water_Stone_Tile_1.png", name: "Water_Stone_Tile_1", category: "Water", cols: 3, rows: 5 },
  { src: "/rpg/tiles/Water/Water_Stone_Tile_1_Anim.png", name: "Water_Stone_Tile_1_Anim", category: "Water", cols: 24, rows: 5, anim: { frames: 8, frameW: 3, mode: "pingpong", fps: 8 } },
  { src: "/rpg/tiles/Water/Water_Tile_1.png", name: "Water_Tile_1", category: "Water", cols: 3, rows: 5 },
  { src: "/rpg/tiles/Water/Water_Tile_1_Anim.png", name: "Water_Tile_1_Anim", category: "Water", cols: 24, rows: 5, anim: { frames: 8, frameW: 3, mode: "pingpong", fps: 8 } },
  { src: "/rpg/tiles/Waterfall/Waterfall_1.png", name: "Waterfall_1", category: "Waterfall", cols: 18, rows: 5, anim: { frames: 6, frameW: 3, mode: "loop", fps: 10 } },
  { src: "/rpg/tiles/Waterfall/Waterfall_5.png", name: "Waterfall_5", category: "Waterfall", cols: 18, rows: 5, anim: { frames: 6, frameW: 3, mode: "loop", fps: 10 } },
  { src: "/rpg/tiles/Wooden_Deck_Tiles.png", name: "Wooden_Deck_Tiles", category: "Misc", cols: 5, rows: 6 },
];
