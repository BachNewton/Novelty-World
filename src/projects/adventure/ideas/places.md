# Places the player defines

An idea, not a plan: nothing here is decided.

Every placed piece already belongs to one place: a named grouping, today the constant in `town.ts` that places it (`INN`, `TOWN_WALL`), with pieces added in the map editor going into `PLACED`. A place is only a label now: the ~ overlay floats its name over the area, and the map's file groups its pieces by it so an edited map maps back onto the code.

The idea is to make places something the player works with when building a map at the macro level:

- **Defining them:** the player makes a place, names it, and puts pieces into it (or takes them out), rather than places coming only from the code.
- **Moving one whole:** select a place and move it, turn it or delete it as one, all its pieces together, so a building or a garden is laid out and then shifted as a unit.

Things to settle when it is built:

- How a place is selected: from a list, by clicking any of its pieces with a modifier, or both.
- Turning a place a quarter turns every piece about one point (the place's middle, or a point the player picks), which moves each piece's cell as well as its own turn.
- Whether a place can hold another (a house within a street), or places stay flat.
- Whether the code's places stay fixed by the code or become ordinary places the player can change, and what saving does to the code's own grouping.
