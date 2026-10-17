/*
 * The direct light a Lambert surface has from the point lights (the fire),
 * worked out the way three works it, so a `light` hook can tell the sun's
 * or the moon's light apart from the fire's in `hwDirect` and shade only
 * the sky's: the fire burns under the clouds' shadows as brightly as ever.
 * The point lights cast no shadows, so their part is exactly this. It is
 * code for inside a Lambert material's `light` hook (which sees three's
 * light loop's locals), declaring `hwNear`.
 */
export const NEAR_LIGHT_GLSL = /* glsl */ `
  vec3 hwNear = vec3(0.0);
  #if NUM_POINT_LIGHTS > 0
    IncidentLight hwIncident;
    // Unrolled by three, as its own light loops are.
    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
      getPointLightInfo( pointLights[ i ], geometryPosition, hwIncident );
      hwNear += saturate( dot( geometryNormal, hwIncident.direction ) ) * hwIncident.color;
    }
    #pragma unroll_loop_end
  #endif
  hwNear *= BRDF_Lambert(material.diffuseColor);
`;
