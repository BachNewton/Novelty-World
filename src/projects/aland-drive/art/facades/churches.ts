/*
 * Åland's medieval stone churches as records for `church.ts`. The sizes are read from each one's NLS solid (its ridges, its
 * highest point, the bearing of its ridge), the highest laser return where the solid stops short, and the plan's oddities
 * from the parishes' own descriptions (kyrkor.ax): where a tower stands, which side a sacristy or porch is on. `solids`
 * names what each replaces. Lumparland isn't here: it's a timber church of 1728. Kumlinge, Kökar and Sottunga are outside
 * the map's tiles.
 */

export type TowerRoof = "pyramid" | "hood" | "spire" | "crown" | "baroque" | "belfry";

interface Body {
  from: number;
  to: number;
  halfWide: number;
  eaves: number;
  ridge: number;
}

export interface ChurchSpec {
  id: string;
  name: string;
  /** The middle of the ridge: ETRS-TM35FIN metres. */
  east: number;
  north: number;
  /** The compass bearing of the nave's axis, towards the east end. */
  bearing: number;
  /** The NLS solids this takes the place of, and the sheet they're on. */
  solids: string[];
  sheet: string;
  stone: "red" | "grey" | "white";
  nave: Body;
  chancel?: Body;
  /** A polygonal end past the nave, plastered white. */
  plasteredApse?: boolean;
  transept?: { x: number; halfX: number; halfZ: number; eaves: number; ridge: number };
  /** `z` positive is south of the axis. `stone` is its masonry's top, `top` its peak, above the ground. */
  tower: { x: number; z: number; halfX: number; halfZ: number; stone: number; top: number; roof: TowerRoof };
  /** Sacristies and porches. */
  annexes: { x: number; z: number; halfX: number; halfZ: number; eaves: number; ridge: number }[];
}

export const CHURCHES: ChurchSpec[] = [
  {
    id: "jomala",
    name: "Sankt Olofs kyrka, Jomala",
    east: 109018.2,
    north: 6689583.6,
    bearing: 86.3,
    solids: ["ahvenanmaa_2022_135301"],
    sheet: "L2334F",
    stone: "red",
    nave: { from: -8, to: 8, halfWide: 9.2, eaves: 9.6, ridge: 16.6 },
    transept: { x: 2, halfX: 5.6, halfZ: 14.8, eaves: 9.4, ridge: 16.4 },
    tower: { x: -12.6, z: 0, halfX: 4.4, halfZ: 4.5, stone: 23.7, top: 37, roof: "spire" },
    annexes: [{ x: 14.6, z: 0, halfX: 7, halfZ: 4, eaves: 5, ridge: 9 }],
  },
  {
    id: "finstrom",
    name: "Sankt Mikaels kyrka, Finström",
    east: 109343.5,
    north: 6701725.2,
    bearing: 94.3,
    solids: ["ahvenanmaa_2022_69349"],
    sheet: "L2343F",
    stone: "red",
    nave: { from: -14, to: 14, halfWide: 7.4, eaves: 9.6, ridge: 20 },
    // Built into the nave's west bay. The solid stops at the ridge; the laser sees the spire 34.5 m up.
    tower: { x: -10, z: 0, halfX: 4, halfZ: 4.2, stone: 23, top: 34.5, roof: "crown" },
    annexes: [
      { x: 0, z: -10.6, halfX: 3.6, halfZ: 3.4, eaves: 5.2, ridge: 9.2 },
      { x: 0, z: 10.6, halfX: 2.8, halfZ: 3.4, eaves: 4.4, ridge: 8 },
    ],
  },
  {
    id: "hammarland",
    name: "Sankta Katarina kyrka, Hammarland",
    east: 98538.6,
    north: 6697765.5,
    bearing: 82.6,
    solids: ["ahvenanmaa_2022_60693"],
    sheet: "L2343D",
    stone: "red",
    nave: { from: -10.35, to: 10.35, halfWide: 7.1, eaves: 7.4, ridge: 15.8 },
    chancel: { from: 10.35, to: 18.4, halfWide: 5, eaves: 5.9, ridge: 12.8 },
    // Against the south wall in line with the west gable: the one Åland tower that stands beside its nave.
    tower: { x: -6.6, z: 11.3, halfX: 3.9, halfZ: 3.9, stone: 15, top: 27.8, roof: "pyramid" },
    annexes: [{ x: -4, z: -9.3, halfX: 3, halfZ: 2.2, eaves: 4.2, ridge: 7.2 }],
  },
  {
    id: "saltvik",
    name: "Sankta Maria kyrka, Saltvik",
    east: 116140,
    north: 6702315.2,
    bearing: 91,
    solids: ["ahvenanmaa_2022_127661"],
    sheet: "L3122A",
    stone: "red",
    nave: { from: -11.2, to: 11.2, halfWide: 7.3, eaves: 9, ridge: 17.3 },
    plasteredApse: true,
    // The 1381 tower with its 18th-century Baroque spire.
    tower: { x: -17.8, z: 0, halfX: 6.5, halfZ: 5.8, stone: 20.5, top: 44.5, roof: "baroque" },
    annexes: [
      { x: 5, z: -10.2, halfX: 2.6, halfZ: 2.9, eaves: 4.4, ridge: 7.6 },
      { x: -2, z: 10.2, halfX: 2.8, halfZ: 2.9, eaves: 4.4, ridge: 7.8 },
    ],
  },
  {
    id: "sund",
    name: "Sankt Johannes kyrka, Sund",
    east: 119263.1,
    north: 6699079.8,
    bearing: 103.9,
    solids: ["ahvenanmaa_2022_119897"],
    sheet: "L3121B",
    stone: "red",
    nave: { from: -12.6, to: 12.6, halfWide: 10, eaves: 11.2, ridge: 22.7 },
    tower: { x: -18.8, z: 0, halfX: 6.1, halfZ: 6.1, stone: 23.4, top: 34.5, roof: "spire" },
    annexes: [
      { x: 2, z: -12.8, halfX: 3.4, halfZ: 2.9, eaves: 5, ridge: 8.6 },
      { x: 0, z: 12.6, halfX: 3, halfZ: 2.7, eaves: 4.6, ridge: 8 },
    ],
  },
  {
    id: "geta",
    name: "Sankta Maria kyrka, Geta",
    east: 106151.9,
    north: 6714564.9,
    bearing: 93.5,
    // The nave and, 30 m south, the bell tower's stone foot, which NLS models to 5.7 m. Its top here is an estimate.
    solids: ["ahvenanmaa_2022_97037", "ahvenanmaa_2022_97341"],
    sheet: "L2433E",
    stone: "red",
    nave: { from: -10.4, to: 10.4, halfWide: 6.3, eaves: 5.5, ridge: 14 },
    tower: { x: -1.3, z: 30.4, halfX: 2.7, halfZ: 2.7, stone: 5.7, top: 12.5, roof: "belfry" },
    annexes: [
      { x: 4, z: -10, halfX: 3.6, halfZ: 3.8, eaves: 3.4, ridge: 6.1 },
      { x: -6, z: 8.4, halfX: 2.2, halfZ: 2.2, eaves: 3, ridge: 5.4 },
    ],
  },
  {
    id: "eckero",
    name: "Sankt Lars kyrka, Eckerö",
    east: 91105,
    north: 6697476.9,
    bearing: 94.2,
    solids: ["ahvenanmaa_2022_49385"],
    sheet: "L2341H",
    stone: "red",
    nave: { from: -7.95, to: 7.95, halfWide: 5.7, eaves: 6.6, ridge: 13.2 },
    // Low and as wide as the nave, under a high hood of tarred shingle.
    tower: { x: -10.9, z: 0, halfX: 2.95, halfZ: 5.8, stone: 12.5, top: 29, roof: "hood" },
    annexes: [
      { x: 5.6, z: -8, halfX: 2.4, halfZ: 2.5, eaves: 3.8, ridge: 6.2 },
      { x: -2, z: 8, halfX: 2.2, halfZ: 2.5, eaves: 3.8, ridge: 6.2 },
    ],
  },
  {
    id: "lemland",
    name: "Sankta Birgitta kyrka, Lemland",
    east: 115569.6,
    north: 6679885.6,
    bearing: 89.5,
    solids: ["ahvenanmaa_2022_37717"],
    sheet: "L2334G",
    stone: "red",
    nave: { from: -9.85, to: 9.85, halfWide: 6.2, eaves: 9.4, ridge: 18.6 },
    chancel: { from: 9.85, to: 18.3, halfWide: 5, eaves: 7.4, ridge: 14 },
    tower: { x: -15.2, z: 0, halfX: 5.3, halfZ: 4.4, stone: 18.2, top: 30.8, roof: "spire" },
    annexes: [
      { x: 7, z: -9, halfX: 2.4, halfZ: 2.8, eaves: 4, ridge: 7 },
      { x: -5, z: 8.8, halfX: 2.4, halfZ: 2.6, eaves: 4, ridge: 7 },
    ],
  },
  {
    id: "foglo",
    name: "Sankta Maria Magdalena kyrka, Föglö",
    east: 133951,
    north: 6671080,
    bearing: 91.2,
    solids: ["ahvenanmaa_2022_105789"],
    sheet: "L3111E",
    stone: "grey",
    nave: { from: -13, to: 13, halfWide: 6, eaves: 7.8, ridge: 12.5 },
    transept: { x: 0, halfX: 6, halfZ: 11.4, eaves: 7.8, ridge: 12.5 },
    tower: { x: -16, z: 0, halfX: 3, halfZ: 3, stone: 15, top: 30.8, roof: "spire" },
    annexes: [{ x: 16, z: 0, halfX: 3.2, halfZ: 3.6, eaves: 4.6, ridge: 8 }],
  },
  {
    id: "vardo",
    name: "Vårdö stone chapel",
    east: 133453.4,
    north: 6696809,
    bearing: 104.1,
    solids: ["ahvenanmaa_2022_126637"],
    sheet: "L3121F",
    stone: "white",
    nave: { from: -10.15, to: 10.15, halfWide: 5.2, eaves: 5.3, ridge: 10.3 },
    tower: { x: -12.8, z: 0, halfX: 2.7, halfZ: 2.7, stone: 11, top: 24.8, roof: "hood" },
    annexes: [{ x: 1, z: -8, halfX: 2.8, halfZ: 2.8, eaves: 3.6, ridge: 6.4 }],
  },
];
