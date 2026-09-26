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
  - Queries work best as the exact full name in quotes plus a relative's name
    and a place. Long OR-chains of names do poorly, and generic name queries
    pull encyclopedia pages.
  - Many queries return a summary instead of snippets. When the wording
    matters, ask WebFetch to reproduce the family sentences word for word:
    its default summary mangles relationships (a spouse listed as a sibling).
- **Chrome DevTools MCP** (`mcp__chrome-devtools__*`): drives the owner's own
  Chrome, with their logins. Use it for login-gated or JavaScript-heavy sites
  (FamilySearch) and for sites that return 403 to WebFetch. Several agents
  can share it at once: each opens its own tab with `new_page` (in the
  background) and passes that tab's `pageId` on every call. Never call
  `select_page`, never touch a tab you didn't open, and close yours when
  done. Keep each agent's pace polite: every tab uses the same account.
  - **Read pages with `evaluate_script`**, returning the main region's
    `innerText` (or one line per result row). A snapshot of a results page
    runs to tens of kilobytes; a script reading the rows costs a tenth.
  - **Wait for an event, never a delay**: a script that resolves when the
    page's ready marker appears (see FamilySearch below for its markers).
  - Never call a site's private JSON API with the session's token: the
    permission classifier blocks it as credential access. Use the normal
    search URLs and read the rendered page.

## FamilySearch

The strongest source. Record pages are `familysearch.org/ark:/61903/<id>`;
cite as "FamilySearch 1:1:XXXX-XXX".

**Access.** Index searches need the login (the Chrome DevTools MCP with the
owner's session), with two exceptions. Without a login, WebFetch reads many
**census record pages** (1920, 1930, 1950, sometimes 1940: full household,
ages, birthplaces, parents' birthplaces, arrival years) and **Ohio county
marriage cards** (both sets of parents); the **search page works for the 1950
census only** (add `&count=50`). NUMIDENT, SSDI, death indexes,
naturalization, obituary indexes and some marriage pages show the sign-in
wall. Try a known ark by WebFetch before queuing it for the browser.

**Search URL** (`/en/search/record/results?...`). Fields: `q.givenName`,
`q.surname`, `q.spouseGivenName` / `q.spouseSurname`, `q.fatherGivenName` /
`q.fatherSurname`, `q.motherGivenName` / `q.motherSurname`,
`q.birthLikeDate.from` / `.to`, `q.birthLikePlace`, `q.marriageLikeDate.from`
/ `.to`, `q.marriageLikePlace`, `q.deathLikeDate.from` / `.to`,
`q.residencePlace`, `q.anyPlace`, `f.collectionId`.

- **Fuzzy matching is on by default.** Add `.exact=on` to a field
  (`q.surname.exact=on`) or a collection filter; without them a search
  returns thousands of look-alikes, and an empty-looking result means
  nothing.
- Month or day birth parameters (`q.birthLikeDate.month`) break the search.
- Collection ids: Ohio County Marriages 1614804, NUMIDENT 5000016, 1920
  census 1488411, 1930 census 1810731, 1950 census 4464515.

**Reading results in the browser.**

- **The "(0)" trap:** the results heading shows "(0)" before the rows load.
  A script that reads the count as soon as the heading appears reports false
  nulls. Wait until a row with a record link appears, or "No Results Found";
  "Results per page" also marks a loaded page.
- Rows split on `"\nMore\n"` in the main region's text; the ark ids come from
  `main a[href*="/ark:/61903/1:1:"]` in the same order.
- Record pages render details late: wait for the "Event Type" field (or
  "Similar Records") in the main region. "OPEN ALL" expands relatives.
- The results row shows only the main name; open the record for aliases.

**Collections that worked:**

- **US censuses 1880–1950**: households, ages, birthplaces; 1880–1930 add
  parents' birthplaces and 1900–1930 the arrival year (the heritage source).
  A parent living with a married child is listed as "Father"/"Mother" with
  their own birthplace. The 1920 census lists in-laws by relation ("maternal
  grandfather"). A 1950 entry sometimes lacks a member's birthplace ("not
  indexed"): that is unknown, not US.
- **County marriage indexes**: ages, often both sets of parents. Ohio's runs
  to 2016; Indiana's (1811–2019) catches Ohio teenagers who eloped there, with
  dates of birth (inflated) and both sets of parents; California County
  Marriages gives parents; Kentucky's runs to 1999; Texas
  Marriages/Divorces gives birth years.
- **NUMIDENT**: birth and death dates plus both parents' names; the best
  identity proof for the dead. Its "Alias" field (and a Similar Records
  "Entry for X and Y") can carry a married name no other source records.
  Covers deaths to about 2007, with many 1970s deaths missing (use SSDI and a
  state death index instead).
- **Ohio Death Index** (1908–1932, 1938–1944, 1958–2007): parents' surnames,
  birthplace and **marital status** ("Single" = never married, which settles
  a partners half).
- **SSDI, other death indexes**: dates; no relatives, so pair with something
  that ties identity. They outrank a grave site's year when the two disagree.
- **Ohio, Stillbirths 1918–1953**: unnamed children with both parents. Each
  stillbirth has a birth-side and a death-side certificate with different
  numbers: one event, not twins (check the sex on both).
- **Ohio County Births 1841–2003**: parents; some entries give the parents'
  ages and birthplaces (a cheap second source for origin).
- **State birth indexes**: Kentucky's and California's (to 1995) give the
  mother's birth surname, so a search by it finds a couple's children.
  Useful but weak alone.
- **Ohio, Naturalization Records 1848–1951**: exact date and town of birth
  abroad, which no census gives; outweighs a census birthplace.
- **WWII draft cards**: exact birth date and town, plus a contact person
  (often a parent or sibling) that ties the card to the family.
- **Church baptism records**: date of birth and parents.
- **Obituary collections**: GenealogyBank Historical (1815–2013) and
  Obituaries, Births and Marriages (1980–2015) index survivor names, mostly
  without text; US Obituary Records 2014–2023 often carries the full text on
  the record page. The indexed relationships are machine-extracted and often
  wrong (a surviving spouse as a parent, in-laws or a spouse as siblings,
  wrong sex, garbled names). Search a relative's name to find the obituary
  they appear in, then read the text itself.
- **"Public Records 1970–2009" / "Residence Database"**: people-search
  quality; exact dates but often wrong or merged. Leads only.
- **Find a Grave index**: dates are fine, but the cemetery's place is often
  wrong (a Michigan or West Virginia cemetery shown in another state).

**Coverage limits** (a null here says little; don't log it as the step done):

- Ohio County Marriages is thin for Cuyahoga and Lake after about 1940, and
  lacks some counties' 1930s marriages entirely.
- Indexed Michigan marriages effectively stop around 1952 (few after 1925).
- California births after 1995 and Kentucky marriages after 1999 are not
  indexed; marriages after about 1990 are mostly absent everywhere.
- Obituaries before about 2000 are often not indexed; the city library's
  necrology index is still needed.
- Older indexes garble spellings (an Italian surname losing its last vowel);
  see "Search techniques" in `methods.md`.

## Grave records

- **Find a Grave**: dates, burial place, often the full newspaper obituary
  (with grandchild counts) and family links; memorial ids are good citations
  ("Find a Grave 123456789"). Memorial pages fetch cleanly.
  - **Family links are the fastest way through a dead family**: a parent's
    memorial links each child, and each child's memorial the spouse and
    children. But links are often missing (a memorial added later by another
    contributor isn't linked): a missing link is not evidence of absence.
  - **Read the bio, not just the links**: bios quote death certificates, and
    can conflict with the linked family.
  - Memorials added by volunteers from cemetery lists (no bio, no links) give
    only years: dates, not identity.
  - Dates quoted from newspapers may be notice dates, and a year can be a
    transcription slip; death records made to state the death win.
  - **Search inside a cemetery**:
    `findagrave.com/cemetery/<cemeteryId>/memorial-search?lastName=X` returns
    the real list, using the cemetery named in a relative's obituary. The
    site-wide search ignores its location parameter when fetched.
  - Rate limit: HTTP 429 after about six quick fetches; batch about four at a
    time and retry after a pause.
- **BillionGraves**: seen only through its FamilySearch index.

## Obituaries

The best source for `family`: they list spouses, children, grandchildren,
and often who died first.

- **Funeral home sites and local TV news obituary pages**: usually fetchable.
  Some funeral-home print views fetch cleanly (add the site's print
  parameter), but a site can start returning 403 without warning, print
  view included; fall back to snippets.
- **Legacy.com, everloved, tribute aggregators**: 403 to WebFetch. Search
  snippets quote their survivors paragraph nearly verbatim when the query
  holds the person's name, year and place plus a survivor's name or "survived
  by": often enough to settle a family without opening the page.
- **Local newspapers' own sites**: several block automated fetches (a small
  city daily's archive among them); try the browser or snippets.

Reading them: "Child (Spouse)" means a current partner; "the late" means
predeceased; grandchildren are usually listed without saying whose they are;
an older obituary names married women as "Mrs. Husband's-Name". Summaries
drop connections ("stepmother", "special loved ones", "companion", a title
like Dr.): keep the survivors paragraph verbatim in the research log.

## Library necrology indexes

- **Cleveland Public Library news and necrology index** (`cpl.org`): death
  notices from Cleveland papers. Older entries are full necrology records;
  entries after about 1975 are one-line abstracts ("Husband of …") and need
  the news record type in the URL, not necrology. Full scans are free by
  email from the library; that is a request for the owner to make. Returns
  403 to WebFetch; search it in the browser.
- Other city libraries keep similar indexes (one blocked automated
  fetches).

## Courts and state archives

- **Cuyahoga County Probate Court marriage search**: refused the connection
  (both hosts).
- **West Virginia Vital Research Records** (`archive.wvculture.org/vrr`):
  ASP.NET postback forms that WebFetch can't submit; needs the browser. Its
  death records likely stop before the late 1970s.

## People-search sites

Leads only: relative lists are guessed by software, merge same-name people,
and ages often disagree between sites. Never cited in the tree. Read them
through search-result snippets; direct fetches are blocked.

- Snippets surface **aliases**: another married surname (a lead for an
  earlier marriage), or a daughter merged into her mother's record (her name
  shown as the mother's alias: a lead for an unplaced grandchild).
- Spokeo, Instant Checkmate, FastPeopleSearch, TruePeopleSearch, ClustrMaps,
  Whitepages, OfficialUSA, veripages, state "resident database" sites: 403,
  CAPTCHA or fetch errors; snippets only.
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
  profession and area for adults; never birth years or relatives. LinkedIn
  and therapyden block fetches.

## Finnish records

For lines from Finland.

- **Institute of Migration emigrant register** (Siirtolaisuusinstituutti):
  its web app has a public JSON API (`/api/search/?last_name=...` lists
  passenger-list, passport-list and other entries with ids;
  `/api/<register>/<id>/` returns one). Name search is free, but every detail
  (year, age, parish, destination) needs the paid tier, so a free search
  can't tie an emigrant to a person; common names return dozens of entries.
- *Untested:* **National Library of Finland digitized newspapers**
  (`digi.kansalliskirjasto.fi`: free, includes Finnish-American papers);
  **Genealogical Society of Finland** (SSHY) and **HisKi** (parish
  registers, some free); **National Archives of Finland** (church books,
  passport lists).

## The owner

- **"Per Kyle"**: the owner, and through them the family. The main source for
  living people, but always the last step: questions are collected into one
  batch per round (sent as a form) and answers arrive slowly, so never wait
  on them.
