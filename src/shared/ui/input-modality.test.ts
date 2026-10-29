import { describe, expect, it } from 'vitest';
import { usingKeyboard } from './input-modality.ts';

describe('usingKeyboard', () => {
  it('says the reader is on the keyboard once they press a key', () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(usingKeyboard()).toBe(true);
  });

  it('says they are not once they touch or click again', () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(usingKeyboard()).toBe(false);
  });
});
