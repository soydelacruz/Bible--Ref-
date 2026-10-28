/**
 * GLSL (WebGL2) for the arc diagram. Arc geometry is computed on the GPU from per-link
 * endpoints and view uniforms, so zooming and panning never re-upload link data.
 *
 * An arc from along-positions `a` to `b` is half an ellipse: its center is midway, its width is
 * `|b - a|`, and its height is half the width (a semicircle) up to `u_maxHeight`, so distant
 * links flatten instead of leaving the screen.
 */

const COMMON = /* glsl */ `
  precision highp float;

  uniform vec2 u_viewport;   // stage size, CSS px
  uniform vec2 u_view;       // visible window: start, end (verse units)
  uniform vec2 u_axis;       // along-axis pixel range of the window
  uniform float u_baseline;  // across-axis pixel coordinate of the axis
  uniform float u_maxHeight; // tallest arc, px
  uniform float u_vertical;  // 0: horizontal axis, arcs rise up; 1: vertical axis, arcs go right
  uniform float u_reveal;    // share of every arc drawn: the intro (and focusing) grows it to 1
  uniform vec2 u_origin;     // verses the arcs grow out of (a focused passage); none: (-1, -1)
  uniform vec3 u_palette[10];

  const float PI = 3.14159265;

  float alongOf(float verse) {
    return u_axis.x + (verse - u_view.x) / (u_view.y - u_view.x) * (u_axis.y - u_axis.x);
  }

  // Arc point at angle theta (0 at a, PI at b) in local (along, height) coordinates.
  vec2 arcLocal(float a, float b, float theta) {
    float radius = 0.5 * (b - a);
    float height = min(abs(radius), u_maxHeight);
    return vec2(0.5 * (a + b) - radius * cos(theta), height * sin(theta));
  }

  vec2 arcTangent(float a, float b, float theta) {
    float radius = 0.5 * (b - a);
    float height = min(abs(radius), u_maxHeight);
    return vec2(radius * sin(theta), height * cos(theta));
  }

  vec2 toScreen(vec2 local) {
    return u_vertical < 0.5
      ? vec2(local.x, u_baseline - local.y)
      : vec2(u_baseline + local.y, local.x);
  }

  vec2 toScreenDirection(vec2 local) {
    return u_vertical < 0.5 ? vec2(local.x, -local.y) : vec2(local.y, local.x);
  }

  vec4 toClip(vec2 px) {
    return vec4(px.x / u_viewport.x * 2.0 - 1.0, 1.0 - px.y / u_viewport.y * 2.0, 0.0, 1.0);
  }

  // An arc spans the stretch of the axis between its ends, so one with both ends past the same
  // edge of the stage is out of sight whatever its height: zoomed in, many links are. Its vertices
  // are put beyond the far plane, so its triangles are clipped whole and it costs no shading or
  // blending. The margin covers the widest ribbon.
  const float OFF_STAGE_MARGIN = 4.0;
  const vec4 OFF_STAGE = vec4(0.0, 0.0, 2.0, 1.0);

  bool isOffStage(float a, float b) {
    float extent = u_vertical < 0.5 ? u_viewport.x : u_viewport.y;
    return max(a, b) < -OFF_STAGE_MARGIN || min(a, b) > extent + OFF_STAGE_MARGIN;
  }

  vec3 arcColor(vec2 genres, float t) {
    return mix(u_palette[int(genres.x + 0.5)], u_palette[int(genres.y + 0.5)], t);
  }

  // Arcs grow from their source, except a link into the origin from elsewhere: it grows from its
  // target, so all of a focused passage's links grow out of the passage.
  bool growsFromTarget(vec2 ends) {
    bool sourceInside = ends.x >= u_origin.x && ends.x <= u_origin.y;
    bool targetInside = ends.y >= u_origin.x && ends.y <= u_origin.y;
    return targetInside && !sourceInside;
  }

  // Past the revealed share, vertices collapse onto its end, so each arc grows from one end.
  float revealed(float t, vec2 ends) {
    return growsFromTarget(ends) ? max(t, 1.0 - u_reveal) : min(t, u_reveal);
  }

  // How far behind the growing tip a point of the arc is, as a share of the arc (0 at the tip).
  float behindTip(float t, vec2 ends) {
    return max(growsFromTarget(ends) ? t - (1.0 - u_reveal) : u_reveal - t, 0.0);
  }

  // The arcs also fade in while they grow.
  float revealFade() {
    return smoothstep(0.0, 0.5, u_reveal);
  }
`;

/**
 * Hairline arcs (GL_LINES), drawn with additive blending so dense regions glow. While the filter
 * changes, the links of both filters are drawn: those leaving flatten into the axis and fade, and
 * those joining rise out of it.
 */
export const LINE_VERTEX_SHADER = /* glsl */ `
  ${COMMON}
  uniform float u_alpha;
  uniform float u_morph;     // how far a change of filter has gone, 0 to 1 (1 when none is going on)
  uniform float u_morphRise; // 1: arcs flatten and rise as they go and come; 0: they only fade

  in vec3 position;   // x: t in [0, 1] along the arc
  in vec2 a_ends;
  in vec2 a_genres;
  in float a_weight;
  in float a_state;   // -1: leaving the filter; 0: staying; 1: joining

  out vec4 v_color;

  void main() {
    float a = alongOf(a_ends.x);
    float b = alongOf(a_ends.y);
    if (isOffStage(a, b)) {
      gl_Position = OFF_STAGE;
      v_color = vec4(0.0);
      return;
    }
    float t = revealed(position.x, a_ends);
    float presence = a_state < -0.5 ? 1.0 - u_morph : (a_state > 0.5 ? u_morph : 1.0);
    vec2 local = arcLocal(a, b, PI * t);
    local.y *= mix(1.0, presence, u_morphRise);
    gl_Position = toClip(toScreen(local));
    v_color = vec4(arcColor(a_genres, t), u_alpha * a_weight * revealFade() * presence * presence);
  }
`;

/**
 * Anti-aliased ribbons of constant screen width, for focused and hovered links. While they grow,
 * the stretch just behind each growing tip is lit up, like the loading screen's arcs of light.
 */
export const RIBBON_VERTEX_SHADER = /* glsl */ `
  ${COMMON}
  uniform float u_alpha;
  uniform float u_width;

  in vec3 position;   // x: t in [0, 1] along the arc; y: side, -1 or 1
  in vec2 a_ends;
  in vec2 a_genres;
  in float a_weight;

  out vec4 v_color;
  out float v_side;

  // The light at the tip fades as the arcs finish growing, and is gone once they have.
  const float TIP_LENGTH = 0.18;
  const float TIP_LIGHT = 0.6;

  void main() {
    float a = alongOf(a_ends.x);
    float b = alongOf(a_ends.y);
    if (isOffStage(a, b)) {
      gl_Position = OFF_STAGE;
      v_color = vec4(0.0);
      v_side = 0.0;
      return;
    }
    float t = revealed(position.x, a_ends);
    vec2 point = toScreen(arcLocal(a, b, PI * t));
    vec2 tangent = toScreenDirection(arcTangent(a, b, PI * t));
    vec2 normal = length(tangent) > 1e-4 ? normalize(vec2(-tangent.y, tangent.x)) : vec2(0.0, 1.0);
    gl_Position = toClip(point + normal * position.y * u_width * 0.5);
    float tip = (1.0 - smoothstep(0.0, TIP_LENGTH, behindTip(position.x, a_ends))) * (1.0 - u_reveal);
    vec3 color = mix(arcColor(a_genres, t), vec3(1.0), tip * TIP_LIGHT);
    v_color = vec4(color, u_alpha * mix(0.55, 1.0, a_weight) * revealFade());
    v_side = position.y;
  }
`;

export const LINE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  in vec4 v_color;
  out vec4 fragColor;
  void main() {
    fragColor = v_color;
  }
`;

export const RIBBON_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  in vec4 v_color;
  in float v_side;
  out vec4 fragColor;
  void main() {
    float edge = 1.0 - smoothstep(0.5, 1.0, abs(v_side));
    fragColor = vec4(v_color.rgb, v_color.a * edge);
  }
`;
