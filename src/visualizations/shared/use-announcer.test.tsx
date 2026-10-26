import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANNOUNCE_DELAY_MS, ANNOUNCEMENT_MS, useAnnouncer } from './use-announcer.ts';

/** A region and a button that speaks through it, as the panel has. */
function Speaker({ message }: { readonly message: string }) {
  const [region, announce] = useAnnouncer<HTMLParagraphElement>();
  return (
    <>
      <p ref={region} role="status" />
      <button
        type="button"
        onClick={() => {
          announce(message);
        }}
      >
        Speak
      </button>
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAnnouncer', () => {
  it('says a message a moment after emptying the region, then clears it', () => {
    render(<Speaker message="John 3:16 copied" />);
    act(() => {
      screen.getByRole('button').click();
    });
    expect(screen.getByRole('status').textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
    });
    expect(screen.getByRole('status').textContent).toBe('John 3:16 copied');
    act(() => {
      vi.advanceTimersByTime(ANNOUNCEMENT_MS);
    });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('says the same message again, by emptying the region in between', () => {
    render(<Speaker message="John 3:16 copied" />);
    act(() => {
      screen.getByRole('button').click();
      vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
    });
    act(() => {
      screen.getByRole('button').click();
    });
    expect(screen.getByRole('status').textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
    });
    expect(screen.getByRole('status').textContent).toBe('John 3:16 copied');
  });

  it('does nothing without a region to speak through', () => {
    const { result } = renderHook(() => useAnnouncer<HTMLParagraphElement>());
    expect(() => {
      result.current[1]('Nobody hears this');
    }).not.toThrow();
  });

  it('stops once it is gone', () => {
    const { unmount } = render(<Speaker message="John 3:16 copied" />);
    act(() => {
      screen.getByRole('button').click();
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
