import type { InstancedBufferGeometry } from 'three';
import {
  AdditiveBlending,
  GLSL3,
  LineSegments,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  RawShaderMaterial,
  Scene,
  Vector2,
  type Blending,
  type IUniform,
  type WebGLRenderer,
} from 'three';
import type { VerseIndexRange } from '../../core/bible/versification.ts';
import { GlowCompositor } from '../shared/glow.ts';
import { createCurveGeometry, type CurveKind } from '../shared/instanced-templates.ts';
import { createRenderer, genrePaletteUniform } from '../shared/webgl.ts';
import type { ArcInstances } from './arc-instances.ts';
import type { ArcLayout } from './arc-layout.ts';
import {
  LINE_FRAGMENT_SHADER,
  LINE_VERTEX_SHADER,
  RIBBON_FRAGMENT_SHADER,
  RIBBON_VERTEX_SHADER,
} from './arc-shaders.ts';
import type { AxisView } from './axis-view.ts';
import { ribbonSegments } from './ribbon-detail.ts';

const LINE_SEGMENTS = 48;

function createGeometry(
  kind: CurveKind,
  instances: ArcInstances,
  states?: Float32Array,
): InstancedBufferGeometry {
  return createCurveGeometry(
    kind,
    kind === 'line' ? LINE_SEGMENTS : ribbonSegments(instances.count),
    instances.count,
    {
      a_ends: { array: instances.endpoints, itemSize: 2 },
      a_genres: { array: instances.genres, itemSize: 2 },
      a_weight: { array: instances.weights, itemSize: 1 },
      // Hairlines also say whether each link stays through a change of filter (all do, at rest).
      ...(kind === 'line' && {
        a_state: { array: states ?? new Float32Array(instances.count), itemSize: 1 },
      }),
    },
  );
}

const EMPTY: ArcInstances = {
  count: 0,
  endpoints: new Float32Array(0),
  genres: new Float32Array(0),
  weights: new Float32Array(0),
};

type ArcObject =
  | LineSegments<InstancedBufferGeometry, RawShaderMaterial>
  | Mesh<InstancedBufferGeometry, RawShaderMaterial>;

/** Glow brightness while a passage is focused, so its own links stand out. */
const DIMMED_GLOW = 0.28;
/** The focused passage's links; faded while one link is previewed on its own. */
const FOCUS_ALPHA = 0.95;
const FOCUS_ALPHA_UNDER_PREVIEW = 0.22;
/** Where arcs grow out of when nothing is focused: nowhere, so they grow from their sources. */
const NO_ORIGIN = -1;

/**
 * The WebGL part of the arc diagram, drawn in three passes:
 * 1. every visible link as a hairline, accumulated additively into a half-float buffer;
 * 2. a full-screen pass that tone-maps that glow onto the surface (hue-preserving, so dense
 *    areas deepen in color instead of burning out to white);
 * 3. hovered and focused links as crisp anti-aliased ribbons on top.
 * Labels and the axis are drawn on a 2D overlay by the controller.
 */
export class ArcScene {
  readonly #renderer: WebGLRenderer;
  readonly #glow: GlowCompositor;
  readonly #glowScene = new Scene();
  readonly #overlayScene = new Scene();
  readonly #camera = new OrthographicCamera(); // Shaders output clip space directly.
  readonly #common = {
    u_viewport: { value: new Vector2(1, 1) },
    u_view: { value: new Vector2(0, 1) },
    u_axis: { value: new Vector2(0, 1) },
    u_baseline: { value: 0 },
    u_maxHeight: { value: 0 },
    u_vertical: { value: 0 },
    u_reveal: { value: 1 },
    u_origin: { value: new Vector2(NO_ORIGIN, NO_ORIGIN) },
    u_palette: { value: genrePaletteUniform() },
  };
  /** A change of filter, shared by the hairlines (see `setMorph`). */
  readonly #morph = { u_morph: { value: 1 }, u_morphRise: { value: 1 } };
  /** The focused links grow on their own, out of the focused passage (see `setFocusGrowth`). */
  readonly #focusGrowth = {
    u_reveal: { value: 1 },
    u_origin: { value: new Vector2(NO_ORIGIN, NO_ORIGIN) },
  };
  #focusFade = 1;
  #previewing = false;
  #ribbonsPrepared = false;
  readonly #lines: ArcObject;
  readonly #hover: ArcObject;
  readonly #focus: ArcObject;
  readonly #preview: ArcObject;

  constructor(canvas: HTMLCanvasElement) {
    this.#renderer = createRenderer(canvas);
    this.#renderer.autoClear = false;
    this.#glow = new GlowCompositor(this.#renderer);

    this.#lines = this.#createObject(this.#glowScene, 'line', AdditiveBlending, 1, 1, this.#morph);
    this.#hover = this.#createObject(this.#overlayScene, 'ribbon', NormalBlending, 0.85, 1.4);
    this.#focus = this.#createObject(
      this.#overlayScene,
      'ribbon',
      NormalBlending,
      FOCUS_ALPHA,
      1.8,
      this.#focusGrowth,
    );
    this.#preview = this.#createObject(this.#overlayScene, 'ribbon', NormalBlending, 1, 2);
    this.#hover.renderOrder = 1;
    this.#focus.renderOrder = 2;
    this.#preview.renderOrder = 3;
  }

  setSize(width: number, height: number): void {
    this.#renderer.setSize(width, height, false);
    this.#glow.setSize(width, height);
    this.#common.u_viewport.value.set(width, height);
  }

  setLayout(layout: ArcLayout): void {
    this.#common.u_axis.value.set(layout.axisStart, layout.axisEnd);
    this.#common.u_baseline.value = layout.baseline;
    this.#common.u_maxHeight.value = layout.maxArcHeight;
    this.#common.u_vertical.value = layout.orientation === 'vertical' ? 1 : 0;
    this.#glow.invalidate();
  }

  setView(view: AxisView): void {
    const current = this.#common.u_view.value;
    if (current.x !== view.start || current.y !== view.end) {
      current.set(view.start, view.end);
      this.#glow.invalidate();
    }
  }

  /**
   * All visible links as glowing hairlines. `ceiling` is the accumulated light at which the glow
   * reaches full intensity (see the composite shader). `states` marks, for a change of filter,
   * which links leave and which join (see `ArcMorph`); without it, all of them stay.
   */
  setLinks(instances: ArcInstances, ceiling: number, states?: Float32Array): void {
    this.#replace(this.#lines, instances, states);
    this.setCeiling(ceiling);
  }

  setCeiling(ceiling: number): void {
    this.#glow.setCeiling(ceiling);
    this.#glow.invalidate();
  }

  /**
   * How far a change of filter has gone, from 0 (as it was) to 1 (as it is now). With `rise`, the
   * links that go flatten into the axis and those that come rise out of it; without, they fade.
   */
  setMorph(progress: number, rise = true): void {
    this.#morph.u_morph.value = progress;
    this.#morph.u_morphRise.value = rise ? 1 : 0;
    this.#glow.invalidate();
  }

  /** How much of every arc is drawn, from its source (0–1): the intro animates it. */
  setReveal(reveal: number): void {
    this.#common.u_reveal.value = reveal;
    this.#glow.invalidate();
  }

  /** Dims the glow while something is focused, from 0 (not at all) to 1 (fully dimmed). */
  setDim(amount: number): void {
    this.#glow.setDim(1 + (DIMMED_GLOW - 1) * amount);
  }

  setHover(instances: ArcInstances | null): void {
    this.#replace(this.#hover, instances ?? EMPTY);
  }

  setFocus(instances: ArcInstances | null): void {
    this.#replace(this.#focus, instances ?? EMPTY);
  }

  /**
   * How much of the focused links is drawn (0–1), growing out of `origin` (the focused passage):
   * the links between its verses and elsewhere start in it, whichever way they point.
   */
  setFocusGrowth(reveal: number, origin: VerseIndexRange | null): void {
    this.#focusGrowth.u_reveal.value = reveal;
    this.#focusGrowth.u_origin.value.set(
      origin ? origin.start : NO_ORIGIN,
      origin ? origin.end + 1 : NO_ORIGIN,
    );
  }

  /** How visible the focused links are (0–1), for a crossfade instead of growing them. */
  setFocusFade(fade: number): void {
    this.#focusFade = fade;
    this.#updateFocusAlpha();
  }

  /**
   * Compiles the ribbons' shader ahead of the first ribbons drawn, in the background where the
   * browser can. Not when the scene is made: the first frames of a visit have enough to do.
   */
  prepareRibbons(): void {
    if (!this.#ribbonsPrepared) {
      this.#ribbonsPrepared = true;
      void this.#renderer.compileAsync(this.#overlayScene, this.#camera);
    }
  }

  /** One link on its own, on top; the focused passage's links fade meanwhile. */
  setPreview(instances: ArcInstances | null): void {
    this.#replace(this.#preview, instances ?? EMPTY);
    this.#previewing = instances !== null;
    this.#updateFocusAlpha();
  }

  render(): void {
    this.#renderer.clear();
    this.#glow.render(this.#glowScene, this.#camera);
    this.#renderer.render(this.#overlayScene, this.#camera);
  }

  dispose(): void {
    for (const object of [this.#lines, this.#hover, this.#focus, this.#preview]) {
      object.geometry.dispose();
      object.material.dispose();
    }
    this.#glow.dispose();
    // No `forceContextLoss()`: a canvas keeps one context for life, and React's development mode
    // remounts effects on the same canvas, so a lost context would break the next renderer.
    this.#renderer.dispose();
  }

  #updateFocusAlpha(): void {
    const alpha = this.#focus.material.uniforms['u_alpha'];
    if (alpha) {
      alpha.value = (this.#previewing ? FOCUS_ALPHA_UNDER_PREVIEW : FOCUS_ALPHA) * this.#focusFade;
    }
  }

  #createObject(
    scene: Scene,
    kind: CurveKind,
    blending: Blending,
    alpha: number,
    width: number,
    own: Readonly<Record<string, IUniform>> = {},
  ): ArcObject {
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: kind === 'line' ? LINE_VERTEX_SHADER : RIBBON_VERTEX_SHADER,
      fragmentShader: kind === 'line' ? LINE_FRAGMENT_SHADER : RIBBON_FRAGMENT_SHADER,
      uniforms: {
        ...this.#common,
        u_alpha: { value: alpha },
        u_width: { value: width },
        ...own,
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending,
    });
    const geometry = createGeometry(kind, EMPTY);
    const object =
      kind === 'line' ? new LineSegments(geometry, material) : new Mesh(geometry, material);
    object.frustumCulled = false;
    object.visible = false;
    scene.add(object);
    return object;
  }

  #replace(object: ArcObject, instances: ArcInstances, states?: Float32Array): void {
    const kind = object instanceof LineSegments ? 'line' : 'ribbon';
    object.geometry.dispose();
    object.geometry = createGeometry(kind, instances, states);
    object.visible = instances.count > 0;
    if (kind === 'line') {
      this.#glow.invalidate();
    }
  }
}
