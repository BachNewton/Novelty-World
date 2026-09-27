# Research tools to consider

Tools that could make family-tree research faster or reach sources it can't today. Each entry says what it unlocks and what it takes. Free tiers and site access change, so check them at setup time. The owner uses free options only.

Ranked by usefulness first, then by how easy it is to set up.

| # | Tool | What it unlocks | Setup | Cost |
|---|---|---|---|---|
| 1 | **Own search API behind an MCP server** (Brave Search or Tavily) | Parallel agents stop running out of the built-in web search, whose limits are undocumented and appear to be shared by every agent in a session. Brave and Tavily both publish ready-made MCP servers, so every agent gets it as a normal tool. Keep built-in search as the fallback. | Easy: free account and API key, key in `.env.local`, one `claude mcp add`. | Free tier |
| 2 | **Shared search cache and a budget for each round** | Agents don't repeat each other's queries, and a round can't burn the whole budget halfway through. Works with any search provider. | Easy: a small wrapper that caches results in `research/`. | Free |
| 3 | **FamilySearch in the owner's browser** | The richest free source (census, vital records, obituary indexes) needs a login. Research agents use the Chrome DevTools MCP directly, each in its own tab (every call targets a page by id), so they can run in parallel. | Done: a convention in `sources.md`. Register images: see the download switch below. | Free |
| 4 | **Chronicling America API** (Library of Congress) | Full-text search of digitized US newspapers up to 1963: older obituaries, marriage notices, arrivals. | Easy: open API, no key. | Free |
| 5 | **Internet Archive full-text search** | City directories, yearbooks and county histories, which place a person in a year and at an address with a household. | Easy: open API, no key. | Free |
| 6 | **Finnish archives**: Astia (National Archives), HisKi, SSHY's free images, the Institute of Migration emigrant register's name search, digi.kansalliskirjasto.fi newspapers (Finnish to 1939, Finnish-American to 1923) | Finnish lines: births, emigration, parish moves, emigrant newspapers. | Easy: all free online without a login for records over 100 years old (see `sources.md`). | Free |
| 7 | **MyHeritage free account** | Record search results and some free collections (such as the SSDI). Most full records are paid, but the results alone often confirm a fact. | Easy: free account, used through the browser. | Free |
| 8 | **WikiTree API** | Other people's research on the same families. Gives leads only, never confirmation. | Easy: open API, no key. | Free |
| 9 | **Free in-person access in Helsinki**: the Genealogical Society library and the FamilySearch center | Member-only Finnish indexes, and premium US sites (MyHeritage, often Ancestry) on their computers. Helmet libraries themselves offer no genealogy database. | Medium: a visit (the FamilySearch center by appointment). | Free |
| 10 | **Headless browsers with a saved login** (Playwright) | Several FamilySearch sessions at once. Faster than the queue, but FamilySearch's terms discourage automated scraping and heavy use could get the account flagged. Only if the queue proves too slow. | Medium to hard. | Free |

## Planned: register images through FamilySearch's Download button

Not yet set up.

**Why.** Reading a handwritten register image is the slowest part of
research. The film viewer shows a small part of the page at a time, so
agents zoom, pan, screenshot and stitch, and several have reached for
FamilySearch's internal image endpoints to skip that, which the owner's
rules forbid. The viewer's own Download button gives the full-resolution
scan, but in the owner's Chrome it opens a Save dialog agents can't answer,
and the owner keeps "Ask where to save each file" on by choice. The Chrome
DevTools MCP has no download option, and a Chrome setting would apply to the
whole browser.

**Chosen: a download switch for research sessions.** The owner prefers
the simplest route: a small PowerShell script run once before a research
round (`on`) and once after it (`off`).

- `on` sets two Chrome policies for the owner's Windows user in the
  registry (no admin needed): `PromptForDownloadLocation` off, and
  `DownloadDirectory` pointing at a research temp folder. `off` deletes both
  values, so Chrome goes back to the owner's own settings.
- Chrome re-reads policies within minutes. "Reload policies" on
  `chrome://policy` applies them at once and shows whether they took. Check
  on the first run that Chrome honours these two as user-level policies.
- While it is on, it covers the whole browser: the owner's own downloads
  also go silently to the temp folder, and Chrome shows "Managed by your
  organization". That's acceptable for the length of a round.
- The research skill then reads register images by clicking the viewer's
  Download button, waiting for the PDF to land in the temp folder, and
  extracting the image with `pypdf`. The skill tells the owner to switch it
  on before a round that needs images, and off afterwards.

**Alternative, not chosen: a research-only Chrome.** Heavier to set up, but
it also isolates agents from the owner's sessions:

- The project's Chrome DevTools MCP launches its own Chrome with a dedicated
  profile folder (`--userDataDir`) instead of attaching to the owner's
  (`--autoConnect`). It stays registered at local scope, per the owner's
  rules.
- The owner signs into FamilySearch in that Chrome once; the profile keeps
  the login. Nothing else is signed in there.
- That profile saves downloads without asking, to a temp folder agents read
  from. The owner's own Chrome keeps asking.
- The owner's global instructions currently say "always `--autoConnect`,
  never `--user-data-dir`", because that recipe gives a profile signed into
  nothing. This is a deliberate exception for a profile signed into
  FamilySearch only, and those instructions get updated with it (a chezmoi
  change).

What the alternative adds over the switch:

- Agents never reach the owner's email, work and payment sessions.
- No "allow debugging" prompt per agent process, and no remote debugging to
  switch on and off in the owner's browser.
- Probably fewer permission-check refusals, which so far came from driving
  the owner's real browser.

**Still needed either way:** a tested screenshot recipe and a small stitching
tool, for films whose Download button is disabled for contract reasons. The
research skill then lists the download route first and the screenshot
recipe as the fallback.

## Asking family

Human answers are the last resort, not a primary source: people take time to reply. Research exhausts the digital sources first. Questions for family are collected over a round and sent together, using a Google Form the owner sends out. Research moves on to other families while answers are pending.
