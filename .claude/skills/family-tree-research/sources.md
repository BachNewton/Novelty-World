# Sources

Each source: what it is good for, how to search and cite it, and how to reach
it. Rewrite an entry whenever a source stops behaving as described. A citation
in the tree row must be public-safe (see "The research record" in
`SKILL.md`); the full URL goes in the research log.

**Free sources only.** The owner pays for nothing: no subscriptions, memberships
or paid tiers. A source that needs one is out of reach; never suggest it.
Free access in person counts: the owner lives in Helsinki, with a Helmet
library card, and can visit the National Library of Finland's reading room.

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
- **Chrome DevTools MCP**: the owner's own Chrome, with their logins. How and
  when to use it is in the owner's global instructions. Use it for
  login-gated or JavaScript-heavy sites (FamilySearch) and for sites that
  return 403 to WebFetch. Several agents can share it, each in its own tab;
  keep each agent's pace polite, since every tab uses the same account.
  FamilySearch's page-ready markers are below.

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
wall. Try a known ark by WebFetch before queuing it for the browser. The
browser's login state can change mid-session: before logging a null, check
the page for the "sign in to see all available results" banner.

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
- Read each result row from its own element: the row containing each
  `a[href*="/ark:/61903/1:1:"]`, its text and ark together. Pairing the page
  text split on "More" with a page-wide list of ark links misaligns when a
  row carries an extra link, and has sent agents to the wrong record.
- Read a census record's "Event Place (Original)": the indexed place can be
  the wrong county.
- The **FamilySearch Family Tree** (profiles others built) is a fast map to
  the right records, never evidence.
- Record pages render details late: wait for the "Event Type" field (or
  "Similar Records") in the main region. "OPEN ALL" expands relatives.
- The results row shows only the main name; open the record for aliases.

**Full Text search** (the Full Text tab: machine transcripts of record
images, cited as "FamilySearch 3:1:XXXX"). The way into the 1800–1870
generations, where no census states relationships: county deed, will,
probate and orphans' court books, and published genealogies. What they tie
is in `methods.md` ("Finding a line's origin").

- Plain keyword queries work: a quoted head of family plus a child's name
  (`"Given Surname" Child`), or a quoted name plus "deceased". Place filters
  return an error. A quoted name alone returns millions of loose matches.
- Results are grouped by image, thousands of loose hits: the image's heading
  (a will book, orphans' court records, a deed book) picks out the right one.
- Read an image through its transcript (the image's `?view=fullText`). The
  transcription garbles names and words: read the image itself before
  relying on a wording that matters.

**Collections that worked:**

- **US censuses 1880–1950**: households, ages, birthplaces; 1880–1930 add
  parents' birthplaces and 1900–1930 the arrival year (the heritage source).
  A parent living with a married child is listed as "Father"/"Mother" with
  their own birthplace. The 1920 census lists in-laws by relation ("maternal
  grandfather"). A 1950 entry sometimes lacks a member's birthplace ("not
  indexed"): that is unknown, not US.
- **Read the image, not only the index.** An index transcribes a few fields
  of a form that holds many: an Ohio county marriage license's application
  gives the bride's exact birthday, birthplace country and prior marriages;
  a Pennsylvania marriage license application (about 1885–1890) names both
  parties' parents and their residence; the 1880 census's parents'
  birthplaces can differ from the index, person by person. Indexers also
  misread initials and garble rare surnames. The census indexes leave out
  the citizenship columns (arrival year, "Na"/"Pa"/"Al", naturalization
  year): read those on the image. The images sit behind the record's
  "View original document". The viewer's Download button (then its
  "DOWNLOAD") saves a PDF to `~/Downloads` holding the full-resolution scan:
  pull the JPEG out with `pypdf` and crop it with PIL, which reads far better
  than screenshots of the viewer's tiles.
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
- **Ohio Deaths 1908–1953**: the death certificates themselves, with both
  parents, full birth date and birthplace. Record pages fetch with WebFetch.
  The fastest way to climb Ohio generations born 1830–1880.
- **Ohio Death Index** (1908–1932, 1938–1944, 1958–2007): parents' surnames,
  birthplace and **marital status** ("Single" = never married, which settles
  a partners half). Not every entry carries parents (a 1970 entry had none).
- **SSDI, other death indexes**: dates; no relatives, so pair with something
  that ties identity. They outrank a grave site's year when the two disagree.
- **Ohio, Stillbirths 1918–1953**: unnamed children with both parents. Each
  stillbirth has a birth-side and a death-side certificate with different
  numbers: one event, not twins (check the sex on both).
- **Ohio County Births 1841–2003**: parents; some entries give the parents'
  ages and birthplaces (a cheap second source for origin).
- **State birth indexes**: Kentucky's and California's (to 1995; collection
  id 2001879) give the mother's birth surname, so a search by it finds a
  couple's children. Useful but weak alone.
- **West Virginia marriage registers** (from about 1866, and the 1930s
  license forms) name both couples' parents. **Death registers** from 1853
  name the informant and their relationship ("son"), which ties a parent to
  a child for deaths before any census states relationships; the index
  leaves it out, so read the image.
- **US passport applications 1906–1925**: the father's name and birthplace,
  and the applicant's own birth date and emigration. **Passenger lists**
  (Ellis Island): from 1907 each manifest has a second sheet, facing the
  first, with the town of birth and the relative being joined. Read both
  from the image.
- **Pennsylvania death certificates 1906–1970** are not on FamilySearch
  (they are on a paid site: out). List one as a gap, not a null.
- **Hungary Civil Registration 1895–1980**: births, marriages, deaths;
  search the native name forms. Births are indexed only to about 1920;
  later people are reached through their parents' marriages and their own
  death records. Death registers after about 1952 give the exact birth date
  and place, and the spouse with the marriage place and year: the best way
  to climb and to tie.
- **"Public Records 1970–2009" / "Residence Database"**: people-search
  quality; exact dates but often wrong or merged. The record page's Alias
  field can show a birth surname or a full two-part surname. Leads only; an
  alias can be a different, merged person.
- **Ohio, Naturalization Records 1848–1951**: exact date and town of birth
  abroad, which no census gives; outweighs a census birthplace. It names the
  spouse, which ties identity. For Levant immigrants the town settles a
  census "Syria": map the town to its present-day country.
- **GenealogyBank obituary index**: its parent and relationship fields are
  unreliable (a sister's name given as the mother's). Check against the
  siblings' NUMIDENTs.
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
- **BillionGraves**: seen only through its FamilySearch index, where its
  cemetery places are right when Find a Grave's index places are wrong.

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
  works in the browser. Results come from plain GET URLs
  (`va_dcresults.aspx?LastName=X&FirstName=&County=C&Year=Y&PlusMinus=Exact&Search=Exact&NumRec=100`);
  a certificate image from `va_view.aspx?Id=N&Type=Death`. The image won't
  download on its own (it needs a referrer); screenshot the viewport, pinning
  the `<img>` with `position:fixed` and stepping its `top` to read it in
  pieces. The certificates give informant, spouse, full birth date and
  birthplaces, which the FamilySearch index lacks. Wildcard first names
  (`Ph*`) return false "no records": search surname, county and year. Deaths
  after 1972 are closed. Marriages search the same way
  (`va_mcresults.aspx?GroomsLastName=..&BridesLastName=..&County=All&Year=All`);
  search by the bride's surname to catch a garbled groom's. Delayed birth
  certificates (filed decades later) list their supporting affidavits, whose
  "sister" or "brother" can tie half-sibling households together.

## Published books

- **County and township histories** (1880s–1910s): full text on archive.org.
  Download the djvu text and grep for the surname and for each in-tree
  person's full name: a biographical sketch sits under its subject's name
  (often a parent's or a sibling's), which a surname-only read misses. How
  far to trust one is in `methods.md`.
- **Strassburger & Hinke, *Pennsylvania German Pioneers*** (1934, three
  volumes on archive.org): the ship lists, text-searchable, but of
  **Philadelphia arrivals only**. A null there says nothing about an
  immigrant who landed at Baltimore or New York.

## England and Ireland

- **Lancashire OnLine Parish Clerks** (`lan-opc.org.uk`, free): transcribed
  parish registers, Catholic missions included. Catholic baptisms give the
  mother's maiden name ("formerly X"), so a search by the couple finds the
  sibling set (see `methods.md`). Submit searches from its form: direct
  search URLs fail with code 4011.
- **FreeBMD** (England and Wales civil index, 1837 on): the new site's search
  works by filling its form in the browser. Its "same page" view shows who
  else was entered on a marriage's register page: before 1912 (when the
  index began giving the spouse's surname) that lists the candidate spouses.
  Index only, so a spouse found that way is Possible.
- **irishgenealogy.ie** (Irish civil births, marriages and deaths, free):
  plain fetches get 403; it works in the browser through its `/search` GET
  URLs. Register images are public PDFs holding one CCITT G4 image: download
  the file and convert the image to read it (Chrome's PDF viewer shows it
  unreliably).
- **The 1901 and 1911 Irish censuses**: the National Archives site
  (`census.nationalarchives.ie`) refused the connection. Use FamilySearch's
  index of the same census; it lacks the form's Irish-language column.

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

For lines from Finland. An emigrant of 1880–1914 and their parents sit in
records over 100 years old, which are free online with no login. Records
under 100 years (about 1926 on) are restricted, and access costs money: out.

- **National Archives of Finland, Astia** (`astia.narc.fi`): digitized
  parish church books, free with no login for material over 100 years old:
  every parish to about the 1860s, most into the early 1900s, including the
  move-out lists (muuttaneet) that record when someone left. The originals
  to climb generation by generation.
- **HisKi** (`hiski.genealogia.fi`): a free index of baptisms, marriages,
  burials and moves, aimed at the whole country to 1850, some parishes into
  the early 1900s, patchy for many (a parish may have no christenings at
  all). A plain request searches every parish at once. Check a parish's
  coverage before counting an empty result as a null; check the original in
  Astia or SSHY before citing it.
- **SSHY digital archive**: church-book images over 125 years old are free
  with no login, and full-size images download directly; 100–125 years
  needs membership (out). The must-try step for a Finnish line: birth books
  (browsed by month) and communion books (by village and farm), whose
  per-image index pages say which month or village each image covers.
- **National Library of Finland digitized newspapers**
  (`digi.kansalliskirjasto.fi`): Finnish papers free to the end of 1939, and
  174 Finnish-American titles from 1876 to 1923 (Hancock, MI and Duluth, MN
  papers among them) for death notices and local news about emigrants.
  Works in the browser; the text recognition is noisy, so a name search
  that finds nothing isn't a strong null. Later material only at
  legal-deposit workstations (in Helsinki: the National Library,
  Unioninkatu 36).
- **Institute of Migration emigrant register** (Siirtolaisuusinstituutti):
  passport lists and passenger lists (Hanko sailings from 1891), many
  nowhere else online. Its web app has a public, no-login JSON API at
  `siirtolaisrekisteri.siirtolaisuusinstituutti.fi/api/`
  (`/api/search/?last_name=...` lists entries with ids;
  `/api/<register>/<id>/` returns one). Name search is free, but every
  detail (year, age, parish, destination) needs the paid tier (out), so a
  free search can't tie an emigrant to a person.
- **FamilySearch's Finland collections** index few emigrant families. Its
  user-built Family Tree is a quick pointer to a parish (and its per-person
  source lists can surface a record name searches missed): a lead only.
- **In person in Helsinki, free** (the owner's to use, for a specific stuck
  question): the Genealogical Society library (Kirkkokatu 6), whose
  member-only index is free on its computers; the FamilySearch center
  (Marjaniementie 35, by appointment), whose computers carry premium sites
  (MyHeritage, often Ancestry) for the US side.
- **Out (paid):** the church's genealogy extracts, the Digital and Population
  Data Services Agency's, SSHY membership, the register's full tier. Helmet
  libraries offer no genealogy database.

## The owner

- **"Per Kyle"**: the owner, and through them the family. The main source for
  living people, but always the last step: questions are collected into one
  batch per round (sent as a form) and answers arrive slowly, so never wait
  on them.
