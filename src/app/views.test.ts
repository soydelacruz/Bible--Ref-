import { describe, expect, it } from 'vitest';
import { VIEWS } from './views.ts';

describe('the views', () => {
  it.each(VIEWS.map((view) => [view.id, view] as const))(
    '%s downloads its code when asked, and only once',
    async (_, view) => {
      const code = view.load();
      expect(view.load()).toBe(code);
      await expect(code).resolves.toBeDefined();
    },
  );
});
