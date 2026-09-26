// The pure half of the tree-editing CLI (tree-cli.ts): parse a change file
// into operations, apply them through the app's own logic functions, and
// describe people and changes in words the owner can approve. No I/O here.

import {
  addChild,
  addParent,
  addSpouse,
  deletePerson,
  GENDER_CYCLE,
  fullName,
  renamePerson,
  setGender,
  setNotes,
  setUnionDeceased,
  setUnionStatus,
  treeProblems,
} from "../logic";
import type { Gender, NameFields, Person, Tree, UnionStatus } from "../types";

// Also the list of name fields a change file may set: a new NameFields key
// fails typecheck here until it gets a default, and from then on flows
// through rename, new people, and search.
const EMPTY_NAME: NameFields = {
  firstName: "",
  lastName: "",
  commonName: "",
  birthSurname: "",
};
const NAME_KEYS = Object.keys(EMPTY_NAME) as (keyof NameFields)[];

const UNION_STATUSES: readonly UnionStatus[] = [
  "married",
  "divorced",
  "ended-by-death",
  "partner",
  "ex-partner",
];

// A person in a change file: "@name" for someone an earlier op in the same
// file added (via its `ref`), otherwise an id or any unique id prefix.
type PersonRef = string;

export type Op =
  | { op: "rename"; person: PersonRef; name: Partial<NameFields> }
  | { op: "setGender"; person: PersonRef; gender: Gender }
  | { op: "setNotes"; person: PersonRef; notes: string }
  | { op: "appendNote"; person: PersonRef; note: string }
  | {
      op: "addChild";
      ref?: string;
      parent: PersonRef;
      // null means an explicit single parent; there is no implicit default.
      coParent: PersonRef | null;
      name: Partial<NameFields>;
      gender: Gender;
    }
  | {
      op: "addSpouse";
      ref?: string;
      person: PersonRef;
      name: Partial<NameFields>;
      gender: Gender;
      status: UnionStatus;
      // Existing children of `person` the new spouse is also a parent of.
      bioChildren: PersonRef[];
    }
  | { op: "addParent"; ref?: string; child: PersonRef; name: Partial<NameFields>; gender: Gender }
  | { op: "setUnionStatus"; a: PersonRef; b: PersonRef; status: UnionStatus }
  | { op: "setUnionDeceased"; a: PersonRef; b: PersonRef; deceased: PersonRef | null }
  | { op: "deletePerson"; person: PersonRef };

type FieldKind =
  | "person"
  | "personOrNull"
  | "persons"
  | "name"
  | "gender"
  | "status"
  | "text"
  | "ref?";

const OP_FIELDS = {
  rename: { person: "person", name: "name" },
  setGender: { person: "person", gender: "gender" },
  setNotes: { person: "person", notes: "text" },
  appendNote: { person: "person", note: "text" },
  addChild: { ref: "ref?", parent: "person", coParent: "personOrNull", name: "name", gender: "gender" },
  addSpouse: {
    ref: "ref?",
    person: "person",
    name: "name",
    gender: "gender",
    status: "status",
    bioChildren: "persons",
  },
  addParent: { ref: "ref?", child: "person", name: "name", gender: "gender" },
  setUnionStatus: { a: "person", b: "person", status: "status" },
  setUnionDeceased: { a: "person", b: "person", deceased: "personOrNull" },
  deletePerson: { person: "person" },
} as const satisfies Record<Op["op"], Record<string, FieldKind>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldError(kind: FieldKind, value: unknown): string | null {
  switch (kind) {
    case "person":
      return typeof value === "string" && value !== "" ? null : "must be a person id, id prefix, or @ref";
    case "personOrNull":
      return value === null || (typeof value === "string" && value !== "")
        ? null
        : "must be a person id, id prefix, @ref, or null";
    case "persons":
      return Array.isArray(value) && value.every((v) => typeof v === "string" && v !== "")
        ? null
        : "must be a list of person ids, id prefixes, or @refs";
    case "name": {
      if (!isRecord(value)) return "must be an object of name fields";
      for (const [key, v] of Object.entries(value)) {
        if (!(NAME_KEYS as string[]).includes(key)) {
          return `has unknown field "${key}" (allowed: ${NAME_KEYS.join(", ")})`;
        }
        if (typeof v !== "string") return `field "${key}" must be a string`;
      }
      return null;
    }
    case "gender":
      return GENDER_CYCLE.includes(value as Gender) ? null : `must be one of ${GENDER_CYCLE.join(", ")}`;
    case "status":
      return UNION_STATUSES.includes(value as UnionStatus)
        ? null
        : `must be one of ${UNION_STATUSES.join(", ")}`;
    case "text":
      return typeof value === "string" ? null : "must be a string";
    case "ref?":
      return value === undefined || (typeof value === "string" && /^@\w[\w-]*$/.test(value))
        ? null
        : 'must look like "@name"';
  }
}

// Parse a change file's JSON into operations, rejecting anything unexpected:
// unknown ops, missing or extra fields, and wrongly typed values.
export function parseOps(json: unknown): Op[] {
  if (!Array.isArray(json)) throw new Error("A change file must be a JSON list of operations");
  return json.map((raw: unknown, i) => {
    const where = `Operation ${i + 1}`;
    if (!isRecord(raw)) throw new Error(`${where} is not an object`);
    const { op } = raw;
    if (typeof op !== "string" || !(op in OP_FIELDS)) {
      throw new Error(`${where} has unknown op ${JSON.stringify(op)} (known: ${Object.keys(OP_FIELDS).join(", ")})`);
    }
    const fields: Record<string, FieldKind> = OP_FIELDS[op as Op["op"]];
    for (const key of Object.keys(raw)) {
      if (key !== "op" && !(key in fields)) throw new Error(`${where} (${op}) has unknown field "${key}"`);
    }
    for (const [key, kind] of Object.entries(fields)) {
      if (!(key in raw) && kind !== "ref?") throw new Error(`${where} (${op}) is missing "${key}"`);
      const problem = fieldError(kind, raw[key]);
      if (problem !== null) throw new Error(`${where} (${op}): "${key}" ${problem}`);
    }
    return raw as Op;
  });
}

// ---------- ids and names ----------

// The person whose id is `idOrPrefix`, or the only one whose id starts with
// it. Ambiguous and unknown prefixes are errors.
export function resolveId(tree: Tree, idOrPrefix: string): string {
  if (idOrPrefix in tree.persons) return idOrPrefix;
  const matches = Object.keys(tree.persons).filter((id) => id.startsWith(idOrPrefix));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new Error(`No person has an id starting with "${idOrPrefix}"`);
  const listed = matches.map((id) => `  ${id}  ${displayName(tree.persons[id])}`).join("\n");
  throw new Error(`"${idOrPrefix}" matches ${matches.length} people:\n${listed}`);
}

// The shortest prefix of `id` (at least 8 characters) no other id shares.
export function shortId(tree: Tree, id: string): string {
  const others = Object.keys(tree.persons).filter((other) => other !== id);
  for (let len = Math.min(8, id.length); len < id.length; len++) {
    const prefix = id.slice(0, len);
    if (!others.some((other) => other.startsWith(prefix))) return prefix;
  }
  return id;
}

export function displayName(person: Person): string {
  const born =
    person.birthSurname !== "" && person.birthSurname !== person.lastName
      ? ` (née ${person.birthSurname})`
      : "";
  return fullName(person) + born;
}

function labelOf(tree: Tree, id: string): string {
  return `${displayName(tree.persons[id])} [${shortId(tree, id)}]`;
}

// ---------- find / show ----------

// People whose name fields or notes contain `text`, ignoring case. The full
// name is searched too, so "first last" finds a person.
export function searchPersons(tree: Tree, text: string): Person[] {
  const needle = text.toLowerCase();
  return Object.values(tree.persons).filter((person) => {
    const haystack = [
      displayName(person),
      ...NAME_KEYS.map((key) => person[key]),
      `${person.firstName} ${person.lastName}`,
      person.notes,
    ];
    return haystack.some((s) => s.toLowerCase().includes(needle));
  });
}

function childrenOf(tree: Tree, id: string): Person[] {
  return Object.values(tree.persons).filter((p) => p.parentIds.includes(id));
}

export function describePerson(tree: Tree, id: string): string {
  const person = tree.persons[id];
  const lines = [`${displayName(person)}`, `  id:       ${id}`];
  const names = NAME_KEYS.filter((key) => person[key] !== "")
    .map((key) => `${key}=${JSON.stringify(person[key])}`)
    .join(", ");
  lines.push(`  names:    ${names}`);
  lines.push(`  gender:   ${person.gender}`);
  lines.push(
    `  parents:  ${person.parentIds.length === 0 ? "(none)" : person.parentIds.map((pid) => labelOf(tree, pid)).join("; ")}`,
  );
  if (person.unions.length === 0) {
    lines.push("  unions:   (none)");
  } else {
    for (const [i, union] of person.unions.entries()) {
      let status: string = union.status;
      if (union.status === "ended-by-death" && union.deceasedId !== null) {
        status += `, ${union.deceasedId === id ? "this person" : "partner"} died`;
      }
      lines.push(`  ${i === 0 ? "unions:  " : "         "} ${labelOf(tree, union.personId)} (${status})`);
    }
  }
  const children = childrenOf(tree, id);
  if (children.length === 0) {
    lines.push("  children: (none)");
  } else {
    for (const [i, child] of children.entries()) {
      const otherId = child.parentIds.find((pid) => pid !== id);
      const other = otherId === undefined ? "no other parent" : `with ${labelOf(tree, otherId)}`;
      lines.push(`  ${i === 0 ? "children:" : "         "} ${labelOf(tree, child.id)} (${other})`);
    }
  }
  if (person.notes !== "") {
    lines.push("  notes:");
    for (const line of person.notes.split("\n")) lines.push(`    ${line}`);
  }
  return lines.join("\n");
}

// ---------- applying operations ----------

export interface ApplyResult {
  tree: Tree;
  // One line per operation, in names the owner can check.
  changes: string[];
}

function trimmedName(name: Partial<NameFields>): Partial<NameFields> {
  const out: Partial<NameFields> = {};
  for (const key of NAME_KEYS) {
    const value = name[key];
    if (value !== undefined) out[key] = value.trim();
  }
  return out;
}

function newPersonName(name: Partial<NameFields>): NameFields {
  const full = { ...EMPTY_NAME, ...trimmedName(name) };
  if (full.firstName === "") throw new Error("a new person needs a firstName");
  return full;
}

function currentName(person: Person): NameFields {
  const out = { ...EMPTY_NAME };
  for (const key of NAME_KEYS) out[key] = person[key];
  return out;
}

function sameName(a: NameFields, b: NameFields): boolean {
  return NAME_KEYS.every((key) => a[key] === b[key]);
}

// Refuses to add someone a relative already has under the same name, which
// is what re-running an already applied change file would do.
function refuseDuplicate(tree: Tree, relatives: string[], name: NameFields, relation: string): void {
  const dupe = relatives.find((rid) => sameName(currentName(tree.persons[rid]), name));
  if (dupe !== undefined) {
    throw new Error(`there is already a ${relation} named ${labelOf(tree, dupe)}`);
  }
}

export function applyOps(tree: Tree, ops: readonly Op[], newId: () => string): ApplyResult {
  const refs = new Map<string, string>();
  const changes: string[] = [];
  let current = tree;

  const who = (ref: PersonRef): string => {
    if (ref.startsWith("@")) {
      const id = refs.get(ref);
      if (id === undefined) throw new Error(`${ref} is not defined by an earlier operation`);
      return id;
    }
    return resolveId(current, ref);
  };
  const label = (id: string): string => labelOf(current, id);
  const bindRef = (ref: string | undefined, id: string): string => {
    if (ref === undefined) return "";
    if (refs.has(ref)) throw new Error(`${ref} is defined twice`);
    refs.set(ref, id);
    return ` as ${ref}`;
  };

  for (const [i, op] of ops.entries()) {
    try {
      const change = applyOne(op);
      changes.push(change);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Operation ${i + 1} (${op.op}): ${message}`, { cause: err });
    }
  }

  const problems = treeProblems(current);
  if (problems.length > 0) {
    throw new Error(`The changed tree is invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return { tree: current, changes };

  function applyOne(op: Op): string {
    switch (op.op) {
      case "rename": {
        const id = who(op.person);
        const before = currentName(current.persons[id]);
        const after = { ...before, ...trimmedName(op.name) };
        if (after.firstName === "") throw new Error("firstName can't be empty");
        const diffs = NAME_KEYS.filter((key) => before[key] !== after[key]).map(
          (key) => `${key} ${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}`,
        );
        if (diffs.length === 0) throw new Error(`${label(id)} already has these names`);
        const was = label(id);
        current = renamePerson(current, id, after);
        return `Rename ${was}: ${diffs.join(", ")}`;
      }
      case "setGender": {
        const id = who(op.person);
        const before = current.persons[id].gender;
        if (before === op.gender) throw new Error(`${label(id)} is already ${op.gender}`);
        current = setGender(current, id, op.gender);
        return `Set gender of ${label(id)}: ${before} → ${op.gender}`;
      }
      case "setNotes": {
        const id = who(op.person);
        const notes = op.notes.trim();
        if (current.persons[id].notes === notes) throw new Error(`${label(id)} already has these notes`);
        current = setNotes(current, id, notes);
        return notes === ""
          ? `Clear notes of ${label(id)}`
          : `Replace notes of ${label(id)} with:\n${indent(notes)}`;
      }
      case "appendNote": {
        const id = who(op.person);
        const note = op.note.trim();
        if (note === "") throw new Error("the note is empty");
        const before = current.persons[id].notes;
        if (before.split("\n").includes(note)) throw new Error(`${label(id)} already has this note`);
        current = setNotes(current, id, before === "" ? note : `${before}\n${note}`);
        return `Add note to ${label(id)}:\n${indent(note)}`;
      }
      case "addChild": {
        const parentId = who(op.parent);
        const coParentId = op.coParent === null ? null : who(op.coParent);
        if (coParentId === parentId) throw new Error("coParent is the same person as parent");
        const name = newPersonName(op.name);
        refuseDuplicate(
          current,
          childrenOf(current, parentId).map((c) => c.id),
          name,
          `child of ${label(parentId)}`,
        );
        const id = newId();
        current = addChild(current, parentId, id, name, op.gender, coParentId);
        const parents = coParentId === null
          ? `${label(parentId)} (no other parent)`
          : `${label(parentId)} and ${label(coParentId)}`;
        return `Add child ${displayName(current.persons[id])} (${op.gender})${bindRef(op.ref, id)} of ${parents}`;
      }
      case "addSpouse": {
        const personId = who(op.person);
        const childIds = op.bioChildren.map(who);
        for (const childId of childIds) {
          const { parentIds } = current.persons[childId];
          if (parentIds.length !== 1 || parentIds[0] !== personId) {
            throw new Error(`${label(childId)} must have ${label(personId)} as their only parent`);
          }
        }
        const name = newPersonName(op.name);
        refuseDuplicate(
          current,
          current.persons[personId].unions.map((u) => u.personId),
          name,
          `partner of ${label(personId)}`,
        );
        const id = newId();
        current = addSpouse(current, personId, id, name, op.gender, op.status, childIds);
        const kids = childIds.length === 0 ? "" : `; also parent of ${childIds.map(label).join(", ")}`;
        return `Add ${op.status} partner ${displayName(current.persons[id])} (${op.gender})${bindRef(op.ref, id)} of ${label(personId)}${kids}`;
      }
      case "addParent": {
        const childId = who(op.child);
        const { parentIds } = current.persons[childId];
        if (parentIds.length >= 2) throw new Error(`${label(childId)} already has two parents`);
        const name = newPersonName(op.name);
        refuseDuplicate(current, parentIds, name, `parent of ${label(childId)}`);
        const otherParentId = parentIds.at(0);
        const id = newId();
        current = addParent(current, childId, id, name, op.gender);
        const union = otherParentId === undefined
          ? ""
          : `; married to ${label(otherParentId)} automatically (follow with setUnionStatus if they weren't married)`;
        return `Add parent ${displayName(current.persons[id])} (${op.gender})${bindRef(op.ref, id)} of ${label(childId)}${union}`;
      }
      case "setUnionStatus": {
        const aId = who(op.a);
        const bId = who(op.b);
        const union = current.persons[aId].unions.find((u) => u.personId === bId);
        if (union === undefined) throw new Error(`${label(aId)} and ${label(bId)} have no union`);
        if (union.status === op.status) throw new Error(`their union is already ${op.status}`);
        current = setUnionStatus(current, aId, bId, op.status);
        return `Union of ${label(aId)} and ${label(bId)}: ${union.status} → ${op.status}`;
      }
      case "setUnionDeceased": {
        const aId = who(op.a);
        const bId = who(op.b);
        const deceasedId = op.deceased === null ? null : who(op.deceased);
        current = setUnionDeceased(current, aId, bId, deceasedId);
        const died = deceasedId === null ? "nobody recorded" : `${label(deceasedId)} died`;
        return `Ended-by-death union of ${label(aId)} and ${label(bId)}: ${died}`;
      }
      case "deletePerson": {
        const id = who(op.person);
        if (id === current.rootId) throw new Error("the root person can't be deleted");
        const effects = [
          ...childrenOf(current, id).map((c) => `parent of ${label(c.id)}`),
          ...current.persons[id].unions.map((u) => `${u.status} to ${label(u.personId)}`),
        ];
        const was = label(id);
        current = deletePerson(current, id);
        return effects.length === 0
          ? `Delete ${was}`
          : `Delete ${was}, removing: ${effects.join("; ")}`;
      }
    }
  }
}

function indent(text: string): string {
  return text.split("\n").map((line) => `    ${line}`).join("\n");
}
