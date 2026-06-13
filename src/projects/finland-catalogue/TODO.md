# Finland Catalogue — TODO

## Self-host catalogue images (deferred — decided, not yet built)

**Why:** images are currently hot-linked from third-party providers (mostly
Wikimedia Commons), which load slowly/unreliably because we depend on the
provider. Plan is to self-host pre-resized copies.

### Measured footprint (June 2026)

838 unique image URLs across `ideas/*.ts` + `topics/*.ts` (`thumbnailUrl` +
`galleryUrls`). Sizes are **pre-compression, originals as-is**:

| Source | Files | Total | Median | Avg |
|---|---|---|---|---|
| Wikimedia originals | 729 | 4.40 GB | 3.4 MB | 6.3 MB |
| Official sites / Flickr / CDNs | 109 | 47 MB | — | ~0.4 MB |
| **Total** | **838** | **~4.45 GB** | | |

The Wikimedia files are full-res (4000–6000px) originals — that's why the raw
total is huge. The non-Wikimedia ones are already web-sized.

### Step 1 (agreed first step): resize to actual render resolution

Resize every image to the size we actually display (cards ≈400px wide, gallery
≈1200px wide — **confirm exact dims in the components before building**) and
encode WebP at q80–85.

- We currently ship 4000–6000px images into ~400px slots, so this discards
  resolution we never render → **~95%+ size cut with no perceptible quality
  loss** (the loss is in detail you can't see at display size).
- Estimated resulting footprint: **~100–150 MB total.**
- Optional later: AVIF, and a separate small card-thumbnail variant.

### Hosting: Supabase Storage public bucket (decided)

- We already have Supabase; **1 GB free storage** dwarfs the ~150 MB need.
- Keeps ~150 MB of binaries **out of the shared monorepo** (matters — many
  projects share this repo).
- **Serve the pre-resized files directly, NOT through `next/image`** — that
  avoids Vercel's image-optimization quota (Hobby: 5K transforms/mo), which is
  the limit that would actually bite with 838 images.
- Set long, immutable `cache-control` so repeat views don't re-download.

Limits / gotchas:
- Supabase free: 1 GB storage, **5 GB/mo storage egress** (~33k uncached
  150 KB loads; CDN/browser caching raises the real ceiling). Fine for hobby.
- Free Supabase projects **pause after 7 days of no DB activity** — a live site
  with any traffic avoids this.
- Escape hatch if egress ever grows: **Cloudflare R2** (zero egress fees).

### Ingest pipeline to build (when we do this)

1. Extract all `thumbnailUrl` + `galleryUrls` from `ideas/*.ts` and `topics/*.ts`.
2. For each: download original → resize to target dims → encode WebP (`sharp`).
3. Upload to a Supabase Storage public bucket (e.g. bucket `finland-catalogue`,
   keyed by slug), public-read policy following the repo's idempotent
   `supabase/*.sql` convention.
4. Rewrite the `thumbnailUrl` / `galleryUrls` values in the `.ts` files to the
   new bucket URLs. (Original source URLs stay in git history in case we need
   to re-pull or re-encode.)
5. Verify in the app, then update `add-finland-idea` / `add-finland-topic` so
   new entries get ingested the same way.

Sources (limits, June 2026): Supabase storage egress docs; Vercel image
optimization limits & pricing.
