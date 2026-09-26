# Research tools to consider

Tools that could make family-tree research faster or reach sources it can't today. Nothing here is set up yet; each entry says what it unlocks and what it takes. Free tiers and site access change, so check them at setup time.

Ranked by usefulness first, then by how easy it is to set up.

| # | Tool | What it unlocks | Setup | Cost |
|---|---|---|---|---|
| 1 | **Own search API behind an MCP server** (Brave Search or Tavily) | Parallel agents stop running out of the built-in web search, whose limits are undocumented and appear to be shared by every agent in a session. Brave and Tavily both publish ready-made MCP servers, so every agent gets it as a normal tool. Keep built-in search as the fallback. | Easy: free account and API key, key in `.env.local`, one `claude mcp add`. | Free tier |
| 2 | **Shared search cache and a budget for each round** | Agents don't repeat each other's queries, and a round can't burn the whole budget halfway through. Works with any search provider. | Easy: a small wrapper that caches results in `research/`. | Free |
| 3 | **FamilySearch through one queue agent** | The richest free source (census, vital records, obituary indexes) needs a login, and the Chrome DevTools MCP drives one browser. One agent works through a queue of lookups that the other agents send it, instead of all of them fighting over the browser. | Medium: a workflow convention, no new accounts. | Free |
| 4 | **Chronicling America API** (Library of Congress) | Full-text search of digitized US newspapers up to 1963: older obituaries, marriage notices, arrivals. | Easy: open API, no key. | Free |
| 5 | **Internet Archive full-text search** | City directories, yearbooks and county histories, which place a person in a year and at an address with a household. | Easy: open API, no key. | Free |
| 6 | **Finnish archives**: Astia (National Archives), SSHY parish registers, HisKi, the Institute of Migration emigrant register, digi.kansalliskirjasto.fi newspapers | Finnish lines: births, emigration, parish moves. Useful when heritage research reaches Finland. | Medium: an Astia account, and SSHY membership for the member-only registers. | Free, SSHY membership cheap |
| 7 | **MyHeritage free account** | Record search results and some free collections (such as the SSDI). Most full records are paid, but the results alone often confirm a fact. | Easy: free account, used through the browser. | Free |
| 8 | **WikiTree API** | Other people's research on the same families. Gives leads only, never confirmation. | Easy: open API, no key. | Free |
| 9 | **Helmet library card** (Helsinki) | Possibly Ancestry Library Edition or newspaper archives on library computers. Unconfirmed; ask at the library. | Medium: a visit. | Free |
| 10 | **Headless browsers with a saved login** (Playwright) | Several FamilySearch sessions at once. Faster than the queue, but FamilySearch's terms discourage automated scraping and heavy use could get the account flagged. Only if the queue proves too slow. | Medium to hard. | Free |
| 11 | **Newspapers.com or Ancestry, one month** | The best obituary archive and the biggest record set. Worth it timed to a focused research round, if the free sources stall. | Easy. | Paid |

## Asking family

Human answers are the last resort, not a primary source: people take time to reply. Research exhausts the digital sources first. Questions for family are collected over a round and sent together, using a Google Form the owner sends out. Research moves on to other families while answers are pending.
