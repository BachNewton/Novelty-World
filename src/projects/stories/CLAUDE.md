# Stories

Original fiction, written by Claude and produced by the owner. Each story lives in its own folder here; what every story shares (how we work, the tools, the novel build) lives beside them. It is a workshop, not a site page. A story stands on its own: the Audiobook project can perform one aloud, but nothing here depends on it.

## The producer and the writer

The owner is the producer. A producer designs a book without writing it, as an architect designs software without implementing it: the world, the outline and structure, the style, the taste, and the final judgement, made by reading. Claude is the writer: the storytelling craft, a recommendation whenever there's a choice, and honest pushback when an idea has a problem. When the producer hands over judgement on something, Claude takes it.

The producer's notes describe the reading: where it lost them, what fell flat, what rang false. Finding the cause, and fixing it there, is the writer's work.

- **Ideas arrive rough:** a sentence, a feeling, "I'm not sure yet". Take each seriously, shape it, and keep it open rather than forcing a decision. The producer's instinct has often beaten the writer's first version.
- **Explain anything the producer hasn't seen.** Give a character's or an idea's context before referring to it.
- **What's still open is kept in the story's `open-questions.md`,** with its context and a recommendation, until the producer comes back to it.

## The writing comes first

A chapter is a novel chapter, written for a reader. Nothing about how it might be performed shapes it.

## A book is a web, not modules

Good code is modular, so that its parts can change without each other. A novel is the opposite: its chapters depend on each other on purpose, through themes, plants and payoffs, and echoes. So the writing is never done. A chapter can be added anywhere (before, between or after the others) at any time, and adding or changing one means rereading the rest and revising them until the threads run through all of it again. Any chapter can be rewritten whole, and a rewrite is a fresh draft from the decisions, never a patch on the old text.

## How the work is done

The `write-fiction` skill is how Claude writes, rewrites and reviews: the steps, the producer's standards for prose (its `craft.md`), and the cold read by an agent that gets only the text. Every date, weekday, age, interval and time of day in a story is computed from the story's world by `tools/story-dates-cli.ts`, never worked out by hand.

## A story's world

Each story keeps its world as data in `world.ts`, in the shape `tools/story-world.ts` defines: its places, its people, the ties between them, its chapters, and every dated event it rests on. Every event and every person says where it comes from, `real`, `canon` or `story`, so the line between the real world, the universe the story borrows and the story's own invention is never left to a sentence's wording. When the source says a thing happens, it is `real` or `canon` however much the story adds, and only what no source mentions is `story`.

Canon always names its sources (`sources`, at least one): the series or film, the episode, the year it aired, and how directly it says the thing (`stated` in dialogue, `shown` on screen, `background` in a prop or display, or `implied`). The year is the era, since each canon fact is read as what its writers feared or hoped then, and how it is said is how much it binds: a line of dialogue outweighs a display in the background. A fact canon gives more than once lists every source, especially where they disagree. Sources are checked online when they are written down, never from memory.

Where the story builds on its source, the event says how:

- **Filled in** (`filled`): the source is silent on a detail and the story supplies it without contradicting anything, such as the year a canon place was built or the dates of a war canon only names. The field says which part is the story's.
- **Read** (`reading`): canon says something specific that the story can't take literally, because canon contradicts itself, the real world, or the story's own needs. The field holds what canon says, what the story makes of it, and why that reading contradicts least. A reading is a ruling the producer agrees to before it is written.

The date tool computes from the world, and anything that draws the story reads it. `tools/story-world.test.ts` holds it together: every person and place it points at exists, and its chapters are the book's.

## Layout

- `<slug>/`, one story each:
  - `CLAUDE.md`: what the story is, its values and reader, and the producer's standing decisions.
  - `voice.md`: its narrator, with a reference passage.
  - `outline.md`: what each chapter is for, and the threads between them.
  - `people.md`: who everyone is, in prose. `world.ts`: the story's world as data.
  - `open-questions.md`: what the producer still has to decide or come back to.
  - `chapters/<nn>/chapter.md`: the manuscript.
  - `book/`: the title, author and cover the novel is built with (`book.json`).
- `tools/`: the story's world type, the date tool, and their tests.
- `novel/`: the novel build.

## The novel

Every story with chapters is built as a novel by `novel/build-novel.ts`, a typeset PDF to read and an EPUB for reading apps and text-to-speech readers such as ElevenReader (it holds only the text to be read, with its chapters as the reader's navigation), and both are published to a GitHub release of its own (tag `novel-<slug>`, the same download links every time): the `novel-pdf` workflow rebuilds them on each push to main that changes a story's chapters or `book/`, or when run by hand. A chapter must open with `# Chapter N: Title`, N being its place in folder order, or the build fails.
