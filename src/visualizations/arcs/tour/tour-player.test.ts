import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PathStep } from '../../shared/connection-path.ts';
import type { TourPlan, TourStop } from './tour-plan.ts';
import {
  HOLD_MS,
  STILL_HOLD_MS,
  TourPlayer,
  tourBeats,
  type TourBeat,
  type TourStage,
} from './tour-player.ts';

const TOTAL = 31_102;

const stop = (key: TourStop['key'], verse: number, answer: number, linkId: number): TourStop => ({
  key,
  passage: { kind: 'verse', verse },
  range: { start: verse, end: verse },
  answer: { kind: 'verse', verse: answer },
  answerRange: { start: answer, end: answer },
  linkId,
});

const FINALE: PathStep[] = [
  { verse: 70, hop: null },
  { verse: 17_900, hop: { linkId: 11, votes: 57, direction: 'outgoing' } },
  { verse: 26_045, hop: { linkId: 12, votes: 77, direction: 'incoming' } },
  { verse: 31_089, hop: { linkId: 13, votes: 178, direction: 'outgoing' } },
];

const PLAN: TourPlan = {
  stops: [stop('beginning', 0, 26_045, 1), stop('shema', 5090, 24_800, 2)],
  finale: FINALE,
};

/** A stage that records what it is asked to do, and lands at once. */
function recordingStage(extra: Partial<TourStage> = {}) {
  const calls: string[] = [];
  const stage: TourStage = {
    show: (range, view) => {
      calls.push(`show ${String(range.start)} [${view.start.toFixed(0)}, ${view.end.toFixed(0)}]`);
      return Promise.resolve(true);
    },
    point: (pointer) => {
      calls.push(
        pointer === null
          ? 'point none'
          : `point ${pointer.linkIds.join('+')} at ${String(pointer.passage.start)}`,
      );
    },
    crossfade: () => {
      calls.push('crossfade');
    },
    ...extra,
  };
  return { stage, calls };
}

async function playAll(beats: readonly TourBeat[], stage: TourStage): Promise<void> {
  for (const beat of beats) {
    await beat.act(stage);
  }
}

describe('tourBeats', () => {
  it('flies each stop in close, then pulls back to show where its link lands', async () => {
    const beats = tourBeats(PLAN, { total: TOTAL, reducedMotion: false, playsPath: false });
    expect(beats.map((beat) => [beat.card, beat.holdMs])).toEqual([
      [0, HOLD_MS.closeUp],
      [0, HOLD_MS.reach],
      [1, HOLD_MS.closeUp],
      [1, HOLD_MS.reach],
      [2, HOLD_MS.pathStart],
      [2, HOLD_MS.pathStep],
      [2, HOLD_MS.pathStep],
      [2, HOLD_MS.pathStep],
      [2, HOLD_MS.pathEnd],
    ]);
    const { stage, calls } = recordingStage();
    await playAll(beats.slice(0, 2), stage);
    expect(calls).toEqual([
      'point none',
      'show 0 [0, 900]',
      'point 1 at 26045',
      // Genesis to John with a tenth to spare either side is more than the canon: all of it.
      'show 0 [0, 31102]',
    ]);
  });

  it('walks the finale a link at a time, keeping the links walked so far, and ends on all of it', async () => {
    const beats = tourBeats(PLAN, { total: TOTAL, reducedMotion: false, playsPath: false });
    const finale = beats.filter((beat) => beat.card === 2);
    expect(finale.map((beat) => beat.passage)).toEqual(
      [70, 17_900, 26_045, 31_089, 31_089].map((verse) => ({ kind: 'verse', verse })),
    );
    const { stage, calls } = recordingStage();
    await playAll(finale, stage);
    expect(calls.filter((call) => call.startsWith('point'))).toEqual([
      'point none',
      'point 11 at 17900',
      'point 11+12 at 26045',
      'point 11+12+13 at 31089',
      'point 11+12+13 at 31089',
    ]);
    expect(calls.at(-1)).toBe('show 31089 [0, 31102]');
  });

  it('cuts to one picture a stop with reduced motion, crossfading, and holds each card longer', async () => {
    const beats = tourBeats(PLAN, { total: TOTAL, reducedMotion: true, playsPath: false });
    expect(beats.filter((beat) => beat.card < 2).map((beat) => beat.holdMs)).toEqual([
      STILL_HOLD_MS.stop,
      STILL_HOLD_MS.stop,
    ]);
    expect(STILL_HOLD_MS.stop).toBeGreaterThan(HOLD_MS.closeUp + HOLD_MS.reach);
    const { stage, calls } = recordingStage();
    await playAll(beats, stage);
    const cuts = calls.filter((call) => call === 'crossfade').length;
    expect(cuts).toBe(beats.length);
    expect(calls.slice(0, 3)).toEqual(['crossfade', 'point 1 at 26045', 'show 0 [0, 31102]']);
  });

  it('hands the finale to the path light when the stage has one', async () => {
    const playPath = vi.fn(() => Promise.resolve(true));
    const beats = tourBeats(PLAN, { total: TOTAL, reducedMotion: false, playsPath: true });
    const finale = beats.filter((beat) => beat.card === 2);
    expect(finale).toHaveLength(1);
    const { stage, calls } = recordingStage({ playPath });
    await finale[0]?.act(stage);
    expect(calls).toEqual(['point none', 'show 70 [0, 31102]']);
    expect(playPath).toHaveBeenCalledWith(FINALE);
  });

  it('leaves the finale out when there is no chain to show', () => {
    const beats = tourBeats(
      { ...PLAN, finale: null },
      { total: TOTAL, reducedMotion: false, playsPath: false },
    );
    expect(beats.map((beat) => beat.card)).toEqual([0, 0, 1, 1]);
  });
});

describe('TourPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Beats that each land when told to, so a test can hold a flight in the air. */
  function beatsLandingOnCue(holds: readonly number[]) {
    const landings: (() => void)[] = [];
    const beats = holds.map((holdMs, card): TourBeat => ({
      card,
      passage: { kind: 'verse', verse: card },
      holdMs,
      act: () =>
        new Promise<void>((resolve) => {
          landings.push(resolve);
        }),
    }));
    return { beats, land: (index: number) => landings[index]?.() };
  }

  it('plays each beat once the last has landed and held for its time, then ends', async () => {
    const { beats, land } = beatsLandingOnCue([1000, 500]);
    const onBeat = vi.fn();
    const onEnd = vi.fn();
    const player = new TourPlayer(beats, recordingStage().stage, { onBeat, onEnd });
    player.start();
    player.start();
    expect(onBeat).toHaveBeenCalledOnce();
    expect(onBeat).toHaveBeenLastCalledWith(beats[0], 0);

    // The hold counts from the landing, however long the flight took.
    await vi.advanceTimersByTimeAsync(5000);
    expect(onBeat).toHaveBeenCalledOnce();
    land(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(onBeat).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(onBeat).toHaveBeenLastCalledWith(beats[1], 1);

    land(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onBeat).toHaveBeenCalledTimes(2);
  });

  it('stops the clock while paused, and goes on with what was left of the hold', async () => {
    const { beats, land } = beatsLandingOnCue([1000, 1000]);
    const onBeat = vi.fn();
    const player = new TourPlayer(beats, recordingStage().stage, { onBeat, onEnd: vi.fn() });
    player.start();
    land(0);
    await vi.advanceTimersByTimeAsync(600);
    player.pause();
    player.pause();
    expect(player.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onBeat).toHaveBeenCalledOnce();

    player.resume();
    player.resume();
    expect(player.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(399);
    expect(onBeat).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(onBeat).toHaveBeenCalledTimes(2);
  });

  it('lets a flight under way land when paused, and holds only once resumed', async () => {
    const { beats, land } = beatsLandingOnCue([1000, 1000]);
    const onBeat = vi.fn();
    const player = new TourPlayer(beats, recordingStage().stage, { onBeat, onEnd: vi.fn() });
    player.start();
    player.pause();
    land(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onBeat).toHaveBeenCalledOnce();
    player.resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onBeat).toHaveBeenCalledTimes(2);
  });

  it('resuming mid-flight waits for the landing, then holds in full', async () => {
    const { beats, land } = beatsLandingOnCue([1000, 1000]);
    const onBeat = vi.fn();
    const player = new TourPlayer(beats, recordingStage().stage, { onBeat, onEnd: vi.fn() });
    player.start();
    player.pause();
    player.resume();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onBeat).toHaveBeenCalledOnce();
    land(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onBeat).toHaveBeenCalledTimes(2);
  });

  it('plays nothing more once stopped, holding or flying, and never says it ended', async () => {
    const { beats, land } = beatsLandingOnCue([1000, 1000]);
    const onBeat = vi.fn();
    const onEnd = vi.fn();
    const player = new TourPlayer(beats, recordingStage().stage, { onBeat, onEnd });
    player.start();
    land(0);
    await vi.advanceTimersByTimeAsync(500);
    player.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onBeat).toHaveBeenCalledOnce();

    const flying = beatsLandingOnCue([1000, 1000]);
    const second = new TourPlayer(flying.beats, recordingStage().stage, { onBeat, onEnd });
    second.start();
    second.stop();
    second.pause();
    second.resume();
    second.start();
    flying.land(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onBeat).toHaveBeenCalledTimes(2);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('cannot be started once stopped', () => {
    const onBeat = vi.fn();
    const player = new TourPlayer(beatsLandingOnCue([1]).beats, recordingStage().stage, {
      onBeat,
      onEnd: vi.fn(),
    });
    player.stop();
    player.start();
    expect(onBeat).not.toHaveBeenCalled();
  });

  it('ends at once when there is nothing to play', async () => {
    const onEnd = vi.fn();
    new TourPlayer([], recordingStage().stage, { onBeat: vi.fn(), onEnd }).start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
