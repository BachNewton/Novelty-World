import { describe, expect, it } from "vitest";
import { storyOf } from "../stories/library";
import { emptyBasket, type Basket } from "./basket";
import {
  awaitsChoice,
  beginConversation,
  choose,
  fill,
  followsOn,
  nextPage,
  noAcquaintances,
  openTalk,
  pagesOf,
  parseFolk,
  rememberTone,
  serializeFolk,
  talkFor,
  type Having,
  type Speaker,
} from "./conversation";
import { addBrew, emptySatchel } from "./brewing";
import { addDish, emptyLarder } from "./cooking";
import { takingFor, WARM_DISHES } from "./help";

const speaker = (story: string, id = "1,2/0", partner: string | null = null): Speaker => ({ id, role: storyOf(story).roles[0], seed: `seed/${id}`, story, partner });
const nothing: Having = { basket: emptyBasket(), larder: emptyLarder(), satchel: emptySatchel(), petHere: false };
const withBasket = (stock: Partial<Basket>): Having => ({ ...nothing, basket: { ...emptyBasket(), ...stock } });

describe("talking with people", () => {
  it("meets someone with a tale, gives the tip as it opens, then greets Elliott as a friend by the tone they took", () => {
    const shepherd = speaker("bell-ewe");
    const met = openTalk(noAcquaintances(), shepherd, nothing);
    expect(met.talk).toBe("meet");
    expect(met.memory.hints).toEqual(["lingonberry-porridge"]);
    const playful = rememberTone(met.memory, shepherd.id, "playful");
    const again = openTalk(playful, shepherd, nothing);
    expect(again.talk).toBe("friend");
    expect(pagesOf(storyOf("bell-ewe"), "friend", "playful")[0].say).toBe(storyOf("bell-ewe").friend.greet.playful);
    expect(again.memory.known[shepherd.id].talks).toBe(2);
    expect(again.memory.hints).toEqual(["lingonberry-porridge"]);
  });

  it("asks for forage, waits while there isn't enough, and takes it as the thanks opens, the most plentiful first", () => {
    const beekeeper = speaker("preserves");
    const asked = openTalk(noAcquaintances(), beekeeper, nothing).memory;
    expect(asked.known[beekeeper.id].help).toBe("asked");
    expect(openTalk(asked, beekeeper, withBasket({ bilberry: 2 })).talk).toBe("waiting");
    const having = withBasket({ bilberry: 3, raspberry: 2 });
    const thanked = openTalk(asked, beekeeper, having);
    expect(thanked.talk).toBe("thanks");
    expect(thanked.taking).toEqual({ kind: "forage", foods: [["bilberry", 3], ["raspberry", 1]] });
    expect(thanked.memory.known[beekeeper.id]).toMatchObject({ help: "given", gave: "bilberry" });
    expect(thanked.memory.keepsakes).toEqual(["honey-jar"]);
    expect(thanked.memory.hints).toEqual(["cloudberry-pancakes"]);
    expect(openTalk(thanked.memory, beekeeper, having).talk).toBe("friend");
  });

  it("takes a warm dish from the pot for a cold traveller, whichever warm dish is in the basket", () => {
    const traveller = speaker("long-road");
    const asked = openTalk(noAcquaintances(), traveller, nothing).memory;
    const pie = addDish(emptyLarder(), "blueberry-pie").larder;
    expect(talkFor(storyOf("long-road"), asked, traveller, { ...nothing, larder: pie })).toBe("waiting");
    const soup = addDish(pie, "humble-pot-porcini").larder;
    const thanked = openTalk(asked, traveller, { ...nothing, larder: soup });
    expect(thanked.taking).toEqual({ kind: "dish", dish: "humble-pot-porcini" });
    expect(WARM_DISHES).toContain("bilberry-soup");
    expect(WARM_DISHES).not.toContain("blueberry-pie");
  });

  it("asks for a brew, hinting how it is made, and takes it from the satchel as the thanks opens, remembered through the device", () => {
    const shepherd = speaker("sore-hoof");
    const met = openTalk(noAcquaintances(), shepherd, nothing);
    expect(met.memory.brewHints).toEqual(["yarrow-salve"]);
    expect(openTalk(met.memory, shepherd, nothing).talk).toBe("waiting");
    const salve = { ...nothing, satchel: addBrew(emptySatchel(), "yarrow-salve", 0, false).satchel };
    const thanked = openTalk(met.memory, shepherd, salve);
    expect(thanked).toMatchObject({ talk: "thanks", taking: { kind: "brew", brew: "yarrow-salve" } });
    expect(thanked.memory.known[shepherd.id]).toMatchObject({ help: "given", gave: "yarrow-salve" });
    expect(thanked.memory.keepsakes).toEqual(["sheep-bell"]);
    expect(parseFolk(serializeFolk(thanked.memory))).toEqual(thanked.memory);
  });

  it("goes straight on to thanks for any tea when Elliott comes with one, even a humble one", () => {
    const cottager = speaker("a-chill");
    const tea = { ...nothing, satchel: addBrew(emptySatchel(), "humble-tea-bilberry", 0, false).satchel };
    const met = openTalk(noAcquaintances(), cottager, tea);
    const next = talkFor(storyOf("a-chill"), met.memory, cottager, tea);
    expect(next).toBe("thanks");
    expect(followsOn(met.talk, next)).toBe(true);
    expect(openTalk(met.memory, cottager, tea).taking).toEqual({ kind: "brew", brew: "humble-tea-bilberry" });
  });

  it("thanks Elliott for a lost animal brought back: kept as a companion, or gone home to its person", () => {
    const cottager = speaker("cat-who-chose");
    const asked = openTalk(noAcquaintances(), cottager, nothing).memory;
    expect(openTalk(asked, cottager, nothing).talk).toBe("waiting");
    const kept = openTalk(asked, cottager, { ...nothing, petHere: true });
    expect(kept).toMatchObject({ talk: "thanks", taking: { kind: "pet" }, keepsPet: true });
    expect(kept.memory.home).toEqual([]);
    const herder = speaker("snow-light", "4,4/0");
    const gone = openTalk(openTalk(noAcquaintances(), herder, nothing).memory, herder, { ...nothing, petHere: true });
    expect(gone.keepsPet).toBe(false);
    expect(gone.memory.home).toEqual(["lost/4,4/0"]);
  });

  it("carries a note from one person to the other, whose arrival is a talk of its own, and then thanks the giver", () => {
    const hiker = speaker("turned-around", "1,1/0", "1,1/1");
    const friend = speaker("on-the-shore", "1,1/1", "1,1/0");
    const given = openTalk(noAcquaintances(), hiker, nothing).memory;
    expect(given.carrying).toEqual([{ parcel: "note", from: hiker.id, to: friend.id }]);
    expect(openTalk(given, hiker, nothing).talk).toBe("waiting");
    const arrived = openTalk(given, friend, nothing);
    expect(arrived.talk).toBe("delivered");
    expect(arrived.memory.carrying).toEqual([]);
    expect(arrived.memory.known[hiker.id].help).toBe("delivered");
    expect(arrived.memory.hints).toEqual(["funnel-chanterelle-soup"]);
    expect(openTalk(arrived.memory, friend, nothing).talk).toBe("friend");
    const thanked = openTalk(arrived.memory, hiker, nothing);
    expect(thanked.talk).toBe("thanks");
    expect(thanked.memory.keepsakes).toEqual(["compass"]);
  });

  it("waits on a friend's shore until the note comes, met or not", () => {
    const friend = speaker("on-the-shore", "1,1/1", "1,1/0");
    const met = openTalk(noAcquaintances(), friend, nothing);
    expect(met.talk).toBe("meet");
    expect(openTalk(met.memory, friend, nothing).talk).toBe("waiting");
  });

  it("goes straight on from meeting to thanks when Elliott already has what is asked", () => {
    const cottager = speaker("cat-who-chose");
    const met = openTalk(noAcquaintances(), cottager, { ...nothing, petHere: true });
    expect(met.talk).toBe("meet");
    const next = talkFor(storyOf("cat-who-chose"), met.memory, cottager, { ...nothing, petHere: true });
    expect(next).toBe("thanks");
    expect(followsOn(met.talk, next)).toBe(true);
    expect(followsOn("meet", "waiting")).toBe(false);
  });

  it("steps through a talk's pages, holding on a choice until one is made, its reply shown before going on", () => {
    const pages = pagesOf(storyOf("bell-ewe"), "meet", null);
    let c = beginConversation("1,2/0", "meet");
    expect(awaitsChoice(c, pages)).toBe(true);
    expect(() => nextPage(c, pages)).toThrow();
    c = choose(c, pages, "curious");
    expect(c.chose).toBe("curious");
    const next = nextPage(c, pages);
    expect(next).toMatchObject({ page: 1, chose: null });
    let end: typeof c | null = next;
    let guard = 0;
    while (end !== null && guard++ < 20) end = awaitsChoice(end, pages) ? choose(end, pages, "warm") : nextPage(end, pages);
    expect(end).toBeNull();
  });

  it("fills the braces, lowercasing a dish mid-sentence", () => {
    expect(fill("Oh, {gave}! Hot.", { gave: "Berry tea" })).toBe("Oh, berry tea! Hot.");
    expect(fill("{gave}, sweet as anything.", { gave: "Bilberries" })).toBe("Bilberries, sweet as anything.");
    expect(fill("I'm {name}.", { name: "Aili" })).toBe("I'm Aili.");
    expect(() => fill("{pet}!", {})).toThrow();
  });

  it("keeps the memory through the device and back unchanged", () => {
    const hiker = speaker("turned-around", "1,1/0", "1,1/1");
    const memory = rememberTone(openTalk(openTalk(noAcquaintances(), speaker("preserves"), nothing).memory, hiker, nothing).memory, hiker.id, "warm");
    expect(parseFolk(serializeFolk(memory))).toEqual(memory);
    expect(() => parseFolk(JSON.stringify({ known: {}, carrying: [], hints: ["toast"], keepsakes: [], home: [] }))).toThrow();
  });

  it("never takes what isn't there", () => {
    expect(() => takingFor({ kind: "dish", dish: "berry-tea" }, { ...nothing, delivered: false })).toThrow();
  });
});
