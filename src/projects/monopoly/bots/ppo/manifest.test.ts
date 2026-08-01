import { describe, expect, it } from "vitest";

import {
  ActionSpaceMismatch,
  ManifestError,
  SUPPORTED_CONTRACT_VERSION,
  assertActionGeometry,
  headByName,
  locateFeatField,
  parseManifest,
  parseManifestJson,
} from "./manifest";
import { syntheticManifestJson } from "./synthetic";

// ---------------------------------------------------------------------------
// Manifest parsing.
//
// Every rejection test asserts the message NAMES THE OFFENDING PATH. A parser
// that merely refuses a bad artifact leaves its reader diffing two JSON files by
// eye; the path is what turns "this bundle is broken" into a one-line fix.
//
// The fixture here is the SYNTHETIC manifest, so none of these paths are
// exercised through the shape of the game the runner happens to ship with.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

/** A deep copy of the synthetic manifest with one edit applied, so no test can
 *  observe another's mutation. */
function mutated(edit: (json: Json) => void): Json {
  const json = JSON.parse(JSON.stringify(syntheticManifestJson())) as Json;
  edit(json);
  return json;
}

function heads(json: Json): Json[] {
  return json.heads as Json[];
}

describe("parseManifest", () => {
  it("accepts the synthetic manifest and types every section", () => {
    const m = parseManifest(syntheticManifestJson());
    expect(m.contractVersion).toBe(SUPPORTED_CONTRACT_VERSION);
    expect(m.heads.map((h) => h.kind)).toEqual([
      "categorical",
      "per_entity_categorical",
      "entity_pointer",
      "gaussian",
    ]);
    expect(m.inputs.map((i) => i.name)).toEqual(["env_feat", "crew_feat", "alive", "wrecks"]);
    expect(m.values.map((v) => v.name)).toEqual(["value_haul"]);
    expect(m.composition.routed).toEqual(["dive", "salvage"]);
    expect(m.masking.negInf).toBeLessThan(0);
    expect(Number.isFinite(m.masking.negInf), "neg_inf must be FINITE, never -Infinity").toBe(true);
  });

  it("refuses an unsupported contract version, naming the field", () => {
    expect(() => parseManifest(mutated((j) => (j.contract_version = 3)))).toThrow(
      /manifest\.contract_version: unsupported contract version 3/,
    );
    // Version is checked FIRST: a v3 file whose heads are also malformed must be
    // rejected for its version, since every other field's meaning is version-bound.
    expect(() =>
      parseManifest(
        mutated((j) => {
          j.contract_version = 3;
          heads(j)[0].kind = "nonsense";
        }),
      ),
    ).toThrow(/contract_version/);
  });

  it("refuses a head kind outside the closed set, naming its index", () => {
    // A skipped head drops a whole factor of the joint and nothing downstream
    // reports it — the remaining heads still sample and still normalize.
    expect(() => parseManifest(mutated((j) => (heads(j)[2].kind = "beam_search")))).toThrow(
      /manifest\.heads\[2\]\.kind: expected one of "categorical" \| "entity_pointer" \| "per_entity_categorical" \| "gaussian", got "beam_search"/,
    );
  });

  it("names the path and the offending value for a malformed field", () => {
    expect(() => parseManifest(mutated((j) => (heads(j)[2].null_column = "x")))).toThrow(
      /manifest\.heads\[2\]\.null_column: expected integer, got "x"/,
    );
    expect(() => parseManifest(mutated((j) => (heads(j)[0].tokens = ["A", 7])))).toThrow(
      /manifest\.heads\[0\]\.tokens\[1\]: expected string, got 7/,
    );
    expect(() => parseManifest(mutated((j) => delete heads(j)[1].select))).toThrow(
      /manifest\.heads\[1\]\.select: missing \(required\)/,
    );
    expect(() => parseManifest(mutated((j) => (heads(j)[1].select = "each")))).toThrow(
      /manifest\.heads\[1\]\.select: expected one of "one" \| "independent", got "each"/,
    );
  });

  it("treats the null fields as absent-and-fine on a continuous head", () => {
    // A gaussian has no discrete vocabulary to collapse onto, so it carries none
    // of the three — demanding them would reject every valid bundle with one.
    const m = parseManifest(syntheticManifestJson());
    const gaussian = headByName(m, "ballast");
    expect(gaussian.kind).toBe("gaussian");
    expect("nullColumn" in gaussian).toBe(false);
  });

  it("refuses a per-entity head with both or neither of ops / dest_entity", () => {
    expect(() => parseManifest(mutated((j) => (heads(j)[1].dest_entity = "diver")))).toThrow(
      /manifest\.heads\[1\]: exactly one of ops \/ dest_entity must be non-null/,
    );
    expect(() => parseManifest(mutated((j) => (heads(j)[1].ops = null)))).toThrow(
      /manifest\.heads\[1\]: exactly one of ops \/ dest_entity must be non-null/,
    );
  });

  it("refuses a count mask that reads from the packed blob", () => {
    // A packed boolean field is 0/1 bytes, so a count of 17 would read back as 1
    // and the head would see one legal row instead of seventeen — a wrong policy
    // that every shape check and every normalization test passes.
    expect(() =>
      parseManifest(
        mutated((j) => {
          const mask = heads(j)[2].mask as Json;
          mask.source = { kind: "feat_layout", section: "bool_fields", field: "alive" };
        }),
      ),
    ).toThrow(/manifest\.heads\[2\]\.mask\.source\.kind: a count mask's source must be "wire"/);
  });

  it("refuses a composition naming a head that does not exist", () => {
    expect(() =>
      parseManifest(
        mutated((j) => {
          const comp = j.composition as Json;
          (comp.groups as Json[])[0].heads = ["move", "phantom"];
        }),
      ),
    ).toThrow(/manifest\.composition\.groups\[0\]\.heads\[1\]: names head "phantom"/);
  });

  it("refuses a files[] that omits the graph", () => {
    // files[] is what keeps a bundle verifiable when the weights spill to a
    // sidecar; a graph missing from it is a graph nobody checksummed.
    expect(() => parseManifest(mutated((j) => (j.files = [])))).toThrow(
      /manifest\.files: does not list the graph "policy\.onnx"/,
    );
  });

  it("refuses a sha256 that is not a digest", () => {
    expect(() =>
      parseManifest(mutated((j) => ((j.files as Json[])[0].sha256 = "deadbeef"))),
    ).toThrow(/manifest\.files\[0\]\.sha256: expected 64 lowercase hex characters/);
  });

  it("refuses a feat_layout whose counts do not add up", () => {
    expect(() =>
      parseManifest(mutated((j) => ((j.feat_layout as Json).float_count = 99))),
    ).toThrow(/manifest\.feat_layout\.float_count: declares 99 but float_fields sum to/);
    expect(() =>
      parseManifest(
        mutated((j) => {
          const field = (j.feat_layout as Json).float_fields as Json[];
          field[1].cols = 5;
        }),
      ),
    ).toThrow(/manifest\.feat_layout\.float_fields\[1\]: count 12 does not equal rows \* cols/);
  });

  it("reports malformed JSON as a manifest error", () => {
    expect(() => parseManifestJson("{not json")).toThrow(ManifestError);
  });
});

describe("the geometry guard", () => {
  it("refuses a manifest that disagrees with itself", () => {
    // A hand-edited action_geometry could otherwise talk a consumer straight past
    // its own compatibility check.
    expect(() =>
      parseManifest(mutated((j) => ((j.action_geometry as Json).crew_ops = 4))),
    ).toThrow(ActionSpaceMismatch);
    expect(() =>
      parseManifest(mutated((j) => ((j.action_geometry as Json).crew_ops = 4))),
    ).toThrow(/crew_ops: action_geometry=4 vs dims-derived=3/);
  });

  it("derives a list-valued dim's geometry entry as its LENGTH", () => {
    // Two nets with the same-sized vocabulary are load-compatible; two with
    // different spellings of it are not, which is why dims keeps the names and
    // the geometry keeps the width.
    expect(() =>
      parseManifest(mutated((j) => ((j.dims as Json).move_tokens = ["A", "B"]))),
    ).toThrow(/move_tokens: action_geometry=5 vs dims-derived=2/);
  });

  it("refuses a geometry key that dims does not declare", () => {
    // The reference reconstructs a dataclass here and silently takes its default.
    // A game-agnostic consumer has no defaults, and inventing one is exactly how a
    // stale artifact talks its way past the guard.
    expect(() =>
      parseManifest(mutated((j) => delete (j.dims as Json).crew_select)),
    ).toThrow(/action_geometry\.crew_select: action_geometry declares "crew_select" but dims does not/);
  });

  it("passes two artifacts that agree and names every field that differs", () => {
    const a = parseManifest(syntheticManifestJson());
    expect(() => assertActionGeometry(a.actionGeometry, a.actionGeometry, "twin")).not.toThrow();

    // The factorization fields change how identical logits factor into a joint
    // WITHOUT changing any tensor shape, so nothing but this guard can catch them.
    const other = { ...a.actionGeometry, crew_select: "independent", crew_gated: false };
    expect(() => assertActionGeometry(a.actionGeometry, other, "other")).toThrow(ActionSpaceMismatch);
    // Both differing fields are named, not just the first one found.
    expect(() => assertActionGeometry(a.actionGeometry, other, "other")).toThrow(
      /crew_gated: other=false vs live=true/,
    );
    expect(() => assertActionGeometry(a.actionGeometry, other, "other")).toThrow(
      /crew_select: other="independent" vs live="one"/,
    );
  });

  it("treats a key present on only one side as a difference", () => {
    const a = parseManifest(syntheticManifestJson());
    const missing = { ...a.actionGeometry };
    delete missing.divers;
    expect(() => assertActionGeometry(a.actionGeometry, missing, "trimmed")).toThrow(
      /divers: trimmed=undefined vs live=3/,
    );
  });
});

describe("locateFeatField", () => {
  it("gives the byte offset of every field in packed order", () => {
    const m = parseManifest(syntheticManifestJson());
    const env = locateFeatField(m.featLayout, "float_fields", "env");
    const crew = locateFeatField(m.featLayout, "float_fields", "crew");
    expect(env).not.toBeNull();
    expect(crew).not.toBeNull();
    expect(env?.byteOffset).toBe(0);
    // Floats are four bytes wide and packed in declared order.
    expect(crew?.byteOffset).toBe(6 * 4);

    // The boolean section starts after the WHOLE float section, not after the
    // last float field a caller happened to ask about.
    const alive = locateFeatField(m.featLayout, "bool_fields", "alive");
    expect(alive?.byteOffset).toBe(m.featLayout.floatCount * 4);
    const crewMask = locateFeatField(m.featLayout, "bool_fields", "crew_mask");
    expect(crewMask?.byteOffset).toBe(m.featLayout.floatCount * 4 + 3 + 5);
    expect(crewMask?.count).toBe(12);
  });

  it("returns null for a field the layout does not declare", () => {
    const m = parseManifest(syntheticManifestJson());
    expect(locateFeatField(m.featLayout, "bool_fields", "env")).toBeNull();
  });
});

describe("headByName", () => {
  it("fails loudly rather than returning undefined", () => {
    const m = parseManifest(syntheticManifestJson());
    expect(headByName(m, "move").kind).toBe("categorical");
    expect(() => headByName(m, "manage")).toThrow(/declares no head named "manage"/);
  });
});
