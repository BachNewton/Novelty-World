# Open questions

What isn't known yet, and what would settle it. A game that settles one moves the answer into the right file and deletes the question.

- **Which costs measured on WebGL hold on WebGPU.** Several platform facts about multisampling, depth writes from a full-screen pass, render statistics and per-object cost were measured under WebGL. Settled by repeating each measurement under the WebGPU renderer with the same counting tools.

- **What a phone floor really costs.** Performance has mostly been measured on desktop integrated and discrete GPUs, while some games' floor is a phone. Settled by measuring a game's frame on its floor phone, and keeping a quality profile per device class only once two classes are shown to need different settings.

- **What colliding with stand-in shapes costs a frame.** A town of several thousand static stand-ins costs a couple of character-controller sweeps and a ray a frame for each player, and a ray for each thing stood again when the colliders change; what that costs in time on the floor device hasn't been measured. Settled by pricing the controller's moves the way a frame's parts are priced, in alternated pairs on the floor device.
