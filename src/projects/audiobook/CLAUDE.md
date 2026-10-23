# Audiobook

A player for books the owner supplies, chapter by chapter, under Tools.

## Where books live

Nothing about a book is in the repo. Everything is in the public Supabase Storage bucket `audiobooks` (`supabase/audiobook.sql`):

- `catalog.json` at the bucket's root is the shelf: every book, its chapters, and each file's path in the bucket. The page fetches it at runtime, so a new book shows without a deploy. `parseCatalog` in `logic.ts` reads it and fails loudly on a bad one.
- Each book's audio and art sit under `<book slug>/`, named by a hash of their content, so a path never changes what it serves and the CDN can cache it for good. The catalog is cached for a minute.

The bucket is public: anyone with a file's URL can play it. The owner chose that.

## Photos

A chapter can carry timed photos, each shown from its moment in the narration (`at`, in seconds into the chapter) until the next. Before a chapter's first photo, the player shows the chapter's own image, or the book's cover. Photos are shown whole, letterboxed in the square frame, because many are portraits or group shots that a crop would ruin. A caption is optional and shown under the photo when there is one. The Nana biography has none, because its narrator describes each photo. The gallery lists every photo in the book by chapter, and picking one plays from its moment.

## Adding or updating a book

The owner hands over a folder of chapter audio, optional chapter images and an optional cover. Write its `book.json` and run the upload tool, `upload/upload-cli.ts`, whose header gives the format and the command. It uploads what isn't there yet, reads chapter lengths with ffprobe, and adds the book to the catalog, or replaces the one with its slug. A book's slug is its URL (`/tools/audiobook/<slug>`), and listeners' progress is kept under it, so don't change a published book's slug.

## Progress

Each browser keeps its own place, bookmarks and playback speed (`store.ts`, in localStorage). There is no sync between devices; a place saved against a book that later changed is clamped into it.

## Tests

The e2e spec answers the page's bucket requests itself (a fixture catalog and silent WAV), so it never reaches Supabase. It blocks the site's service worker, which would otherwise fetch past the stub.
