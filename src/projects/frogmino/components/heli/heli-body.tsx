"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshLambertMaterial, type Group } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { HELI_PAINTS, heliModel, heliToken, type HeliPaint, type HeliPart, type Rotor } from "../../heli/model";
import { borderMask, mergedParts } from "../vehicle-assets";

// The world's blocks carry this faint a border; the helicopter's big boxes
// share it, so it reads as built from the same blocks as the overpass.
const BORDER_SHADE = 0.78;

function useHeliMaterials() {
  const materials = useMemo(() => {
    const mask = borderMask("all", BORDER_SHADE);
    const plain = Object.fromEntries(
      HELI_PAINTS.map((paint) => [paint, new MeshLambertMaterial({ color: themeColor(heliToken(paint)) })]),
    ) as Record<HeliPaint, MeshLambertMaterial>;
    const bordered = Object.fromEntries(
      HELI_PAINTS.map((paint) => [paint, new MeshLambertMaterial({ color: themeColor(heliToken(paint)), map: mask })]),
    ) as Record<HeliPaint, MeshLambertMaterial>;
    return {
      plain,
      bordered,
      dispose() {
        mask.dispose();
        [...Object.values(plain), ...Object.values(bordered)].forEach((material) => {
          material.dispose();
        });
      },
    };
  }, []);
  useEffect(
    () => () => {
      materials.dispose();
    },
    [materials],
  );
  return materials;
}

// Parts merged per paint, bordered and plain apart.
function useMerged(parts: readonly HeliPart[]) {
  const merged = useMemo(
    () => [
      ...mergedParts(parts.filter((p) => p.bordered === true)).map((m) => ({ ...m, bordered: true })),
      ...mergedParts(parts.filter((p) => p.bordered !== true)).map((m) => ({ ...m, bordered: false })),
    ],
    [parts],
  );
  useEffect(
    () => () => {
      merged.forEach(({ geometry }) => {
        geometry.dispose();
      });
    },
    [merged],
  );
  return merged;
}

function Parts({ parts, materials }: { parts: readonly HeliPart[]; materials: ReturnType<typeof useHeliMaterials> }) {
  const merged = useMerged(parts);
  return merged.map(({ paint, geometry, bordered }) => (
    <mesh key={`${paint}${bordered ? "#" : ""}`} geometry={geometry} material={(bordered ? materials.bordered : materials.plain)[paint]} />
  ));
}

function SpinningRotor({ rotor, materials }: { rotor: Rotor; materials: ReturnType<typeof useHeliMaterials> }) {
  const spin = useRef<Group>(null);
  useFrame((_, delta) => {
    const group = spin.current;
    if (group === null) return;
    const turn = 2 * Math.PI * rotor.speed * delta;
    if (rotor.axis === "y") group.rotation.y += turn;
    else group.rotation.x += turn;
  });
  return (
    <group position={rotor.centre}>
      <group ref={spin}>
        <Parts parts={rotor.parts} materials={materials} />
      </group>
    </group>
  );
}

// The Lily Lifter on a road `lanes` wide, in its own frame (see
// `heli/model.ts`): the deck's top at y = 0, centred on z = 0, lanes as the
// scene's. Its rotors spin by themselves.
export function HeliBody({ lanes }: { lanes: number }) {
  const model = useMemo(() => heliModel(lanes), [lanes]);
  const materials = useHeliMaterials();
  return (
    <>
      <Parts parts={model.body} materials={materials} />
      {model.rotors.map((rotor, i) => (
        <SpinningRotor key={i} rotor={rotor} materials={materials} />
      ))}
    </>
  );
}
