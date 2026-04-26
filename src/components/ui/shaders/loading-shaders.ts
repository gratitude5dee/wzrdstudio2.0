// Cinematic "Supernova Emergence" loading shaders — BOLD & DRAMATIC

export const loadingVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const loadingFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uPhase; // 0→4 continuous
  uniform sampler2D uLogo;
  uniform sampler2D uText;
  uniform vec2 uResolution;
  varying vec2 vUv;

  // ── Noise helpers ──
  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314*r; }
  vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

  float cnoise(vec2 P) {
    vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
    vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
    Pi = mod289(Pi);
    vec4 ix = Pi.xzxz, iy = Pi.yyww;
    vec4 fx = Pf.xzxz, fy = Pf.yyww;
    vec4 i = permute(permute(ix) + iy);
    vec4 gx = fract(i*(1.0/41.0))*2.0-1.0;
    vec4 gy = abs(gx)-0.5;
    vec4 tx = floor(gx+0.5);
    gx = gx - tx;
    vec2 g00 = vec2(gx.x,gy.x), g10 = vec2(gx.y,gy.y);
    vec2 g01 = vec2(gx.z,gy.z), g11 = vec2(gx.w,gy.w);
    vec4 norm = taylorInvSqrt(vec4(dot(g00,g00),dot(g01,g01),dot(g10,g10),dot(g11,g11)));
    g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
    float n00 = dot(g00,vec2(fx.x,fy.x));
    float n10 = dot(g10,vec2(fx.y,fy.y));
    float n01 = dot(g01,vec2(fx.z,fy.z));
    float n11 = dot(g11,vec2(fx.w,fy.w));
    vec2 fade_xy = fade(Pf.xy);
    vec2 n_x = mix(vec2(n00,n01),vec2(n10,n11),fade_xy.x);
    return 2.3 * mix(n_x.x,n_x.y,fade_xy.y);
  }

  // 6-octave FBM for rich detail
  float fbm(vec2 p) {
    float f = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) {
      f += a * cnoise(p);
      p *= 2.1;
      a *= 0.45;
    }
    return f;
  }

  // Domain-warped FBM for fire vortex
  float warpedFbm(vec2 p, float t) {
    vec2 q = vec2(fbm(p + vec2(0.0, 0.0)),
                  fbm(p + vec2(5.2, 1.3)));
    vec2 r = vec2(fbm(p + 4.0*q + vec2(1.7, 9.2) + 0.15*t),
                  fbm(p + 4.0*q + vec2(8.3, 2.8) + 0.126*t));
    return fbm(p + 4.0*r);
  }

  void main() {
    vec2 uv = vUv;
    vec2 center = uv - 0.5;
    float aspect = uResolution.x / uResolution.y;
    vec2 uvA = vec2(center.x * aspect, center.y);
    float distA = length(uvA);

    // Phase interpolation — faster, punchier
    float phaseVoid   = smoothstep(0.0, 0.2, uPhase);
    float phaseIgnite = smoothstep(0.3, 1.0, uPhase);
    float phaseBloom  = smoothstep(1.0, 2.0, uPhase);
    float phaseReveal = smoothstep(2.0, 3.0, uPhase);
    float phaseResolve= smoothstep(3.0, 3.8, uPhase);

    // ── Layer 1: INTENSE FIRE VORTEX ──
    // Rotate UVs over time for swirling effect
    float angle = uTime * 0.3;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 rotUv = rot * uvA;
    
    float vortex = warpedFbm(rotUv * 2.5, uTime * 0.8);
    vortex = vortex * 0.5 + 0.5;
    vortex = pow(vortex, 1.5); // Increase contrast
    
    // Radial fade — brighter in center
    float radialFade = 1.0 - smoothstep(0.0, 0.8, distA);
    vortex *= radialFade;
    
    // Fire color ramp: black → deep red → orange → amber → white-hot
    vec3 fireColor;
    if (vortex < 0.3) {
      fireColor = mix(vec3(0.02, 0.0, 0.03), vec3(0.4, 0.05, 0.0), vortex / 0.3);
    } else if (vortex < 0.6) {
      fireColor = mix(vec3(0.4, 0.05, 0.0), vec3(0.97, 0.45, 0.09), (vortex - 0.3) / 0.3);
    } else if (vortex < 0.85) {
      fireColor = mix(vec3(0.97, 0.45, 0.09), vec3(1.0, 0.7, 0.2), (vortex - 0.6) / 0.25);
    } else {
      fireColor = mix(vec3(1.0, 0.7, 0.2), vec3(1.0, 0.95, 0.8), (vortex - 0.85) / 0.15);
    }
    
    // Scale intensity with phase
    vec3 bg = fireColor * phaseVoid * (0.6 + 0.4 * phaseIgnite);

    // ── Layer 2: SHOCKWAVE RINGS ──
    float shockTime = uPhase * 1.5;
    for (int i = 0; i < 3; i++) {
      float ringT = shockTime - float(i) * 0.4;
      if (ringT > 0.0) {
        float ringRadius = ringT * 0.5;
        float ringWidth = 0.08 + float(i) * 0.03;
        float ring = 1.0 - smoothstep(0.0, ringWidth, abs(distA - ringRadius));
        ring *= exp(-ringT * 1.5); // Fade over time
        ring *= phaseIgnite;
        vec3 ringColor = mix(vec3(1.0, 0.6, 0.1), vec3(1.0, 0.9, 0.5), ring);
        bg += ringColor * ring * 0.8;
      }
    }

    // ── Layer 3: LOGO DISSOLVE with BURNING EDGE ──
    vec2 logoUv = uv * 2.5 - 0.75;
    vec4 logoTex = texture2D(uLogo, clamp(logoUv, 0.0, 1.0));
    float inBounds = step(0.0, logoUv.x) * step(logoUv.x, 1.0) * step(0.0, logoUv.y) * step(logoUv.y, 1.0);
    logoTex.a *= inBounds;

    float noiseThreshold = cnoise(uv * 5.0 + uTime * 0.3) * 0.5 + 0.5;
    float dissolve = smoothstep(noiseThreshold - 0.03, noiseThreshold + 0.03, phaseBloom);
    float logoAlpha = logoTex.a * dissolve;

    // BURNING EDGE — white-hot → orange → red at dissolve boundary
    float edgeMask = smoothstep(0.0, 0.12, dissolve) * (1.0 - smoothstep(0.12, 0.35, dissolve));
    vec3 edgeGlow = vec3(0.0);
    edgeGlow += vec3(1.0, 0.95, 0.8) * smoothstep(0.08, 0.12, dissolve) * (1.0 - smoothstep(0.12, 0.18, dissolve)) * 4.0; // white-hot core
    edgeGlow += vec3(1.0, 0.5, 0.1) * smoothstep(0.0, 0.08, dissolve) * (1.0 - smoothstep(0.18, 0.35, dissolve)) * 2.5; // orange mid
    edgeGlow += vec3(0.8, 0.1, 0.0) * smoothstep(0.0, 0.04, dissolve) * (1.0 - smoothstep(0.25, 0.5, dissolve)) * 1.5; // red outer
    edgeGlow *= (1.0 - phaseResolve);
    edgeGlow *= logoTex.a; // Only on logo shape

    // ── Layer 4: FAKE BLOOM / RADIAL GLOW ──
    float bloomStr = phaseBloom * (1.0 - phaseResolve * 0.6);
    vec3 bloom = vec3(0.0);
    if (bloomStr > 0.01) {
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 3.14159 * 2.0 / 12.0;
        float r = 0.02 + float(i) * 0.004;
        vec2 offset = vec2(cos(a), sin(a)) * r;
        vec2 sampleUv = clamp(logoUv + offset, 0.0, 1.0);
        float sampleA = texture2D(uLogo, sampleUv).a * inBounds;
        bloom += vec3(0.97, 0.55, 0.15) * sampleA * dissolve;
      }
      bloom *= bloomStr * 0.15;
    }

    // ── Layer 5: Text dissolve ──
    vec2 textUv = vec2(uv.x, uv.y + 0.15) * 3.0 - 1.0;
    vec4 textTex = texture2D(uText, clamp(textUv, 0.0, 1.0));
    float textInBounds = step(0.0, textUv.x) * step(textUv.x, 1.0) * step(0.0, textUv.y) * step(textUv.y, 1.0);
    textTex.a *= textInBounds;
    float textDissolve = smoothstep(0.0, 1.0, phaseReveal);
    float textAlpha = textTex.a * textDissolve;

    // ── Layer 6: Chromatic aberration ──
    float caStrength = phaseBloom * (1.0 - phaseResolve) * 0.015;
    vec2 caOffset = center * caStrength;
    float fogR = warpedFbm((rotUv + caOffset * 2.0) * 2.5, uTime * 0.8) * 0.5 + 0.5;
    float fogB = warpedFbm((rotUv - caOffset * 2.0) * 2.5, uTime * 0.8) * 0.5 + 0.5;
    bg.r += (fogR - vortex) * phaseIgnite * 0.15;
    bg.b += (fogB - vortex) * phaseIgnite * 0.08;

    // ── DEEP VIGNETTE ──
    float vig = 1.0 - smoothstep(0.2, 0.85, distA);
    bg *= mix(0.3, 1.0, vig);

    // ── Compose ──
    vec3 logoColor = logoTex.rgb + edgeGlow + bloom;
    vec3 color = mix(bg, logoColor, logoAlpha);
    color = mix(color, textTex.rgb, textAlpha * 0.9);
    
    // Add bloom glow to background too
    color += bloom * 0.3 * (1.0 - logoAlpha);

    // ── ENERGY BEAM progress bar ──
    float barH = 0.006;
    float barGlow = 0.015;
    float barProgress = phaseBloom;
    float barDist = abs(uv.y - barH * 0.5);
    if (uv.y < barH + barGlow) {
      float barMask = step(uv.x, barProgress);
      float barCore = 1.0 - smoothstep(0.0, barH * 0.5, barDist);
      float barOuter = 1.0 - smoothstep(barH * 0.5, barH * 0.5 + barGlow, barDist);
      vec3 barColor = mix(vec3(0.97, 0.45, 0.09), vec3(1.0, 0.8, 0.3), uv.x);
      // Pulse effect
      float pulse = 0.8 + 0.2 * sin(uTime * 8.0 - uv.x * 20.0);
      color += barColor * barCore * barMask * 1.5 * pulse;
      color += barColor * barOuter * barMask * 0.4 * pulse;
    }

    // Film grain
    float g = fract(sin(dot(uv * uResolution, vec2(12.9898,78.233)) + uTime * 60.0) * 43758.5453);
    color += (g - 0.5) * 0.06;

    // Fade out during resolve
    float fadeOut = 1.0 - smoothstep(3.5, 4.0, uPhase);

    gl_FragColor = vec4(color, fadeOut);
  }
`;
