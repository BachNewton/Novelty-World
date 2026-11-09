# The racing line drawn on the road

An idea the owner raised after racing the AI racers, not yet a project decision: no direction chosen, nothing built.

## What it is

Forza Horizon draws a race's ideal line on the road ahead of the player's car, coloured by what to do on it: green where to accelerate, red where to brake, with the shade saying how hard. The player chooses none, the full line, or the braking parts only. Åland Drive would do the same for a race's route, and for a challenge's.

## Why it fits here

- **The line exists already.** The racers drive a minimum-curvature racing line inside the laid road's edges with a speed plan along it, by surface and condition, from the car's measured limits (`racers/CLAUDE.md`): the line a player would be shown is the very line the racers follow, and the plan's speeds say where to brake and where to accelerate.
- **It doubles as the racers' debugging view.** Today the racers' line and plan are read in the vetting tool's traces. Drawn on the road, a racer's mistake shows in play: a car leaving its own line, braking late against its own plan, cutting where the line doesn't.
- **It is a player's own choice**, kept per browser like the other settings, so a player who wants the road bare has it bare.

## What is undecided

- **Whose line.** The racing line is drawn for a car's width and its plan for that car's grip; the player's car may differ from the racers'. The line could be drawn for the player's car (the file holds the corridor, so the line and plan are a few milliseconds' arithmetic on the page) or be the race's one line for every car.
- **How it is drawn.** A ribbon on the road ahead, a few car lengths, fading with distance; its colour from the plan's braking and pull between here and the next samples. Whether it is a mesh rebuilt as the car moves or a decal the ground shader reads is a rendering question for `render/CLAUDE.md`'s rules (nothing compiled mid-drive, counts not times).
- **Challenges too, or races only.** A challenge's route has the same corridor; its line would be drawn the same way.
- **The cut corners.** Where a player would cut across the grass into a turn the race doesn't pin (`ideas/races.md`, section 7), the drawn line keeps to the road, and shows the player a slower way than they'd take. The per-track ruling on those corners comes first.
