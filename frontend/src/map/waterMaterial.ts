import { buildModuleUrl, Cartesian3, Color, Material } from 'cesium'
import { HORIZON } from '../scene/constants'
import { SUN_ENU } from './sun'

/*
 * Sea surface for map mode, shaded like the sea scene: deep-to-shallow colour, sky reflection
 * (Schlick Fresnel), a sun glint and haze far away, on Cesium's moving water normal map.
 * It is unlit (emission only), so the sea looks the same at any time of day; the feed clock can be at night.
 * Tangent space of the water surface is east-north-up.
 */
const SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  float time = czm_frameNumber * animationSpeed;
  vec4 fine = czm_getWaterNoise(normalMap, materialInput.st * frequency, time, 0.0);
  vec4 broad = czm_getWaterNoise(normalMap, materialInput.st * frequency * 0.23, time * 0.5, 1.1);
  vec3 nTS = normalize(vec3((fine.xy + 0.7 * broad.xy) * slope, 1.0));
  vec3 normalEC = normalize(materialInput.tangentToEyeMatrix * nTS);
  vec3 toEye = normalize(materialInput.positionToEyeEC);

  float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(normalEC, toEye), 0.0, 1.0), 5.0);
  vec3 col = mix(deepColor.rgb, shallowColor.rgb, clamp(0.4 + 0.5 * (broad.x + broad.y), 0.0, 1.0));
  col = mix(col, skyColor.rgb, clamp(fres, 0.0, 0.6));

  // glint from the fixed afternoon sun (sun.ts)
  vec3 sunEC = normalize(materialInput.tangentToEyeMatrix * sunDirection);
  float spec = pow(max(dot(reflect(-sunEC, normalEC), toEye), 0.0), 140.0);
  col += vec3(1.0, 0.95, 0.85) * spec * 0.8;

  float dist = length(materialInput.positionToEyeEC);
  col = mix(col, hazeColor.rgb, smoothstep(5000.0, 45000.0, dist));

  material.diffuse = vec3(0.0);
  material.specular = 0.0;
  material.emission = col;
  material.alpha = 1.0;
  return material;
}
`

export function createWaterMaterial(): Material {
  return new Material({
    translucent: false,
    fabric: {
      type: 'KioskWater',
      uniforms: {
        normalMap: buildModuleUrl('Assets/Textures/waterNormals.jpg'),
        deepColor: Color.fromCssColorString('#1d5568'),
        shallowColor: Color.fromCssColorString('#3a8ca0'),
        skyColor: Color.fromCssColorString('#a9cbdb'),
        hazeColor: Color.fromCssColorString(HORIZON),
        sunDirection: Cartesian3.normalize(SUN_ENU, new Cartesian3()),
        /** Ripple repeats across the water rectangle (higher = smaller ripples) */
        frequency: 10000,
        animationSpeed: 0.01,
        /** Ripple steepness */
        slope: 0.5,
      },
      source: SOURCE,
    },
  })
}
