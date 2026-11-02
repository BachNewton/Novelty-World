# A work score for the GPU

An idea, not a plan: nothing is built or scheduled, and no phase depends on it.

## The problem

The repo's speed rule says a change is judged by counting work, never by a time taken on the owner's laptop, which is always busy with other work. The game counts draw calls and triangles, and `tools/forest-count.mjs` and `tools/forest-pop.mjs --cost` compare them at fixed views. Those counts miss what each pixel costs: a change that keeps the triangles but makes shading heavier, or covers more of the screen with overlapping layers, reads as no change. That is likely where dense small things such as grass, bushes and reeds spend most of their cost.

## The idea

One score per frame, at the fixed views the count tools already use, made of two parts multiplied together:

- **How much is drawn.** A counting render of the same frame tallies the pixels each kind of object shades, overdraw included, and the vertices it processes. This is the game's own count: exact, the same on every run, and needing no outside tool.
- **What each one costs.** The instruction count of each shader as compiled for a real GPU, from AMD's Radeon GPU Analyzer. It compiles offline for AMD chips on any machine and runs from the command line. The shaders reach it by way of the WGSL three.js generates.

Pixels times the fragment shader's instructions, plus vertices times the vertex shader's, gives the work in a frame. It is unmoved by load because nothing in it is timed. A before-and-after comparison of a change then reads like the triangle counts do now.

## Why these tools

- The industry mostly times its games, but on quiet, dedicated machines with fixed clocks. Counts are what's left without one, which is the situation here.
- WebGPU itself reports only times. Its spec once had exact counters for pixels shaded and the like, but they were dropped, hence the game's own counting render.
- One vendor's instruction counts work as a fixed yardstick: a shader that gets cheaper on AMD almost always gets cheaper on Nvidia, because the work comes from the shader itself. Nvidia has no public offline compiler for game shaders; its Nsight Graphics shows a captured frame's instructions on an Nvidia card.
- Microsoft's PIX can capture a frame from Chrome, which draws WebGPU through DirectX 12 on Windows, and its exact pixel and vertex counts are the occasional check that the counting render is right.

## What it can't see

Memory traffic (texture reads, the size of what is drawn into) and how well the GPU overlaps its work. A change whose effect lives there is reported as one counts can't settle, and only a time on a quiet machine can answer it.

## Open questions

- Is the score shared by every WebGPU project in `src/shared/`, or kept in Åland Drive until a second game needs it?
- Does a change that raises the score past some margin fail a check, or is the score only reported?
- Mali and Adreno's offline compilers give the same cost per shader for phone GPUs, which matters once phones are a target: is that a second score, or a second column?
