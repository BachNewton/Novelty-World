# Tradeoffs

Decisions where sound reasons pull opposite ways. Each names the forces on each side and the goal that tips them. The playbook settles none of them: a game settles each by its own goals and records the choice and its reason in its own `CLAUDE.md`.

- **WebGPU or WebGL.** WebGPU brings compute, indirect draws and the path the renderer is developing, and a newer, stricter set of traps. WebGL reaches more devices and its traps are better known. *Tips on:* whether the game needs compute-driven scale, and how old a device it must reach.

- **Built in code, or assembled from asset packs.** Code-built art is fully controlled, consistent and changeable, and costs build and review time for every piece. Packs give breadth at once, with someone else's style, units and quirks, and gaps nobody will fill. *Tips on:* how identifiable a look the game needs, and how many distinct things its world holds.

- **Baked or live lighting.** Baking moves cost from every frame to load time, allows many lights and adds no recompiles, but cannot follow what moves. Live lighting follows everything, at a frame cost per light. *Tips on:* how much of the scene moves, and whether light itself changes (time of day, carried lights).

- **Where the look comes from.** One physical light model with the art direction applied by the camera (exposure, tone mapping, a final grade) stays consistent as conditions change. Per-surface artistry gives direct control and drifts apart under changing light. *Tips on:* whether light changes over play. If it doesn't, per-surface control costs less.

- **Native resolution or a lowered render scale.** Lowering it is the biggest single lever on fill cost, and reads soft. Native reads crisp, and costs fill on dense, high-ratio screens. *Tips on:* the floor device and how much of the look is fine detail.

- **Optimise early or late.** Decisions that shape the architecture (streaming, how systems scale, the pipeline count) are cheap early and costly to retrofit. Local optimisation before a real device shows a problem spends effort on the wrong cost. *Tips on:* whether the choice is structural or local.

- **Real 3D collision or simple footprints.** Footprints are cheap and predictable, but block air beside long objects and make hollow things solid. Real collision handles anything, at a cost in complexity and frame time. *Tips on:* whether play ever goes over, under or inside things. A player who sees a thing expects to stand on it, jump onto it and walk under it, and every rule added to footprints to allow one of those (outlines sliced at a height, a whitelist of what can be stood on) breaks on the next case: pieces stacked, a basin's rim, a fence jumped onto. Once play goes over things, a physics engine with stand-in shapes measured from the art (see the platform facts on colliders) is the simpler system.

- **A kinematic character controller or a dynamic body.** A kinematic controller moves exactly as the game asks, frame by frame, with no mass, momentum or solver to fight: game feel is written directly, and the world never pushes the character. It is an infinite mass to anything dynamic, so it shoves light bodies about. A dynamic body has a real mass: its weight rocks what it stands on and a push is shared, and it rides a moving deck by contact, but its walking is steered through velocities, and walls and corners need handling the solver won't give. *Tips on:* whether the character stands on, or pushes against, things the physics moves. A world of static scenery wants the controller.

- **Fixed-step simulation or frame-driven updates.** A fixed step gives determinism, exact replays and rollback, at the cost of interpolating every drawn motion. Frame-driven updates are simpler, but tie results to frame rate. *Tips on:* whether the game is real-time, networked or replayed.

- **Switches.** A live switch per system makes costs measurable by turning one thing off at a time. Product options multiply the states that must work and be tested. *Tips on:* who the switch is for. A measuring switch can live in development only, while the game ships what it is.

- **Who tunes feel.** Claude proposing values, judged by the owner from the result, keeps the owner out of the knobs. Live sliders let the owner find a feel they can't put into words. *Tips on:* whether the owner can judge from a result or needs to search by hand. Ask when unsure.
