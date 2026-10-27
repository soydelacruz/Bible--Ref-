import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuRows } from '../visualizations/shared/components/MenuButton.tsx';
import { WanderButton } from './WanderButton.tsx';

/** Stands in for the Web Animations API, which the test DOM leaves out. */
function stubAnimate() {
  const animate = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true });
  return animate;
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'animate');
});

describe('WanderButton', () => {
  it('wanders from a click, or from the keyboard', async () => {
    const user = userEvent.setup();
    const onWander = vi.fn();
    render(<WanderButton flourish={false} onWander={onWander} />);
    const button = screen.getByRole('button', { name: 'Wander' });
    // Where the header has no room for the label, the tooltip still says what it does.
    expect(button.getAttribute('title')).toBe('Go to a richly linked verse you may not know');
    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onWander).toHaveBeenCalledTimes(3);
  });

  it('turns its compass only while it is asked to, on the first press', async () => {
    const user = userEvent.setup();
    const animate = stubAnimate();
    const { rerender } = render(<WanderButton flourish onWander={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Wander' }));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { transform: 'rotate(0turn)' },
      { transform: 'rotate(1turn)' },
    ]);

    rerender(<WanderButton flourish={false} onWander={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Wander' }));
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('dims rather than turns where motion is reduced', async () => {
    const user = userEvent.setup();
    const animate = stubAnimate();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<WanderButton flourish onWander={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Wander' }));
    expect(animate.mock.calls[0]?.[0]).toEqual([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }]);
  });

  it('wanders without the flourish where the browser cannot animate', async () => {
    const user = userEvent.setup();
    const onWander = vi.fn();
    render(<WanderButton flourish onWander={onWander} />);
    await user.click(screen.getByRole('button', { name: 'Wander' }));
    expect(onWander).toHaveBeenCalledOnce();
  });

  it('spells out its name as a row of the More menu, with no tooltip', () => {
    render(
      <MenuRows value>
        <WanderButton flourish={false} onWander={vi.fn()} />
      </MenuRows>,
    );
    const button = screen.getByRole('button', { name: 'Wander' });
    expect(button.textContent).toBe('Wander');
    expect(button.hasAttribute('title')).toBe(false);
  });
});
