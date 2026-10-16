// Small builders for the logic tests, fast and slow alike.

import { emptyResearch, newUnion } from "../logic";
import type { Gender, NameFields, Person, Tree, Union, UnionStatus } from "../types";

// Builds a NameFields object positionally, so a test needn't spell out the object literal.
export function n(
  firstName: string,
  lastName = "",
  commonName = "",
  birthSurname = "",
  middleName = "",
): NameFields {
  return { firstName, middleName, lastName, commonName, birthSurname };
}

// A person with every optional field empty, married to `spouses` and divorced from `divorced`.
export function p(
  id: string,
  gender: Gender = "M",
  parentIds: string[] = [],
  spouses: string[] = [],
  divorced: string[] = [],
): Person {
  return {
    id,
    firstName: id,
    middleName: "",
    lastName: "",
    commonName: "",
    birthSurname: "",
    notes: "",
    birthDate: "",
    birthPlace: "",
    birthPlaceToday: "",
    emigrationDate: "",
    motherTongue: "",
    recordedPeople: "",
    religion: "",
    originLore: "",
    research: emptyResearch(),
    heritage: [],
    gender,
    parentIds,
    unions: [
      ...spouses.map((personId) => u(personId, "married")),
      ...divorced.map((personId) => u(personId, "divorced")),
    ],
  };
}

export function u(personId: string, status: UnionStatus): Union {
  return newUnion(personId, status);
}

// A tree rooted at its first person.
export function makeTree(persons: Person[]): Tree {
  return {
    rootId: persons[0].id,
    persons: Object.fromEntries(persons.map((person) => [person.id, person])),
  };
}
