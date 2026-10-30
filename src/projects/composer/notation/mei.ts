import { noteKey } from "../analysis";
import { metreOf, TICKS_PER_QUARTER, type Metre } from "./metre";
import type { Clef, Notation, Staff, Tie, Written, WrittenNote } from "./transcribe";

// Notation as MEI, Verovio's native tongue: what we write is what it engraves,
// and the ids we give notes are the ids its timemap and its SVG hand back.

const PITCH_NAMES = "cdefgab";
const ACCIDENTALS: Record<number, string> = { [-2]: "ff", [-1]: "f", 0: "n", 1: "s", 2: "x" };
const GESTURAL: Record<number, string> = { [-2]: "ff", [-1]: "f", 1: "s", 2: "ss" };

const CLEFS: Record<Clef, string> = {
  treble: 'clef.shape="G" clef.line="2"',
  treble8: 'clef.shape="G" clef.line="2" clef.dis="8" clef.dis.place="above"',
  bass: 'clef.shape="F" clef.line="4"',
  bass8: 'clef.shape="F" clef.line="4" clef.dis="8" clef.dis.place="below"',
  percussion: 'clef.shape="perc" clef.line="3"',
};

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function keySignature(fifths: number): string {
  return fifths === 0 ? "0" : `${String(Math.abs(fifths))}${fifths > 0 ? "s" : "f"}`;
}

function staffDef(staff: Staff, number: number, fifths: number): string {
  const signature = staff.clef === "percussion" ? "" : ` keysig="${keySignature(fifths)}"`;
  return `<staffDef n="${String(number)}" lines="5" ${CLEFS[staff.clef]}${signature}/>`;
}

function staffDefs(staves: readonly Staff[], fifths: number): string {
  const defs: string[] = [];
  staves.forEach((staff, index) => {
    if (staff.brace === null) defs.push(staffDef(staff, index + 1, fifths));
    else if (staff.brace === index) {
      const pair = staves.filter((other) => other.brace === staff.brace);
      const inner = pair.map((other, offset) => staffDef(other, index + 1 + offset, fifths)).join("");
      defs.push(`<staffGrp symbol="brace" bar.thru="true">${inner}</staffGrp>`);
    }
  });
  return `<staffGrp symbol="bracket" bar.thru="false">${defs.join("")}</staffGrp>`;
}

function value({ dur, dots }: Written): string {
  return `dur="${String(dur)}"${dots === 1 ? ' dots="1"' : ""}`;
}

// Hands out note ids, and remembers which notes continue which: Verovio's
// timemap names only the first note of a tie, and every one of them sounds.
class Ids {
  private next = 0;
  private open = new Map<string, string>();
  readonly ties = new Map<string, string[]>();
  // By a note's place in the score, its first written id.
  readonly written: [key: string, id: string][] = [];
  line = "";
  track = "";

  note(id: string, tie: Tie | null): string {
    const note = `n${String(this.next++)}`;
    const held = `${this.line}:${id}`;
    if (tie === "i") {
      this.open.set(held, note);
      this.ties.set(note, []);
    } else if (tie !== null) {
      const first = this.open.get(held);
      if (first === undefined) throw new Error(`Notation: a tie out of nothing at ${note}`);
      this.ties.get(first)?.push(note);
    }
    return note;
  }
}

function noteAttributes(note: WrittenNote, ids: Ids): string {
  const { letter, alter, octave } = note.spelled;
  const noteId = ids.note(`${String(letter)}:${String(octave)}`, note.tie);
  if (note.tie === null || note.tie === "i") ids.written.push([noteKey(ids.track, note.source.start, note.source.pitch), noteId]);
  const id = `xml:id="${noteId}"`;
  if (note.drum !== null) return `${id} pname="c" oct="5" loc="${String(note.drum.line)}"${note.drum.cross ? ' head.shape="x"' : ""}`;
  const accidental = note.accidental === null ? "" : ` accid="${ACCIDENTALS[note.accidental]}"`;
  const sounding = note.accidental === null && alter !== 0 ? ` accid.ges="${GESTURAL[alter]}"` : "";
  const tie = note.tie === null ? "" : ` tie="${note.tie}"`;
  return `${id} pname="${PITCH_NAMES[letter]}" oct="${String(octave)}"${accidental}${sounding}${tie}`;
}

function writeEvent(written: Written, ids: Ids): string {
  const { notes, hidden, staccato } = written;
  if (notes.length === 0) return hidden ? `<space ${value(written)}/>` : `<rest ${value(written)}/>`;
  const artic = staccato ? ' artic="stacc"' : "";
  if (notes.length === 1) return `<note ${value(written)}${artic} ${noteAttributes(notes[0], ids)}/>`;
  return `<chord ${value(written)}${artic}>${notes.map((note) => `<note ${noteAttributes(note, ids)}/>`).join("")}</chord>`;
}

function isBeamed(written: Written): boolean {
  return written.notes.length > 0 && written.dur >= 8;
}

// The beat a note beams within. Compound time has its beats, simple its
// quarters; eighths alone may join across the two beats of a half.
function beamGroup(written: Written, metre: Metre): number {
  return metre.beats.findLastIndex((beat) => beat <= written.start) * 2 + Math.floor((written.start % (metre.compound ? metre.barTicks : TICKS_PER_QUARTER * 2)) / metre.barTicks);
}

function beamRuns(events: readonly Written[], metre: Metre): Written[][] {
  const runs: Written[][] = [];
  for (const written of events) {
    const last = runs.at(-1)?.at(-1);
    const joins = last !== undefined && isBeamed(last) && isBeamed(written) && last.end === written.start && beamGroup(last, metre) === beamGroup(written, metre);
    if (joins) runs[runs.length - 1].push(written);
    else runs.push([written]);
  }
  if (metre.middle === null || metre.compound) return runs;
  const halves: Written[][] = [];
  for (const run of runs) {
    const previous = halves.at(-1);
    const twoEighths = (group: readonly Written[]): boolean => group.length === 2 && group.every(({ dur, dots, tuplet }) => dur === 8 && dots === 0 && tuplet === null);
    const startsHalf = run[0].start % (TICKS_PER_QUARTER * 2) === TICKS_PER_QUARTER;
    if (previous !== undefined && twoEighths(previous) && twoEighths(run) && startsHalf && previous[1].end === run[0].start) {
      previous.push(...run);
    } else {
      halves.push([...run]);
    }
  }
  return halves;
}

function writeBeamed(events: readonly Written[], metre: Metre, ids: Ids): string {
  return beamRuns(events, metre)
    .map((run) => {
      const inner = run.map((written) => writeEvent(written, ids)).join("");
      return run.length > 1 ? `<beam>${inner}</beam>` : inner;
    })
    .join("");
}

function writeVoice(events: readonly Written[], metre: Metre, ids: Ids): string {
  const parts: string[] = [];
  let plain: Written[] = [];
  const flush = (): void => {
    parts.push(writeBeamed(plain, metre, ids));
    plain = [];
  };
  for (let index = 0; index < events.length; ) {
    const { tuplet } = events[index];
    if (tuplet === null) {
      plain.push(events[index]);
      index++;
      continue;
    }
    flush();
    const inside: Written[] = [];
    while (events.at(index)?.tuplet?.cell === tuplet.cell) inside.push(events[index++]);
    const bracket = inside.some(({ notes }) => notes.length === 0) ? "true" : "false";
    parts.push(`<tuplet num="${String(tuplet.count)}" numbase="${String(tuplet.count === 3 ? 2 : 4)}" bracket.visible="${bracket}" num.format="count">${writeBeamed(inside, metre, ids)}</tuplet>`);
  }
  flush();
  return parts.join("");
}

function writeStaffBar(staff: Staff, bar: number, number: number, metre: Metre, ids: Ids): string {
  const voices = staff.bars[bar];
  ids.track = staff.name;
  // By staff, not voice: a bar with fewer voices renumbers them, so a tie can cross voices.
  ids.line = String(number);
  const layers =
    voices.length === 0
      ? '<layer n="1"><mRest/></layer>'
      : voices
          .map((voice, index) => {
            return `<layer n="${String(index + 1)}">${writeVoice(voice, metre, ids)}</layer>`;
          })
          .join("");
  return `<staff n="${String(number)}">${layers}</staff>`;
}

// A place in the piece as a bar and a beat in the metre's own unit.
function barPlace(quarters: number, notation: Notation, metre: Metre): { bar: number; tstamp: number } {
  const unit = 4 / notation.metre[1];
  const bar = Math.floor((quarters * TICKS_PER_QUARTER) / metre.barTicks);
  const within = quarters - (bar * metre.barTicks) / TICKS_PER_QUARTER;
  return { bar, tstamp: 1 + within / unit };
}

function lowestStaff(notation: Notation): number {
  return notation.staves.reduce((lowest, staff, index) => (staff.clef === "percussion" ? lowest : index + 1), 1);
}

// The marks each bar carries over its notes: tempo changes and the pedal.
function controlMarks(notation: Notation, metre: Metre): Map<number, string[]> {
  const marks = new Map<number, string[]>();
  const add = (bar: number, mark: string): void => void marks.set(bar, [...(marks.get(bar) ?? []), mark]);
  const { tempo } = notation;
  tempo.forEach((point, index) => {
    const next = tempo.at(index + 1);
    const { bar, tstamp } = barPlace(point.beat, notation, metre);
    if (next?.glide === true) {
      add(bar, `<tempo tstamp="${String(tstamp)}" staff="1" place="above">${next.bpm < point.bpm ? "rit." : "accel."}</tempo>`);
    } else if (index > 0 && point.glide !== true) {
      add(bar, `<tempo tstamp="${String(tstamp)}" staff="1" place="above" mm.unit="4" mm="${String(Math.round(point.bpm))}">a tempo</tempo>`);
    }
  });
  const staff = lowestStaff(notation);
  for (const { beat, down } of notation.pedal) {
    const { bar, tstamp } = barPlace(beat, notation, metre);
    if (bar < notation.bars) add(bar, `<pedal tstamp="${String(tstamp)}" staff="${String(staff)}" dir="${down ? "down" : "up"}" form="pedstar"/>`);
  }
  return marks;
}

function tempoMark(notation: Notation, metre: Metre): string {
  const { tempo, swing } = notation;
  if (!swing) return "";
  const { bpm } = tempo[0];
  const beat = metre.compound ? { unit: 'mm.unit="4" mm.dots="1"', perMinute: bpm / 1.5 } : { unit: 'mm.unit="4"', perMinute: bpm };
  return `<tempo tstamp="1" staff="1" place="above" ${beat.unit} mm="${String(Math.round(beat.perMinute))}">Swing</tempo>`;
}

function document(music: string, title: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">',
    `<meiHead><fileDesc><titleStmt><title>${escapeXml(title)}</title></titleStmt><pubStmt/></fileDesc></meiHead>`,
    `<music><body><mdiv><score>${music}</score></mdiv></body></music>`,
    "</mei>",
  ].join("");
}

function scoreDef(notation: Notation, fifths: number): string {
  const [count, unit] = notation.metre;
  return `<scoreDef meter.count="${String(count)}" meter.unit="${String(unit)}" midi.bpm="${String(notation.tempo[0].bpm)}">${staffDefs(notation.staves, fifths)}</scoreDef>`;
}

// By staff, not for the score: a drum staff has no key to change.
function keyChange(staves: readonly Staff[], fifths: number): string {
  const defs = staves.map((staff, index) => (staff.clef === "percussion" ? "" : `<staffDef n="${String(index + 1)}" keysig="${keySignature(fifths)}"/>`));
  return `<scoreDef><staffGrp>${defs.join("")}</staffGrp></scoreDef>`;
}

export function notationToMei(notation: Notation): { mei: string; ties: Map<string, string[]>; written: [string, string][] } {
  const metre = metreOf(notation.metre);
  const ids = new Ids();
  const changes = new Map(notation.keys.map(({ bar, fifths }) => [bar, fifths]));
  const controls = controlMarks(notation, metre);
  const measures: string[] = [];
  for (let bar = 0; bar < notation.bars; bar++) {
    const change = changes.get(bar);
    if (bar > 0 && change !== undefined) measures.push(keyChange(notation.staves, change));
    const staves = notation.staves.map((staff, index) => writeStaffBar(staff, bar, index + 1, metre, ids)).join("");
    measures.push(`<measure n="${String(bar + 1)}">${staves}${bar === 0 ? tempoMark(notation, metre) : ""}${(controls.get(bar) ?? []).join("")}</measure>`);
  }
  return { mei: document(`${scoreDef(notation, notation.keys[0].fifths)}<section>${measures.join("")}</section>`, notation.title), ties: ids.ties, written: ids.written };
}

// One empty bar with a key's signature: the clefs and signature pinned to the
// left edge while the music scrolls under them.
export function headerMei(notation: Notation, fifths: number): string {
  const staves = notation.staves.map((_, index) => `<staff n="${String(index + 1)}"><layer n="1"><mSpace/></layer></staff>`).join("");
  return document(`${scoreDef(notation, fifths)}<section><measure n="1">${staves}</measure></section>`, notation.title);
}
