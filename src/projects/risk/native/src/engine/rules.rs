//! Every move and the steps the rules take on their own. A move is checked whole before anything
//! changes, so a refused move leaves the game as it was; a move is legal exactly when `apply`
//! accepts it, and `options` lists exactly those (a test holds them equal).

use super::events::{EventKind, EventSink, Quiet, TradeBonus};
use super::state::{Game, Occupying, Phase, Reinforce, Seat, Territory};
use crate::blitz::resolve_blitz;
use crate::cards::{is_valid_set, set_value, territory_of, Card, FULL_DECK};
use crate::list::List;
use crate::map::{component, territories_in, ADJACENT, TERRITORY_COUNT};
use crate::rng::Rng;

/// Every move a seat can make (`contract.ts`'s `Move`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Move {
    /// Placing reinforcements (`REINF-5`).
    Place {
        territory: Territory,
        armies: i32,
    },
    /// `bonus` picks which owned, pictured territory gets the +2 (`CARDS-7`) when more than one
    /// qualifies; the engine picks when only one does.
    Trade {
        cards: [Card; 3],
        bonus: Option<Territory>,
    },
    /// One battle (`COMBAT-4`) with the attacker's chosen dice.
    Attack {
        from: Territory,
        to: Territory,
        dice: u8,
    },
    /// Fight until `to` is captured or `from` is down to `keep_at_least` (`COMBAT-8`).
    Blitz {
        from: Territory,
        to: Territory,
        keep_at_least: i32,
    },
    /// The total armies in the captured territory once moved in (`COMBAT-6`).
    Occupy {
        armies: i32,
    },
    EndAttack,
    Fortify {
        from: Territory,
        to: Territory,
        armies: i32,
    },
    /// Ends the turn without fortifying (`FORT-3`).
    EndTurn,
}

pub type Refusal = &'static str;

/// One die (`DECK-3`).
fn roll_die(rng: &mut Rng) -> u8 {
    1 + (rng.next() * 6.0).floor() as u8
}

/// `count` dice, highest first (`COMBAT-4`).
fn roll_dice<const N: usize>(rng: &mut Rng, count: usize) -> List<u8, N> {
    let mut dice = List::new();
    for _ in 0..count {
        dice.push(roll_die(rng));
    }
    dice.as_mut_slice().sort_unstable_by(|a, b| b.cmp(a));
    dice
}

/// `COMBAT-4`: the dice pair off highest first for `min(attacker, defender)` pairs, and a tie goes
/// to the defender. Both lists are sorted highest first. Returns (attacker losses, defender
/// losses).
pub fn pair_dice(attacker: &[u8], defender: &[u8]) -> (i32, i32) {
    let mut losses = (0, 0);
    for (a, d) in attacker.iter().zip(defender) {
        if a > d {
            losses.1 += 1;
        } else {
            losses.0 += 1;
        }
    }
    losses
}

impl Game {
    /// Applies `seat`'s move, then every forced step after it, stopping at the next decision.
    pub fn apply(&mut self, seat: Seat, mv: Move) -> Result<Vec<super::Event>, Refusal> {
        let mut events = Vec::new();
        self.apply_with(seat, mv, &mut events)?;
        Ok(events)
    }

    /// `apply` without keeping the events, for a search playing lines forward.
    pub fn apply_quiet(&mut self, seat: Seat, mv: Move) -> Result<(), Refusal> {
        self.apply_with(seat, mv, &mut Quiet)
    }

    pub fn apply_with(
        &mut self,
        seat: Seat,
        mv: Move,
        events: &mut impl EventSink,
    ) -> Result<(), Refusal> {
        if self.phase == Phase::GameOver {
            return Err("the game is over");
        }
        if seat != self.active {
            return Err("it is not your turn");
        }
        let mut rng = Rng::from_state(self.rng);
        let phase = self.phase;
        let wrong_phase = Err("that move is not one of this phase's");
        match mv {
            Move::Place { territory, armies } if phase == Phase::Reinforce => {
                self.place(territory, armies, events)?
            }
            Move::Trade { cards, bonus } if phase == Phase::Reinforce => {
                self.trade(cards, bonus, &mut rng, events)?
            }
            Move::Attack { from, to, dice } if phase == Phase::Attack => {
                self.attack(from, to, dice, &mut rng, events)?
            }
            Move::Blitz {
                from,
                to,
                keep_at_least,
            } if phase == Phase::Attack => self.blitz(from, to, keep_at_least, &mut rng, events)?,
            Move::Occupy { armies } if phase == Phase::Attack => self.occupy(armies, events)?,
            Move::EndAttack if phase == Phase::Attack => {
                if self.occupying.is_some() {
                    return Err("move armies into the captured territory first");
                }
                self.end_attack_phase(events);
            }
            Move::Fortify { from, to, armies } if phase == Phase::Fortify => {
                self.fortify(from, to, armies, events)?
            }
            Move::EndTurn if phase == Phase::Fortify => self.end_turn(events),
            _ => return wrong_phase,
        }
        self.take_forced_steps(events);
        self.rng = rng.state();
        Ok(())
    }

    /// Steps the rules leave no choice over, taken until the next real decision: a move-in whose
    /// minimum is its maximum, and an attack or fortify phase with nothing to do but end it.
    fn take_forced_steps(&mut self, events: &mut impl EventSink) {
        loop {
            match (self.phase, self.occupying) {
                (Phase::Attack, Some(o)) if o.min == o.max => self.move_in(o.min, events),
                (Phase::Attack, None) if !self.has_attack() => self.end_attack_phase(events),
                (Phase::Fortify, _) if !self.has_fortify() => self.end_turn(events),
                _ => return,
            }
        }
    }

    // -- Reinforce ------------------------------------------------------------------------------

    fn reinforce_state(&self) -> Reinforce {
        self.reinforce
            .unwrap_or_else(|| panic!("no reinforce phase in progress ({:?})", self.phase))
    }

    /// `CARDS-5` and `ELIM-3`: a hand of 5 or more must trade until it holds 4 or fewer.
    pub fn must_trade(&self) -> bool {
        self.hands[self.active as usize].len() >= 5
    }

    /// `CARDS-5`: any sets, before placing. `ELIM-3`: only the forced trades.
    pub fn may_trade(&self) -> bool {
        let r = self.reinforce_state();
        if r.after_elimination {
            self.must_trade()
        } else {
            !r.placed_any
        }
    }

    /// `REINF-5`: armies on any owned territories, all of them before the first battle
    /// (`REINF-1`).
    fn place(
        &mut self,
        territory: Territory,
        armies: i32,
        events: &mut impl EventSink,
    ) -> Result<(), Refusal> {
        let seat = self.active;
        let mut r = self.reinforce_state();
        if self.must_trade() {
            return Err("trade a set before placing");
        }
        if territory as usize >= TERRITORY_COUNT || self.owner[territory as usize] != seat {
            return Err("armies can only be placed on a territory you own");
        }
        if armies < 1 || armies > r.armies_to_place {
            return Err("place at least 1 army and no more than are left to place");
        }

        self.armies[territory as usize] += armies;
        r.armies_to_place -= armies;
        r.placed_any = true;
        let rule = if r.after_elimination {
            "ELIM-3"
        } else {
            "REINF-5"
        };
        events.push(
            rule,
            EventKind::Placed {
                owner: seat,
                territory,
                armies,
            },
        );
        if r.armies_to_place == 0 {
            self.reinforce = None;
            let rule = if r.after_elimination {
                "ELIM-3"
            } else {
                "TURN-1"
            };
            self.set_phase(Phase::Attack, rule, events);
        } else {
            self.reinforce = Some(r);
        }
        Ok(())
    }

    /// `CARDS-7`: the territories pictured among `cards` that the active seat owns, in hand order,
    /// any one of which may take a trade's +2 (once per trade, note `territory-bonus`).
    pub fn bonus_territories(&self, cards: &[Card]) -> List<Territory, 12> {
        let seat = self.active;
        let mut out = List::new();
        for &card in self.hands[seat as usize].iter() {
            if !cards.contains(&card) {
                continue;
            }
            if let Some(t) = territory_of(card) {
                if self.owner[t] == seat {
                    out.push(t as Territory);
                }
            }
        }
        out
    }

    /// `CARDS-5` (or `ELIM-3`): three cards from the hand forming a set (`CARDS-3`), worth its
    /// fixed value (`CARDS-6`), and the occupied-territory bonus where due (`CARDS-7`). The cards
    /// go back into the deck (`CARDS-8`).
    fn trade(
        &mut self,
        cards: [Card; 3],
        bonus: Option<Territory>,
        rng: &mut Rng,
        events: &mut impl EventSink,
    ) -> Result<(), Refusal> {
        let seat = self.active;
        let mut r = self.reinforce_state();
        if !self.may_trade() {
            return Err("no trade is allowed now");
        }
        if cards[0] == cards[1] || cards[0] == cards[2] || cards[1] == cards[2] {
            return Err("a trade is three different cards");
        }
        let hand = self.hands[seat as usize];
        if !cards
            .iter()
            .all(|&c| (c as usize) < FULL_DECK.len() && hand.contains(&c))
        {
            return Err("you can only trade cards in your hand");
        }
        if !is_valid_set(&cards) {
            return Err("those cards are not a set");
        }
        let choices = self.bonus_territories(&cards);
        let bonus_territory = match bonus {
            Some(t) if choices.contains(&t) => Some(t),
            Some(_) => return Err("that territory cannot take the occupied-territory bonus"),
            None if choices.len() > 1 => {
                return Err("choose which territory takes the occupied-territory bonus")
            }
            None => choices.first().copied(),
        };

        let armies = set_value(&cards) as i32;
        let held = &mut self.hands[seat as usize];
        for card in cards {
            let at = held
                .iter()
                .position(|&c| c == card)
                .expect("checked in hand");
            held.remove(at);
        }
        for card in cards {
            self.return_to_deck(card, rng);
        }
        self.trades += 1;
        r.armies_to_place += armies;
        self.reinforce = Some(r);
        let bonus = bonus_territory.map(|territory| {
            // CARDS-7: both bonus armies go on the pictured territory, so the engine places them.
            self.armies[territory as usize] += 2;
            TradeBonus {
                territory,
                armies: 2,
            }
        });
        let rule = if r.after_elimination {
            "ELIM-3"
        } else {
            "CARDS-5"
        };
        events.push(
            rule,
            EventKind::Traded {
                seat,
                cards,
                armies,
                bonus,
            },
        );
        Ok(())
    }

    /// `CARDS-8`: a traded card goes back into the deck at a random place below its top 3 cards,
    /// or anywhere in a deck of 3 or fewer.
    fn return_to_deck(&mut self, card: Card, rng: &mut Rng) {
        let len = self.deck.len();
        let lowest = if len > 3 { 3 } else { 0 };
        let at = lowest + (rng.next() * (len - lowest + 1) as f64).floor() as usize;
        self.deck.insert(at, card);
    }

    // -- Attack ---------------------------------------------------------------------------------

    /// `COMBAT-1` and `COMBAT-2`: the most dice a battle from `from` into `to` may roll, or None
    /// when the active seat may not attack there.
    pub fn max_dice(&self, from: Territory, to: Territory) -> Option<u8> {
        let (f, t) = (from as usize, to as usize);
        if f >= TERRITORY_COUNT || t >= TERRITORY_COUNT {
            return None;
        }
        let seat = self.active;
        let legal = self.owner[f] == seat
            && self.armies[f] >= 2
            && ADJACENT[f] & (1 << t) != 0
            && self.owner[t] != seat;
        legal.then(|| 3.min(self.armies[f] - 1) as u8)
    }

    /// Whether the active seat has any legal battle.
    pub fn has_attack(&self) -> bool {
        let own = self.owned[self.active as usize];
        territories_in(own).any(|t| self.armies[t] >= 2 && ADJACENT[t] & !own != 0)
    }

    /// One battle (`COMBAT-4`) with the attacker's chosen dice.
    fn attack(
        &mut self,
        from: Territory,
        to: Territory,
        dice: u8,
        rng: &mut Rng,
        events: &mut impl EventSink,
    ) -> Result<(), Refusal> {
        if self.occupying.is_some() {
            return Err("move armies into the captured territory first");
        }
        let Some(max) = self.max_dice(from, to) else {
            return Err("that attack is not allowed");
        };
        if dice < 1 || dice > max {
            return Err("roll at least 1 die, at most 3 and fewer than the attacking armies");
        }
        // COMBAT-3: the defender rolls the most dice it may (note `defender-dice`).
        let attacker_dice: List<u8, 3> = roll_dice(rng, dice as usize);
        let defender_dice: List<u8, 2> = roll_dice(rng, 2.min(self.armies[to as usize]) as usize);
        let (attacker_losses, defender_losses) = pair_dice(&attacker_dice, &defender_dice);
        self.armies[from as usize] -= attacker_losses;
        self.armies[to as usize] -= defender_losses;
        events.push(
            "COMBAT-4",
            EventKind::Battle {
                from,
                to,
                attacker_dice,
                defender_dice,
                attacker_losses,
                defender_losses,
            },
        );
        if self.armies[to as usize] == 0 {
            self.capture(from, to, dice as i32, events);
        }
        Ok(())
    }

    /// `COMBAT-8`: a fight until `to` is captured or `from` is down to `keep_at_least`, resolved at
    /// once by Balanced Blitz from one draw of the random source.
    fn blitz(
        &mut self,
        from: Territory,
        to: Territory,
        keep_at_least: i32,
        rng: &mut Rng,
        events: &mut impl EventSink,
    ) -> Result<(), Refusal> {
        if self.occupying.is_some() {
            return Err("move armies into the captured territory first");
        }
        if self.max_dice(from, to).is_none() {
            return Err("that attack is not allowed");
        }
        let (f, t) = (from as usize, to as usize);
        if keep_at_least < 1 || keep_at_least >= self.armies[f] {
            return Err("keep at least 1 army, and fewer than the territory holds");
        }
        let attackers = self.armies[f] - keep_at_least;
        let draw = rng.next();
        let result = resolve_blitz(
            attackers as usize,
            self.armies[t] as usize,
            draw,
            &mut || rng.next(),
        );
        let attacker_losses = result.attacker_losses as i32;
        let defender_losses = result.defender_losses as i32;
        self.armies[f] -= attacker_losses;
        self.armies[t] -= defender_losses;
        events.push(
            "COMBAT-8",
            EventKind::Blitzed {
                from,
                to,
                attacker_losses,
                defender_losses,
            },
        );
        if self.armies[t] == 0 {
            // COMBAT-6: a blitz rolls no dice, so the move-in is at least 3, or all that can move.
            let minimum = 3.min(attackers).min(self.armies[f] - 1);
            self.capture(from, to, minimum, events);
        }
        Ok(())
    }

    /// `COMBAT-6`: the attacker takes the territory at once, moving in at least `minimum` armies.
    /// That minimum moves in with the capture, so no territory is ever empty (`INV-1`).
    fn capture(
        &mut self,
        from: Territory,
        to: Territory,
        minimum: i32,
        events: &mut impl EventSink,
    ) {
        let seat = self.active;
        let previous = self.owner[to as usize];
        let max = self.armies[from as usize] - 1;
        self.set_owner(to, seat);
        self.armies[to as usize] = minimum;
        self.armies[from as usize] -= minimum;
        self.captured_this_turn = true;
        events.push(
            "COMBAT-6",
            EventKind::Captured {
                seat,
                territory: to,
                from: previous,
            },
        );

        let eliminating = (self.owned[previous as usize] == 0).then_some(previous);
        if let Some(loser) = eliminating {
            if self.seats_in_game() == 2 {
                // WIN-1: the last opponent is gone and the game ends at once, with no move-in.
                self.eliminate(loser, events);
                self.winner = Some(seat);
                self.set_phase(Phase::GameOver, "WIN-1", events);
                events.push("WIN-1", EventKind::GameOver { winner: seat });
                return;
            }
        }
        self.occupying = Some(Occupying {
            from,
            to,
            min: minimum,
            max,
            eliminating,
        });
    }

    fn occupy(&mut self, armies: i32, events: &mut impl EventSink) -> Result<(), Refusal> {
        let Some(o) = self.occupying else {
            return Err("there is no captured territory to move into");
        };
        if armies < o.min || armies > o.max {
            return Err("move in at least the capture's minimum and leave at least 1 army behind");
        }
        self.move_in(armies, events);
        Ok(())
    }

    /// Completes a capture's move-in; an elimination follows it (note `elimination-order`), and a
    /// hand of 5 or more then trades at once (`ELIM-3`).
    fn move_in(&mut self, armies: i32, events: &mut impl EventSink) {
        let o = self
            .occupying
            .take()
            .expect("a capture waits for its move-in");
        let extra = armies - o.min;
        self.armies[o.from as usize] -= extra;
        self.armies[o.to as usize] += extra;
        events.push(
            "COMBAT-6",
            EventKind::Occupied {
                from: o.from,
                to: o.to,
                armies,
            },
        );
        if let Some(loser) = o.eliminating {
            self.eliminate(loser, events);
            if self.must_trade() {
                self.reinforce = Some(Reinforce {
                    armies_to_place: 0,
                    placed_any: false,
                    after_elimination: true,
                });
                self.set_phase(Phase::Reinforce, "ELIM-3", events);
            }
        }
    }

    /// `ELIM-1` and `ELIM-2`: out of the game, every card going to the capturer.
    fn eliminate(&mut self, loser: Seat, events: &mut impl EventSink) {
        let taken = self.hands[loser as usize];
        self.eliminated[loser as usize] = true;
        for &card in taken.iter() {
            self.hands[self.active as usize].push(card);
        }
        self.hands[loser as usize].clear();
        events.push(
            "ELIM-2",
            EventKind::Eliminated {
                seat: loser,
                by: self.active,
                cards_taken: taken.len() as u8,
            },
        );
    }

    /// The end of the attack phase: on to the fortify phase (`TURN-1`).
    fn end_attack_phase(&mut self, events: &mut impl EventSink) {
        self.set_phase(Phase::Fortify, "TURN-1", events);
    }

    // -- Fortify --------------------------------------------------------------------------------

    /// Whether the active seat has any legal fortifying move: some territory with an army to
    /// spare next to another of its own.
    pub fn has_fortify(&self) -> bool {
        let own = self.owned[self.active as usize];
        territories_in(own).any(|t| self.armies[t] >= 2 && ADJACENT[t] & own != 0)
    }

    /// `FORT-1`: one move along owned territories (note `fortify-reach`), leaving at least 1 army
    /// behind; it ends the turn (`FORT-3`).
    fn fortify(
        &mut self,
        from: Territory,
        to: Territory,
        armies: i32,
        events: &mut impl EventSink,
    ) -> Result<(), Refusal> {
        let seat = self.active;
        let (f, t) = (from as usize, to as usize);
        if f >= TERRITORY_COUNT || t >= TERRITORY_COUNT {
            return Err("no such territory");
        }
        if self.owner[f] != seat {
            return Err("fortify from a territory you own");
        }
        if f == t || component(self.owned[seat as usize], f) & (1 << t) == 0 {
            return Err("fortify to a territory joined to it through your own");
        }
        if armies < 1 || armies >= self.armies[f] {
            return Err("move at least 1 army and leave at least 1 behind");
        }
        self.armies[f] -= armies;
        self.armies[t] += armies;
        events.push("FORT-1", EventKind::Fortified { from, to, armies });
        self.end_turn(events);
        Ok(())
    }

    /// `FORT-3`, `CARDS-1` and `TURN-2`: the turn's card if the turn captured anything (none from
    /// an empty deck, `CARDS-8`), then the turn passes to the next seat still in the game, a new
    /// round beginning when the turn order wraps round (`REINF-6`).
    fn end_turn(&mut self, events: &mut impl EventSink) {
        let seat = self.active;
        if self.captured_this_turn && !self.deck.is_empty() {
            let card = self.deck.remove(0);
            self.hands[seat as usize].push(card);
            events.push(
                "CARDS-1",
                EventKind::CardDrawn {
                    seat,
                    card: Some(card),
                },
            );
        }
        let order = self.turn_order();
        let at = self.position(seat);
        let next_at = (1..=order.len())
            .map(|step| (at + step) % order.len())
            .find(|&i| !self.eliminated[order[i] as usize])
            .expect("a seat is left to take a turn");
        let next = order[next_at];
        if next_at <= at {
            self.round += 1;
        }
        self.start_turn(next, "TURN-2", events);
    }
}
