import { describe, expect, it } from 'vitest';
import { CROSS_PROPORTIONS, crossBeams } from './cross-geometry.ts';

describe('crossBeams', () => {
  const [post, crossbar] = crossBeams();

  it('stands the post upright, centered on the origin', () => {
    expect(post.name).toBe('post');
    expect(post.position).toEqual([0, 0, 0]);
    expect(post.size[1]).toBe(CROSS_PROPORTIONS.height);
  });

  it('sets the crossbar a quarter of the way down, above the middle', () => {
    expect(crossbar.name).toBe('crossbar');
    expect(crossbar.position[1]).toBeCloseTo(CROSS_PROPORTIONS.height / 4);
    expect(crossbar.position[1]).toBeGreaterThan(0);
  });

  it('makes each arm as long as the post above the crossbar', () => {
    const top = CROSS_PROPORTIONS.height / 2;
    const arm = (crossbar.size[0] - post.size[0]) / 2;
    expect(arm).toBeCloseTo(top - crossbar.position[1]);
  });

  it('lashes the crossbar across the front of the post, overlapping it', () => {
    const postFront = post.size[2] / 2;
    const crossbarFront = crossbar.position[2] + crossbar.size[2] / 2;
    const crossbarBack = crossbar.position[2] - crossbar.size[2] / 2;
    expect(crossbarFront).toBeGreaterThan(postFront);
    expect(crossbarBack).toBeLessThan(postFront);
  });

  it('follows other proportions it is given', () => {
    const [tallPost, bar] = crossBeams({ ...CROSS_PROPORTIONS, height: 8, crossbarAt: 0.3 });
    expect(tallPost.size[1]).toBe(8);
    expect(bar.position[1]).toBeCloseTo(4 - 8 * 0.3);
  });
});
