import { describe, expect, it } from 'vitest';
import { CLIP_FPS, clipTimeline, framePhase, frameTimeMs, linkGrowth } from './clip-timeline.ts';

/** The frame on which each link of a timeline lands, read off `linkGrowth`. */
function landingFrames(linkCount: number): number[] {
  const timeline = clipTimeline(linkCount);
  return Array.from({ length: linkCount }, (_, index) => {
    for (let frame = 0; frame < timeline.frameCount; frame += 1) {
      if (linkGrowth(timeline, index, frameTimeMs(frame)) === 1) {
        return frame;
      }
    }
    return Infinity;
  });
}

describe('clipTimeline', () => {
  it.each([0, 1, 2, 7, 40, 150, 1000, 5000])(
    'lasts 4 to 6 seconds at 30 frames a second with %i links',
    (count) => {
      const timeline = clipTimeline(count);
      expect(timeline.durationMs).toBeGreaterThanOrEqual(4000);
      expect(timeline.durationMs).toBeLessThanOrEqual(6000);
      expect(timeline.frameCount).toBe(Math.ceil((timeline.durationMs * CLIP_FPS) / 1000));
    },
  );

  it('lets every link land, and holds the whole picture for over a second before the end', () => {
    for (const count of [1, 2, 7, 40, 1000]) {
      const timeline = clipTimeline(count);
      const last = Math.max(...landingFrames(count));
      expect(frameTimeMs(last)).toBeLessThanOrEqual(timeline.durationMs - 1300);
    }
  });

  it('gives a few links time to be seen rising, one after another', () => {
    const timeline = clipTimeline(3);
    expect(timeline.growMs).toBe(700);
    expect(timeline.staggerMs).toBe(350);
    const frames = landingFrames(3);
    expect(new Set(frames).size).toBe(3);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
  });

  it('grows many links faster, so only a few dozen grow at once', () => {
    for (const count of [100, 289, 1000, 5000]) {
      const { growMs, staggerMs } = clipTimeline(count);
      expect(growMs / staggerMs).toBeLessThanOrEqual(48 + 1e-9);
    }
  });

  it('counts only whole links', () => {
    expect(clipTimeline(-3).linkCount).toBe(0);
    expect(clipTimeline(2.7).linkCount).toBe(2);
  });
});

describe('linkGrowth', () => {
  const timeline = clipTimeline(3);

  it('is nothing until the link’s turn, and complete once it has landed', () => {
    expect(linkGrowth(timeline, 0, 0)).toBe(0);
    expect(linkGrowth(timeline, 0, 400)).toBe(0);
    expect(linkGrowth(timeline, 0, 1100)).toBe(1);
    expect(linkGrowth(timeline, 2, 1100)).toBe(0);
  });

  it('eases out: most of the way there in the first half of its time', () => {
    expect(linkGrowth(timeline, 0, 400 + 350)).toBeCloseTo(0.875);
    let previous = 0;
    for (let time = 400; time <= 1100; time += 10) {
      const growth = linkGrowth(timeline, 0, time);
      expect(growth).toBeGreaterThanOrEqual(previous);
      previous = growth;
    }
  });
});

describe('framePhase', () => {
  it('agrees with linkGrowth on which links have landed and which are growing', () => {
    for (const count of [0, 1, 2, 7, 300]) {
      const timeline = clipTimeline(count);
      for (let frame = 0; frame < timeline.frameCount; frame += 1) {
        const time = frameTimeMs(frame);
        const { landed, started } = framePhase(timeline, time);
        const growth = Array.from({ length: count }, (_, index) =>
          linkGrowth(timeline, index, time),
        );
        expect(growth.filter((value) => value === 1)).toHaveLength(landed);
        expect(growth.filter((value) => value > 0)).toHaveLength(started);
        // In order: every landed link comes before every growing one.
        expect(growth.slice(0, landed).every((value) => value === 1)).toBe(true);
        expect(growth.slice(landed, started).every((value) => value > 0 && value < 1)).toBe(true);
      }
    }
  });

  it('shows the axis alone at first, and every link at the end', () => {
    const timeline = clipTimeline(12);
    expect(framePhase(timeline, 0)).toEqual({ landed: 0, started: 0 });
    expect(framePhase(timeline, timeline.durationMs)).toEqual({ landed: 12, started: 12 });
  });
});

describe('frameTimeMs', () => {
  it('spaces frames a thirtieth of a second apart', () => {
    expect(frameTimeMs(0)).toBe(0);
    expect(frameTimeMs(30)).toBe(1000);
    expect(frameTimeMs(45)).toBe(1500);
  });
});
