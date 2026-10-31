/*
 * What a vertex can be painted, by index into one palette, so every person of every
 * look draws in the same material. Each name is a token in `tokens.css`.
 */

export const SKINS = ["skin-1", "skin-2", "skin-3", "skin-4", "skin-5", "skin-6"] as const;
export const HAIRS = ["hair-black", "hair-brown", "hair-chestnut", "hair-ash", "hair-blond", "hair-copper", "hair-grey", "hair-white"] as const;
export const CLOTHS = ["cloth-white", "cloth-linen", "cloth-sand", "cloth-khaki", "cloth-grey", "cloth-charcoal", "cloth-navy", "cloth-denim", "cloth-sky", "cloth-sea", "cloth-forest", "cloth-red", "cloth-coral", "cloth-mustard", "cloth-lilac", "cloth-rose", "cloth-work", "cloth-signal"] as const;
export const SHOES = ["shoe-dark", "shoe-brown", "shoe-white"] as const;
export const PROPS = ["straw", "prop-wood", "prop-rod", "prop-steel", "prop-line"] as const;

export const PARTS = [...SKINS, ...HAIRS, ...CLOTHS, ...SHOES, ...PROPS] as const;
export type Part = (typeof PARTS)[number];
export type Skin = (typeof SKINS)[number];
export type Hair = (typeof HAIRS)[number];
export type Cloth = (typeof CLOTHS)[number];
export type Shoe = (typeof SHOES)[number];
