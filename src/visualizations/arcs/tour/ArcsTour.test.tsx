import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useRef, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Passage } from '../../../core/bible/passage.ts';
import { preferenceKey, ARCS_TOUR_PREFERENCE } from '../../../shared/lib/preference-keys.ts';
import { verseIndex } from '../../../test-utils/fixtures.ts';
import { createVizData } from '../../../test-utils/viz-data.ts';
import {
  createLinkFilter,
  DEFAULT_LINK_FILTER,
  type LinkFilter,
} from '../../shared/link-filter.ts';
import { TourLayer } from './ArcsTour.tsx';
import { HOLD_MS } from './tour-player.ts';
import { startArcsTour, useArcsTourAvailable } from './tour-request.ts';
import { coveredShare, useArcsTour, type PlayPath, type TourCamera } from './use-arcs-tour.ts';

const GEN_1_1 = verseIndex('Gen', 1, 1);
const JOHN_1_1 = verseIndex('John', 1, 1);
const DEUT_6_4 = verseIndex('Deut', 6, 4);
const MARK_12_29 = verseIndex('Mark', 12, 29);
const GEN_3_15 = verseIndex('Gen', 3, 15);
const ISA_7_14 = verseIndex('Isa', 7, 14);
const REV_22_13 = verseIndex('Rev', 22, 13);

/** Two stops and a finale of two links: three cards, about 18 seconds. */
const DATA = createVizData([
  { from: GEN_1_1, to: JOHN_1_1, votes: 50 },
  { from: DEUT_6_4, to: MARK_12_29, votes: 50 },
  { from: GEN_3_15, to: ISA_7_14, votes: 50 },
  { from: ISA_7_14, to: REV_22_13, votes: 50 },
]);
const WHOLE_TOUR_MS = 30_000;
/** Both shots of a stop, which lands at once with this camera. */
const STOP_MS = HOLD_MS.closeUp + HOLD_MS.reach;
const verse = (index: number): Passage => ({ kind: 'verse', verse: index });

function fakeCamera() {
  return {
    showStop: vi.fn<TourCamera['showStop']>(() => Promise.resolve(true)),
    setFocus: vi.fn<TourCamera['setFocus']>(),
    setPreview: vi.fn<TourCamera['setPreview']>(),
    snapshot: vi.fn((compose: (layers: readonly HTMLCanvasElement[]) => unknown) =>
      compose([document.createElement('canvas')]),
    ) as TourCamera['snapshot'],
  };
}

interface HarnessProps {
  readonly camera: TourCamera;
  readonly passage?: Passage | null;
  readonly onNavigate?: (passage: Passage | null) => void;
  readonly filter?: LinkFilter;
  readonly active?: boolean;
  readonly playPath?: PlayPath;
}

/** The arcs' view in miniature: a stage, the hint line's entry, and the tour's layer. */
function Harness({
  camera,
  passage = null,
  onNavigate = () => undefined,
  filter = DEFAULT_LINK_FILTER,
  active = true,
  playPath,
}: HarnessProps) {
  const cameraRef = useRef<TourCamera | null>(camera);
  const tour = useArcsTour({
    data: DATA,
    filter,
    active,
    passage,
    onNavigate,
    camera: cameraRef,
    playPath,
  });
  return (
    <main>
      <div role="application" tabIndex={0} aria-label="Arcs" />
      {tour.available && (
        <button type="button" onClick={tour.start}>
          Tour from the hint line
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          tour.select(verse(JOHN_1_1));
        }}
      >
        Tap John
      </button>
      <TourLayer
        run={tour.run}
        inviting={tour.inviting}
        versification={DATA.versification}
        layerRef={tour.layerRef}
        cardRef={tour.cardRef}
        fadeRef={tour.fadeRef}
        onStart={tour.start}
        onDismiss={tour.dismiss}
        onPause={tour.pause}
        onResume={tour.resume}
        onClose={tour.close}
      />
    </main>
  );
}

/**
 * Renders a reader's first visit. Preferences are kept in module memory ahead of storage, so an
 * earlier test's answer to the invitation is forgotten the way another tab's would be.
 */
function firstVisit(ui: ReactElement) {
  const view = render(ui);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage'));
  });
  return view;
}

const card = () => screen.queryByRole('region', { name: 'Guided tour' });
const stage = () => screen.getByRole('application', { name: 'Arcs' });
const progress = () => card()?.querySelector('p')?.textContent;

async function elapse(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Starts the tour from the hint line, and lets the first stop arrive. */
async function startTour(props: Partial<HarnessProps> = {}) {
  const camera = fakeCamera();
  const onNavigate = vi.fn();
  const view = render(<Harness camera={camera} onNavigate={onNavigate} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tour from the hint line' }));
  await elapse(0);
  return { camera, onNavigate, view };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the invitation', () => {
  it('offers the tour on a first visit, and once declined never again', () => {
    const { unmount } = firstVisit(<Harness camera={fakeCamera()} />);
    expect(
      screen.getByText('New to the arcs? A 45-second tour shows what they join.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(card()).toBeNull();
    expect(localStorage.getItem(preferenceKey(ARCS_TOUR_PREFERENCE))).toBe('true');
    unmount();
    render(<Harness camera={fakeCamera()} />);
    expect(card()).toBeNull();
  });

  it('goes away for good once the reader starts on the arcs alone, but not for a Tab', () => {
    firstVisit(<Harness camera={fakeCamera()} />);
    fireEvent.keyDown(stage(), { key: 'Tab' });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Not now' }));
    expect(card()).not.toBeNull();
    fireEvent.pointerDown(stage());
    expect(card()).toBeNull();
    expect(localStorage.getItem(preferenceKey(ARCS_TOUR_PREFERENCE))).toBe('true');
  });

  it('waits while a passage is open, or the view is put away', () => {
    const { rerender } = firstVisit(<Harness camera={fakeCamera()} passage={verse(GEN_1_1)} />);
    expect(card()).toBeNull();
    rerender(<Harness camera={fakeCamera()} active={false} />);
    expect(card()).toBeNull();
  });

  it('is not made, nor the tour offered at all, when the filter hides every stop', () => {
    firstVisit(<Harness camera={fakeCamera()} filter={createLinkFilter(100)} />);
    expect(card()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tour from the hint line' })).toBeNull();
  });

  it('starts the tour', async () => {
    const camera = fakeCamera();
    firstVisit(<Harness camera={camera} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    await elapse(0);
    expect(progress()).toBe('Tour · 1 of 3');
    expect(camera.showStop).toHaveBeenCalled();
  });

  it('says outside the arcs when the filter leaves no tour to take', () => {
    const available = renderHook(() => useArcsTourAvailable());
    const { rerender } = firstVisit(
      <Harness camera={fakeCamera()} filter={createLinkFilter(100)} />,
    );
    expect(available.result.current).toBe(false);
    rerender(<Harness camera={fakeCamera()} />);
    expect(available.result.current).toBe(true);
  });

  it('starts when asked from outside the arcs, as from their own button', async () => {
    const { unmount } = firstVisit(<Harness camera={fakeCamera()} />);
    act(() => {
      startArcsTour();
    });
    await elapse(0);
    expect(progress()).toBe('Tour · 1 of 3');
    expect(localStorage.getItem(preferenceKey(ARCS_TOUR_PREFERENCE))).toBe('true');
    // Gone with the arcs: nothing is left listening.
    unmount();
    startArcsTour();
    expect(card()).toBeNull();
  });
});

describe('the tour', () => {
  it('flies to the first stop, says where it is, and hands the keys to its own controls', async () => {
    const { camera } = await startTour();
    expect(progress()).toBe('Tour · 1 of 3');
    expect(screen.getByRole('heading', { name: 'In the beginning' })).toBeTruthy();
    expect(card()?.textContent).toContain('Genesis 1:1 → John 1:1');
    expect(camera.showStop).toHaveBeenLastCalledWith(
      { start: GEN_1_1, end: GEN_1_1 },
      expect.objectContaining({ start: 0 }),
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pause the tour' }));
    expect(localStorage.getItem(preferenceKey(ARCS_TOUR_PREFERENCE))).toBe('true');
    await elapse(200);
    expect(screen.getByRole('status').textContent).toBe(
      'Tour, 1 of 3: In the beginning. Genesis 1:1 → John 1:1',
    );
  });

  it('pulls back to show where the link lands, picking it out', async () => {
    const { camera } = await startTour();
    expect(camera.setPreview).toHaveBeenLastCalledWith(null);
    await elapse(HOLD_MS.closeUp);
    expect(camera.setPreview).toHaveBeenLastCalledWith({
      links: expect.objectContaining({ count: 1 }) as unknown,
      passage: { start: JOHN_1_1, end: JOHN_1_1 },
    });
    expect(progress()).toBe('Tour · 1 of 3');
  });

  it('goes from stop to stop, ends on the finale, and leaves the reader at its last passage', async () => {
    const { onNavigate } = await startTour();
    await elapse(STOP_MS);
    expect(progress()).toBe('Tour · 2 of 3');
    expect(screen.getByRole('heading', { name: 'Hear, O Israel' })).toBeTruthy();
    await elapse(STOP_MS);
    expect(progress()).toBe('Tour · 3 of 3');
    expect(card()?.textContent).toContain('Genesis 3:15 → Isaiah 7:14 → Revelation 22:13');
    expect(onNavigate).not.toHaveBeenCalled();
    await elapse(WHOLE_TOUR_MS);
    expect(card()).toBeNull();
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(verse(REV_22_13));
  });

  it('pauses, saying so, and carries on from where it was when resumed', async () => {
    await startTour();
    await elapse(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Pause the tour' }));
    expect(progress()).toBe('Tour · 1 of 3 · Paused');
    await elapse(WHOLE_TOUR_MS);
    expect(progress()).toBe('Tour · 1 of 3 · Paused');
    fireEvent.click(screen.getByRole('button', { name: 'Resume the tour' }));
    await elapse(HOLD_MS.closeUp - 1000 + HOLD_MS.reach - 1);
    expect(progress()).toBe('Tour · 1 of 3');
    await elapse(1);
    expect(progress()).toBe('Tour · 2 of 3');
  });

  it('ends at the close button, handing over the stop on screen and putting focus on the arcs', async () => {
    const { onNavigate, camera } = await startTour();
    fireEvent.click(screen.getByRole('button', { name: 'End the tour' }));
    expect(card()).toBeNull();
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(verse(GEN_1_1));
    expect(camera.setPreview).toHaveBeenLastCalledWith(null);
    expect(document.activeElement).toBe(stage());
    await elapse(WHOLE_TOUR_MS);
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('ends at Escape from anywhere, and keeps it from the arcs, which would clear the stop', async () => {
    const { onNavigate } = await startTour();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const stageHeard = vi.fn();
    stage().addEventListener('keydown', stageHeard);
    act(() => {
      stage().dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(stageHeard).not.toHaveBeenCalled();
    expect(card()).toBeNull();
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(verse(GEN_1_1));
  });

  it('ends at a press on the arcs, handing the stop back once the press is over', async () => {
    const { onNavigate } = await startTour();
    fireEvent.pointerDown(stage());
    expect(card()).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.pointerUp(window);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(verse(GEN_1_1));
    fireEvent.pointerUp(window);
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('lets a press that chose a passage of its own keep it', async () => {
    const { onNavigate } = await startTour();
    fireEvent.pointerDown(stage());
    fireEvent.click(screen.getByRole('button', { name: 'Tap John' }));
    fireEvent.pointerCancel(window);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(verse(JOHN_1_1));
  });

  it('is not ended by a press on its own card', async () => {
    await startTour();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Pause the tour' }));
    fireEvent.wheel(screen.getByRole('button', { name: 'Pause the tour' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Pause the tour' }), { key: 'Enter' });
    expect(card()).not.toBeNull();
  });

  it('ends at the wheel or a key on the arcs, but not at Tab', async () => {
    const wheel = await startTour();
    fireEvent.keyDown(stage(), { key: 'Tab' });
    expect(card()).not.toBeNull();
    fireEvent.wheel(stage());
    expect(card()).toBeNull();
    expect(wheel.onNavigate).toHaveBeenCalledWith(verse(GEN_1_1));
    wheel.view.unmount();

    const key = await startTour();
    fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    expect(card()).toBeNull();
    expect(key.onNavigate).toHaveBeenCalledWith(verse(GEN_1_1));
  });

  it('gives way to a passage chosen elsewhere, without handing its own back', async () => {
    const { onNavigate, camera, view } = await startTour();
    view.rerender(<Harness camera={camera} onNavigate={onNavigate} passage={verse(JOHN_1_1)} />);
    expect(card()).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(camera.setPreview).toHaveBeenLastCalledWith(null);
  });

  it('ends at a change of filter, handing over its stop', async () => {
    const { onNavigate, camera, view } = await startTour();
    view.rerender(
      <Harness camera={camera} onNavigate={onNavigate} filter={createLinkFilter(10)} />,
    );
    expect(card()).toBeNull();
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(verse(GEN_1_1));
  });

  it('closes an open passage first, and starts once it is gone', async () => {
    const camera = fakeCamera();
    const onNavigate = vi.fn();
    const { rerender } = render(
      <Harness camera={camera} onNavigate={onNavigate} passage={verse(JOHN_1_1)} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tour from the hint line' }));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(null);
    await elapse(0);
    expect(camera.showStop).not.toHaveBeenCalled();
    rerender(<Harness camera={camera} onNavigate={onNavigate} passage={null} />);
    await elapse(0);
    expect(camera.showStop).toHaveBeenCalledOnce();
    expect(progress()).toBe('Tour · 1 of 3');
  });

  it('ends with nothing focused when closed before its first stop', () => {
    const camera = fakeCamera();
    const onNavigate = vi.fn();
    render(<Harness camera={camera} onNavigate={onNavigate} passage={verse(JOHN_1_1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tour from the hint line' }));
    fireEvent.click(screen.getByRole('button', { name: 'End the tour' }));
    expect(card()).toBeNull();
    expect(camera.setFocus).toHaveBeenCalledWith(null);
  });

  it('holds still while the view is put away, and carries on when it is back', async () => {
    const { camera, onNavigate, view } = await startTour();
    view.rerender(<Harness camera={camera} onNavigate={onNavigate} active={false} />);
    await elapse(WHOLE_TOUR_MS);
    expect(progress()).toBe('Tour · 1 of 3');
    view.rerender(<Harness camera={camera} onNavigate={onNavigate} active />);
    await elapse(STOP_MS);
    expect(progress()).toBe('Tour · 2 of 3');
  });

  it('holds still while the page is hidden', async () => {
    await startTour();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await elapse(WHOLE_TOUR_MS);
    expect(progress()).toBe('Tour · 1 of 3');
    Reflect.deleteProperty(document, 'hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await elapse(STOP_MS);
    expect(progress()).toBe('Tour · 2 of 3');
  });

  it('crossfades between pictures with reduced motion, from a picture of the one before', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const animate = vi.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, 'animate', {
      value: animate,
      configurable: true,
    });
    const { camera } = await startTour();
    expect(camera.snapshot).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], expect.anything());
    // One picture a stop: straight to both ends of the link.
    expect(camera.setPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ passage: { start: JOHN_1_1, end: JOHN_1_1 } }),
    );
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'animate');
  });

  it('hands the finale to the path light when there is one', async () => {
    const playPath = vi.fn<PlayPath>(() => Promise.resolve(true));
    const { onNavigate } = await startTour({ playPath });
    await elapse(2 * STOP_MS + HOLD_MS.pathStart);
    expect(progress()).toBe('Tour · 3 of 3');
    expect(playPath).toHaveBeenCalledOnce();
    const [steps, signal] = playPath.mock.calls[0] ?? [];
    expect(steps?.map((step) => step.verse)).toEqual([GEN_3_15, ISA_7_14, REV_22_13]);
    expect(signal?.aborted).toBe(false);
    await elapse(WHOLE_TOUR_MS);
    // The light's chain stays drawn with the reader, from its first verse.
    expect(signal?.aborted).toBe(false);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(verse(GEN_3_15));
  });

  it('stops for good when the view goes, taking the path light with it', async () => {
    const playPath = vi.fn<PlayPath>(() => new Promise(() => undefined));
    const { view } = await startTour({ playPath });
    await elapse(2 * STOP_MS + HOLD_MS.pathStart);
    const [, signal] = playPath.mock.calls[0] ?? [];
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe('coveredShare', () => {
  function sized(width: number, height: number, top = 0, bottom = 0) {
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientWidth', { value: width });
    Object.defineProperty(element, 'clientHeight', { value: height });
    element.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
    return element;
  }

  it('is the share of an upright axis the card lies across', () => {
    // The axis runs from 48px to 784px down an 800px stage; the card reaches 140px, plus 12.
    const share = coveredShare(sized(390, 800, 100), sized(300, 120, 0, 240));
    expect(share).toBeCloseTo((152 - 48) / 736);
  });

  it('is none where the axis runs along the bottom, or nothing is there to measure', () => {
    expect(coveredShare(sized(1440, 800), sized(300, 120, 0, 240))).toBe(0);
    expect(coveredShare(null, null)).toBe(0);
  });

  it('never takes more than a share of a short screen', () => {
    expect(coveredShare(sized(100, 200), sized(80, 180, 0, 190))).toBe(0.4);
  });
});
