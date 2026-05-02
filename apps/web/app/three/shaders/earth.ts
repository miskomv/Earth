/**
 * Earth surface shader. Blends:
 *   - day texture (NASA Blue Marble or GIBS daily)
 *   - night texture (Black Marble city lights)
 *   - normal map (topography)
 *   - specular mask (water = shiny)
 *   - cloud projection (clouds darken day side, faint silver on night side)
 *
 * Lighting is hand-rolled (one directional sun) so we can drive the
 * day/night terminator from `sunDir` and softly transition cities visible
 * only in shadow.
 */

export const earthVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vec4 viewPos = viewMatrix * worldPos;
    vViewDir = normalize(-viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
  }
`

export const earthFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform sampler2D specularTex;
  uniform sampler2D normalTex;
  uniform sampler2D cloudsTex;
  uniform float hasNight;
  uniform float hasSpecular;
  uniform float hasNormal;
  uniform float hasClouds;
  uniform float cloudOpacity;
  /** Longitudinal UV drift applied to the cloud sample so clouds advect across the surface. */
  uniform float cloudUvOffset;
  uniform vec3 sunDirView;
  uniform float time;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;

  void main() {
    vec3 N = normalize(vNormal);
    if (hasNormal > 0.5) {
      vec3 nm = texture2D(normalTex, vUv).xyz * 2.0 - 1.0;
      // Cheap normal perturbation around current normal.
      N = normalize(N + nm * 0.25);
    }
    vec3 L = normalize(sunDirView);
    float NdotL = dot(N, L);
    // Smooth terminator: -0.05 → 0.15 transitions night→day.
    float dayMix = smoothstep(-0.05, 0.15, NdotL);

    vec3 dayCol = texture2D(dayTex, vUv).rgb;
    vec3 nightCol = hasNight > 0.5 ? texture2D(nightTex, vUv).rgb : vec3(0.0);
    // Boost city lights brightness, but keep slightly bluish.
    nightCol = pow(nightCol, vec3(0.85)) * vec3(1.05, 1.0, 1.2);

    // Specular highlight (oceans).
    float spec = 0.0;
    if (hasSpecular > 0.5) {
      float oceanMask = 1.0 - texture2D(specularTex, vUv).r;
      vec3 V = normalize(vViewDir);
      vec3 H = normalize(L + V);
      float NdotH = max(dot(N, H), 0.0);
      spec = pow(NdotH, 80.0) * oceanMask * smoothstep(0.0, 0.3, NdotL);
    }

    vec3 col = mix(nightCol, dayCol, dayMix);
    col += vec3(spec) * 0.6;

    // Clouds: a single, shader-projected cloud layer (no parallax sphere) so
    // the user never sees a duplicated double-image. UV is drifted in the
    // longitude axis so the pattern advects relative to the surface even
    // though it shares the Earth mesh's rotation.
    if (hasClouds > 0.5) {
      vec2 cuv = vec2(vUv.x + cloudUvOffset, vUv.y);
      vec4 cloud = texture2D(cloudsTex, cuv);
      // Combine alpha and luminance so the layer works whether the texture
      // is RGBA (PNG with cloud alpha) or RGB (JPG grayscale-as-density).
      float lum = (cloud.r + cloud.g + cloud.b) / 3.0;
      float cAlpha = cloud.a * lum;
      cAlpha = clamp(cAlpha * cloudOpacity, 0.0, 1.0);
      vec3 cloudCol = vec3(1.0);
      // Lit clouds bright; dark side: faint silver.
      vec3 cloudShaded = cloudCol * (0.15 + 0.85 * dayMix);
      col = mix(col, cloudShaded, cAlpha);
    }

    // Subtle ambient so dark side isn't pitch black where no city lights.
    col += vec3(0.01, 0.012, 0.02) * (1.0 - dayMix);

    gl_FragColor = vec4(col, 1.0);
  }
`
