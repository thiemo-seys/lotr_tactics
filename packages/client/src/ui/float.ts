// A floating number or cast name over a unit (docs/viewer-spec.md section 5, Numbers and Effects), as
// two elements. The outer one is the CSS2DObject's: CSS2DRenderer writes its screen position into the
// outer element's `transform` every frame, and CSS's `scale` multiplies all of that transform, offset
// and all, so a number scaled there would start far from its unit and fly in as it shrinks. The pop
// goes on the inner element instead; the outer one takes only what doesn't scale its offset: opacity,
// and `translate`, which is applied after the transform. Each write happens only when its value
// changes, so a paused fight writes nothing.

/** The styles a floating text writes: what an element's `style` has of them. */
export interface FloatStyle {
  opacity: string;
  translate: string;
  scale: string;
}

/** An element as a floating text uses it: its style, which a test can stand in for without a DOM. */
export interface FloatElement {
  readonly style: FloatStyle;
}

export class FloatView<E extends FloatElement = FloatElement> {
  private shown = { opacity: -1, lift: 0, scale: 1 };

  /**
   * @param outer the element CSS2DRenderer positions, with the inner one in it.
   * @param inner the element that pops in, scaled about its bottom edge.
   */
  constructor(
    readonly outer: E,
    readonly inner: E,
  ) {}

  /** A floating text's elements: its kind's classes on the outer one, its text in the inner one. */
  static create(className: string, text: string): FloatView<HTMLElement> {
    const outer = document.createElement('div');
    outer.className = className;
    const inner = document.createElement('span');
    inner.className = 'float-pop';
    inner.textContent = text;
    outer.append(inner);
    return new FloatView(outer, inner);
  }

  opacity(value: number): void {
    if (value === this.shown.opacity) return;
    this.shown.opacity = value;
    this.outer.style.opacity = String(value);
  }

  /** Moves it up `pixels` on screen, to clear its unit's label. */
  lift(pixels: number): void {
    if (pixels === this.shown.lift) return;
    this.shown.lift = pixels;
    this.outer.style.translate = `0 ${-pixels}px`;
  }

  /** Its size as it pops in, times its own: on the inner element, never the positioned one. */
  scale(value: number): void {
    if (value === this.shown.scale) return;
    this.shown.scale = value;
    this.inner.style.scale = String(value);
  }
}
