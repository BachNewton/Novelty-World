/** Words that open a character's name as a title, never what they are called by. */
const TITLES = new Set(["Father", "Professor", "Madame"]);

/** What a character is called by on a nameplate: the card's nickname where it has one ("Flash"), the surname after a
 *  title ("Rhinehardt"), otherwise the first name ("Zoe"). */
export function shortName(name: string): string {
  const nickname = /"([^"]+)"/.exec(name);
  if (nickname) return nickname[1];
  const words = name.split(" ");
  return TITLES.has(words[0]) ? words[words.length - 1] : words[0];
}
