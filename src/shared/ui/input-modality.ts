/**
 * Whether the reader is on the keyboard: the last thing they did was press a key, rather than
 * touch or click.
 *
 * Motion that answers a key stays instant. A reader stepping through with the keyboard moves
 * fast and knows where they are going, and an entrance or an exit in their way only makes them
 * wait; a pointer opening a menu, or closing the details, is shown where the thing came from and
 * went. So a menu or a panel asks this as it comes or goes.
 *
 * Both listeners are on the window, capturing, so they have run before any handler that asks.
 */
let lastInput: 'keyboard' | 'pointer' = 'pointer';

window.addEventListener(
  'keydown',
  () => {
    lastInput = 'keyboard';
  },
  true,
);
window.addEventListener(
  'pointerdown',
  () => {
    lastInput = 'pointer';
  },
  true,
);

/** Whether the latest input was a key (see the module's note). */
export function usingKeyboard(): boolean {
  return lastInput === 'keyboard';
}
