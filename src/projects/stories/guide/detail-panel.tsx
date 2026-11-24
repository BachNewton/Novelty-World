"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { StoryEvent, StoryWorld } from "../tools/story-world";
import { ChapterMark, KIND_NAMES, KindMark } from "./marks";
import type { Selection } from "./selection";
import { formatDate, formatRange, settled, yearOf } from "./timeline-layout";

interface Props {
  world: StoryWorld;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onClose: () => void;
}

const WEEKDAY = /^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day[^:]{0,40}:\s*/;

/** An event in a few words: its chart label, or the first clause of what happened. */
function headline(event: StoryEvent): string {
  if (event.label !== undefined) return event.label;
  const first = settled(event.what).replace(WEEKDAY, "").split(/;\s|\.\s|:\s/)[0];
  const sentence = first.charAt(0).toUpperCase() + first.slice(1);
  return sentence.length > 110 ? `${sentence.slice(0, 107).trimEnd()}…` : sentence;
}

function when(event: StoryEvent): string {
  return event.end === undefined ? formatDate(event.date) : formatRange(event.date, event.end);
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="font-story-label text-xs uppercase tracking-widest text-story-ink-soft">{children}</p>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="font-story-label text-xs uppercase tracking-widest text-story-ink-soft">{title}</h3>
      {children}
    </section>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full border border-story-line px-2.5 py-0.5 text-sm text-story-ink hover:border-story-ink-soft focus-visible:outline-2 focus-visible:outline-story-canon">
      {children}
    </button>
  );
}

function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function EventList({ world, ids, onSelect }: { world: StoryWorld; ids: string[]; onSelect: (selection: Selection) => void }) {
  const sorted = [...ids].sort((a, b) => yearOf(world.events[a].date) - yearOf(world.events[b].date));
  return (
    <ol className="grid">
      {sorted.map((id) => {
        const event = world.events[id];
        return (
          <li key={id}>
            <button type="button" onClick={() => onSelect({ type: "event", id })} className="grid w-full grid-cols-[5.5rem_1fr] gap-2 rounded-sm px-1 py-1.5 text-left hover:bg-story-band focus-visible:outline-2 focus-visible:outline-story-canon">
              <span className="font-story-label text-xs uppercase tracking-wide text-story-ink-soft">{when(event)}</span>
              <span className="flex items-baseline gap-2 text-sm text-story-ink">
                <KindMark kind={event.kind} />
                {headline(event)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function eventsWhere(world: StoryWorld, keep: (event: StoryEvent) => boolean): string[] {
  return Object.entries(world.events)
    .filter(([, event]) => keep(event))
    .map(([id]) => id);
}

function chaptersAround(world: StoryWorld, event: StoryEvent): number[] {
  const [start, end] = [yearOf(event.date), yearOf(event.end ?? event.date)];
  return world.chapters.flatMap((chapter, index) => (yearOf(chapter.from) <= end && yearOf(chapter.to) >= start ? [index] : []));
}

function EventDetail({ world, id, onSelect }: { world: StoryWorld; id: string; onSelect: (selection: Selection) => void }) {
  const event = world.events[id];
  const chapters = chaptersAround(world, event);
  return (
    <>
      <header className="grid gap-1">
        <Kicker>{when(event)}</Kicker>
        <h2 className="font-story-display text-2xl leading-tight text-balance">{headline(event)}</h2>
        <p className="flex items-center gap-2 text-sm text-story-ink-soft">
          <KindMark kind={event.kind} />
          {KIND_NAMES[event.kind]}
        </p>
      </header>
      <p className="leading-relaxed">{settled(event.what)}</p>
      {event.who !== undefined && (
        <Section title="Who">
          <Chips>
            {event.who.map((person) => (
              <Chip key={person} onClick={() => onSelect({ type: "person", id: person })}>
                {world.people[person].name}
              </Chip>
            ))}
          </Chips>
        </Section>
      )}
      {event.where !== undefined && (
        <Section title="Where">
          <Chips>
            {event.where.map((place) => (
              <Chip key={place} onClick={() => onSelect({ type: "place", id: place })}>
                {world.places[place].name}
              </Chip>
            ))}
          </Chips>
        </Section>
      )}
      {chapters.length > 0 && (
        <Section title="In the book">
          <Chips>
            {chapters.map((index) => (
              <Chip key={index} onClick={() => onSelect({ type: "chapter", index })}>
                <ChapterMark />
                {index + 1}. {world.chapters[index].title}
              </Chip>
            ))}
          </Chips>
        </Section>
      )}
    </>
  );
}

function PersonDetail({ world, id, onSelect }: { world: StoryWorld; id: string; onSelect: (selection: Selection) => void }) {
  const person = world.people[id];
  const life = [
    person.born === undefined ? null : `Born ${formatDate(person.born)}`,
    person.died === undefined ? null : `Died ${formatDate(person.died)}${person.born === undefined ? "" : `, aged ${Math.floor(yearOf(person.died) - yearOf(person.born))}`}`,
  ].filter((part) => part !== null);
  const ties = [
    ...world.ties.filter((tie) => tie.who === id).map((tie) => ({ other: tie.of, text: `${tie.is} of ${world.people[tie.of].name}` })),
    ...world.ties.filter((tie) => tie.of === id).map((tie) => ({ other: tie.who, text: `${world.people[tie.who].name}, ${tie.is}` })),
  ];
  const events = eventsWhere(world, (event) => event.who?.includes(id) === true);
  return (
    <>
      <header className="grid gap-1">
        <Kicker>{life.length > 0 ? life.join(" · ") : "Person"}</Kicker>
        <h2 className="font-story-display text-2xl leading-tight text-balance">{person.name}</h2>
        {person.kind !== "story" && (
          <p className="flex items-center gap-2 text-sm text-story-ink-soft">
            <KindMark kind={person.kind} />
            {KIND_NAMES[person.kind]}
          </p>
        )}
      </header>
      <p className="leading-relaxed">{person.role}</p>
      {person.facts !== undefined && (
        <ul className="grid list-disc gap-1 pl-5 text-sm leading-relaxed text-story-ink-soft">
          {person.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
      {ties.length > 0 && (
        <Section title="Family and friends">
          <Chips>
            {ties.map((tie) => (
              <Chip key={tie.text} onClick={() => onSelect({ type: "person", id: tie.other })}>
                {tie.text.charAt(0).toUpperCase() + tie.text.slice(1)}
              </Chip>
            ))}
          </Chips>
        </Section>
      )}
      {events.length > 0 && (
        <Section title={`Their life · ${events.length}`}>
          <EventList world={world} ids={events} onSelect={onSelect} />
        </Section>
      )}
    </>
  );
}

function ChapterDetail({ world, index, onSelect }: { world: StoryWorld; index: number; onSelect: (selection: Selection) => void }) {
  const chapter = world.chapters[index];
  const [start, end] = [yearOf(chapter.from), yearOf(chapter.to)];
  const events = eventsWhere(world, (event) => yearOf(event.date) <= end && yearOf(event.end ?? event.date) >= start && event.end === undefined);
  return (
    <>
      <header className="grid gap-1">
        <Kicker>Chapter {index + 1} · {formatRange(chapter.from, chapter.to)}</Kicker>
        <h2 className="font-story-display text-2xl leading-tight text-balance">{chapter.title}</h2>
      </header>
      <Section title="Where">
        <Chips>
          {chapter.where.map((place) => (
            <Chip key={place} onClick={() => onSelect({ type: "place", id: place })}>
              {world.places[place].name}
            </Chip>
          ))}
        </Chips>
      </Section>
      <Section title={`What happens · ${events.length}`}>
        <EventList world={world} ids={events} onSelect={onSelect} />
      </Section>
    </>
  );
}

function PlaceDetail({ world, id, onSelect }: { world: StoryWorld; id: string; onSelect: (selection: Selection) => void }) {
  const place = world.places[id];
  const chapters = world.chapters.flatMap((chapter, index) => (chapter.where.includes(id) ? [index] : []));
  const events = eventsWhere(world, (event) => event.where?.includes(id) === true);
  return (
    <>
      <header className="grid gap-1">
        <Kicker>Place</Kicker>
        <h2 className="font-story-display text-2xl leading-tight text-balance">{place.name}</h2>
      </header>
      <p className="leading-relaxed">{place.about}</p>
      {chapters.length > 0 && (
        <Section title="In the book">
          <Chips>
            {chapters.map((index) => (
              <Chip key={index} onClick={() => onSelect({ type: "chapter", index })}>
                <ChapterMark />
                {index + 1}. {world.chapters[index].title}
              </Chip>
            ))}
          </Chips>
        </Section>
      )}
      <Section title={`What happens here · ${events.length}`}>
        <EventList world={world} ids={events} onSelect={onSelect} />
      </Section>
    </>
  );
}

export function DetailPanel({ world, selection, onSelect, onClose }: Props) {
  return (
    <div className="relative grid content-start gap-5 p-5 pt-6 text-story-ink">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 rounded-full p-1.5 text-story-ink-soft hover:text-story-ink focus-visible:outline-2 focus-visible:outline-story-canon">
        <X className="size-5" />
      </button>
      {selection.type === "event" && <EventDetail world={world} id={selection.id} onSelect={onSelect} />}
      {selection.type === "person" && <PersonDetail world={world} id={selection.id} onSelect={onSelect} />}
      {selection.type === "chapter" && <ChapterDetail world={world} index={selection.index} onSelect={onSelect} />}
      {selection.type === "place" && <PlaceDetail world={world} id={selection.id} onSelect={onSelect} />}
    </div>
  );
}
