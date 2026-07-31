declare module "earcut" {
  /** Triangulates a flat polygon coordinate array and returns vertex indices. */
  export default function earcut(
    vertices: number[],
    holeIndices?: number[],
    dimensions?: number,
  ): number[];
}
