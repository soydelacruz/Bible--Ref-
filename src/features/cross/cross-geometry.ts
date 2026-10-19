/** A beam of the cross: its size and where its center sits, in scene units. */
export interface Beam {
  readonly name: 'post' | 'crossbar';
  /** Width, height and depth. */
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
}

export interface CrossProportions {
  readonly height: number;
  readonly postWidth: number;
  readonly postDepth: number;
  /** Distance from the top of the post to the center of the crossbar, as a share of the height. */
  readonly crossbarAt: number;
  readonly crossbarHeight: number;
  readonly crossbarDepth: number;
}

/**
 * The proportions of a Latin cross, the shape of the cross of the Gospels: an upright post, and a
 * crossbar a quarter of the way down it whose arms are as long as the post above them is tall.
 * The crossbar is a little thinner than the post and sits proud of it, as a lashed timber would.
 */
export const CROSS_PROPORTIONS: CrossProportions = {
  height: 6,
  postWidth: 0.6,
  postDepth: 0.5,
  crossbarAt: 0.25,
  crossbarHeight: 0.54,
  crossbarDepth: 0.46,
};

/** The two beams of the cross, centered on the origin so it turns about its own middle. */
export function crossBeams(
  proportions: CrossProportions = CROSS_PROPORTIONS,
): readonly [Beam, Beam] {
  const { height, postWidth, postDepth, crossbarAt, crossbarHeight, crossbarDepth } = proportions;
  const top = height / 2;
  const crossbarY = top - height * crossbarAt;
  // Each arm reaches as far from the post as the post rises above the crossbar.
  const armLength = top - crossbarY;
  const crossbarWidth = postWidth + 2 * armLength;
  return [
    { name: 'post', size: [postWidth, height, postDepth], position: [0, 0, 0] },
    {
      name: 'crossbar',
      size: [crossbarWidth, crossbarHeight, crossbarDepth],
      // Lashed across the front of the post, not cut into it.
      position: [0, crossbarY, (postDepth + crossbarDepth) / 2 - crossbarDepth * 0.6],
    },
  ];
}
