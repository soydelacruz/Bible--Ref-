import { elementAt } from '../../core/lib/array.ts';
import type { CrossReferenceIndex } from '../../cross-references/cross-reference-index.ts';
import { GENRE_HEX, GENRE_RGB } from '../shared/palette.ts';
import {
  ARRIVAL_SCALE,
  glideDotRadius,
  glideLineVertices,
  glideVertices,
  LINE_FLOATS,
  SLOT_FLOATS,
  type GlidePlan,
  type PlacedLabel,
  type ShownLabel,
} from './cluster-glide.ts';
import {
  LABEL_SIZE,
  placeClusterLabels,
  type ClusterLabel,
  type LabelText,
} from './cluster-labels.ts';
import type { ClusterGroup, ClusterLayout, ClusterSide } from './cluster-layout.ts';

/**
 * The faint haze of every link drawn: enough of them at once read as a texture, not lines. The
 * more links, the fainter each, so that a hundred thousand of them make a mist rather than a wall.
 */
const HAZE_WIDTH = 0.5;

export function hazeAlpha(links: number): number {
  return Math.min(0.06, 4 / Math.sqrt(Math.max(1, links)));
}
const DOT_ALPHA = 0.9;
const LABEL_COLOR = 'rgba(235, 235, 235, 0.78)';
const HEADING_COLOR = 'rgba(235, 235, 235, 0.55)';
/**
 * A rim of the surface around every letter: a name that crosses the dots of a neighbouring
 * cluster stays readable over them.
 */
const HALO_COLOR = 'rgba(13, 13, 13, 0.75)';
const HALO_WIDTH = 2.5;

/** How each kind of label is set: a book's name, a chapter's number, a band's heading. */
const LABEL_STYLES = {
  name: { font: `${String(LABEL_SIZE.name)}px`, color: LABEL_COLOR, baseline: 'bottom' },
  chapter: { font: `${String(LABEL_SIZE.chapter)}px`, color: LABEL_COLOR, baseline: 'bottom' },
  heading: {
    font: `600 ${String(LABEL_SIZE.heading)}px`,
    color: HEADING_COLOR,
    baseline: 'alphabetic',
  },
} as const satisfies Record<
  PlacedLabel['kind'],
  { font: string; color: string; baseline: CanvasTextBaseline }
>;

export interface BaseScene {
  readonly layout: ClusterLayout;
  readonly index: CrossReferenceIndex;
  readonly linkIds: Int32Array;
  readonly verseGenres: Uint8Array;
  /** A cluster's name, in full and in short (for where the full name has no room). */
  readonly label: (group: ClusterGroup) => LabelText;
  /** The heading over each band, e.g. "Old Testament". */
  readonly headings: Readonly<Partial<Record<ClusterSide, string>>>;
  readonly fontFamily: string;
}

/** Dots to fill: verses, and where each is drawn, by position. */
interface Dots {
  readonly nodes: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
}

/** Dots of one genre in one path: ten fills instead of one per verse. */
function fillDots(
  context: CanvasRenderingContext2D,
  dots: Dots,
  positions: Iterable<number>,
  verseGenres: Uint8Array,
  radius: number,
): void {
  const paths = GENRE_HEX.map(() => new Path2D());
  for (const position of positions) {
    const genre = elementAt(verseGenres, elementAt(dots.nodes, position));
    const x = elementAt(dots.x, position);
    const y = elementAt(dots.y, position);
    const path = elementAt(paths, genre);
    path.moveTo(x + radius, y);
    path.arc(x, y, radius, 0, Math.PI * 2);
  }
  paths.forEach((path, genre) => {
    context.fillStyle = elementAt(GENRE_HEX, genre);
    context.fill(path);
  });
}

/** The picture at rest: the haze of links, every dot, and the names placed by `placeLabels`. */
export function drawBase(
  context: CanvasRenderingContext2D,
  scene: BaseScene,
  labels: readonly PlacedLabel[],
): void {
  const { layout, index, linkIds, verseGenres } = scene;
  context.clearRect(0, 0, layout.width, layout.height);

  context.strokeStyle = `rgba(255, 255, 255, ${String(hazeAlpha(linkIds.length))})`;
  context.lineWidth = HAZE_WIDTH;
  context.beginPath();
  for (const id of linkIds) {
    const from = elementAt(layout.nodeOf, elementAt(index.sources, id));
    const to = elementAt(layout.nodeOf, elementAt(index.targetStarts, id));
    context.moveTo(elementAt(layout.x, from), elementAt(layout.y, from));
    context.lineTo(elementAt(layout.x, to), elementAt(layout.y, to));
  }
  context.stroke();

  context.globalAlpha = DOT_ALPHA;
  fillDots(context, layout, layout.nodes.keys(), verseGenres, layout.dotRadius);
  context.globalAlpha = 1;

  drawLabels(context, labels, scene.fontFamily);
}

function setLabelStyle(
  context: CanvasRenderingContext2D,
  kind: PlacedLabel['kind'],
  fontFamily: string,
): void {
  const style = LABEL_STYLES[kind];
  context.font = `${style.font} ${fontFamily}`;
  context.fillStyle = style.color;
  context.textBaseline = style.baseline;
}

/**
 * Where the names of the clusters and the headings of the bands go, measured in the type they are
 * drawn in (see `placeClusterLabels`): no two overlap, and a name with no room is shortened or
 * left out. Worked out once per picture, so a glide moves the names rather than re-deals them.
 */
export function placeLabels(context: CanvasRenderingContext2D, scene: BaseScene): ClusterLabel[] {
  const widths = new Map<string, number>();
  return placeClusterLabels(scene.layout, {
    measure: (text, kind) => {
      const key = `${kind}\u0000${text}`;
      let width = widths.get(key);
      if (width === undefined) {
        setLabelStyle(context, kind, scene.fontFamily);
        width = context.measureText(text).width;
        widths.set(key, width);
      }
      return width;
    },
    name: scene.label,
    headings: scene.headings,
  });
}

function drawLabels(
  context: CanvasRenderingContext2D,
  labels: readonly (PlacedLabel | ShownLabel)[],
  fontFamily: string,
): void {
  context.textAlign = 'center';
  context.lineJoin = 'round';
  context.lineWidth = HALO_WIDTH;
  context.strokeStyle = HALO_COLOR;
  for (const label of labels) {
    const alpha = 'alpha' in label ? label.alpha : 1;
    if (alpha <= 0) continue;
    setLabelStyle(context, label.kind, fontFamily);
    context.globalAlpha = alpha;
    context.strokeText(label.text, label.x, label.y);
    context.fillText(label.text, label.x, label.y);
  }
  context.globalAlpha = 1;
}

/**
 * The names mid-glide, moving and fading (see `blendLabels`). The dots and links under them are
 * drawn by a `GlideRenderer`, so this canvas holds the names alone until the glide lands.
 */
export function drawGlideLabels(
  context: CanvasRenderingContext2D,
  layout: ClusterLayout,
  labels: readonly ShownLabel[],
  fontFamily: string,
): void {
  context.clearRect(0, 0, layout.width, layout.height);
  drawLabels(context, labels, fontFamily);
}

/** A slot's place `progress` of the way from where it starts to where it ends, in clip space. */
const PLACE = `
attribute vec4 a_move;
uniform vec2 u_stage;
uniform float u_progress;

vec4 place() {
  vec2 point = mix(a_move.xy, a_move.zw, u_progress);
  return vec4(point.x / u_stage.x * 2.0 - 1.0, 1.0 - point.y / u_stage.y * 2.0, 0.0, 1.0);
}
`;

/** A link's two ends follow their dots; it is as strong as it is part-way from start to end. */
const LINE_VERTEX = `${PLACE}
attribute vec2 a_strength;
uniform float u_thin;
varying float v_alpha;

void main() {
  gl_Position = place();
  v_alpha = mix(a_strength.x, a_strength.y, u_progress) * u_thin;
}
`;

const LINE_FRAGMENT = `
precision mediump float;
varying float v_alpha;

void main() {
  gl_FragColor = vec4(v_alpha);
}
`;

/**
 * Each dot is a point as wide as its disc, with a pixel spare for its soft edge. A leaving dot
 * fades out from how opaque it starts; any other fades in to fully drawn (see `slotAlpha`).
 */
const DOT_VERTEX = `${PLACE}
attribute float a_genre;
attribute float a_role;
attribute float a_fade;
uniform float u_ratio;
uniform vec3 u_radius;
uniform float u_dotAlpha;
uniform vec3 u_palette[${String(GENRE_RGB.length)}];
varying vec4 v_color;
varying float v_radius;

void main() {
  gl_Position = place();
  float radius = a_role < 0.5 ? u_radius.x : a_role < 1.5 ? u_radius.y : u_radius.z;
  float opacity = a_role > 1.5 ? a_fade * (1.0 - u_progress) : mix(a_fade, 1.0, u_progress);
  float alpha = u_dotAlpha * opacity;
  v_radius = radius * u_ratio;
  gl_PointSize = 2.0 * v_radius + 2.0;
  v_color = vec4(u_palette[int(a_genre + 0.5)] * alpha, alpha);
}
`;

const DOT_FRAGMENT = `
precision mediump float;
varying vec4 v_color;
varying float v_radius;

void main() {
  float distance = length(gl_PointCoord - 0.5) * (2.0 * v_radius + 2.0);
  float coverage = clamp(v_radius - distance + 0.5, 0.0, 1.0);
  if (coverage <= 0.0) discard;
  gl_FragColor = v_color * coverage;
}
`;

/** Attribute slots, fixed for both programs (each reads its own buffer). */
const ATTRIBUTES = { a_move: 0, a_genre: 1, a_role: 2, a_fade: 3, a_strength: 4 } as const;

function compile(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not create a shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? 'Could not compile a shader');
    }
    gl.attachShader(program, shader);
  }
  for (const [name, location] of Object.entries(ATTRIBUTES)) {
    gl.bindAttribLocation(program, location, name);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Could not link a program');
  }
  return program;
}

/**
 * Draws a glide's dots and links on the GPU. Canvas 2D fills tens of thousands of small discs far
 * too slowly to redraw them every frame on a phone; here each slot's start and end go up once per
 * glide, the GPU moves every dot itself, and a frame sends it nothing but a few numbers.
 */
export class GlideRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGLRenderingContext;
  readonly #lines: WebGLProgram;
  readonly #dots: WebGLProgram;
  readonly #vertices: WebGLBuffer;
  readonly #lineVertices: WebGLBuffer;
  #plan: GlidePlan | null = null;
  #slots = 0;
  #lineEnds = 0;
  #stage = { width: 1, height: 1, ratio: 1 };

  /** A renderer on `canvas`, or `null` where WebGL is not to be had (the layout then jumps). */
  static create(canvas: HTMLCanvasElement): GlideRenderer | null {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false,
    });
    if (!gl) return null;
    try {
      return new GlideRenderer(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.#canvas = canvas;
    this.#gl = gl;
    this.#lines = compile(gl, LINE_VERTEX, LINE_FRAGMENT);
    this.#dots = compile(gl, DOT_VERTEX, DOT_FRAGMENT);
    this.#vertices = gl.createBuffer();
    this.#lineVertices = gl.createBuffer();
    gl.useProgram(this.#dots);
    gl.uniform3fv(gl.getUniformLocation(this.#dots, 'u_palette'), GENRE_RGB.flat());
  }

  /** Sends a glide to the GPU: where every slot starts and ends, and the links between them. */
  load(plan: GlidePlan, layout: ClusterLayout, verseGenres: Uint8Array, ratio: number): void {
    const gl = this.#gl;
    const width = Math.round(layout.width * ratio);
    const height = Math.round(layout.height * ratio);
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#vertices);
    gl.bufferData(gl.ARRAY_BUFFER, glideVertices(plan, layout, verseGenres), gl.STATIC_DRAW);
    const lines = glideLineVertices(plan, layout);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#lineVertices);
    gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
    this.#plan = plan;
    this.#slots = plan.count + plan.leaving.length;
    this.#lineEnds = lines.length / LINE_FLOATS;
    this.#stage = { width: layout.width, height: layout.height, ratio };
  }

  /** Points the given attributes into the buffer bound now, and turns every other one off. */
  #attributes(
    stride: number,
    layout: readonly (readonly [location: number, size: number, offset: number])[],
  ): void {
    const gl = this.#gl;
    for (const location of Object.values(ATTRIBUTES)) gl.disableVertexAttribArray(location);
    for (const [location, size, offset] of layout) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
    }
  }

  /**
   * Draws the glide `progress` of the way through: links first, then dots, as at rest. Returns
   * false if it could not (the GPU was lost), for the caller to land the glide at once instead.
   */
  draw(progress: number): boolean {
    const gl = this.#gl;
    const plan = this.#plan;
    if (!plan || gl.isContextLost()) return false;
    const { width, height, ratio } = this.#stage;
    const float = Float32Array.BYTES_PER_ELEMENT;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const uniform = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name);

    gl.useProgram(this.#lines);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#lineVertices);
    this.#attributes(LINE_FLOATS * float, [
      [ATTRIBUTES.a_move, 4, 0],
      [ATTRIBUTES.a_strength, 2, 4 * float],
    ]);
    gl.uniform2f(uniform(this.#lines, 'u_stage'), width, height);
    gl.uniform1f(uniform(this.#lines, 'u_progress'), progress);
    // A GPU line is a whole device pixel wide; the canvas's are half a CSS pixel, which is less
    // than one where a CSS pixel is one device pixel, so they are drawn fainter to match.
    gl.uniform1f(uniform(this.#lines, 'u_thin'), Math.min(1, HAZE_WIDTH * ratio));
    if (this.#lineEnds > 0) gl.drawArrays(gl.LINES, 0, this.#lineEnds);

    gl.useProgram(this.#dots);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#vertices);
    this.#attributes(SLOT_FLOATS * float, [
      [ATTRIBUTES.a_move, 4, 0],
      [ATTRIBUTES.a_genre, 1, 4 * float],
      [ATTRIBUTES.a_role, 1, 5 * float],
      [ATTRIBUTES.a_fade, 1, 6 * float],
    ]);
    gl.uniform2f(uniform(this.#dots, 'u_stage'), width, height);
    gl.uniform1f(uniform(this.#dots, 'u_progress'), progress);
    gl.uniform1f(uniform(this.#dots, 'u_ratio'), ratio);
    gl.uniform3f(
      uniform(this.#dots, 'u_radius'),
      glideDotRadius(plan, progress),
      plan.toDotRadius * (ARRIVAL_SCALE + (1 - ARRIVAL_SCALE) * progress),
      plan.fromDotRadius,
    );
    gl.uniform1f(uniform(this.#dots, 'u_dotAlpha'), DOT_ALPHA);
    gl.drawArrays(gl.POINTS, 0, this.#slots);
    return true;
  }

  /** Clears the canvas, once the glide has landed and the picture at rest is drawn below. */
  clear(): void {
    const gl = this.#gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.#plan = null;
  }

  dispose(): void {
    const gl = this.#gl;
    gl.deleteBuffer(this.#vertices);
    gl.deleteBuffer(this.#lineVertices);
    gl.deleteProgram(this.#lines);
    gl.deleteProgram(this.#dots);
  }
}

/** Links to stand out, as pairs of dot positions, each colored by a genre. */
export interface Segments {
  readonly from: Int32Array;
  readonly to: Int32Array;
  readonly genre: Uint8Array;
}

export interface Overlay {
  readonly layout: ClusterLayout;
  readonly verseGenres: Uint8Array;
  readonly segments: Segments;
  /** How far the links have grown from their start, in [0, 1]. */
  readonly progress: number;
  /**
   * How far the highlight has swelled in, in [0, 1]: its dots grow from their size at rest, its
   * rings close in and its links brighten, quickly, so pointing feels answered rather than cut.
   */
  readonly grow: number;
  /** Bold for one passage's links, faint for a whole book's. */
  readonly strength: 'strong' | 'soft';
  /** Dots drawn bright over the dimmed picture: the ends of the links. */
  readonly marked: Iterable<number>;
  /** Dots ringed: the focused passage. */
  readonly ringed: readonly number[];
}

/** A ring's radius as it swells in, as a share of its own. */
const RING_GROW_FROM = 0.7;

/** What stands out over the picture: the links of a passage or a book, and their dots. */
export function drawOverlay(context: CanvasRenderingContext2D, overlay: Overlay): void {
  const { layout, segments, progress, grow, strength, verseGenres } = overlay;
  context.clearRect(0, 0, layout.width, layout.height);
  if (segments.from.length > 0) {
    const paths = GENRE_HEX.map(() => new Path2D());
    segments.from.forEach((from, i) => {
      const to = elementAt(segments.to, i);
      const x0 = elementAt(layout.x, from);
      const y0 = elementAt(layout.y, from);
      const path = elementAt(paths, elementAt(segments.genre, i));
      path.moveTo(x0, y0);
      path.lineTo(
        x0 + (elementAt(layout.x, to) - x0) * progress,
        y0 + (elementAt(layout.y, to) - y0) * progress,
      );
    });
    context.lineWidth = strength === 'strong' ? 1.2 : 0.7;
    context.globalAlpha = (strength === 'strong' ? 0.85 : 0.3) * grow;
    paths.forEach((path, genre) => {
      context.strokeStyle = elementAt(GENRE_HEX, genre);
      context.stroke(path);
    });
    context.globalAlpha = 1;
  }

  const scale = strength === 'strong' ? 1.6 : 1.2;
  const radius = layout.dotRadius * (1 + (scale - 1) * grow);
  fillDots(context, layout, overlay.marked, verseGenres, radius);

  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;
  const ring = Math.max(4, layout.dotRadius * 2.6) * (RING_GROW_FROM + (1 - RING_GROW_FROM) * grow);
  for (const position of overlay.ringed) {
    context.beginPath();
    context.arc(elementAt(layout.x, position), elementAt(layout.y, position), ring, 0, Math.PI * 2);
    context.stroke();
  }
}
