import * as THREE from "three";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { moonDirection } from "./lighting";
import { paletteHex, type PaletteKey } from "./palette";
import { earth, TEXELS_PER_METRE } from "./textures";

/*
 * What lies behind the house: a backdrop, not a landscape. It never hugs the
 * house's footprint (the house grows tile by tile and rooms move), so it is
 * worked out per pixel from the camera's line of sight alone, in one draw
 * call over the whole screen, drawn before everything else and writing no
 * depth:
 *
 * - a night sky, deep blue at the horizon to near black overhead, with the
 *   moon low over the trees where the house's moonlight comes from;
 * - ground, dark grass and earth well below the ground floor, fading into
 *   the house's fog with distance and with depth under the floor, so it has
 *   no edge at any zoom or tilt;
 * - a line of bare, crooked trees on the horizon only, as flat silhouettes;
 * - under the house (the basement showing), packed earth and stone all round
 *   in place of sky.
 *
 * It is self-lit, never baked: its sky is the house's fill light's sky
 * colour, the very `THREE.Color` the haunt's mood shifts, so it darkens with
 * the house at no cost, and the fog is the scene's own. A storm plugs in at
 * the sky colour: lightning is a brief lift of the sky the backdrop reads,
 * and rain falls on the outdoor rooms, not here.
 */

export type BackdropKind = "night" | "off";

/** Whether a page's query string asks for the backdrop: `?backdrop=night`, or `off` (the plain fog colour), the default. */
export function backdropFromSearch(search: string): BackdropKind {
  const value = new URLSearchParams(search).get("backdrop") ?? "off";
  if (value !== "night" && value !== "off") throw new Error(`backdrop=${value}: it is night or off`);
  return value;
}

export function backdropKind(): BackdropKind {
  return backdropFromSearch(typeof window === "undefined" ? "" : window.location.search);
}

/** The backdrop's look, in one place. */
export const BACKDROP = {
  /** Metres the ground lies below the lowest floor showing, and below the basement's floor. */
  groundDepth: 2.5,
  basementDepth: 1.2,
  /** Metres of fall under the floor over which the ground fades most of the way into the fog. */
  underReach: 9,
  /** How bright the ground is under the sky's light, and the earth round the basement. */
  groundLight: 0.9,
  earthLight: 0.6,
  /** The horizon's sky as a share of the fill's sky colour; overhead is `zenith`. */
  horizon: 0.3,
  zenith: "void" as PaletteKey,
  /** The silhouettes' colour, from near black towards the horizon's sky. */
  silhouette: { colour: "void" as PaletteKey, toSky: 0.22 },
  moon: { colour: "moonLight" as PaletteKey, brightness: 0.55, glow: 0.5, radiusDegrees: 1.1, elevationDegrees: 4.6 },
  /** The tree line's strip: texels round the horizon and up from it. One texel is the same angle either way. */
  strip: { width: 4096, height: 64 },
} as const;

const TEXEL_ANGLE = (Math.PI * 2) / BACKDROP.strip.width;

/** The horizon all round, as an alpha mask: low rolling hills, and clumps of
 *  bare, crooked trees on them. Its first row is the horizon. */
function treeLine(): THREE.DataTexture {
  const { width, height } = BACKDROP.strip;
  const alpha = new Uint8Array(width * height * 4);
  const plot = (x: number, y: number) => {
    const row = Math.round(y);
    if (row < 0 || row >= height) return;
    const column = ((Math.round(x) % width) + width) % width;
    alpha[(row * width + column) * 4 + 3] = 255;
  };
  const rng = createRng("backdrop:trees");
  const range = (low: number, high: number) => low + rng.next() * (high - low);

  // The hills: a few slow waves round the horizon, never above a few texels.
  const hill = (x: number) => 2.5 + 1.6 * Math.sin((x / width) * Math.PI * 2 * 3 + 1.2) + 1.2 * Math.sin((x / width) * Math.PI * 2 * 7 + 0.4);
  for (let x = 0; x < width; x++) for (let y = 0; y <= hill(x); y++) plot(x, y);

  const stroke = (x0: number, y0: number, x1: number, y1: number, thick: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      for (let dx = 0; dx < thick; dx++) plot(x + dx - (thick - 1) / 2, y);
    }
  };
  /** A limb, bent once or twice along its length, forking into smaller ones. */
  const limb = (x: number, y: number, angle: number, length: number, thick: number, rngOf: Rng, depth: number) => {
    let [px, py, heading] = [x, y, angle];
    const bends = 2;
    for (let bend = 0; bend < bends; bend++) {
      heading += (rngOf.next() - 0.5) * 0.9;
      const nx = px + Math.sin(heading) * (length / bends);
      const ny = py + Math.cos(heading) * (length / bends);
      stroke(px, py, nx, ny, thick);
      [px, py] = [nx, ny];
    }
    if (depth === 0 || length < 2) return;
    const forks = rngOf.next() < 0.35 ? 3 : 2;
    for (let fork = 0; fork < forks; fork++) {
      const spread = (fork - (forks - 1) / 2) * range(0.5, 0.9) + (rngOf.next() - 0.5) * 0.4;
      limb(px, py, heading + spread, length * range(0.55, 0.75), Math.max(1, thick - 1), rngOf, depth - 1);
    }
  };

  // Clumps of trees with gaps between, a few lone ones, all standing on the hills.
  let x = range(0, 60);
  while (x < width) {
    const clump = rng.next() < 0.25 ? 1 : Math.floor(range(3, 10));
    for (let tree = 0; tree < clump; tree++) {
      const base = hill(x);
      const tall = range(16, 34) * (clump === 1 ? 1.25 : 1);
      const lean = (rng.next() - 0.5) * 0.35;
      limb(x, base, lean, tall * 0.42, tall > 26 ? 4 : 3, rng, 5);
      x += range(10, 24);
    }
    x += range(30, 160);
  }

  const texture = new THREE.DataTexture(alpha, width, height);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** A texture's average colour, in the working (linear) colour space: what it reads as from far away. */
function meanColour(texture: THREE.Texture): THREE.Color {
  const image = texture.image as HTMLCanvasElement;
  const context = image.getContext("2d");
  if (!context) throw new Error("The ground texture has no 2D canvas");
  const { data } = context.getImageData(0, 0, image.width, image.height);
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  const count = data.length / 4;
  return new THREE.Color().setRGB(sum[0] / count / 255, sum[1] / count / 255, sum[2] / count / 255, THREE.SRGBColorSpace);
}

const vertexShader = /* glsl */ `
  varying vec3 vRay;
  void main() {
    // The far plane's corner in view space, turned into the world: the line of sight through this corner.
    vec4 far = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
    vRay = transpose(mat3(viewMatrix)) * (far.xyz / far.w);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  uniform vec3 sky;
  uniform vec3 zenith;
  uniform vec3 silhouette;
  uniform vec3 moonLight;
  uniform vec3 moonAt;
  uniform float moonRadius;
  uniform float moonGlow;
  uniform float horizon;
  uniform float silhouetteToSky;
  uniform sampler2D trees;
  uniform vec2 treesSize;
  uniform float texelAngle;
  uniform sampler2D ground;
  uniform vec3 groundMean;
  uniform float groundTexels;
  uniform float groundY;
  uniform float floorY;
  uniform float underReach;
  uniform float groundLight;
  uniform float underground;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 vRay;

  /** Where a direction points, as an angle round the horizon and one up from it. */
  vec2 angles(vec3 dir) {
    return vec2(atan(dir.x, dir.z), asin(clamp(dir.y, -1.0, 1.0)));
  }

  vec3 skyAt(vec3 dir, vec2 at) {
    vec3 low = sky * horizon;
    // The moon takes on the sky's hue: pale blue on a night of exploring, a blood moon over the haunt's red.
    vec3 moonColour = moonLight * mix(vec3(1.0), sky / max(max(sky.r, sky.g), max(sky.b, 1e-4)), 0.5);
    vec3 colour = mix(low, zenith, smoothstep(0.0, 0.2, dir.y));
    // On the strip's grid of texels, so the moon and the trees share one pixel size.
    vec2 cell = (floor(at / texelAngle) + 0.5) * texelAngle;
    vec2 moon = angles(moonAt);
    float across = abs(mod(cell.x - moon.x + PI, 2.0 * PI) - PI) * cos(moon.y);
    float off = length(vec2(across, cell.y - moon.y));
    colour += moonColour * moonGlow * 0.12 * pow(max(dot(dir, moonAt), 0.0), 600.0);
    colour += moonColour * moonGlow * 0.05 * pow(max(dot(dir, moonAt), 0.0), 30.0);
    if (off < moonRadius) {
      // A dimmer sea on the moon's face.
      float sea = step(length(vec2(across, cell.y - moon.y) - moonRadius * vec2(-0.3, 0.2)), moonRadius * 0.45);
      colour = moonColour * (1.0 - 0.18 * sea);
    }
    vec2 strip = vec2(at.x / (2.0 * PI) + 0.5, at.y / (texelAngle * treesSize.y));
    if (strip.y >= 0.0 && strip.y < 1.0) {
      float tree = texture2D(trees, strip).a;
      colour = mix(colour, mix(silhouette, low, silhouetteToSky), tree);
    }
    return colour;
  }

  void main() {
    vec3 dir = normalize(vRay);
    vec2 at = angles(dir);
    vec3 forward = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    // three hands materials the fog colour already encoded for the screen, and fogs after encoding: so does this.
    vec3 colour;
    float fog;
    if (dir.y >= 0.0) {
      // Underground there is no sky: earth all round, fading from the fog to black upwards.
      colour = underground > 0.5 ? zenith : skyAt(dir, at);
      fog = underground > 0.5 ? 1.0 - smoothstep(0.0, 0.3, dir.y) : 0.0;
    } else {
      float run = (groundY - cameraPosition.y) / dir.y;
      vec3 hit = cameraPosition + dir * run;
      vec2 uv = hit.xz * groundTexels;
      vec3 texel = texture2D(ground, uv).rgb;
      // Where a texel is smaller than a pixel, the ground shows its average rather than shimmering.
      float footprint = max(length(dFdx(uv)), length(dFdy(uv))) * float(textureSize(ground, 0).x);
      texel = mix(texel, groundMean, smoothstep(0.6, 2.0, footprint));
      // Lit by the sky's colour, as the house's fill lights it, never by the moon's direct light.
      colour = texel * mix(vec3(1.0), sky / max(max(sky.r, sky.g), max(sky.b, 1e-4)), 0.6) * groundLight;
      float sceneFog = smoothstep(fogNear, fogFar, run * dot(dir, forward));
      float under = 1.0 - exp(-((floorY - groundY) / -dir.y) / underReach);
      fog = 1.0 - (1.0 - sceneFog) * (1.0 - under);
    }
    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fog);
  }
`;

/** Which backdrop shows, and where its ground lies: under the floor showing, or round the basement. */
export interface BackdropPlace {
  underground: boolean;
  /** The height of the lowest floor showing, and of the ground floor. */
  floorY: number;
  groundFloorY: number;
}

export interface Backdrop {
  /** Added to the scene, never to the house: it is no part of what the camera frames. */
  mesh: THREE.Mesh;
  show: (place: BackdropPlace) => void;
  dispose: () => void;
}

/** The backdrop, under `sky`: the fill light's sky colour, kept by reference so a mood shift reaches it. */
export function createBackdrop(sky: THREE.Color): Backdrop {
  const grass = earth({ soil: ["void", "soot", "woodDark"], grass: ["wraithDark", "verdigrisDark"], patches: 90, size: 256, seed: "backdrop:grass" });
  const packed = earth({ soil: ["void", "soot", "sootLight"], grass: [], size: 256, seed: "backdrop:earth" });
  const trees = treeLine();
  const groundOf = (underground: boolean) => (underground ? packed : grass);
  const colour = (key: PaletteKey) => new THREE.Color(paletteHex(key));
  const moon = moonDirection();
  const elevation = THREE.MathUtils.degToRad(BACKDROP.moon.elevationDegrees);
  const flat = Math.hypot(moon.x, moon.z);
  const moonAt = new THREE.Vector3((moon.x / flat) * Math.cos(elevation), Math.sin(elevation), (moon.z / flat) * Math.cos(elevation));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      sky: { value: sky },
      zenith: { value: colour(BACKDROP.zenith) },
      silhouette: { value: colour(BACKDROP.silhouette.colour) },
      silhouetteToSky: { value: BACKDROP.silhouette.toSky },
      moonLight: { value: colour(BACKDROP.moon.colour).multiplyScalar(BACKDROP.moon.brightness) },
      moonAt: { value: moonAt },
      moonRadius: { value: THREE.MathUtils.degToRad(BACKDROP.moon.radiusDegrees) },
      moonGlow: { value: BACKDROP.moon.glow },
      horizon: { value: BACKDROP.horizon },
      trees: { value: trees },
      treesSize: { value: new THREE.Vector2(BACKDROP.strip.width, BACKDROP.strip.height) },
      texelAngle: { value: TEXEL_ANGLE },
      ground: { value: grass },
      groundMean: { value: meanColour(grass) },
      groundTexels: { value: TEXELS_PER_METRE / (grass.image as HTMLCanvasElement).width },
      groundY: { value: -BACKDROP.groundDepth },
      floorY: { value: 0 },
      underReach: { value: BACKDROP.underReach },
      groundLight: { value: BACKDROP.groundLight },
      underground: { value: 0 },
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
    },
    fog: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const geometry = new THREE.BufferGeometry();
  // One triangle over the whole screen.
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1e6;
  mesh.name = "backdrop";

  return {
    mesh,
    show: ({ underground, floorY, groundFloorY }) => {
      const uniforms = material.uniforms;
      const texture = groundOf(underground);
      uniforms.underground.value = underground ? 1 : 0;
      uniforms.ground.value = texture;
      uniforms.groundMean.value = meanColour(texture);
      uniforms.groundLight.value = underground ? BACKDROP.earthLight : BACKDROP.groundLight;
      uniforms.floorY.value = floorY;
      uniforms.groundY.value = underground ? floorY - BACKDROP.basementDepth : Math.min(floorY, groundFloorY) - BACKDROP.groundDepth;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      trees.dispose();
    },
  };
}
