/**
 * Atmospheric glow shader. Renders a slightly larger sphere from the *back*
 * face so the camera sees a soft halo around Earth. Blue Rayleigh-style
 * scatter intensified at the day-night terminator (sunset rim).
 */

export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 viewPos = viewMatrix * worldPos;
    vNormalView = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(-viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
  }
`

export const atmosphereFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 sunDirView;
  uniform vec3 atmoColor;
  uniform float intensity;

  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    float fresnel = pow(1.0 - max(dot(vNormalView, vViewDir), 0.0), 2.5);
    float sunFacing = max(dot(vNormalView, normalize(sunDirView)), 0.0);
    // Glow strongest at the rim and toward the sun side.
    float glow = fresnel * (0.4 + 0.6 * sunFacing) * intensity;
    // Subtle warm tint at the terminator edge.
    float terminator = smoothstep(0.05, 0.0, sunFacing - 0.0);
    vec3 col = mix(atmoColor, vec3(1.0, 0.55, 0.3), terminator * fresnel * 0.4);
    gl_FragColor = vec4(col, glow);
  }
`
