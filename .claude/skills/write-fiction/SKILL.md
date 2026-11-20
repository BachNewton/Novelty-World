---
name: write-fiction
description: How Claude writes, rewrites and reviews fiction in the Audiobook drama workshop (src/projects/audiobook/drama), with the owner as producer. Covers drafting a chapter, rewriting one, adding a chapter anywhere in a book and keeping the rest connected to it, the cold read by a reviewer without the context, taking the producer's notes, and starting a new story with its narrator's voice. Use whenever a chapter is written, rewritten, reviewed or added, the producer gives notes on the writing, or a story is started.
---

# Writing fiction with the producer

Read the workshop's `CLAUDE.md` (`src/projects/audiobook/drama/CLAUDE.md`), then the story's own `CLAUDE.md`, `voice.md`, `outline.md` and `people.md`, then every chapter of the book, in order. A chapter is written into the whole book, so the whole book is read first, every time. `craft.md` beside this file is the producer's standards for prose; read it before drafting and again before handing anything over.

## Writing or rewriting a chapter

1. **Brief.** Take the chapter's outline entry: its idea, its question, what moves from start to end, and the threads it picks up and plants. Anything only the producer can decide is asked first, with a recommendation. When the producer hands over judgement, take it and don't stop to ask.
2. **Facts.** Check every canon and real-world fact online before drafting, never from memory, and keep the sources for the hand-over. Add every date the chapter rests on to the story's timeline (`timeline.ts`), then compute each date, weekday, age, interval and time of day from it with the date tool. Never do date arithmetic in your head.

   ```
   npx tsx src/projects/audiobook/drama/tools/story-dates-cli.ts <story> sheet <date or event id>
   ```

   `sheet` gives the weekday, everyone's age and the time since each earlier event; `age`, `between`, `weekday` and `clock` (the time in one place shown in others, through daylight saving) answer single questions. The file's header lists them.
3. **Voice.** Reread `voice.md` and its reference passage straight before drafting. The whole chapter is in that one voice.
4. **Draft.** Write the whole chapter in one pass, as a novel chapter for a reader, to `chapters/<nn>/chapter.md`. A rewrite is a fresh draft from the decisions: the old text says what happens and is never a base to edit, because a patched text reads as a patchwork. How the chapter will be performed plays no part here.
5. **Self-check.** Go through `craft.md` against the draft, line by line. The checks that catch what a writer can't see in their own text: any rule, note or outline phrase that has leaked onto the page; a word or phrase repeated without meaning more each time; a sentence that has to be read twice; a place, idiom or reference that needs knowledge the reader may not have; a number the reader has to work out; a moment where the reader can't tell what someone feels.
6. **Cold read.** Copy the chapters up to and including this one into a folder outside the repository (the scratchpad), then spawn a fresh general-purpose agent with `cold-read.md` as its brief, the story's reader from its `CLAUDE.md`, and the copies' paths, in order, and nothing else: no notes, outline or voice. Its value is that it doesn't know what was meant. The copies matter: an agent that opens a file inside the story's folder has that folder's `CLAUDE.md` loaded for it, and then knows.
7. **Revise.** Every place it got lost, misread or felt nothing is fixed at its cause, which is usually in a paragraph before the one it quotes. A confusion is kept only when it's a mystery the reader knows is a mystery. A cold read pulls toward completeness, since a reader asked what they had to work out will list every gap, so its questions are not orders to add facts: a gap is fixed with the least that lets the reader follow and feel the scene, often by showing it, or by cutting what raised the question. A cold reader also can't tell a true detail of a place from a false one; that check is the writer's and the producer's. And it doesn't know the story's stance on hard subjects, so its discomfort is a signal, never a veto: a character who says something hurtful, true to who they are, stays, and the people around them are allowed to wince. What gets fixed is the book being careless with someone, never a character being honest. Softening a hard moment because a reader flinched is the instinct the story's `CLAUDE.md` tells the writer to push against. A revision is again written as if it had always been so. When the revision is large, run the cold read again with a fresh agent.
8. **Threads.** Reread the other chapters against this one. What does it plant that a later chapter should pay off, and what does it pay off that an earlier one should plant? Did it change a fact another chapter states? Revise the other chapters to fit, as deeply as they need, and update the outline's threads and the timeline.
9. **Hand over.** Give the producer the chapter, with a short note: the judgement calls, the sources, what the cold read found and what changed because of it. The producer reads it, and the notes come back.

## Adding a chapter

A new chapter can go anywhere: before, between or after the others. It goes through the steps above, and step 8 is where most of the work is: an earlier chapter may need a plant for what the new one pays off, a later one may need to remember what it introduced. The book is never finished, so no chapter is ever frozen, and a chapter that needs a full rewrite to fit gets one.

## Taking the producer's notes

The producer describes the reading: lost here, flat there, this rang false. Finding the cause is the writer's work.

- **Sort each note.** A note is about writing in general (a craft standard), about this story (a decision for its `CLAUDE.md`, `voice.md` or outline), or about one line. A line note is usually an instance of a pattern: fix the pattern, and look for its other instances.
- **Find the cause before fixing.** If the same kind of note keeps coming, the cause is in the process or the brief, not the lines.
- **A general note becomes a craft standard** only when the producer agrees it's general. Propose it; write it in `craft.md` once agreed, with its reason.
- **Write each decision down as it's made,** stated as a principle and as if it had always been so. Never as the story of the mistake, never as a rule named after the bad line, and never, ever onto the page. The correction and why it was made go in the commit message.
- **Then rewrite the chapter**, from step 4, rather than patching the lines the notes named.

## Starting a story

1. **The story's `CLAUDE.md`:** what the story is, its values, its reader, and the producer's standing decisions. **`outline.md`:** what each chapter is for, and the threads. **`timeline.ts`** and **`people.md`.**
2. **The narrator's voice, by interview.** Ask the producer, a few questions at a time, with each option shown as the same short moment from the story told that way (examples), and some questions as plain descriptions (abstractions). Cover: how close the narrator stands (outside, inside one person, moving between hearts), who it is as a presence, how facts about the world arrive, how openly it judges, tense, its humour, how it changes in dark times, and whether it says "you" or "I". Where the producer can't choose, recommend, with authors whose narrators work that way.
3. **A reference passage.** Write a scene in the agreed voice, about 400 words, from the story's own material. Once the producer approves it, it goes in `voice.md` with the answers, and every chapter is drafted with it in mind.
