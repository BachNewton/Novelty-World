# Sources

Each source: what it is good for, how to search and cite it, and how to reach
it. Rewrite an entry whenever a source stops behaving as described. A citation
in the tree row must be public-safe (see "The research record" in
`SKILL.md`); the full URL goes in the research log.

## Tools

- **WebSearch / WebFetch**: obituaries, grave records, funeral homes, public
  indexes. The WebSearch budget is shared by every agent running at once and
  runs out; plan queries per family, not per person, and log who was never
  searched so a later round picks them up. Direct fetches of Google, Bing,
  DuckDuckGo and similar get CAPTCHA or consent walls.
- **Chrome DevTools MCP** (`mcp__chrome-devtools__*`): drives the owner's own
  Chrome, with their logins. Use it for login-gated or JavaScript-heavy sites
  (FamilySearch) and for sites that return 403 to WebFetch.

## FamilySearch

The strongest source. Needs a login: use the Chrome DevTools MCP with the
owner's session. Record pages are `familysearch.org/ark:/61903/<id>`; cite as
"FamilySearch 1:1:XXXX-XXX".

Collections that worked:

- **1940 and 1950 US censuses**: households, ages, birthplaces. Anchors a
  whole family at once.
- **Earlier censuses (1880–1930)**: birthplace, parents' birthplaces,
  immigration year: the heritage source.
- **County marriage indexes** (Ohio's runs to 2016): ages, often both sets of
  parents. Good for birth surnames, birth-year windows and earlier marriages.
  Some states' records give the date of birth itself.
- **NUMIDENT**: birth and death dates plus both parents' names. The best
  identity proof for anyone who has died, and a search by parents' names finds
  children who died. Covers only the dead.
- **SSDI, state death indexes**: dates; no relatives, so pair with something
  that ties identity.
- **Obituary indexes** (newspaper obituary collections): full text for some,
  indexed names for others. The indexer sometimes lists a surviving spouse as
  a parent; that is not evidence.
- **Church baptism records**: date of birth and parents.
- **State birth indexes** (e.g. one giving the mother's birth surname): useful
  but weak alone.
- **"Public Records" aggregates**: people-search quality; leads only.

Limits: the generations married after about 1990 are mostly absent. Name
spellings in older indexes are OCR- or hand-garbled; search variants. Ages on
elopement records can be false.

## Grave records

- **Find a Grave**: dates, burial place, often the full obituary text and
  family links; memorial ids are good citations ("Find a Grave 123456789").
  A memorial without family links needs other proof of identity. Dates quoted
  from newspapers may be notice dates, not death dates. Also reachable as a
  FamilySearch index.
- **BillionGraves**: same role, less coverage. *Untested.*

## Obituaries

The best source for `family`: they list spouses, children, grandchildren,
and often who died first.

- **Funeral home sites**: usually fetchable. Some have a print view that
  fetches cleanly (add the site's print parameter).
- **Legacy.com, everloved, tribute aggregators**: 403 to WebFetch; use the
  Chrome DevTools MCP or search-result snippets.
- **Local newspapers' own sites**: several block automated fetches; try the
  browser.

Reading them: "Child (Spouse)" means a current partner; "the late" means
predeceased; grandchildren are usually listed without saying whose they are;
an older obituary names married women as "Mrs. Husband's-Name".

## Library necrology indexes

- **Cleveland Public Library news and necrology index** (`cpl.org`): death
  notices from Cleveland papers. Older entries are full necrology records;
  entries after about 1975 are one-line abstracts ("Husband of …") and need
  the news record type in the URL, not necrology. Full scans are free by
  email from the library; that is a request for the owner to make. Sometimes
  403 to fetches; search in the browser.
- Other city libraries keep similar indexes (one blocked
  automated fetches).

## People-search sites

Leads only: relative lists are guessed by software, merge same-name people,
and ages often disagree between sites. Never cited in the tree. Read them
through search-result snippets; direct fetches are blocked.

- Spokeo, Instant Checkmate, FastPeopleSearch, TruePeopleSearch, ClustrMaps,
  Whitepages, OfficialUSA, state "resident database" sites: 403, CAPTCHA or
  fetch errors; snippets only.
- **Radaris**: dead. The domain shows a seizure notice under New Jersey's
  Daniel's Law.
- Voter-record sites: name and area only, no relatives.

## Other public pages

- **Wedding and registry sites** (The Knot, Zola, WithJoy, MyRegistry):
  marriage dates for recent couples; no ages, sometimes no surnames.
- **University athletics roster bios**: an adult's birth year and parents'
  names. High-school sports sites only show that someone is past a class year;
  for a minor, use them for the birth year or class year only, and save
  nothing that locates the child.
- **Professional registries** (NPI registry, clinician directories): identity,
  profession and area for adults; not birth years. LinkedIn blocks fetches.

## Finnish records

For lines from Finland. *Untested.*

- **National Library of Finland digitized newspapers**
  (`digi.kansalliskirjasto.fi`): free, includes Finnish-American papers.
- **Institute of Migration emigrant register** (Siirtolaisuusinstituutti):
  who emigrated, and when.
- **Genealogical Society of Finland** (SSHY) and **HisKi**: parish registers,
  some free.
- **National Archives of Finland** (Kansallisarkisto): church books, passport
  lists.

## The owner

- **"Per Kyle"**: the owner, and through them the family. The main source for
  living people, but always the last step: questions are collected into one
  batch per round (sent as a form) and answers arrive slowly, so never wait
  on them.
