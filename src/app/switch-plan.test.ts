import { describe, expect, it } from 'vitest';
import type { PassageSpot } from '../visualizations/shared/passage-spot.ts';
import {
  beaconStart,
  chooseSwitch,
  CROSSFADE_MS,
  EDGE_INSET_PX,
  KEYBOARD_FADE_MS,
  planBeacon,
  type SwitchContext,
} from './switch-plan.ts';

const POINTER: SwitchContext = {
  canTransition: true,
  reducedMotion: false,
  keyboard: false,
  carriesPassage: true,
};

describe('chooseSwitch', () => {
  it('carries a kept passage across a pointer switch, over a quick crossfade', () => {
    expect(chooseSwitch(POINTER)).toEqual({
      kind: 'transition',
      fadeMs: CROSSFADE_MS,
      beacon: true,
    });
  });

  it('only crossfades, under 200ms, with no passage to carry', () => {
    const style = chooseSwitch({ ...POINTER, carriesPassage: false });
    expect(style).toEqual({ kind: 'transition', fadeMs: CROSSFADE_MS, beacon: false });
    expect(CROSSFADE_MS).toBeLessThan(200);
  });

  it('blinks from the keyboard: a shorter crossfade, and nothing travels', () => {
    expect(chooseSwitch({ ...POINTER, keyboard: true })).toEqual({
      kind: 'transition',
      fadeMs: KEYBOARD_FADE_MS,
      beacon: false,
    });
    expect(KEYBOARD_FADE_MS).toBeLessThan(CROSSFADE_MS);
  });

  it('keeps the crossfade and drops the travel for a reader who asked for less motion', () => {
    expect(chooseSwitch({ ...POINTER, reducedMotion: true })).toEqual({
      kind: 'transition',
      fadeMs: CROSSFADE_MS,
      beacon: false,
    });
  });

  it('fades the next view in where the browser cannot animate the page', () => {
    expect(chooseSwitch({ ...POINTER, canTransition: false })).toEqual({
      kind: 'fade',
      fadeMs: CROSSFADE_MS,
    });
    expect(chooseSwitch({ ...POINTER, canTransition: false, keyboard: true })).toEqual({
      kind: 'fade',
      fadeMs: KEYBOARD_FADE_MS,
    });
  });
});

/** The stage: 800 by 600, from (0, 50). */
const BOUNDS = { left: 0, top: 50, right: 800, bottom: 650 };
const at = (x: number, y: number): PassageSpot => ({ point: { x, y }, bounds: BOUNDS });

describe('beaconStart', () => {
  it('starts where the passage is drawn, or at the edge on its side when it is out of sight', () => {
    expect(beaconStart(at(400, 300))).toEqual({ x: 400, y: 300 });
    expect(beaconStart(at(400, 2000))).toEqual({ x: 400, y: 650 - EDGE_INSET_PX });
  });

  it('starts nowhere when the last view does not draw the passage', () => {
    expect(beaconStart(null)).toBeNull();
  });
});

describe('planBeacon', () => {
  it('travels from where the passage was drawn to where it is', () => {
    expect(planBeacon(at(100, 600), at(700, 120))).toEqual({
      kind: 'travel',
      from: { x: 100, y: 600 },
      to: { x: 700, y: 120 },
    });
  });

  it('lands at the edge nearest the passage when the next view has it out of sight', () => {
    // E.g. the arcs zoomed into Genesis, and the passage in John: the beacon points that way.
    expect(planBeacon(at(100, 600), at(5000, 600))).toEqual({
      kind: 'travel',
      from: { x: 100, y: 600 },
      to: { x: 800 - EDGE_INSET_PX, y: 600 },
    });
  });

  it('comes in from the edge when only the next view has it in sight', () => {
    expect(planBeacon(at(400, -900), at(400, 300))).toEqual({
      kind: 'travel',
      from: { x: 400, y: 50 + EDGE_INSET_PX },
      to: { x: 400, y: 300 },
    });
  });

  it('appears where the passage is when the last view did not draw it', () => {
    expect(planBeacon(null, at(400, 300))).toEqual({ kind: 'arrive', to: { x: 400, y: 300 } });
  });

  it('shows nothing when the passage is in sight in neither view', () => {
    expect(planBeacon(at(-100, 300), at(400, 9000))).toEqual({ kind: 'none' });
    expect(planBeacon(null, at(400, 9000))).toEqual({ kind: 'none' });
  });

  it('shows nothing when the next view does not draw the passage at all', () => {
    expect(planBeacon(at(400, 300), null)).toEqual({ kind: 'none' });
  });
});
