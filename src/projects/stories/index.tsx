import cover from "./citizens-of-the-federation/book/cover.png";
import { THEME } from "./citizens-of-the-federation/theme";
import { world } from "./citizens-of-the-federation/world";
import { StoryGuide } from "./guide/story-guide";

export function CitizensOfTheFederation() {
  return <StoryGuide title="Citizens of the Federation" world={world} theme={THEME} cover={cover} />;
}
