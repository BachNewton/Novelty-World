// Credits for third-party work the site shows: art, photos, fonts, icons,
// textures, data. Each project that uses someone else's work exports its own
// list, and the credits page (src/app/credits) gathers them by project.
// Code libraries are not listed: their licences cover code, and their notices
// ship with the packages.

export interface License {
  readonly name: string;
  // The licence text, or null when there is none to link (public domain).
  readonly url: string | null;
  // Whether the licence requires a visible credit. A credit under a licence
  // that doesn't is a courtesy.
  readonly attribution: boolean;
}

export interface Credit {
  // What the work is, as the site uses it.
  work: string;
  author: string;
  license: License;
  // Where the work came from: its file page, store page or repository.
  source: string;
  // The credit line the licence requires, or empty when it requires none.
  attribution: string;
}

export const LICENSES = {
  "public-domain": { name: "Public domain", url: null, attribution: false },
  "cc0-1.0": { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: false },
  mit: { name: "MIT", url: "https://opensource.org/license/mit", attribution: true },
  isc: { name: "ISC", url: "https://opensource.org/license/isc-license-txt", attribution: true },
  "bsd-3-clause": { name: "BSD 3-Clause", url: "https://opensource.org/license/bsd-3-clause", attribution: true },
  "ofl-1.1": { name: "SIL Open Font License 1.1", url: "https://openfontlicense.org/open-font-license-official-text/", attribution: false },
  "all-rights-reserved": { name: "All rights reserved", url: null, attribution: false },
} as const satisfies Record<string, License>;

// Work the whole site uses, rather than one project.
export const SITE_CREDITS: readonly Credit[] = [
  {
    work: "Space Grotesk typeface",
    author: "Florian Karsten",
    license: LICENSES["ofl-1.1"],
    source: "https://fonts.google.com/specimen/Space+Grotesk",
    attribution: "",
  },
  {
    work: "Space Mono typeface",
    author: "Colophon Foundry",
    license: LICENSES["ofl-1.1"],
    source: "https://fonts.google.com/specimen/Space+Mono",
    attribution: "",
  },
  {
    work: "Lucide icons",
    author: "Lucide Icons and Contributors",
    license: LICENSES.isc,
    source: "https://lucide.dev",
    attribution: "Copyright (c) Lucide Icons and Contributors",
  },
];
