// A story typeset as a novel. build-novel.ts writes novel.json (the title, author,
// cover, edition line and chapters) beside a copy of this file and compiles it.
#import "@preview/cmarker:0.1.9"

#let novel = json("novel.json")
#let ink = rgb("#1b1b1b")
#let page-width = 5.5in

#set document(title: novel.title, author: novel.author)
#set page(width: page-width, height: 8.5in, margin: (x: 0.75in, top: 0.9in, bottom: 0.9in))
#set text(font: "Libertinus Serif", size: 11.5pt, lang: "en", fill: ink)
#set par(justify: true, leading: 0.72em, spacing: 0.72em, first-line-indent: 1.5em)

// The cover's four-pointed star, drawn rather than set, so no font has to have it.
#let star(r) = {
  let w = r * 0.26
  box(polygon(
    fill: ink,
    (r, 0pt), (r + w, r - w), (2 * r, r), (r + w, r + w),
    (r, 2 * r), (r - w, r + w), (0pt, r), (r - w, r - w),
  ))
}
#let stars = stack(dir: ltr, spacing: 1.1em, star(3.2pt), star(3.2pt), star(3.2pt))
#let small-label(body) = text(size: 9pt, tracking: 0.25em, upper(body))

// A scene break, `---` in the manuscript.
#show divider: _ => block(width: 100%, above: 1.5em, below: 1.5em, align(center, stars))

#let chapter-heading = heading.where(level: 1, outlined: true)
#set heading(numbering: "1", supplement: [Chapter])
#show chapter-heading: it => block(width: 100%, below: 3.2em, align(center)[
  #small-label[Chapter #context counter(heading).display()]
  #v(0.5em)
  #text(size: 21pt, weight: "regular", it.body)
])

// Cover: a page the shape of the art.
#if novel.cover != none {
  page(width: page-width, height: page-width * novel.cover-aspect, margin: 0pt,
    image(novel.cover, width: 100%, height: 100%))
}

#page[
  #set align(center)
  #set par(justify: false, first-line-indent: 0pt)
  #v(26%)
  #text(size: 27pt, novel.title)
  #v(1.6em)
  #stars
  #v(1.6em)
  #text(size: 13pt, style: "italic", novel.author)
]

#page[
  #set par(justify: false, first-line-indent: 0pt)
  #set text(size: 9pt)
  #align(bottom)[
    _#{novel.title}_ \
    by #novel.author

    #novel.edition
  ]
]

#page[
  #set par(justify: false, first-line-indent: 0pt)
  #v(12%)
  #align(center, small-label[Contents])
  #v(2.4em)
  #outline(title: none, depth: 1)
]

// The running head names the chapter, except on the page it opens.
#let running-head = context {
  let page-now = here().page()
  let opens-here = query(chapter-heading).any(h => h.location().page() == page-now)
  let before = query(chapter-heading.before(here()))
  if not opens-here and before.len() > 0 {
    align(center, text(size: 9pt, style: "italic", before.last().body))
  }
}
#let folio = context align(center, text(size: 9.5pt, counter(page).display()))

#set page(header: running-head, footer: folio)
#counter(page).update(1)

#for chapter in novel.chapters {
  pagebreak(weak: true)
  v(14%)
  heading(level: 1, chapter.title)
  cmarker.render(chapter.body, raw-typst: false)
}
