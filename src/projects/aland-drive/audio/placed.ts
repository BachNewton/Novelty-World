import { heardAt, voicesHeard, type Listener } from "./model";
import { churchBell, gullCall, rollGravelLoop, rollTarmacLoop, trafficEngineLoop, trafficMotorLoop, type Loop } from "./synthesis";
import { ELECTRIC_LOOP_RPM, TRAFFIC_LOOP_RPM, TRAFFIC_VOICES } from "./traffic";

/*
 * Sounds placed in the world: each comes from a place in the scene, as loud as its loudness at 8 m and falling off with
 * distance, from its own side of the listener. A loop sounds while its caller names it each frame (a car's engine, a
 * fountain); a one-shot plays once from where it was asked for (a gull, a church bell), its side and loudness following
 * the listener while it plays. Only the loudest heard play, up to the budget (`PLACED_VOICES` in `model.ts`), which a
 * setting can turn down: a loop past the budget is stopped and starts again when it's among the loudest, and a one-shot
 * asked for with the budget full isn't played. Which plays, and how loud and from which side, is `model.ts`'s rule.
 */

/** Every sound that can be placed, rendered once when first asked for. A new kind of placed sound is a row here. */
const PLACED = {
  gull: gullCall,
  bell: churchBell,
  "traffic-petrol": () => trafficEngineLoop(TRAFFIC_VOICES.petrol, TRAFFIC_LOOP_RPM.petrol),
  "traffic-diesel": () => trafficEngineLoop(TRAFFIC_VOICES.diesel, TRAFFIC_LOOP_RPM.diesel),
  "traffic-van": () => trafficEngineLoop(TRAFFIC_VOICES.van, TRAFFIC_LOOP_RPM.van),
  "traffic-electric": () => trafficMotorLoop(TRAFFIC_VOICES.electric, ELECTRIC_LOOP_RPM),
  "roll-tarmac": rollTarmacLoop,
  "roll-gravel": rollGravelLoop,
} satisfies Record<string, () => Loop>;

export type PlacedSoundId = keyof typeof PLACED;

/** The traffic's loops (`traffic.ts`). */
export const TRAFFIC_SOUNDS: readonly PlacedSoundId[] = ["traffic-petrol", "traffic-diesel", "traffic-van", "traffic-electric", "roll-tarmac", "roll-gravel"];

/** A loop placed in the world this frame: `id` keeps it the same voice from frame to frame. */
export interface PlacedLoop {
  id: string;
  sound: PlacedSoundId;
  x: number;
  z: number;
  loudness: number;
  /** How fast it plays, 1 as rendered: a traffic car's revs and its pass-by. */
  rate?: number;
}

/** How fast a placed voice's loudness and side follow the listener, seconds: smooth, but quick enough to follow a pass-by. */
const FOLLOW_S = 0.05;

interface Voice {
  source: AudioBufferSourceNode;
  level: GainNode;
  side: StereoPannerNode;
  x: number;
  z: number;
  loudness: number;
}

export function createPlacedVoices(context: BaseAudioContext, out: AudioNode, toBuffer: (loop: Loop) => AudioBuffer) {
  const buffers = new Map<PlacedSoundId, AudioBuffer>();
  const bufferOf = (sound: PlacedSoundId) => {
    let buffer = buffers.get(sound);
    if (buffer === undefined) {
      buffer = toBuffer(PLACED[sound]());
      buffers.set(sound, buffer);
    }
    return buffer;
  };
  const loops = new Map<string, Voice>();
  const onces = new Set<Voice>();
  let listener: Listener | null = null;

  const start = (sound: PlacedSoundId, loop: boolean, rate: number, x: number, z: number, loudness: number): Voice => {
    const source = new AudioBufferSourceNode(context, { buffer: bufferOf(sound), loop, playbackRate: rate });
    const level = new GainNode(context, { gain: 0 });
    const side = new StereoPannerNode(context, { pan: 0 });
    source.connect(level).connect(side).connect(out);
    source.start();
    return { source, level, side, x, z, loudness };
  };
  const follow = (voice: Voice, gain: number, pan: number) => {
    voice.level.gain.setTargetAtTime(gain, context.currentTime, FOLLOW_S);
    voice.side.pan.setTargetAtTime(pan, context.currentTime, FOLLOW_S);
  };
  const stop = (voice: Voice) => {
    voice.level.gain.setTargetAtTime(0, context.currentTime, FOLLOW_S);
    voice.source.stop(context.currentTime + FOLLOW_S * 5);
  };

  return {
    /** Renders these sounds now, while the sound is being built, so the first time one plays costs a frame nothing. */
    prepare(sounds: readonly PlacedSoundId[]) {
      for (const sound of sounds) bufferOf(sound);
    },
    /** Each frame: where the sound is heard from, the loops placed this frame, and how many voices may play. */
    frame(heardFrom: Listener, placed: readonly PlacedLoop[], budget: number) {
      listener = heardFrom;
      for (const voice of onces) {
        const { gain, pan } = heardAt(heardFrom, voice.x, voice.z, voice.loudness);
        follow(voice, gain, pan);
      }
      const chosen = voicesHeard(heardFrom, placed, budget - onces.size);
      const kept = new Set(chosen.map(({ id }) => id));
      for (const [id, voice] of loops) {
        if (kept.has(id)) continue;
        stop(voice);
        loops.delete(id);
      }
      for (const { id, sound, x, z, loudness, rate = 1, gain, pan } of chosen) {
        let voice = loops.get(id);
        if (voice === undefined) {
          voice = start(sound, true, rate, x, z, loudness);
          loops.set(id, voice);
        }
        Object.assign(voice, { x, z, loudness });
        follow(voice, gain, pan);
        voice.source.playbackRate.setTargetAtTime(rate, context.currentTime, FOLLOW_S);
      }
    },
    /** Plays a sound once from a place, at a rate (1 as rendered), if it's heard and the budget has room. */
    once(sound: PlacedSoundId, x: number, z: number, loudness: number, budget: number, rate = 1) {
      if (listener === null || loops.size + onces.size >= budget) return;
      const { gain, pan } = heardAt(listener, x, z, loudness);
      if (gain === 0) return;
      const voice = start(sound, false, rate, x, z, loudness);
      voice.level.gain.value = gain;
      voice.side.pan.value = pan;
      onces.add(voice);
      voice.source.onended = () => {
        voice.source.disconnect();
        onces.delete(voice);
      };
    },
    /** How many placed voices are playing. */
    playing: () => loops.size + onces.size,
    stopAll() {
      for (const voice of [...loops.values(), ...onces]) voice.source.stop();
      loops.clear();
      onces.clear();
    },
  };
}
