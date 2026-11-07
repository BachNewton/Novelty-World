import type { RoadsideModel } from "../roadside/models";

/*
 * Åland's landmark lighthouses, each a model of its own on the identity kit's meshes and materials
 * (`art/identity`), so the sea marks draw them with the rest. A model stands on its foot at y 0, its own size: it is
 * never scaled. One on a skerry no tile draws (Märket, Lågskär, Flötjan) brings its own rock.
 */
export interface LighthouseArt {
  /** Its name as a player reads it. */
  name: string;
  build: () => RoadsideModel;
  /** The middle of its lamp above its foot, where its light shines from, or null for one that shows no light. */
  lampM: number | null;
  /** How far round the lamp its lantern reaches, so its light's glow is drawn clear of it. */
  lanternM: number;
}
