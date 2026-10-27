# Whisker Hollow

A cozy co-op hunt, made for Elliott (who loves cats) and Sonja (who loves rats). Inspired by the feel of *Librarian: Tidy Up the Arcane Library!*: wander a cosy, cluttered place, pick things up, and put them where they belong. Here the things are animals: an island is heaped with every sort of junk, every animal pair's two animals are hidden apart among it, and the players find both and carry them home.

It is a busy-hands game, not a puzzle game, and a long one: a grind over many evenings, played while chatting over tea. Nothing is timed and nothing fails.

Claude owns the art direction and the level design (choosing and placing the assets); the owner playtests and reviews.

## Decided

- **The hunt.** Every pair has a home: a basket on a cushion, with a picture frame on a post showing the pair's two animals. The picture is the clue: it tells players whom to look for. Both animals of every pair start hidden, far apart, tucked against the junk. A player carries one at a time: at its own home it stays, at another pair's home it stays in their arms, anywhere else it waits where it was put down. Once both are home, whoever brought the second names the pair.
- **The cast is every handheld animal Poly by Google made**, each model its own pair: two of that model. Where Poly made the same animal twice as two files, the two files are the pair. Ten dogs are ten pairs, which is part of the challenge.
- **It ends.** The hunt is over once every pair is home and named; nothing new arrives.
- **The island.** One island with three areas: a storm-wrecked beach round the shore and in the south, grandpa's backyard in the middle, and a wizard's castle courtyard in the north. Each area has a village of homes, a grid of baskets with their pictures, and similar animals live side by side (all the dogs down one lane): the beach village holds the sea, shore and water animals, the castle village the owls, bats, birds of prey, creepy-crawlies and exotic animals, the backyard village the pets, farm and garden animals. Every other model is junk, each used once: the landmarks are placed by hand, big pieces stand anywhere there's room, and the rest heap up in their own area, with a share washing up in another for surprises. The layout is worked out from a seed, so every player has the same island.
- **One shared world, saved as it changes.** No lobby and no rooms to pick: opening the page joins the one world. Whoever arrives first hosts it (the relay's `claim` mode); when the host leaves, a guest takes over with the world it already has. Solo play is the same world with one player in it.
- **The host is authoritative.** Guests send intents (pick up, put down, name) and the host applies them with the pure rules in `world.ts`, then sends the whole world down. Player positions travel separately and often; they are not saved.
- **Saving.** The host writes the world to Supabase (`supabase/whisker-hollow.sql`, through `/api/whisker-hollow`) after every change, one write in flight and only the newest waiting. `?save=local` keeps it in this browser instead (e2e and offline dev).
- **Saves break freely while the game is in development.** No code keeps an old save or an old stored look readable: when their shape changes, the stale save is deleted. That holds until the owner says the game is released.
- **Players are human caretakers** (Quaternius's "Character Animated", about 1.5 m). A player picks a shirt, a hair and a skin colour from a few cozy choices. A caretaker bends down (the model's PickUp) to pick an animal up and to put one down, as everyone sees it: the bend is played from the world's change, not the button. A carried animal is cradled across both arms at the belly, the arms posed in code over the walk and idle.
- **Animals don't move.** They are Poly by Google's still models: they sit where they are, are carried, and sit on their cushion.
- **Naming.** Always the players' own: the card starts empty and suggests nothing, because inventing names is the fun. Typing needs a keyboard, even for a controller player. The album shows every pair: found ones with their name and who named them, the rest as a question mark.
- **Controls.** Keyboard and mouse, and a controller (the shared gamepad library). No touch, no phone layout: this is a desktop game.
- **A loose mouse is for menus, never for playing.** The mouse plays only under pointer lock (asked for with raw mouse input, through the shared `lockPointer`): a click on the island locks it, and while locked it looks round (yaw, and pitch within limits), the wheel zooms, and its buttons never interact: only Space (the controller's A) picks up and puts down. Unlocked, it never moves the camera or the player. The keys (WASD, Space) and the controller play whether or not the pointer is locked.
- **Cards free the mouse; closing one locks it again.** The album, the naming card (also when it opens by itself) and the look picker let the pointer go; closing a card locks it again in the same click or key press. There is never a "click to play" card. A lock the browser refuses is let go quietly, and the next click locks.
- **Esc is the browser's, and a lost lock pauses.** Losing the lock while no card is open opens the pause menu: Resume, the album, a new look. The controller's Menu button opens it too. The album and the look are reached only from there.
- **Two cameras.** Third person orbits behind and above the caretaker, who turns to face their walk; first person looks from their eyes, the body hidden, what they carry shown low in the view. V (or the right stick's click) switches; the wheel (or the d-pad) only zooms the third-person camera.
- **Rendering.** Plain three.js on `WebGPURenderer` (`three/webgpu`), which falls back to WebGL2 by itself. No React Three Fiber: React draws only the overlay UI. The sun's shadows are drawn round the player and follow them.

## Code map

- `types.ts`: animals and where they are, pairs home, the saved world, and a player's look and avatar.
- `cast.ts`: the pairs, from the model manifest (a pair is a model, or a model and its duplicate file), and each model's height.
- `level.ts`: the island, pure and seeded: its shape and areas, the landmarks, the junk's placing, the villages of homes grouped by kind of animal, the hiding spots, and which home a point is on.
- `world.ts`: the rules, pure: a new world with every animal hidden and partners far apart, picking up, putting down (home, wrong home, or on the ground), naming, the hunt's end, and putting down what an absent player carried.
- `movement.ts`: walking, pure: speed, sliding round junk and baskets, staying on the island, the spot in front of a player, turning.
- `parse.ts`: checking a world or an avatar that comes off the wire or out of a save.
- `protocol.ts`: the co-op messages, the one world's id (`?world=` names another, for tests and dev) and the moment a pair is home together.
- `save.ts`: where the host keeps the world, and the saver that keeps one write in flight.
- `session.ts`: one visit to the island on the relay's `claim` room: hosting, joining, taking over from a host who left, and players' positions.
- `caretaker.ts`: the colours a caretaker can take. `look.ts`: this player's look, kept in this browser.
- `camera.ts`: the two cameras, pure. `input.ts`: keyboard, mouse and controller into movement, the look and actions, the pointer lock, and the bindings the prompts show.
- `credits.ts`: the caretaker's credit and every Poly by Google model's, from the manifest.
- `models/`: the Poly by Google models (see Models), and `heights.ts`, the height in metres each stands at.
- `scene/`: the drawing. `assets.ts` loads every model and copies one at a height; `poses.ts` plays the caretaker's idle or walk with one-shots over it; `caretaker.ts` is a player, bending and cradling; `island-view.ts` builds the ground, the sea, the junk and the homes; `portraits.ts` renders each home's picture once the renderer is ready; `game-scene.ts` is the frame loop: the player, the camera, the animals wherever they are, other players, name tags, hearts, and what interact would do.
- `components/`: the React overlay. `whisker-hollow.tsx` is the root (the look picker on a first visit), `game.tsx` the island with its prompt, badges and cards, and where the pointer lock is taken and given back; `look-picker.tsx`, `name-card.tsx`, `album.tsx`, `pause-menu.tsx` and `card.tsx` the cards.

## Models

- The animals and junk are Poly by Google models from poly.pizza (CC-BY 3.0). `models/selection.json` is the list of them, and the source of truth: an id, title, kind (animal or junk), category, the file it duplicates (two files of one animal make a pair) and its poly.pizza page and GLB.
- `tools/build-poly-models.ts` (`npm run whisker:models`) downloads each into a cache outside the repo and writes a web-ready copy to `public/whisker-hollow/poly/<id>.glb`: standing on the ground, centred on its footprint, exactly 1 tall, facing whichever way its artist made it; meshes joined and flattened, textures at most 512² WebP, geometry meshopt-compressed (the loader needs three's `MeshoptDecoder`). It also generates `models/poly-models.ts`, the plain-data manifest that the rules, scene and credits import. Never edit the manifest or the outputs by hand.
- To add a model, add its entry to the selection, give it a height in `models/heights.ts`, and rerun the tool; `--only <id>,…` rebuilds just those files without touching the manifest. Its credit follows from the manifest.
- Height 1 means little for flat things (rugs, records, coins, a kite): their footprints run to tens or hundreds. Heights are judged per model.

## Developing and testing

- `?overview` looks down on the whole island, for laying it out.
- `?world=<id>&save=local` plays a world of your own, kept in this browser, so the shared island is untouched.
- The page exposes a read-only probe, `window.__whiskerHollow` (frames drawn, the player's position and heading, what interact would do, the camera, whether the pointer is locked, the world), which `e2e/whisker-hollow.spec.ts` walks the island by. Its host starts from a saved world with one pair waiting by the spawn, near their home, so the walks are short.
- The test browser has no GPU, so it draws the island in software, slowly; the e2e viewport is small for that reason.

## Known gaps

To come back to; the game plays without them.

- **Collision is circles, not shapes.** Each piece of junk blocks a circle (three quarters of half its widest side, so long things like cars, benches and fences block empty air beside them), anything under about 45 cm is walked through, and hollow things (the castle, the barn, gazebos) are solid. The plan when this is picked up: the model tool slices each model's real triangles at body height (about 0.1 to 1.6 m), flattens the slice into a 2D outline stored beside the model, and walking slides round outlines. That lets a tree block only its trunk, an arch or a gate let a player through, and hiding spots tuck against real shapes, at no cost while playing. Full 3D collision (a spatial index on the meshes, or a physics engine) only pays if players ever climb or go upstairs.
- **Some models' scale is off.** `models/heights.ts` was judged from titles and bounding boxes, with only a few previews checked, so some models stand at the wrong size; flat animals (butterflies, centipedes, worms) came out wide, and some dioramas' sizes were guesses. It needs a pass in the game, model by model.
- **Some animals lie on their sides.** Poly by Google made some animal models lying down or tipped over, and the model tool keeps each model's pose as its artist made it, so those animals sit sideways in the world and in their pictures. Each needs its own turn to stand it up, baked in by the model tool, and its height judged again once it stands. Separately, the models don't agree on which way is forward (about 27 animals face along x rather than z), which matters wherever an animal should face something.
- **Some models are scenes, not props.** Poly by Google made some models as whole dioramas: the farms, the islands, the beach scenes, the garden, the cemetery scene, the lighthouse scene, and the rooms (Room, Bathroom, Kitchen, Bedroom, Closet). Standing on the island as single pieces they look out of place, or read as somewhere a player should be able to go inside and explore. Either they leave the junk, or they become places of their own to enter.

## Open questions

- Music: lo-fi, written in ZzFXM, later.
- Performance on the owner's machine with every model on the island at once; loading is all up front.
- Hiding spots that tidying uncovers (the *Librarian* half of the idea).
