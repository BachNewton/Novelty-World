import { describe, expect, it } from "vitest";

import {
  ASSET_DESTS,
  GLOBAL_TOKENS,
  MANAGE_OPS,
  MAX_SEATS,
  NUM_ASSETS,
  NUM_PROPS,
} from "./action-space";
import {
  actionSpec,
  featLayout,
  obsSpec,
  specV2,
  type GaussianHeadV2,
  type PerEntityCategoricalHeadV2,
} from "./encode-rl";

// ---------------------------------------------------------------------------
// Spec v2 dual-emission gate: the declarative schema block must (a) survive a
// JSON round-trip unchanged (it travels as msgpack — plain data only), and
// (b) derive exactly the dims the v1 spec emitters declare, so the two blocks
// in one spec message can never disagree. Mirrors the Python-side check in
// py/tests/test_schema_v2.py (both anchor to the same v1 contract).
// ---------------------------------------------------------------------------

describe("specV2", () => {
  it("round-trips through JSON unchanged", () => {
    const spec = specV2();
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
  });

  it("declares 4 heads in 3 groups with v1 group ids by list order", () => {
    const spec = specV2();
    expect(spec.action.groups.map((g) => g.name)).toEqual([
      "global",
      "manage",
      "trade",
    ]);
    expect(spec.action.groups.map((g) => [...g.heads])).toEqual([
      ["global"],
      ["manage"],
      ["trade_dest", "trade_cash"],
    ]);
    expect(spec.action.heads.map((h) => h.name)).toEqual([
      "global",
      "manage",
      "trade_dest",
      "trade_cash",
    ]);
  });

  it("declares the manage group as GATED on the global ARM_MANAGE token", () => {
    const spec = specV2();
    const [global, manage, trade] = spec.action.groups;
    // The manage plan is sampled every transition and applies only when the
    // global head emitted ARM_MANAGE — so the group carries a gate instead of
    // being routed by `obs.head`. Its group id (list position 1) is unchanged.
    expect(manage.gate).toEqual({ head: "global", token: "ARM_MANAGE" });
    // The gate names a real head and a real token of that head's vocabulary.
    const gateHead = spec.action.heads.find((h) => h.name === manage.gate?.head);
    expect(gateHead?.type).toBe("categorical");
    if (gateHead?.type === "categorical") {
      expect(gateHead.tokens.includes("ARM_MANAGE")).toBe(true);
    }
    // Every other group is routed, not gated.
    expect(global.gate).toBeUndefined();
    expect(trade.gate).toBeUndefined();
  });

  it("matches the v1 obs dims", () => {
    const spec = specV2();
    const v1 = obsSpec();
    expect(spec.obs.global_feat).toBe(v1.global);
    const player = spec.obs.entities[0];
    const asset = spec.obs.entities[1];
    expect(player).toMatchObject({
      name: "player",
      count: v1.max_seats,
      feat: v1.player,
      presence: "mask",
      self_row: 0,
    });
    expect(asset).toMatchObject({
      name: "asset",
      count: v1.num_assets,
      feat: v1.asset,
      presence: "all",
      identity_embedding: true,
    });
  });

  it("matches the v1 action dims", () => {
    const spec = specV2();
    const v1 = actionSpec();
    const [global, manage, tradeDest, tradeCash] = spec.action.heads;
    expect(global.type).toBe("categorical");
    if (global.type === "categorical") {
      expect([...global.tokens]).toEqual([...v1.global_tokens]);
      expect(global.tokens.length).toBe(GLOBAL_TOKENS.length);
    }
    const m = manage as PerEntityCategoricalHeadV2;
    expect(m.type).toBe("per_entity_categorical");
    expect(m.rows).toBe(NUM_PROPS);
    expect(m.ops?.length).toBe(v1.manage_ops);
    expect([...(m.ops ?? [])]).toEqual([...MANAGE_OPS]);
    // 28 INDEPENDENT per-property categoricals sampled into one plan. The op
    // count is unchanged by that shape, so `select` is the only thing that tells
    // the two apart — v1 carries it as `manage_select` for exactly that reason.
    expect(m.select).toBe("independent");
    expect(v1.manage_select).toBe("independent");
    // The collapse column lives INSIDE the op vocabulary (no extra null column),
    // and is what makes every row structurally legal while a window is open.
    expect(m.null_token).toBe(false);
    expect(m.null_always_legal).toBe(true);
    expect(MANAGE_OPS[0]).toBe("NOOP");
    const td = tradeDest as PerEntityCategoricalHeadV2;
    expect(td.type).toBe("per_entity_categorical");
    expect(td.entity).toBe("asset");
    expect(td.dest_entity).toBe("player");
    expect(td.null_token).toBe(true);
    expect(td.select).toBe("independent");
    // dest cols = player rows + null column == v1 asset_dests
    expect(MAX_SEATS + 1).toBe(v1.asset_dests);
    expect(ASSET_DESTS).toBe(v1.asset_dests);
    const tc = tradeCash as GaussianHeadV2;
    expect(tc.type).toBe("gaussian");
    expect(tc.conditioning).toBe("per_entity");
    expect(tc.exclude_self_row).toBe(true);
    expect(tc.constraint).toBe("zero_sum_derived_slot");
    expect(tc.wire_dim).toBe(v1.cash_dim);
    // asset row set: manage rows are a prefix of the asset entity's rows
    expect(NUM_PROPS).toBeLessThanOrEqual(NUM_ASSETS);
  });

  it("echoes the exact v1 feat_layout (byte layout unchanged)", () => {
    expect(specV2().feat_layout).toEqual(featLayout());
  });

  it("masks reference the packed bool fields", () => {
    const spec = specV2();
    const boolFields = new Set(spec.feat_layout.bool_fields.map((f) => f.name));
    for (const head of spec.action.heads) {
      if ("mask" in head && head.mask !== "") {
        expect(boolFields.has(head.mask)).toBe(true);
      }
    }
    // presence-masked entities have a packed present field
    expect(boolFields.has("present")).toBe(true);
  });

  it("aux knobs reference declared heads/entities/tokens", () => {
    const spec = specV2();
    const headNames = new Set(spec.action.heads.map((h) => h.name));
    const entityNames = new Set(spec.obs.entities.map((e) => e.name));
    expect(headNames.has(spec.aux.ngu_action_head)).toBe(true);
    for (const e of spec.aux.novelty_entities) {
      expect(entityNames.has(e)).toBe(true);
    }
    for (const h of spec.aux.icm_action_heads) {
      expect(headNames.has(h)).toBe(true);
    }
    for (const f of spec.aux.inv_freq_heads) {
      expect(headNames.has(f.head)).toBe(true);
    }
    const globalHead = spec.action.heads[0];
    if (globalHead.type === "categorical") {
      for (const t of spec.aux.telemetry_tokens) {
        expect(globalHead.tokens.includes(t)).toBe(true);
      }
    }
  });
});
