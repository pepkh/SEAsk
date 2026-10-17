/*
 * Ocean shader from the Home mockup: moving swell, Kelvin wake and bow wave, all in the ship's frame.
 * Changes for the live speed: uOffset (distance the water moved) replaces uTime * uSpeed,
 * and uWake (0–1) scales the wake foam, so a docked ship has no wake.
 * The normal comes from the swell slope (smooth water instead of flat triangles), and the colour goes
 * through the renderer's tone mapping and sRGB output like the rest of the scene.
 */

const WAVES = /* glsl */ `
  uniform float uTime; uniform float uOffset;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
  vec2 waterCoord(vec2 p){ return vec2(p.x, p.y - uOffset); }
  // One swell term a·sin(k·(q·d) + w·t): height (x) and slope along x and z (yz)
  vec3 wave(vec2 q, vec2 d, float a, float k, float w){
    d = normalize(d); float ph = dot(q, d)*k + uTime*w;
    return vec3(a*sin(ph), a*k*cos(ph)*d); }
  vec3 swell(vec2 p){ vec2 q = waterCoord(p);
    return wave(q, vec2(0.35, 1.0), 1.10, 0.045, 0.80) + wave(q, vec2(-0.8, 0.6), 0.55, 0.090, 1.15)
         + wave(q, vec2(0.9, 0.2), 0.35, 0.140, 1.45) + wave(q, vec2(-0.2, -1.0), 0.18, 0.230, 1.90); }
  // Swell fades out far away, and is calmer right against the hull so it never pokes through the deck
  float swellScale(vec2 p){
    float fall = 1.0 - smoothstep(1800.0, 4200.0, length(p));
    vec2 hb = abs(p) - vec2(12.0, 70.0);
    float nearHull = 1.0 - smoothstep(0.0, 30.0, length(max(hb, 0.0)));
    return fall * mix(1.0, 0.35, nearHull); }
`

export const oceanVertexShader = WAVES + /* glsl */ `
  varying vec3 vPos; varying float vH;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    float h = swell(w.xz).x * swellScale(w.xz);
    w.y += h; vH = h; vPos = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`

export const oceanFragmentShader = WAVES + /* glsl */ `
  uniform vec3 uDeep, uShallow, uSky, uFog, uSun;
  uniform float uWake;
  varying vec3 vPos; varying float vH;
  void main(){
    vec3 s = swell(vPos.xz) * swellScale(vPos.xz);
    vec3 n = vec3(-s.y, 1.0, -s.z);
    // small ripples on top of the swell, faded with distance so they do not shimmer at the horizon
    vec2 q = waterCoord(vPos.xz);
    float dist = length(vPos - cameraPosition);
    float detail = 1.0 - smoothstep(400.0, 2600.0, dist);
    n.xz += 0.07*vec2(noise(q*0.08 + uTime*0.6) - 0.5, noise(q*0.08 - uTime*0.5 + 17.0) - 0.5);
    n.xz += detail*0.05*vec2(noise(q*0.35 + uTime*1.4) - 0.5, noise(q*0.33 - uTime*1.2 + 5.0) - 0.5);
    n.xz += detail*0.03*vec2(noise(q*1.10 + uTime*2.1) - 0.5, noise(q*1.05 - uTime*1.9 + 9.0) - 0.5);
    n = normalize(n);
    vec3 V = normalize(cameraPosition - vPos);
    // Schlick Fresnel for water (F0 = 0.02), capped so low views keep the sea colour
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 col = mix(uDeep, uShallow, clamp(vH*0.3 + 0.4, 0.0, 1.0));
    col = mix(col, uSky, clamp(fres, 0.0, 0.6));
    float spec = pow(max(dot(reflect(-uSun, n), V), 0.0), 120.0);
    col += vec3(1.0, 0.95, 0.85) * spec * 1.2;

    // foam: ship sits at the origin heading -z, stern at z = +80
    float x = vPos.x, z = vPos.z, d = z - 76.0;
    float grain = noise(q*0.18) * 0.6 + noise(q*0.6) * 0.4;
    float foam = 0.0;
    if (d > 0.0){
      float k = abs(x) - (13.0 + d*0.34);
      foam += smoothstep(10.0, 0.0, abs(k)) * exp(-d/1100.0) * 0.9;
      foam += smoothstep(10.0 + d*0.05, 0.0, abs(x)) * exp(-d/650.0) * 1.2;
    }
    foam += smoothstep(5.0, 0.0, abs(abs(x) - 13.8)) * step(abs(z), 80.0) * 0.7;
    foam += smoothstep(26.0, 0.0, length(vec2(x*0.9, (z + 84.0)*1.4))) * 0.9;
    foam *= uWake;
    foam *= smoothstep(0.25, 0.75, grain + foam*0.3);
    foam += smoothstep(1.6, 2.1, vH) * smoothstep(0.6, 0.85, grain) * 0.2;
    col = mix(col, vec3(0.96, 0.98, 0.99), clamp(foam, 0.0, 0.92));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Fog after the output conversion, so the far sea meets the CSS sky colour behind the canvas exactly.
    float fog = smoothstep(1200.0, 4600.0, dist);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, fog);
  }`
