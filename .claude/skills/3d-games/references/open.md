# Open questions

What isn't known yet, and what would settle it. A game that settles one moves the answer into the right file and deletes the question.

- **Which costs measured on WebGL hold on WebGPU.** Several platform facts about multisampling, depth writes from a full-screen pass, render statistics and per-object cost were measured under WebGL. Settled by repeating each measurement under the WebGPU renderer with the same counting tools.

- **What a phone floor really costs.** Performance has mostly been measured on desktop integrated and discrete GPUs, while some games' floor is a phone. Settled by measuring a game's frame on its floor phone, and keeping a quality profile per device class only once two classes are shown to need different settings.

- **How collision should grow beyond footprints.** Slicing each model at body height into outlines, offline, is reasoned as the cheapest step up from circles. Settled by the first game whose play needs it, measured against a physics engine on the same scene.
