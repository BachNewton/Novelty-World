# Euchre Rules

Canonical ruleset for the Novelty World implementation. All game logic and tests
trace back to this document.

---

## 1. Overview

Euchre is a trick-taking card game for **4 players** in **2 fixed teams** of 2.
Partners sit across from each other. The first team to **10 points** wins.

---

## 2. The Deck

A standard 24-card deck:

- **Suits:** Hearts, Diamonds, Clubs, Spades
- **Ranks per suit:** 9, 10, Jack, Queen, King, Ace (6 cards each)

---

## 3. Seating and Positions

Players are numbered 0–3 clockwise:

- Players 0 and 2 are **Team A** (partners).
- Players 1 and 3 are **Team B** (partners).
- The **dealer** rotates clockwise after each hand.

---

## 4. Dealing

1. The dealer shuffles and deals **5 cards** to each player in two rounds
   (e.g., 3 then 2, or 2 then 3 — either is acceptable).
2. The 4 remaining cards form the **kitty**.
3. The **top card of the kitty** is turned face-up. This is the **up card** and
   proposes a trump suit for bidding round 1.

---

## 5. Card Ranking

### 5.1 Trump Suit (highest to lowest)

1. **Right Bower** — Jack of the trump suit (highest card in the game)
2. **Left Bower** — Jack of the same color as trump (second highest)
3. Ace of trump
4. King of trump
5. Queen of trump
6. 10 of trump
7. 9 of trump

> **Critical rule:** The Left Bower *belongs to the trump suit* for all
> purposes — following suit, trick resolution, etc. It is NOT a member of its
> printed suit during the hand.

### 5.2 Non-Trump Suits (highest to lowest)

Ace, King, Queen, Jack, 10, 9

> Note: If the Jack of a non-trump suit is the Left Bower, it is absent from
> that suit's ranking (it has moved to the trump suit).

### 5.3 Same-Color Suit Pairs

- Hearts and Diamonds (red)
- Clubs and Spades (black)

These pairs matter because the Left Bower comes from the same-color suit.

---

## 6. Calling Trump (Bidding)

Bidding determines which suit is trump and which team are the **makers**
(the team that called trump). The other team are the **defenders**.

### 6.1 Round 1 — The Up Card

Starting with the player to the dealer's left, going clockwise:

- A player may **order it up** (accept the up card's suit as trump) or **pass**.
- If the dealer's **partner** orders it up, this is called **assisting**.
- If the **dealer** accepts, they **pick up the up card**, add it to their hand,
  and **discard** any one card face-down to the kitty.
- If any non-dealer player orders it up, the dealer still picks up the up card
  and discards.
- If all four players pass, proceed to Round 2.

### 6.2 Round 2 — Naming Trump

The up card is turned face-down. Starting with the player to the dealer's left:

- A player may **name any suit except the turned-down suit** as trump, or pass.
- If a player names a suit, that suit becomes trump and their team are the makers.
- If all four players pass again, the hand is **dead** — reshuffle, rotate dealer,
  and deal again.

### 6.3 Stick the Dealer (Optional Variant)

> **We will implement this variant.** If all players pass through both rounds,
> the dealer is **forced** to name a trump suit. This prevents dead hands and
> keeps the game moving.

---

## 7. Going Alone

When a player calls trump (in either round), they may simultaneously declare
they are **going alone**.

- The lone player's **partner sits out** the hand — their cards are placed
  face-down and they do not play.
- Only **5 tricks** are still played, but with 3 active players instead of 4.
- The lone player plays against both opponents.
- **Lead adjustment:** The player to the **left of the lone player** leads the
  first trick (not necessarily left of dealer).

---

## 8. Playing Tricks

### 8.1 Leading

- The player to the **dealer's left** leads the first trick.
  - Exception: If that player's partner is going alone, the next eligible player
    (across from dealer) leads.
  - Exception: If the player going alone is not left of dealer, the player to
    the left of the lone player leads.
- The winner of each trick leads the next.

### 8.2 Following Suit

Each player, in clockwise order, must play a card following these rules:

1. **Must follow suit** if able. If the lead suit is trump, you must play a
   trump card if you have one (including the Left Bower).
2. If the lead suit is a non-trump suit and you have no cards of that suit
   (remember: the Left Bower is NOT in its printed suit), you may play **any
   card** — including a trump to win the trick.
3. If you cannot follow suit, you may play any card.

### 8.3 Winning a Trick

- If no trump was played, the **highest card of the lead suit** wins.
- If any trump was played, the **highest trump** wins.
- The trick winner collects all played cards face-down and leads the next trick.

---

## 9. Scoring

After all 5 tricks are played, score the hand:

| Situation | Points |
|---|---|
| Makers win 3 or 4 tricks | **1 point** |
| Makers win all 5 tricks (**march**) | **2 points** |
| Makers win fewer than 3 tricks (**euchred**) | Defenders get **2 points** |
| Lone player wins 3 or 4 tricks | **1 point** |
| Lone player wins all 5 tricks | **4 points** |
| Lone player wins fewer than 3 (**euchred**) | Defenders get **2 points** |

### 9.1 Winning the Game

The first team to reach **10 points** wins. If both teams would reach 10 on
the same hand, the **makers** have priority (they score first).

---

## 10. Dealer Rotation

After each hand (whether played or dead), the dealer position rotates
**one seat clockwise**.

---

## 11. Revoking (Misplay)

If a player fails to follow suit when they were able to, this is a **revoke**.

- The offending team loses their **trick count for the hand** — the opponents
  are awarded **2 points**.
- In our implementation: since the host validates all plays, revokes should be
  impossible. The game will reject illegal plays.

---

## 12. Rules NOT Implemented

The following variants and rules exist but are **out of scope** for the initial
implementation:

- **Farmer's Hand / No Ace No Face** — redeal when dealt only 9s and 10s
- **Defender Going Alone** — defenders playing solo
- **Partner's Best** — exchanging cards with partner during alone play
- **Joker / Best Bower** — extra card above the Right Bower
- **Rubber scoring** — multi-game series point bonuses
- **2-player, 3-player, or 6-player variants**

These may be added as optional settings in the future.

---

## Sources

- [Bicycle Cards — How to Play Euchre](https://bicyclecards.com/how-to-play/euchre)
- [Wikipedia — Euchre](https://en.wikipedia.org/wiki/Euchre)
- [Euchre.com — Rules](https://euchre.com/rules/)
