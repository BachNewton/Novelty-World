# Desktop layout and native controller play

Exploring: nothing here is decided or built.

## The idea

Two problems that share a foundation:

1. **A desktop layout.** The board is the phone layout's vertical strip at every width, so a wide screen gets a narrow column of squares and wasted space. A desktop layout would use the width: the whole game on screen at once.
2. **Native controller play.** Not the current UI with a controller mapped onto its buttons, but interactions designed for a controller from the ground up. People on phones are unlikely to use a controller, so the controller only has to be native on the desktop layout.

The desktop layout must be **as native for mouse and keyboard as it is for a controller**. Each player gets the best and most convenient play for the input they prefer, and no input is a translation of another.

The phone layout stays as it is.

## Why Monopoly suits it

The game is already built around very few real decisions (see Philosophy in `../CLAUDE.md`): buy or auction, bid, jail, build/sell/mortgage, and trade. Everything else runs on its own. A small, fixed set of decisions is what makes a controller feel native: each decision can own its buttons, and nothing needs a cursor.

## Three layers

### 1. The action model

A pure function of the game state and the viewer's seat that answers "what can I do right now, and with what values?". For example:

- In an auction: bid any amount up to my cap, or drop out.
- In jail: roll, pay the fine, or use a card if I hold one.
- In manage: for each color group, which builds, sells and mortgages are legal.

No layout and no input handling: it is what every input drives. Each action resolves to an intent the store already sends, so the engine and store don't change. Being pure, it is unit-tested like `logic.ts`.

### 2. The desktop layout

The real square board ring, with the middle of the ring used as a **stage** for the current decision. Nothing scrolls.

```
┌──────────────────────────────────────────────────────────┐
│  player strip: cash, net worth, whose turn                │
├────────────┬──────────────────────────────┬──────────────┤
│            │ ┌──────────────────────────┐ │              │
│  event     │ │   board ring (40 squares)│ │  deed card   │
│  log       │ │   ┌──────────────────┐   │ │  of the      │
│            │ │   │  stage: current  │   │ │  highlighted │
│            │ │   │  decision and    │   │ │  square      │
│            │ │   │  its actions     │   │ │              │
│            │ │   └──────────────────┘   │ │              │
│            │ └──────────────────────────┘ │              │
└────────────┴──────────────────────────────┴──────────────┘
```

Its structure doesn't depend on the input. Two rules keep it controller-ready even before a controller adapter exists:

- **Nothing scrolls.** Scrolling is natural for a mouse and miserable for a controller.
- **Everything is "highlight a square, then act".** Any action that needs a target takes the highlighted square.

### 3. Input adapters

One each for mouse, keyboard and controller, each turning its own natural gestures into actions from the action model.

**The highlighted square** ties them together. Mouse hover sets it, and the arrow keys and the controller's stick or D-pad move it. The deed panel always shows it, so the layout looks the same whatever the input.

**Stage actions are buttons for every input.** Each is clickable and shows the hint for the input used last: a key letter after keyboard use, the controller button icon after controller use, plain text after mouse use. Switching input mid-game just works.

| Action | Mouse | Keyboard | Controller |
|---|---|---|---|
| Look at a square | Hover it | Arrow keys | Stick / D-pad |
| Buy, auction, jail choices | Click the action on the stage | Its hotkey, shown on the action | Face button, shown on the action |
| Set a bid amount | Quick-raise chips or the scroll wheel | Type the number, then Enter | Triggers, speeding up as they're held |
| Build or sell on a color group | Click + / − on the group | Highlight it, then + / − | Highlight it, then D-pad up / down |
| Add a property to a trade | Click it on the board | Highlight it, then a key | Highlight it, then A |
| Big or permanent actions | Click, then confirm | Key, then confirm | Hold the button |
| Arm a trade or manage | Click the toggle | Hotkey | Bumper |

## Controller principles

- **No cursor.** The decision comes to the player; they never steer to a button.
- **Each decision owns fixed face buttons**, the same every time, so play becomes muscle memory.
- **Amounts are analog.** Triggers raise and lower an amount, speeding up as they're held; bumpers make big jumps. No number entry, no cash keypad.
- **Hold to confirm** instead of a confirmation dialog, for anything big or permanent: dropping out of an auction, proposing a trade, committing a manage plan.
- **Building is per color group.** Up and down add or remove houses on the whole group; the engine's build planner already places them legally and cheaply, so the controller never deals with the even-build rule.

A first pass at the mapping:

| Moment | Controls |
|---|---|
| Watching | Stick or D-pad looks at any square. LB arms a trade, RB arms manage. Holding View peeks at the full standings. |
| Buy | A buys, X auctions, Y raises cash when short. |
| Auction | Triggers set the bid you're preparing. A bids, B (held) drops out. |
| Jail | A rolls, X pays the fine, Y uses a card. |
| Manage | The highlight jumps between your own color groups. Up/Down builds or sells on the group, Y mortgages or unmortgages. Menu (held) commits, B cancels. |
| Vote on a trade | A accepts, B declines, Y counters. |
| Build a trade | LB/RB choose the counterparty. A moves the highlighted property to the other side of the deal. Triggers set the cash. Menu (held) proposes. |

## Shared code it would add

Controller pieces any future controller game would reuse, in `src/shared/` beside the gamepad library: hold-to-confirm, hold-to-repeat with speed-up, and a button-icon component (the Controller Tester already draws the Xbox pad). The "last input used" tracking, which picks the hints on each action, may belong there too.

## Open questions

- **When the desktop layout shows.** Leaning: any wide landscape screen, whatever the input, so there is one desktop layout. The alternative is switching only when a controller is connected.
- **Trades with several parties on a controller.** The engine allows any number of parties, and a proposer who isn't one. That's hard to make native on a controller. Leaning: the controller trade builder handles one counterparty at a time, and the full model stays in the engine. Mouse and keyboard may not need that limit.
- **The phone layout on the action model.** The phone layout could also run on the action model, with touch as one more adapter, removing duplicated decision logic. A later cleanup, not part of this.
- **Several controllers on one screen** (couch play) would change how seats work: each client is one seat today. Out of scope; any connected controller drives its client's seat.
- **Secure context.** Browsers hide controllers outside https or localhost. Fine in production; a phone or second machine on the dev server by its LAN address sees none.

## A possible order

1. **The action model.** Small, pure and testable; it pins down what a decision is before any UI exists.
2. **The desktop layout, with mouse and keyboard.** What most desktop players use, and the easiest to test end to end.
3. **The controller adapter**, with the shared controller pieces.

Each step is useful on its own: the desktop layout improves the game even with no controller.
