//! `sim.ts` in Rust: worlds a searching bot plays forward, whole games on the native engine built
//! from one seat's view and history and the bot's own guess at what the seat can't see (the other
//! hands and the deck's order), with a random source seeded by the bot. A guess is refused unless
//! the seat's knowledge allows it: every hand's size, its own hand, each card once, and a card
//! traded back below the deck's top kept out of reach of the draws since. The public facts the view
//! doesn't carry (the round, for the first-turn bonus, and the reinforce phase's bookkeeping) are
//! read exactly from the history. Nothing here reads a real game: a world is made from what the
//! seat may see.

use crate::cards::{Card, FULL_DECK};
use crate::engine::{
    Deck, Event, EventKind, Game, Hand, Occupying, Phase, Reinforce, Seat, View, DECK_SIZE,
    MAX_SEATS,
};
use crate::rng::Rng;

/// `CARDS-8`: a traded card goes back below the deck's top 3 cards.
const BURIED: u8 = 3;

/// What the seat's history says beyond its view.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PublicRecord {
    /// Rounds of the turn order completed (`REINF-6`).
    pub round: u32,
    /// The reinforce phase in progress: (placed any, after an elimination).
    pub reinforce: Option<(bool, bool)>,
    /// Cards traded back below the deck's top that too few draws have happened since to reach:
    /// each must still be in the deck, at least this deep. In the order they were traded.
    pub min_depth: Vec<(Card, u8)>,
}

/// Reads the public record from a seat's history, checking it ends where the view stands.
pub fn read_history(view: &View, history: &[Event]) -> Result<PublicRecord, String> {
    let at = |seat: Seat| view.turn_order.iter().position(|&s| s == seat);
    let mut round = 0;
    let mut deck: Option<i32> = None;
    let mut turn: Option<(Seat, u32)> = None;
    let mut phase: Option<Phase> = None;
    let mut reinforce: Option<(bool, bool)> = None;
    let mut min_depth: Vec<(Card, u8)> = Vec::new();
    let mut trades = 0usize;
    for e in history {
        match &e.kind {
            EventKind::TurnOrder { order } => {
                if order.as_slice() != view.turn_order.as_slice() {
                    return Err("the history's turn order is not the view's".into());
                }
            }
            EventKind::DeckReshuffled => {
                deck = Some(DECK_SIZE as i32);
                min_depth.clear();
            }
            &EventKind::TurnStarted { seat, turn: n } => {
                if let Some((prev, _)) = turn {
                    if at(seat) <= at(prev) {
                        round += 1;
                    }
                }
                turn = Some((seat, n));
            }
            &EventKind::Phase { phase: p } => {
                phase = Some(p);
                reinforce = (p == Phase::Reinforce).then_some((false, e.rule == "ELIM-3"));
            }
            EventKind::Placed { .. } => match &mut reinforce {
                Some(r) => r.0 = true,
                None => return Err("the history places armies outside a reinforce phase".into()),
            },
            &EventKind::CardDrawn { seat, card } => {
                let d = deck
                    .as_mut()
                    .ok_or("the history draws a card before the deck is made")?;
                *d -= 1;
                if card.is_some() && Some(seat) != view.viewer {
                    return Err("the history shows a card another seat drew".into());
                }
                if let Some(c) = card {
                    if min_depth.iter().any(|&(x, _)| x == c) {
                        return Err(format!(
                            "the history draws card {c} sooner than a traded card can come up"
                        ));
                    }
                }
                min_depth.retain_mut(|(_, depth)| {
                    *depth -= 1;
                    *depth > 0
                });
            }
            EventKind::Traded { cards, .. } => {
                let d = deck
                    .as_mut()
                    .ok_or("the history trades a card before the deck is made")?;
                trades += 1;
                for &card in cards {
                    // A card returned later can only push this one deeper, so the bound holds
                    // until draws wear it away.
                    min_depth.retain(|&(x, _)| x != card);
                    if *d > BURIED as i32 {
                        min_depth.push((card, BURIED));
                    }
                    *d += 1;
                }
            }
            _ => {}
        }
    }
    let (Some(deck), Some((seat, n)), Some(phase)) = (deck, turn, phase) else {
        return Err("the history does not start at the game's beginning".into());
    };
    if n != view.turn || seat != view.active {
        return Err("the history does not end at the view's turn".into());
    }
    if phase != view.phase {
        return Err("the history does not end in the view's phase".into());
    }
    if deck != view.deck as i32 {
        return Err("the history's deck size is not the view's".into());
    }
    if trades != view.traded.len() {
        return Err("the history's trades are not the view's".into());
    }
    Ok(PublicRecord {
        round,
        reinforce,
        min_depth,
    })
}

/// A guess at the cards a seat can't see.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hidden {
    /// Every seat's hand, the guessing seat's own included (exactly as its view shows it).
    pub hands: [Hand; MAX_SEATS],
    /// The deck, `deck[0]` its top card.
    pub deck: Deck,
}

fn seat_of(view: &View) -> Seat {
    match (view.viewer, view.hand) {
        (Some(seat), Some(_)) => seat,
        _ => panic!("a world is built from a seat's view, not a spectator's"),
    }
}

/// Why `hidden` can't be the cards `view`'s seat can't see, or None when it can.
pub fn refusal(view: &View, record: &PublicRecord, hidden: &Hidden) -> Option<String> {
    let seat = seat_of(view);
    for s in view.seats.iter() {
        let n = hidden.hands[s.seat as usize].len();
        if n != s.hand_size as usize {
            return Some(format!(
                "the guess gives seat {} {n} cards, not {}",
                s.seat, s.hand_size
            ));
        }
    }
    if Some(hidden.hands[seat as usize]) != view.hand {
        return Some("the guess changes the seat's own hand".into());
    }
    if hidden.deck.len() != view.deck as usize {
        return Some(format!(
            "the guess's deck has {} cards, not {}",
            hidden.deck.len(),
            view.deck
        ));
    }
    let mut seen = 0u64;
    for &card in hidden
        .hands
        .iter()
        .flat_map(|h| h.iter())
        .chain(hidden.deck.iter())
    {
        if card as usize >= FULL_DECK.len() {
            return Some(format!(
                "the guess has a card that isn't in the game: {card}"
            ));
        }
        if seen & 1 << card != 0 {
            return Some(format!("the guess has card {card} twice"));
        }
        seen |= 1 << card;
    }
    for &(card, depth) in &record.min_depth {
        match hidden.deck.iter().position(|&c| c == card) {
            Some(at) if at >= depth as usize => {}
            at => {
                return Some(format!(
                    "card {card} was traded back below the deck's top and can't be {} yet",
                    at.map_or("in a hand".to_string(), |a| format!("at depth {a}"))
                ))
            }
        }
    }
    None
}

/// A guess at the cards `view`'s seat can't see, drawn from `rng`: the unseen cards dealt at
/// random, with a card traded back below the deck's top kept out of reach of the draws since.
pub fn sample_hidden(view: &View, record: &PublicRecord, rng: &mut Rng) -> Hidden {
    let seat = seat_of(view);
    let own = view.hand.expect("a seat's view has its hand");
    let unseen: Vec<Card> = FULL_DECK
        .iter()
        .copied()
        .filter(|c| !own.contains(c))
        .collect();
    let unseen = rng.shuffle(&unseen);

    // The buried cards first, deepest bound first: each later one may go anywhere the earlier ones
    // could, so this finds room whenever there is any.
    let mut deck: Vec<Option<Card>> = vec![None; view.deck as usize];
    let mut buried = record.min_depth.clone();
    buried.sort_by_key(|&(_, depth)| std::cmp::Reverse(depth));
    for &(card, depth) in &buried {
        let free: Vec<usize> = (depth as usize..deck.len())
            .filter(|&i| deck[i].is_none())
            .collect();
        assert!(
            !free.is_empty(),
            "no room in the deck for card {card} below depth {depth}"
        );
        deck[free[(rng.next() * free.len() as f64).floor() as usize]] = Some(card);
    }
    let mut rest = unseen
        .into_iter()
        .filter(|c| !record.min_depth.iter().any(|&(x, _)| x == *c));
    let mut hands = [Hand::new(); MAX_SEATS];
    for s in view.seats.iter() {
        hands[s.seat as usize] = if s.seat == seat {
            own
        } else {
            let mut hand = Hand::new();
            for _ in 0..s.hand_size {
                hand.push(rest.next().expect("the unseen cards fill every hand"));
            }
            hand
        };
    }
    let mut out = Deck::new();
    for slot in deck {
        out.push(slot.unwrap_or_else(|| rest.next().expect("the unseen cards fill the deck")));
    }
    Hidden { hands, deck: out }
}

/// A world for the seat whose `view` this is: its board and public facts exactly the real game's,
/// the cards it can't see as `hidden` guesses them, and dice drawn from `seed`. Panics on a guess
/// the seat's knowledge rules out, or a view the record doesn't match.
pub fn build_world(view: &View, record: &PublicRecord, hidden: &Hidden, seed: &str) -> Game {
    let seat = seat_of(view);
    if let Some(reason) = refusal(view, record, hidden) {
        panic!("not a guess this seat could make: {reason}");
    }
    let players = view.seats.len();
    let mut turn_order = [0; MAX_SEATS];
    turn_order[..players].copy_from_slice(&view.turn_order);
    let mut owner = [0; crate::map::TERRITORY_COUNT];
    let mut armies = [0; crate::map::TERRITORY_COUNT];
    for (t, tv) in view.territories.iter().enumerate() {
        owner[t] = tv.owner;
        armies[t] = tv.armies;
    }
    let mut eliminated = [false; MAX_SEATS];
    for s in view.seats.iter() {
        eliminated[s.seat as usize] = s.eliminated;
    }
    // During a move-in, the seat that lost its last territory is still in the game (`ELIM-3`, note
    // `elimination-order`): the one seat with no territories that isn't out.
    let eliminating = view
        .seats
        .iter()
        .find(|s| s.territories == 0 && !s.eliminated)
        .map(|s| s.seat);
    let game = Game {
        players: players as u8,
        rng: Rng::from_seed(seed).state(),
        turn_order,
        owner,
        armies,
        owned: view.owned,
        hands: hidden.hands,
        deck: hidden.deck,
        trades: view.traded.len() as u32,
        eliminated,
        turn: view.turn,
        round: record.round,
        active: view.active,
        phase: view.phase,
        reinforce: record
            .reinforce
            .map(|(placed_any, after_elimination)| Reinforce {
                armies_to_place: view.armies_to_place,
                placed_any,
                after_elimination,
            }),
        occupying: view.occupying.map(|o| Occupying {
            from: o.from,
            to: o.to,
            min: o.min,
            max: o.max,
            eliminating,
        }),
        captured_this_turn: view.card_earned,
        winner: view.winner,
    };
    assert!(
        game.view(Some(seat), &view.traded) == *view,
        "a world built from this view doesn't show it back: the view and history disagree"
    );
    game
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bots::bot;
    use crate::runner::drive;

    /// Every decision of a few native games: the world built from the seat's view and a sampled
    /// guess shows the view back, and its guesses are always ones the seat could make.
    #[test]
    fn worlds_show_their_view_back_at_every_decision() {
        for (seed, labels) in [
            ("sim-1", ["greedy", "gd-aggressive", "gd-stacker", "greedy"]),
            (
                "sim-2",
                ["gd-defensive", "greedy", "gd-continental", "gd-aggressive"],
            ),
        ] {
            let bots: Vec<_> = labels.iter().map(|l| bot(l).unwrap()).collect();
            let mut checked = 0;
            drive(
                seed,
                labels.len(),
                300,
                |decision, input| {
                    let record = read_history(input.view, input.history)?;
                    let mut rng = Rng::from_seed(&format!("guess-{decision}"));
                    let hidden = sample_hidden(input.view, &record, &mut rng);
                    if let Some(r) = refusal(input.view, &record, &hidden) {
                        return Err(r);
                    }
                    let world = build_world(input.view, &record, &hidden, "dice");
                    assert_eq!(world.options(input.seat), Some(*input.options));
                    checked += 1;
                    Ok(bots[input.seat as usize].decide(input))
                },
                |_| {},
            )
            .unwrap();
            assert!(checked > 100);
        }
    }

    #[test]
    fn a_traded_card_is_never_guessed_within_reach() {
        let record = PublicRecord {
            round: 3,
            reinforce: None,
            min_depth: vec![(5, 3), (7, 2)],
        };
        let (game, _) = crate::engine::new_game(4, "buried");
        let view = game.view(Some(game.active), &[]);
        for n in 0..200 {
            let hidden = sample_hidden(&view, &record, &mut Rng::from_seed(&n.to_string()));
            assert_eq!(refusal(&view, &record, &hidden), None);
            assert!(hidden.deck.iter().position(|&c| c == 5).unwrap() >= 3);
            assert!(hidden.deck.iter().position(|&c| c == 7).unwrap() >= 2);
        }
    }
}
