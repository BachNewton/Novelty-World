# AI players: findings and options

What a proof of concept taught about local models playing Betrayal, and the options it leaves for the bots and AI-players milestones (section 13 of `engine.md`). It feeds the open question there on which model plays an AI seat and how it reaches the game. The proof of concept lives on the `betrayal-ai-poc` branch, in `src/projects/betrayal/poc/`: a script that plays the exploration phase with a local model in every seat, and the transcripts of its runs. It stays off `main` because it builds its own stand-in for `viewFor` and will drift as the engine grows; revive it at the bots milestone.

## How the proof of concept works

For each pending decision the script builds one prompt: a short rules primer, the acting seat's view as text (a stand-in for `viewFor`), the question from `describeDecision`, recent log lines from `describeEvent`, and the legal choices numbered. The model's answer is constrained by a JSON schema to one of those numbers, plus a short reason. The engine applies the chosen action and runs on to the next decision. Thinking mode lets the model reason freely first, then asks for the constrained answer with that reasoning in context.

## Findings

### Constraining the answer to a choice number works

About 350 decisions across the runs: every pick was legal and every answer parsed. A schema-constrained choice is the right interface for any AI seat, local or remote, and the engine's own validation stays as the second guard the design already requires.

### The view text matters as much as the model

The first view text left the model to work out what each choice did. Every model, in every mode, sometimes stepped into a room and straight back out, or swapped between two rooms across turns. A second version of the view added three things:

- each choice says what it leads to ("a room already in the house; 2 unexplored doorways there; you were already there this turn", or "places a new room and moves you in; ends your movement");
- the seat's path this turn;
- unexplored doorways named by direction, with what exploring through one does.

Over three seeds of 40 quick-mode decisions each (Qwen3.5-9B), moves back into a room already visited that turn fell from 8 of 28 moves (29%) to 4 of 33 (12%), and explorations rose from 0.31 to 0.35 per decision, at almost no cost in speed. The sample is small, but the direction is clear: much of the "bad play" was the input, not the model.

What this means for the engine:

- **A choice's consequence belongs with its label.** The decision kind that writes a choice's label should also write a one-line consequence, so the two never disagree. The UI can show the same line as a tooltip.
- **The turn's path belongs in the turn record,** beside the movement already spent. The proof of concept rebuilds it from events, which is the wrong place.
- **The prompt is a pure function of the state and the seat.** The engine owns the facts and their wording (`viewFor`, `describe`); the AI layer only arranges them into a prompt. The same state always gives the same prompt, which makes runs reproducible, lets the model server reuse its work on a stable prefix (primer and rules first), and lets a bad move be debugged by regenerating exactly what the model saw.

### Small models invent rules in their explanations

Even when a pick was sound, the stated reason often cited rules that don't exist ("the Medallion triggers a haunt roll", "east is the canonical direction"). A bot's reasoning must never be shown to players as if it were a rule.

### Whether thinking helps is still open

Thinking used up its 1,200-token budget on every decision, on both models and with both views: these models reason at length by habit, restating the state before weighing choices. Their thinking was therefore always cut off, and thinking mode made mistakes similar to quick mode's at ten times the time. A fair test needs a larger budget or an instruction to reason briefly.

### Measured speed

Exploration-phase prompts of about 1,000 to 2,500 tokens, on the owner's laptop (Ryzen 7 7840U with Radeon 780M, 32 GB) and its RTX 4070 eGPU:

| Model and device | Quick mode | Thinking (1,200-token budget) |
|---|---|---|
| Qwen3.5-4B, Q4, on the 780M | about 8 s | about 86 s |
| Qwen3.5-9B, Q6, on the 4070 | about 2 s | about 24 s |

The 4070 makes quick decisions table-paced. The 780M alone is usable for quick mode but slow for thinking. A model larger than 12 GB would need splitting between the 4070 and system RAM, which isn't warranted unless the 9B proves too weak.

## Options not yet tested

- **System-one picks from probabilities.** Instead of generating a reason and a number, read the model's probability for each choice number in one pass. That should bring quick decisions well under a second, and the spread of probabilities is a confidence: a confident pick is taken as it is, and a close call is sent to thinking mode. That is the fast and slow split from one model.
- **A stated plan carried between decisions.** Every prompt starts fresh from the state, so a model has no memory of what it meant to do. The path this turn stops backtracking within a turn, but nothing stops a model heading upstairs one turn and changing its mind the next. Keeping the whole conversation would fix that at a high cost: the history outgrows the context within a game, small models get worse as context grows, old views contradict the current one, and the prompt would stop being a function of the state. The middle ground: the answer gains a one-line plan beside its reason ("heading to the Upper Landing to explore its north door"), stored with the seat, and the next prompt shows it as "your plan from last turn", along with the seat's own last few decisions. Intent passes forward in a few dozen tokens, and the prompt stays a function of the state plus that stored note. Test it by counting changes of direction across turns, with and without the plan.
- **Purpose-built open decision models** (small non-autoregressive classifiers in the style of TypeSafe's Jev). They are tiny enough for a phone, but built for classification over short inputs, not strategy over a game state, and new and unproven. Worth a look only for an AI that runs on every player's device.

## Where the model can run

| Where | Fit |
|---|---|
| The player's device (WebGPU) | Free, but a 1 to 4B model is the ceiling, phones are slow, and someone's client must run the bot seat, which the design forbids (the server drives non-human seats) |
| A Vercel or Supabase function | Not workable: no GPU, and Supabase's limits rule it out entirely; CPU inference on Vercel is slow and costs more than a hosted model |
| A hosted model through an API | A few cents per game, fast, bigger models; fits the design unchanged |
| The owner's laptop as the model server | Free and fits the design unchanged: the drive request calls the laptop instead of a provider. The bot exists only while the laptop is on, awake and reachable, so the drive deadline's fallback (a rule bot or a legal random choice, logged) is what keeps a game moving without it. Exposed by port forwarding, behind a secret key |
| The player's own agent over MCP ("bring your own AI") | See below |

Every one of these sits behind the same AI controller, so the choice can change without touching the engine.

## Bring your own AI

Novelty World would offer an MCP server, and a player connects their own agent to play a seat. It fits the design as it stands: controllers answer asynchronously, answers name their decision, the engine validates them, and decisions describe themselves. It costs Novelty World nothing and gives frontier-model players. What it needs:

- **Tools:** the seat's view with its pending decision and numbered choices; choose; look up rules; wait for the seat's turn; and optionally say something at the table, which doubles as a progress update.
- **Waiting for a turn:** MCP is driven by the agent, so a wait tool holds its request open, wakes on the game row's Realtime change, and returns "call again" when the function's time limit nears. The game itself never waits.
- **Self-contained views:** each view carries the state and a short recent log, so an agent never has to remember the game. Agents that can run a loop suit it; a chat is not built to sit through a long game.
- **A hard boundary:** humans are trusted not to peek, agents are not. The MCP serves only `viewFor`, and rule lookups refuse the other side's half of the haunt.
- **Identity:** a per-seat secret that permits that seat in that game only, revocable by the game's creator.
- **An agent that wanders off** is the drive deadline's case again: the fallback answers, and the log says so.

## Progress while an AI thinks

Long thinking is acceptable if players see progress. The drive request reads the model's answer as a stream and relays progress over a Supabase Realtime broadcast channel: short-lived, never written to the game row, and safe to lose, because the answer still arrives through the normal commit. A capped thinking budget turns progress into an honest ETA ("up to 30 s") and puts an upper bound on a drive's duration, which helps settle the drive deadline. Streamed thoughts follow hidden information like everything else: before the haunt they can be shown; a traitor's thoughts are never shown live to the heroes, and could be revealed after the game.
