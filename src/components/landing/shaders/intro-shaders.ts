// Cinematic "Genesis Event" intro shaders — BOLD, DRAMATIC, AWARD-WINNING

export const introVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const introFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uPhase; // 0-6 continuous
  uniform sampler2D uLogo;
  uniform sampler2D uText;
  uniform vec2 uResolution;
  varying vec2 vUv;

  // ── Noise ──
  vec3 mod289(vec3 x) { return x - floor(x*(1.0/289.0))*289.0; }
  vec4 mod289(vec4 x) { return x - floor(x*(1.0/289.0))*289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159-0.85373472095314*r; }
  vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

  float cnoise(vec2 P) {
    vec4 Pi = floor(P.xyxy)+vec4(0.0,0.0,1.0,1.0);
    vec4 Pf = fract(P.xyxy)-vec4(0.0,0.0,1.0,1.0);
    Pi = mod289(Pi);
    vec4 ix=Pi.xzxz,iy=Pi.yyww,fx=Pf.xzxz,fy=Pf.yyww;
    vec4 i=permute(permute(ix)+iy);
    vec4 gx=fract(i*(1.0/41.0))*2.0-1.0;
    vec4 gy=abs(gx)-0.5;
    vec4 tx=floor(gx+0.5);
    gx=gx-tx;
    vec2 g00=vec2(gx.x,gy.x),g10=vec2(gx.y,gy.y),g01=vec2(gx.z,gy.z),g11=vec2(gx.w,gy.w);
    vec4 norm=taylorInvSqrt(vec4(dot(g00,g00),dot(g01,g01),dot(g10,g10),dot(g11,g11)));
    g00*=norm.x;g01*=norm.y;g10*=norm.z;g11*=norm.w;
    float n00=dot(g00,vec2(fx.x,fy.x)),n10=dot(g10,vec2(fx.y,fy.y));
    float n01=dot(g01,vec2(fx.z,fy.z)),n11=dot(g11,vec2(fx.w,fy.w));
    vec2 fade_xy=fade(Pf.xy);
    vec2 n_x=mix(vec2(n00,n01),vec2(n10,n11),fade_xy.x);
    return 2.3*mix(n_x.x,n_x.y,fade_xy.y);
  }

  float fbm(vec2 p) {
    float f=0.0,a=0.5;
    for(int i=0;i<6;i++){f+=a*cnoise(p);p*=2.1;a*=0.45;}
    return f;
  }

  // Domain-warped FBM for plasma
  float warpedFbm(vec2 p, float t) {
    vec2 q = vec2(fbm(p + vec2(0.0, 0.0)),
                  fbm(p + vec2(5.2, 1.3)));
    vec2 r = vec2(fbm(p + 4.0*q + vec2(1.7, 9.2) + 0.15*t),
                  fbm(p + 4.0*q + vec2(8.3, 2.8) + 0.126*t));
    return fbm(p + 4.0*r);
  }

  float grain(vec2 uv, float t) {
    return fract(sin(dot(uv, vec2(12.9898,78.233)) + t) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    vec2 center = uv - 0.5;
    float aspect = uResolution.x / uResolution.y;
    vec2 uvA = vec2(center.x * aspect, center.y);
    float distA = length(uvA);

    // Phase breakpoints
    float pDark    = smoothstep(0.0, 0.6, uPhase);
    float pRays    = smoothstep(0.6, 1.5, uPhase);
    float pBloom   = smoothstep(1.5, 2.5, uPhase);
    float pReveal  = smoothstep(2.5, 4.0, uPhase);
    float pResolve = smoothstep(4.0, 5.0, uPhase);
    float pFade    = smoothstep(5.0, 6.0, uPhase);

    // ── PLASMA BACKGROUND ──
    float angle = uTime * 0.2;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 rotUv = rot * uvA;
    
    float plasma = warpedFbm(rotUv * 2.0, uTime * 0.6);
    plasma = plasma * 0.5 + 0.5;
    plasma = pow(plasma, 1.3);
    float radialFade = 1.0 - smoothstep(0.0, 0.9, distA);
    plasma *= radialFade;
    
    // Rich fire color ramp
    vec3 plasmaColor;
    if (plasma < 0.25) {
      plasmaColor = mix(vec3(0.02, 0.0, 0.04), vec3(0.35, 0.02, 0.0), plasma / 0.25);
    } else if (plasma < 0.5) {
      plasmaColor = mix(vec3(0.35, 0.02, 0.0), vec3(0.85, 0.3, 0.05), (plasma - 0.25) / 0.25);
    } else if (plasma < 0.75) {
      plasmaColor = mix(vec3(0.85, 0.3, 0.05), vec3(1.0, 0.65, 0.15), (plasma - 0.5) / 0.25);
    } else {
      plasmaColor = mix(vec3(1.0, 0.65, 0.15), vec3(1.0, 0.92, 0.7), (plasma - 0.75) / 0.25);
    }
    
    vec3 bg = plasmaColor * pDark * 0.7;

    // ── VOLUMETRIC GOD RAYS (60 samples, 3x intensity) ──
    float rayStr = pRays * (1.0 - pResolve * 0.5);
    vec3 godRays = vec3(0.0);
    if (rayStr > 0.01) {
      vec2 rayUv = uv;
      float decay = 1.0;
      vec2 rayCenter = vec2(0.5);
      // Slowly rotating rays
      float rayAngle = uTime * 0.05;
      for (int i = 0; i < 60; i++) {
        rayUv -= (rayUv - rayCenter) * 0.015;
        vec2 rUv = rayUv;
        // Add subtle rotation to ray sampling
        vec2 rc = rUv - 0.5;
        rUv = vec2(rc.x * cos(rayAngle) - rc.y * sin(rayAngle),
                    rc.x * sin(rayAngle) + rc.y * cos(rayAngle)) + 0.5;
        float noise = fbm(rUv * 5.0 + uTime * 0.15) * 0.5 + 0.5;
        noise = pow(noise, 0.8); // Brighter
        godRays += vec3(1.0, 0.55, 0.12) * noise * decay * 0.025;
        decay *= 0.975;
      }
      // Pulsating brightness
      float pulse = 0.7 + 0.3 * sin(uTime * 2.5);
      godRays *= rayStr * 3.0 * pulse;
    }

    // ── ANAMORPHIC LENS FLARE ──
    float flareStr = pBloom * (1.0 - pResolve);
    vec3 flare = vec3(0.0);
    if (flareStr > 0.01) {
      // Horizontal streak
      float hStreak = exp(-abs(center.y) * 40.0) * exp(-center.x * center.x * 4.0);
      // White core with orange falloff
      vec3 flareCore = vec3(1.0, 0.95, 0.9) * hStreak * 2.0;
      vec3 flareOuter = vec3(1.0, 0.5, 0.1) * exp(-abs(center.y) * 20.0) * exp(-center.x * center.x * 2.0);
      flare = (flareCore + flareOuter) * flareStr * 0.6;
    }

    // ── HEAT DISTORTION ──
    float heatStr = pBloom * (1.0 - pResolve);
    vec2 distortedUv = uv;
    if (heatStr > 0.01) {
      float distort = cnoise(uv * 10.0 + uTime * 0.8) * 0.012 * heatStr;
      distortedUv += vec2(distort, distort * 0.6);
    }

    // ── LOGO with INTENSE CHROMATIC ABERRATION ──
    vec2 logoUv = distortedUv * 2.5 - 0.75;
    float inBounds = step(0.0,logoUv.x)*step(logoUv.x,1.0)*step(0.0,logoUv.y)*step(logoUv.y,1.0);

    // 5x stronger chromatic aberration (0.02 during bloom)
    float caStr = heatStr * 0.02;
    vec2 caDir = normalize(center + 0.001) * caStr;
    float logoR = texture2D(uLogo, clamp(logoUv + caDir, 0.0, 1.0)).r;
    float logoG = texture2D(uLogo, clamp(logoUv, 0.0, 1.0)).g;
    float logoB = texture2D(uLogo, clamp(logoUv - caDir, 0.0, 1.0)).b;
    float logoA = texture2D(uLogo, clamp(logoUv, 0.0, 1.0)).a;
    vec4 logoTex = vec4(logoR, logoG, logoB, logoA * inBounds);

    // Dissolve with burning edge
    float noiseT = cnoise(distortedUv * 6.0 + uTime * 0.2) * 0.5 + 0.5;
    float dissolve = smoothstep(noiseT - 0.04, noiseT + 0.04, pBloom);
    float logoAlpha = logoTex.a * dissolve;

    // BURNING EDGE — white-hot → orange → red
    vec3 edgeGlow = vec3(0.0);
    float e1 = smoothstep(0.0, 0.1, dissolve) * (1.0 - smoothstep(0.1, 0.25, dissolve));
    float e2 = smoothstep(0.0, 0.06, dissolve) * (1.0 - smoothstep(0.15, 0.4, dissolve));
    edgeGlow += vec3(1.0, 0.95, 0.85) * e1 * 5.0; // white-hot
    edgeGlow += vec3(1.0, 0.5, 0.1) * e2 * 3.0;   // orange
    edgeGlow += vec3(0.7, 0.1, 0.0) * smoothstep(0.0, 0.03, dissolve) * (1.0 - smoothstep(0.3, 0.6, dissolve)) * 2.0; // red
    edgeGlow *= (1.0 - pResolve) * logoTex.a;

    // INTENSE BLOOM HALO around logo
    vec3 bloomHalo = vec3(0.0);
    float bloomStr = pBloom * (1.0 - pResolve * 0.5);
    if (bloomStr > 0.01) {
      for (int i = 0; i < 16; i++) {
        float a = float(i) * 3.14159 * 2.0 / 16.0;
        for (int j = 1; j <= 3; j++) {
          float r = float(j) * 0.015;
          vec2 offset = vec2(cos(a), sin(a)) * r;
          vec2 sampleUv = clamp(logoUv + offset, 0.0, 1.0);
          float sampleA = texture2D(uLogo, sampleUv).a * inBounds;
          bloomHalo += vec3(1.0, 0.6, 0.2) * sampleA * dissolve / float(j);
        }
      }
      bloomHalo *= bloomStr * 0.06;
    }

    // Sobel edge detection for energy lines
    float edgeDist = 0.006;
    float aL = texture2D(uLogo, clamp(logoUv + vec2(-edgeDist,0.0),0.0,1.0)).a * inBounds;
    float aR = texture2D(uLogo, clamp(logoUv + vec2( edgeDist,0.0),0.0,1.0)).a * inBounds;
    float aT = texture2D(uLogo, clamp(logoUv + vec2(0.0, edgeDist),0.0,1.0)).a * inBounds;
    float aB = texture2D(uLogo, clamp(logoUv + vec2(0.0,-edgeDist),0.0,1.0)).a * inBounds;
    float edgeDetect = abs(aR - aL) + abs(aT - aB);
    edgeDetect = smoothstep(0.03, 0.4, edgeDetect);
    vec3 energyLines = vec3(1.0, 0.6, 0.2) * edgeDetect * dissolve * (1.0 - pResolve) * 3.0;

    // ── TEXT with CHARACTER FLASH ──
    vec2 textUv = vec2(uv.x * 3.0 - 1.0, (uv.y + 0.15) * 3.0 - 1.0);
    float textInB = step(0.0,textUv.x)*step(textUv.x,1.0)*step(0.0,textUv.y)*step(textUv.y,1.0);
    vec4 textTex = texture2D(uText, clamp(textUv, 0.0, 1.0));
    textTex.a *= textInB;
    // Per-character stagger with flash
    float charProgress = smoothstep(textUv.x * 0.4, textUv.x * 0.4 + 0.2, pReveal);
    // Flash at reveal moment
    float charFlash = smoothstep(textUv.x * 0.4, textUv.x * 0.4 + 0.05, pReveal) 
                    * (1.0 - smoothstep(textUv.x * 0.4 + 0.05, textUv.x * 0.4 + 0.2, pReveal));
    float textAlpha = textTex.a * charProgress;
    vec3 textGlow = vec3(1.0, 0.7, 0.3) * charFlash * textTex.a * 2.0;

    // ── DEEP VIGNETTE ──
    float vig = 1.0 - smoothstep(0.15, 0.8, distA);
    bg *= mix(0.2, 1.0, vig);

    // ── Film grain (stronger) ──
    float g = grain(uv * uResolution, uTime * 60.0);
    bg += (g - 0.5) * 0.08;

    // ── COMPOSE ──
    vec3 color = bg + godRays + flare;
    vec3 logoFinal = logoTex.rgb + edgeGlow + bloomHalo + energyLines;
    color = mix(color, logoFinal, logoAlpha);
    color += bloomHalo * 0.4 * (1.0 - logoAlpha); // Bloom bleeds into bg
    color = mix(color, textTex.rgb + textGlow, textAlpha * 0.9);

    // Fade out
    float opacity = 1.0 - pFade;

    gl_FragColor = vec4(color, opacity);
  }
`;
