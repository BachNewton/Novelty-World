// d3-force-3d ships no types. Covers only the API tree-3d-sim.ts uses.
declare module "d3-force-3d" {
  export interface SimulationNode {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
  }

  export interface Force<N extends SimulationNode> {
    (alpha: number): void;
    initialize?: (nodes: N[], random: () => number, nDim: number) => void;
  }

  export interface Simulation<N extends SimulationNode> {
    tick(iterations?: number): this;
    stop(): this;
    alpha(): number;
    alpha(alpha: number): this;
    alphaMin(): number;
    force(name: string, force: Force<N>): this;
  }

  export function forceSimulation<N extends SimulationNode>(
    nodes: N[],
    numDimensions: 3,
  ): Simulation<N>;

  export interface LinkForce<N extends SimulationNode, L> extends Force<N> {
    distance(distance: (link: L) => number): this;
    strength(strength: (link: L) => number): this;
  }

  export function forceLink<
    N extends SimulationNode,
    L extends { source: N; target: N },
  >(links: L[]): LinkForce<N, L>;

  export interface ManyBodyForce<N extends SimulationNode> extends Force<N> {
    strength(strength: number): this;
    distanceMax(distance: number): this;
  }

  export function forceManyBody<N extends SimulationNode>(): ManyBodyForce<N>;
}
