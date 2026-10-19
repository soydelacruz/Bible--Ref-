import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_VERSIFICATION } from '../../core/bible/versification.ts';
import { verseIndex } from '../../test-utils/fixtures.ts';
import { playTour, TOUR_STOPS, tourPassages } from './tour.ts';

describe('tourPassages', () => {
  it('turns every stop into a verse of the versification', () => {
    const passages = tourPassages(CANONICAL_VERSIFICATION);
    expect(passages).toHaveLength(TOUR_STOPS.length);
    expect(passages[0]).toEqual({ kind: 'verse', verse: verseIndex('Gen', 1, 1) });
    expect(passages.at(-1)).toEqual({ kind: 'verse', verse: verseIndex('Rev', 22, 13) });
  });
});

describe('playTour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the first stop at once and each next one a step later, then ends', () => {
    const onStep = vi.fn();
    const onEnd = vi.fn();
    playTour(['a', 'b', 'c'], onStep, onEnd, 1000);
    expect(onStep.mock.calls).toEqual([['a', 0]]);
    vi.advanceTimersByTime(1000);
    expect(onStep).toHaveBeenLastCalledWith('b', 1);
    vi.advanceTimersByTime(1000);
    expect(onStep).toHaveBeenLastCalledWith('c', 2);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onStep).toHaveBeenCalledTimes(3);
  });

  it('stops early without ending', () => {
    const onStep = vi.fn();
    const onEnd = vi.fn();
    const stop = playTour(['a', 'b'], onStep, onEnd, 1000);
    stop();
    vi.advanceTimersByTime(5000);
    expect(onStep).toHaveBeenCalledOnce();
    expect(onEnd).not.toHaveBeenCalled();
    stop();
  });

  it('ends at once when there is nothing to show', () => {
    const onEnd = vi.fn();
    const stop = playTour([], vi.fn(), onEnd);
    expect(onEnd).toHaveBeenCalledOnce();
    stop();
  });
});
