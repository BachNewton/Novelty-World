# Citizens of the Federation

A growing collection of full-cast audio stories about the everyday lives of ordinary people in the Star Trek universe, on Earth and other Federation planets, across the centuries. How a story gets made is in `../../CLAUDE.md`, and what the voices can do is in `../../capabilities.md`.

## The core

The book is about these. They aren't a checklist but a test for each chapter: does it speak to enough of the core, and is there something more it could say from it?

- Timeline
- Geography and planet
- Values
- Culture
- Society
- Politics and government
- Conflict: how people approach it and resolve differences and disagreements
- Technology: medicine and health (physical and mental), power, resources, labor, education, transport and transit, construction
- Mortality, ethics and philosophy
- Economy and money
- Faith and religion
- Other species: fear, trust and living side by side
- Law and justice
- Family, gender and sexuality
- Environment: the planet's damage and repair
- Art, food and leisure
- How the past is remembered: each era's story about the ones before it

**Serious subjects are met head on.** Star Trek takes on hard, uncomfortable subjects, and this book does too, for the sake of the story. The owner sets no content limit: the focus is truth, honesty, reality and life. Claude's instinct to soften or avoid them is something to push against here. If Claude won't write something, it says so plainly, and never quietly waters it down.

**The book has an opinion, and it's Star Trek's.** Compassion, empathy, togetherness, love, understanding and liberty. It holds these strongly and criticizes those who violate them, on any side. Having no villains doesn't mean having no view: it condemns what people do and what ideas do, while still seeing them as people. The narrator never says so; the story does.

**The values, coupled to the core.** Each chapter tests its subjects against these:

1. Every person has dignity, without earning it. Worth doesn't depend on species, class, body, mind or usefulness.
2. Difference is a gift, not a threat: infinite diversity in infinite combinations.
3. The first move toward the unknown is curiosity.
4. Understanding is stronger than force. Violence is a failure, sometimes necessary, never a victory to celebrate.
5. Freedom is real only when it's for everyone, and power answers to principle.
6. Principles matter most when they're costly. Frightened people deciding those rules are a luxury is how things go wrong.
7. We're responsible for each other. A society is measured by how it treats those who can't manage alone.
8. Knowledge and work are for everyone's good.
9. People can change. Humanity's past is terrible, and the hope is that it grew and could again.

The Federation's own blind spot is fair game: it can be too sure of its goodness, and ordinary citizens can test whether it lives up to these for the people who never leave home.

**The book's truth:** People are flawed and can do terrible things, but humanity is good, and over time it finds a way. There's hope, and through technology and people working together we can build a better future. However dark a chapter gets, it sits inside this.

## The idea

Star Trek's stories usually happen on a starship. This one looks at the people who never board one: what life is like for an average citizen as society, technology, culture, values and politics change around them. It starts in the 21st century and moves forward, and the hard part it has to balance is the facts of the universe against a personal, relatable touch.

## Decided

- **It's made for the owner.** Other Trek fans are welcome to listen, so stories can assume the listener knows the universe.
- **The world is what holds it together.** It doesn't need one family, one place or a continuing cast. It is closer to a collection of short stories or case studies, each a lens into one life, and stories may sometimes overlap.
- **It grows over time.** There's no finished plan to deliver in one go. The owner brings new ideas, Claude helps turn them into stories that work, and an outline can keep up as it grows.
- **No villains, and no trouble for its own sake.** The conflict is life itself (people grow, change and lose things) and how the world of Star Trek deals with it.
- **It keeps Star Trek's spirit:** the utopia, the humanistic optimism, and using the future to comment on our own society. What it comments on will come out of the stories, not be chosen in advance.
- **Each story still needs something open at the start that has moved by the end,** however small. A portrait now and then is fine.
- **Earlier chapters can be refactored.** The book is built like code: mostly additive, but when going back to change an earlier chapter makes the whole better, we do. Nothing published is frozen. The chapter passes the outline's test again, and only changed lines are re-recorded.
- **It's a rolling story.** Some things resolve, some stay open and new ones open up, so a story doesn't have to end tied off.
- **A third-party narrator walks us through the facts and the world.** The narrator is a natural, non-judgmental observer. The emotion belongs to the people, and comes through what they say. The model is Jeffrey Wright's Watcher in *What If...?*: someone who sees everything, cares, and doesn't interfere. It's a designed voice in that spirit, never a clone of the actor.
- **A chapter runs 15 to 30 minutes.**
- **Chapters are published as they're generated.** The owner reviews by listening, so a script doesn't wait for approval before audio, and a finished chapter goes straight onto the player.
- **It's fiction.** The story may sit close to the owner's life, but creativity and invention lead, and the owner steers by what feels right. Claude doesn't mine the owner's life for material.

## The owner and Claude

The owner is a software engineer and a devoted Star Trek fan who knows the universe well and isn't a writer. The owner brings the ideas, the direction and the taste, and Claude does the storytelling craft as a thoughtful creative partner.

- **Think like code.** The core is the spec, the outline's test is the test suite, canon is the external API, and a chapter can be refactored. Tradeoffs land best in those terms.
- **Bring a recommendation.** Offer a few options with a clear pick and its reason, then let the owner choose, and push back honestly when an idea has a problem. When the owner hands over judgement on a chapter, take it and don't stop to ask.
- **Ideas arrive rough.** The owner often answers with a sentence or a feeling ("I'm not sure yet"). Take it seriously, shape it, and keep it open rather than forcing a decision. The owner's instinct has repeatedly been better than Claude's first version: the Ohio family, the third-party narrator, the title, book censorship and screen time, and the book having an opinion.
- **Explain anything the owner hasn't seen.** Don't refer to a character or idea as if the owner has met it. Give the context first.
- **The owner reviews by listening,** and gives notes by line id. Don't ask for a script read-through.
- **Write decisions down as they're made.** The story notes and `outline.md` are how the next session picks up, so a new decision goes in during the conversation.

### How a chapter gets made

1. Check the outline's entry, and agree anything only the owner can decide.
2. A writing subagent gets a full brief: the notes, the outline, every earlier script and the chapter's core. It checks canon and real-world facts online, reports its sources and judgement calls, and runs the outline's test on its own draft.
3. The main session reads the whole script and checks dates, ages, continuity, direction rules and the values.
4. Claude draws the chapter's art as SVG, exports it to PNG in `book/`, and adds the chapter to `book.json`.
5. The same session designs any new voices (they go in `cast.yaml`, with a locked design and seed), renders the chapter, and publishes it to the player, following `../../CLAUDE.md` and the `voice-casting` skill. One session handles both the story and the audio.
6. The owner listens and gives notes. Failed lines are rewritten, and lessons go into `capabilities.md`.

Memory Alpha pages don't fetch directly: use search results, TrekCore's episode pages, Wikipedia and Ex Astris Scientia.

### What the writing has to sound like

Literary, grounded and specific, in the manner of chapter 1 and chapter 2. The narrator's tool is the plain fact set beside a small domestic one, and the narrator is directed with sorrow, tender attention or curiosity, never calm words. People deflect, joke and talk about the dishes rather than the thing itself, with no therapy-speak and no tidy epiphanies. Each chapter finds its own shape from its subject, such as the sections of a form. Running images return only when they earn it. Never state what the listener knows is coming. A small decent act at a cost carries the hope.

## Canon

Stay as close to canon as possible, filling gaps only when needed and only where nothing contradicts them.

**Canon is checked online while working, never from memory.** When canon disagrees with itself, take the modern retcon where it fits. Where it doesn't fit, or an idea contradicts canon, stop and talk it over with the owner before writing around it. A ruling goes in the table below.

| Event | Canon so far | Status |
|---|---|---|
| Bell Riots | San Francisco, first week of September 2024 | Solid |
| Sanctuary Districts | American cities in the 2020s. In every major city by the early 2020s. They hold the unemployed and homeless ("gimmes"), the mentally ill ("dims") and those who prey on them ("ghosts"; people with criminal records aren't let in). Residents are kept in, with ration cards and a promised job interview under the Federal Employment Act. The Bell Riots turned opinion and led to their abolition, at an undated time | Solid, and undated closure gives us room. The Ohio districts are our fill-in |
| Second Civil War | American, some time after 2024. Pike's speech, the only on-screen mention found: "Our conflict also started with a fight for freedoms. We called it the Second Civil War, then the Eugenics War, and finally just World War III." | No year on screen; ruled as beginning in January 2030 |
| World War III | Under way around 2050, with a nuclear attack in 2053. A 2026 start appears in secondary sources and doesn't bind us: Pike's order puts it after the Second Civil War. The death toll is 600 million in older canon and far higher in *Strange New Worlds* | End solid; start ruled later than 2030; **toll unconfirmed** |
| The United States | TNG "The Royale" has a 52-star flag in use from 2033 to 2079, so a United States survives and adds states by 2033 | The Second Civil War must settle by then |
| Earth's Starfleet | Already exists before the Federation: the NX-01 Enterprise launches in 2151 | Solid |
| Federation founded | 2161 | Solid |
| Eugenics Wars | In the 21st century, just before World War III (*Strange New Worlds*), not the 1990s of older canon | Ruled |

## The first family

Chapter 1, "Dark by Four", is set on 8 November 2026, Finnish Father's Day. Each chapter's script is in `chapters/<number>/`. `cast.yaml` and `voices/` sit at the story's top level, shared by every chapter. The book's art and `book.json` are in `book/`: art is drawn as SVG and exported to PNG, the only form the player takes.

- **Anna Dorsey**, 41, from Dayton, the only child of Walt and Ruth. She filled in the forms to leave. She is 31 weeks pregnant, and the baby is due in January 2027.
- **Ben**, 43, from Toledo, a software developer whose parents are dead.
- **Nora**, 7, was two when they moved. Finnish is now her easy language. **Theo**, 4, was born in Helsinki.
- **Walt Dorsey**, 79, had polio in 1952 and worked 34 years at Delco on a steel brace. Post-polio weakness is now taking his good leg.
- **Ruth Dorsey**, 76, taught piano for forty years and has schizoaffective disorder. In 1996 she spent eleven weeks in hospital, and a county worker then checked on Anna's care every Thursday for a year. Her clinic closed in September 2026, ending her monthly injection from Dolores, her nurse of nineteen years.

## Chapter 2

"Responsible Party", 18 to 22 March 2027, Dayton, built on the sections of a county form.

- **Ben Novak** goes to Ohio. **Alma**, the baby, was born on 14 January 2027.
- **Walt** broke his hip on 9 March and lay seventeen hours before the Henderson boy found him. He is in a nursing home and won't walk again.
- **Ruth** named Anna, not Walt, as her proxy in a declaration she renews every three years. The four bars are *Finlandia* ("Be Still, My Soul"), played on purpose at the Sunday call. Anna signs her into the Montgomery County Sanctuary District, which makes Anna the only person who can ever get her out. **Dolores** restarts her injection there. **Lucille Odom**, a former school cook, ties her ration card round her neck.
- **Carol Flory**, 48, county clerk for 23 years, is a trans woman with a son of 23 in the Guard. Her license expires on 9 April, and Ohio's new rule threatens her letter and her login. Picking "none available" for Anna sent her file to a supervisor.
- A Finnish application is started. **Gary Pruitt** is the county caseworker.

## Chapter 3

"Known As", the night of 13 August 2030, Dayton, told through Carol Flory and built on the roll call of her ledger. The owner left this chapter to Claude's judgement. The sides are today's American politics carried to its extremes, heavily implied and never named. Decent people and terrible acts exist on both, while the book still holds its opinion: "They don't come out even. And it doesn't get me off."

- **The war:** two Presidents since January 2029. **Stays** back Washington ("a President stays until a count can be trusted") and **Counts** back Philadelphia ("the count was the count"). On 14 January 2030, Ohio's Guard and the Air Force fire on each other at Gate 12A of Wright-Patterson, and eleven die. That Friday the county's payroll comes in at zero. The phrases "Second Civil War" and "World War III" are never spoken.
- **Carol Flory**, now 52, lost her login in May 2027 when her license changed to M, and kept the District's only record in a paper ledger. The Counts' Safety Board had her add a letter, H, to hold people who wouldn't pledge, and that is her guilt. She cut the ledger down to its "known as" column to save the residents from being sorted. She ends with a folding table on the levee, finding people by what they were called.
- **Joel Flory**, her son, a Guard sergeant, fired second at the gate. He helped her cut the book, wrote "None available" on the colonel's receipt, and was shot by the Ohio Guard on 14 August, after **Gary Pruitt**, ruined by his phone, reported him. His last line in the book is "Mom."
- **Walt** died on 10 February 2030 in Kettering when the power failed. Carol held up the phone. **Dolores** went out on 29 June and hasn't been seen since.
- **Ruth** is alive. The shot worked again, and she taught eleven children on a cereal-box keyboard. Her last injection was on 22 May 2030. **Naomi Garber**, Carol's Old German Baptist sister, who won't say Carol's name, took her north to a house with no instruments.
- **Anna's** Finnish permit came through in November 2029, but the embassy appointment never happened. Carol finds Ruth for her through the narrow book.
- **Lucille** runs the kitchen. Insulin ran out, and she has a sore on her foot. **Miss Bea Yancey**, librarian and choir director, hid both sides' banned books. **Caleb Henderson**, 19, carries water to Building C. The residents sold the fence for flour in October 2030.

## The road ahead

The agreed pace and topics. The dates between canon's fixed points are ours, and chapters can be added anywhere. `outline.md` holds what each chapter is responsible for, and the test it must pass before audio.

| Chapter | When | What it covers |
|---|---|---|
| 1 | November 2026 | Helsinki: America seen from far away, and the danger reaching the family |
| 2 | 2027 | Ohio and the Sanctuary District, as things slip |
| 3 | About 2030 | The Second Civil War |
| 4 | 2030s to 2040s | The Eugenics Wars, somewhere outside America |
| 5 | 2053 | World War III, and the Helsinki shelter |
| 6 | 2063 | First Contact, from the outside |

The book won't stay in Finland or America. It jumps around Earth and other Federation planets as it moves through the centuries, one rung at a time rather than in big leaps.

## Ideas to keep

- **Alma Novak**, born in January 2027, would be 26 in 2053 and 36 at First Contact. The book could quietly return to her decades later, and the listener will remember the kitchen before she was born.
- **The Helsinki shelter** is planted in chapter 1: Ben told Nora the room was for skis. Chapter 5 pays it off.
- **Subjects return as the world changes:** food in a world with replicators, a future child baffled that a book was ever banned, and how the Bell Riots are taught.
- **The owner's early questions:** what a child does all day in the 24th century, and how it feels when a neighbour's son dies at Wolf 359.
- **Ordinary citizens as the Federation's test:** the happier centuries still need something to push against. TNG's "Family" is close to the spirit of the idea.
- **Overlaps:** a minor character can step forward in a later chapter, as Carol does, and a name, place or tune can echo across centuries.

## Still open

- **Whether the owner keeps what chapter 3 did.** The owner hasn't yet heard chapters 1 to 3; they'll be heard together, and that listen decides the voices and any refactor. Joel's death, written under the owner's handed-over judgement, is the biggest choice to check.
- **What happens to the Dorseys next,** and whether Anna ever reaches Ruth.
- **The form.** Stories, case studies, or oral histories gathered by a Federation archive, in the manner of *World War Z* and Studs Terkel's *Working*. The archive would allow any century in any order and suits long, intimate speech, the voices' proven strength.
- **Where it stops,** and which series count as canon, up to the 32nd century of *Discovery* or not.
