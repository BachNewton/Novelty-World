/**
 * A story as an EPUB, for reading apps and text-to-speech readers such as ElevenReader.
 * It carries only what should be read aloud: a title page, then each chapter under its heading.
 * The contents is the reader's navigation, not a page, and the draft's edition is metadata.
 * A scene break is a rule, which a reader shows and a voice passes over.
 */
import { crc32, deflateRawSync } from "node:zlib";
import { writeFileSync } from "node:fs";

export interface EpubBook {
  slug: string;
  title: string;
  author: string;
  edition: string;
  /** The cover's PNG bytes, when the book has one. */
  cover: Buffer | null;
  chapters: { number: number; title: string; body: string }[];
}

function escape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** The manuscripts' Markdown is paragraphs, `*emphasis*`, `**strong**` and `---` scene breaks.
 *  Anything else would be read aloud as its symbols, so it fails the build instead. */
function bodyToXhtml(body: string, where: string): string {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => {
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(block)) return "<hr/>";
      const html = escape(block.replace(/\s*\n\s*/g, " "))
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");
      const leftover = /[*_`[\]\\]|^&gt;|^\d+\.\s|^[-+]\s/.exec(html);
      if (leftover) throw new Error(`${where}: the EPUB can't render "${leftover[0]}" in: ${block.slice(0, 80)}`);
      return `<p>${html}</p>`;
    })
    .join("\n");
}

function page(title: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>${escape(title)}</title><link rel="stylesheet" href="style.css"/></head>
<body>
${body}
</body>
</html>
`;
}

const STYLE = `body { font-family: serif; line-height: 1.5; }
h1 { text-align: center; font-weight: normal; margin: 3em 0 2em; }
p { margin: 0; text-indent: 1.5em; }
h1 + p, hr + p { text-indent: 0; }
hr { border: none; margin: 1.5em 0; text-align: center; }
hr::after { content: "\\2726  \\2726  \\2726"; }
.title-page { text-align: center; margin-top: 30%; }
.title-page p { text-indent: 0; font-style: italic; margin-top: 2em; }
`;

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`;

function files(book: EpubBook): [string, string | Buffer][] {
  const chapterFile = (n: number) => `chapter-${String(n).padStart(2, "0")}.xhtml`;
  const heading = (c: EpubBook["chapters"][number]) => `Chapter ${c.number}: ${c.title}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  const manifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="style" href="style.css" media-type="text/css"/>`,
    `<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>`,
    ...(book.cover ? [`<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>`] : []),
    ...book.chapters.map((c) => `<item id="c${c.number}" href="${chapterFile(c.number)}" media-type="application/xhtml+xml"/>`),
  ];
  const spine = [`<itemref idref="title"/>`, ...book.chapters.map((c) => `<itemref idref="c${c.number}"/>`)];

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:novelty-world:${escape(book.slug)}</dc:identifier>
    <dc:title>${escape(book.title)}</dc:title>
    <dc:creator>${escape(book.author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:description>${escape(book.edition)}</dc:description>
    <meta property="dcterms:modified">${modified}</meta>
    ${book.cover ? `<meta name="cover" content="cover"/>` : ""}
  </metadata>
  <manifest>
    ${manifest.join("\n    ")}
  </manifest>
  <spine>
    ${spine.join("\n    ")}
  </spine>
</package>
`;

  const nav = page(
    "Contents",
    `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${book.chapters.map((c) => `<li><a href="${chapterFile(c.number)}">${escape(heading(c))}</a></li>`).join("\n")}
</ol></nav>`,
  );

  return [
    ["mimetype", "application/epub+zip"],
    ["META-INF/container.xml", CONTAINER],
    ["OEBPS/content.opf", opf],
    ["OEBPS/nav.xhtml", nav],
    ["OEBPS/style.css", STYLE],
    [
      "OEBPS/title.xhtml",
      page(book.title, `<section class="title-page"><h1>${escape(book.title)}</h1><p>by ${escape(book.author)}</p></section>`),
    ],
    ...(book.cover ? [["OEBPS/cover.png", book.cover] as [string, Buffer]] : []),
    ...book.chapters.map(
      (c) =>
        [
          `OEBPS/${chapterFile(c.number)}`,
          page(heading(c), `<h1>${escape(heading(c))}</h1>\n${bodyToXhtml(c.body, `chapter ${c.number}`)}`),
        ] as [string, string],
    ),
  ];
}

/** A zip archive, the container an EPUB is. The `mimetype` entry must come first and be
 *  stored uncompressed, so readers can identify the file from its first bytes. */
function zip(entries: [string, string | Buffer][]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  // A fixed timestamp (1 January 1980, the format's epoch) so the same book zips the same bytes.
  const dosDate = (0 << 9) | (1 << 5) | 1;
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const store = name === "mimetype";
    const packed = store ? data : deflateRawSync(data);
    const method = store ? 0 : 8;
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export function writeEpub(book: EpubBook, out: string): void {
  writeFileSync(out, zip(files(book)));
}
