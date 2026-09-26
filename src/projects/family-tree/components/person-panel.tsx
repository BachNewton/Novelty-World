"use client";

import type { ReactNode } from "react";
import type { Person } from "../types";
import { fullNameWithMiddle } from "../logic";
import { Button } from "@/shared/components/ui/button";

interface PersonPanelProps {
  person: Person;
  // The relationship readout for this person, as their card shows it: "you"
  // on the view root, null when no relation was found.
  relation: string | null;
  viewRootName: string;
  isViewRoot: boolean;
  onSetAsViewRoot: () => void;
  onClose: () => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A partial ISO date ("1931", "1931-06", "1931-06-16") or an approximate
// year ("~1931"), in words. Stored values are validated by treeProblems.
function formatDate(value: string): string {
  if (value.startsWith("~")) return `About ${value.slice(1)}`;
  const parts = value.split("-");
  const year = parts[0];
  if (parts.length === 1) return year;
  const monthName = MONTHS[Number(parts[1]) - 1];
  if (parts.length === 2) return `${monthName} ${year}`;
  return `${Number(parts[2])} ${monthName} ${year}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-text-primary">{children}</dd>
    </div>
  );
}

function NotRecorded({ children }: { children: ReactNode }) {
  return <span className="text-text-muted italic">{children}</span>;
}

export function PersonPanel({
  person,
  relation,
  viewRootName,
  isViewRoot,
  onSetAsViewRoot,
  onClose,
}: PersonPanelProps) {
  const showBirthSurname =
    person.birthSurname !== "" && person.birthSurname !== person.lastName;

  return (
    <div className="pointer-events-auto fixed right-4 bottom-4 z-10 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-border-default bg-surface-secondary p-4 max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl md:top-20 md:right-4 md:bottom-auto md:max-h-[calc(100dvh-6rem)]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-lg font-semibold text-text-primary">
            {fullNameWithMiddle(person)}
          </div>
          {showBirthSurname ? (
            <div className="text-sm text-text-muted italic">
              {person.gender === "M" ? "né" : "née"} {person.birthSurname}
            </div>
          ) : null}
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          ×
        </Button>
      </div>

      <dl className="flex flex-col gap-3">
        <Field label={isViewRoot ? "Relation" : `Relation to ${viewRootName}`}>
          {isViewRoot ? (
            <span className="text-brand-blue">Viewing relations from here</span>
          ) : relation !== null ? (
            relation
          ) : (
            <NotRecorded>No relation found</NotRecorded>
          )}
        </Field>

        <Field label="Born">
          {person.birthDate === "" ? (
            <NotRecorded>Not recorded</NotRecorded>
          ) : (
            formatDate(person.birthDate)
          )}
        </Field>

        <Field label="Notes">
          {person.notes === "" ? (
            <NotRecorded>None</NotRecorded>
          ) : (
            <span className="whitespace-pre-wrap">{person.notes}</span>
          )}
        </Field>

        <Field label="Partners & children">
          {person.checked === null ? (
            <NotRecorded>Not checked yet</NotRecorded>
          ) : (
            <>
              All in the tree as of {formatDate(person.checked.asOf)}
              <span className="block text-xs text-text-secondary">
                Source: {person.checked.source}
              </span>
            </>
          )}
        </Field>
      </dl>

      {isViewRoot ? null : (
        <Button variant="secondary" onClick={onSetAsViewRoot} className="mt-4 w-full">
          View relations from here
        </Button>
      )}
    </div>
  );
}
