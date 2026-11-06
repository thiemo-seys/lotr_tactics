// A floating number's pop (docs/viewer-spec.md section 5, Effects; ui/float.ts), without a DOM.

import { describe, expect, it } from 'vitest';
import { FloatView, type FloatElement } from '../src/ui/float.js';

const element = (): FloatElement => ({ style: { opacity: '', translate: '', scale: '' } });

describe('floating numbers', () => {
  it('pops in on the inner element, never the one CSS2DRenderer positions, whose transform a scale would multiply', () => {
    const view = new FloatView(element(), element());
    view.scale(1.7);
    expect(view.inner.style.scale).toBe('1.7');
    expect(view.outer.style.scale).toBe('');
    view.scale(1);
    expect(view.inner.style.scale).toBe('1');
    expect(view.outer.style.scale).toBe('');
  });

  it('fades and lifts the positioned element, neither of which scales its offset', () => {
    const view = new FloatView(element(), element());
    view.opacity(0.5);
    view.lift(12);
    expect(view.outer.style).toEqual({ opacity: '0.5', translate: '0 -12px', scale: '' });
    expect(view.inner.style).toEqual({ opacity: '', translate: '', scale: '' });
  });

  it('writes a style only when its value changes, so a paused fight writes nothing', () => {
    const outer = element();
    const writes: string[] = [];
    const style = outer.style;
    const watched: FloatElement = {
      style: {
        get opacity() {
          return style.opacity;
        },
        set opacity(value: string) {
          writes.push(value);
          style.opacity = value;
        },
        translate: '',
        scale: '',
      },
    };
    const view = new FloatView(watched, element());
    view.opacity(0.5);
    view.opacity(0.5);
    expect(writes).toEqual(['0.5']);
  });
});
