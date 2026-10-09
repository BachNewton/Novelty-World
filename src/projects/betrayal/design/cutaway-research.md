# Cutaway research

How other games show the inside of a building from above, gathered to decide how the house's cut walls carry what a wall means to the rules (doors, false doors, windows, secret passages). The evidence is mostly player forums, manuals and reviews; there are few developer talks. The proposals it led to are in `presentation.md` ("Walls under the cutaway").

## What other games do

- **The Sims 4:** walls up, cutaway or down. In cutaway, interior walls drop to a line; wall objects vanish with their wall; half walls never cut. Players asked for a "peekaboo" mode that keeps the walls opposite the camera up. Doors only show with the walls up. <https://forums.ea.com/discussions/the-sims-4-gameplay-en/inner-walls-wont-cut-away-anymore/8694620>
- **Jagged Alliance 3:** walls turn see-through by shader, with Ctrl+H to hide them while held. Players: "distorts the image in a bad way"; "hard to see if there is an opening in the wall, when we see no wall". <https://steamcommunity.com/app/1084160/discussions/0/3807282847933646201/>
- **Baldur's Gate 3:** walls, roofs and stairs fade around the party. Players found it disorienting: false holes, stairs and floors popping, and a slow cut in corridors. <https://steamcommunity.com/app/1086940/discussions/0/3811785047377002290>
- **Divinity: Original Sin:** a fixed camera hid chests, hatches and stairs; the fix was holding ALT to outline everything interactable. <https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=489086>
- **A hobby isometric game:** walls cut to a stub with a dashed outline beat see-through glass in a playtest. Weak evidence. <https://github.com/thepoeticheartishope/DungeonCrawler/pull/90>
- **Game Developer, "The Curse of the Camera":** don't draw the walls that hide things, or make them semi-transparent, and outline hidden characters. <https://www.gamedeveloper.com/design/the-curse-of-the-camera>
- **XCOM 2:** rule facts go on icons (half and full cover shields, a warning that breaking glass makes noise), not on geometry. <https://www.feralinteractive.com/en/manual/xcom2/latest/steam/>
- **XCOM floors:** changed with keys or the wheel; players complained of the cursor snapping to the ground floor and roofs blocking the view. <https://steamcommunity.com/app/200510/discussions/0/792923683670203120/>
- **inZOI:** hides upper floors automatically and resets a floor the player chose; players wanted it off. <https://forum.playinzoi.com/t/topic/6261>
- **The Sims Mobile:** explicit floor up and down buttons.
- **XCOM on iOS:** tap to pick, tap again to confirm; camera and move gestures got confused, and a finger drifting while confirming changed the target. <http://www.appspy.com/review/7551/xcom-enemy-unknown/>
- **Prison Architect Mobile:** tablets only, with the UI rebuilt for touch.

## What it suggests

- Stay with cutting walls to a stub; see-through and fading walls confuse players about where the openings are.
- Offer a hold-to-raise-walls control (a key, a pad button, a touch button) for a full look.
- Floor changes belong to the player: explicit, never reset by the game behind their back.
- On touch, tap once to focus and again to confirm.
- Put rule facts on the stub, the floor or an icon, not on geometry that the cut removes: a strip and frame on the stub's cap for a window, plus a pool of window light on the floor; a lit threshold strip for a door; a false door as an outline on an unbroken stub; markers for secret passages and switches; a destination-floor icon on stairs.
- Keep the 45 cm stub (a 1 m stub hides about a fifth of a room's floor at a 40° view) and give its cap a colour of its own.
- Add hysteresis and a short fade to the cut, so walls don't flicker as the camera moves.
