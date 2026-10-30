import type { Page, Route } from "@playwright/test";
import { test, expect } from "./test";

/**
 * The Audiobook player, on a book of the test's own: the page's requests to
 * the audiobooks bucket are answered here (a catalog, and a minute of silent
 * WAV for each chapter), so the run never reaches Supabase.
 */

// The site's service worker fetches for the page, and the routes below never see what it fetches.
test.use({ serviceWorkers: "block" });

const CHAPTER_SECONDS = 60;
const SAMPLE_RATE = 8000;

/** A mono 8-bit WAV of silence. */
function silentWav(seconds: number): Buffer {
  const samples = seconds * SAMPLE_RATE;
  const wav = Buffer.alloc(44 + samples, 0x80);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples, 40);
  return wav;
}

const AUDIO = silentWav(CHAPTER_SECONDS);
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PHOTO_AT = 20;

const CATALOG = {
  books: [
    {
      slug: "test-book",
      title: "The Test Book",
      author: "E. Twoe",
      chapters: [
        {
          title: "Chapter One",
          audio: "test-book/one.wav",
          photos: [{ at: PHOTO_AT, image: "test-book/photo.png" }],
          duration: CHAPTER_SECONDS,
        },
        { title: "Chapter Two", audio: "test-book/two.wav", duration: CHAPTER_SECONDS },
      ],
    },
  ],
};

/** Serves the audio with byte ranges and CORS, as the bucket does, so the player can seek and download ahead. */
async function serveAudio(route: Route) {
  const headers = { "accept-ranges": "bytes", "access-control-allow-origin": "*" };
  const range = /bytes=(\d+)-(\d*)/.exec((await route.request().headerValue("range")) ?? "");
  if (!range) {
    await route.fulfill({ status: 200, contentType: "audio/wav", headers, body: AUDIO });
    return;
  }
  const start = Number(range[1]);
  const end = range[2] === "" ? AUDIO.length - 1 : Number(range[2]);
  await route.fulfill({
    status: 206,
    contentType: "audio/wav",
    headers: { ...headers, "content-range": `bytes ${String(start)}-${String(end)}/${String(AUDIO.length)}` },
    body: AUDIO.subarray(start, end + 1),
  });
}

async function stubBucket(page: Page) {
  await page.route("**/storage/v1/object/public/audiobooks/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/catalog.json")) await route.fulfill({ json: CATALOG });
    else if (url.endsWith(".png")) await route.fulfill({ contentType: "image/png", body: PHOTO });
    else await serveAudio(route);
  });
}

test("a listener plays a chapter, sees its photo, bookmarks it, moves on, and picks up where they left off", async ({ page }) => {
  await stubBucket(page);
  await page.goto("/tools/audiobook");

  await page.getByTestId("shelf-book").filter({ hasText: "The Test Book" }).click();
  await expect(page.getByTestId("chapter-title")).toHaveText("Chapter One");

  const photo = page.getByRole("img", { name: "Chapter One, photo 1" });
  await expect(page.getByRole("img", { name: "The Test Book cover" })).toBeVisible();
  await expect(photo).toHaveCount(0);

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Forward 30 seconds" }).click();
  await expect(page.getByTestId("elapsed")).toHaveText(/^0:3\d$/);
  // The narration has passed the photo's moment: it shows, and a photo without a caption gets none.
  await expect(photo).toBeVisible();
  await expect(page.getByTestId("photo-caption")).toHaveCount(0);

  await page.getByRole("button", { name: "Add bookmark" }).click();
  await expect(page.getByTestId("bookmark-row")).toHaveCount(1);

  await page.getByRole("tab", { name: "Chapters" }).click();
  await page.getByTestId("chapter-row").filter({ hasText: "Chapter Two" }).click();
  await expect(page.getByTestId("chapter-title")).toHaveText("Chapter Two");
  await expect(page.getByTestId("elapsed")).not.toHaveText("0:00");
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  await page.reload();
  await expect(page.getByTestId("chapter-title")).toHaveText("Chapter Two");
  await expect(page.getByTestId("elapsed")).not.toHaveText("0:00");
  await page.getByRole("tab", { name: "Bookmarks" }).click();
  await expect(page.getByTestId("bookmark-row")).toHaveCount(1);

  // A thumbnail opens the photo full screen, and leaves the listening where it was.
  await page.getByRole("tab", { name: "Photos" }).click();
  await page.getByTestId("gallery-photo").click();
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer.getByRole("img", { name: "Chapter One, photo 1" })).toBeVisible();
  await expect(page.getByTestId("chapter-title")).toHaveText("Chapter Two");
  // Only "play from here" moves the listening to the photo's moment.
  await viewer.getByRole("button", { name: /^Play from here/ }).click();
  await expect(viewer).toBeHidden();
  await expect(page.getByTestId("chapter-title")).toHaveText("Chapter One");
  await expect(page.getByTestId("elapsed")).toHaveText(/^0:2\d$/);
  await expect(photo).toBeVisible();

  // The picture in the player opens full screen too, and Escape closes it.
  await page.getByRole("region", { name: "Player" }).getByRole("button", { name: "View Chapter One, photo 1" }).click();
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  await page.getByRole("tab", { name: "Bookmarks" }).click();
  await page.getByTestId("bookmark-row").getByRole("button").first().click();
  await expect(page.getByTestId("elapsed")).toHaveText(/^0:3\d$/);

  await page.goBack();
  await expect(page.getByRole("progressbar", { name: "Listened" })).not.toHaveAttribute("aria-valuenow", "0");
});

test("the next chapter downloads while one plays, and follows it without going back to the network", async ({ page }) => {
  await stubBucket(page);
  await page.goto("/tools/audiobook/test-book");
  const audio = page.locator("audio");
  await expect(audio).toHaveAttribute("data-next-downloaded", "false");

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(audio).toHaveAttribute("data-next-downloaded", "true");
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));

  await page.getByRole("slider", { name: "Position in chapter" }).fill(String(CHAPTER_SECONDS - 1));
  await expect(page.getByTestId("chapter-title")).toHaveText("Chapter Two");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(audio).toHaveAttribute("src", /^blob:/);
  expect(requests.filter((url) => url.endsWith("/two.wav"))).toEqual([]);
});

test("a stop the listener didn't ask for says so, and offers its log; their own pause doesn't", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await stubBucket(page);
  await page.goto("/tools/audiobook/test-book");
  const stopped = page.getByRole("status").filter({ hasText: "Stopped" });

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(stopped).toHaveCount(0);

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  // As the phone does it: the audio paused from outside the player's controls.
  await page.locator("audio").evaluate((el: HTMLAudioElement) => el.pause());
  await expect(stopped).toContainText("not by you");
  await expect(stopped.getByRole("button", { name: "Copy log" })).toBeVisible();
  expect(await page.evaluate(() => [document.scrollingElement?.scrollHeight, document.scrollingElement?.scrollWidth])).toEqual([640, 360]);

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(stopped).toHaveCount(0);
});

test("on a phone, the player fits the screen and the lists open over it", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await stubBucket(page);
  await page.goto("/tools/audiobook/test-book");
  await expect(page.getByTestId("chapter-title")).toHaveText("Chapter One");

  const pageSize = () => page.evaluate(() => [document.scrollingElement?.scrollHeight, document.scrollingElement?.scrollWidth]);
  expect(await pageSize()).toEqual([640, 360]);
  await expect(page.getByRole("button", { name: "Next chapter" })).toBeInViewport();
  await expect(page.getByTestId("chapter-row").first()).toBeHidden();

  await page.getByRole("button", { name: "Chapters, bookmarks and photos" }).click();
  await page.getByTestId("chapter-row").filter({ hasText: "Chapter Two" }).click();
  // A pick goes back to the player, at the chapter picked.
  await expect(page.getByTestId("chapter-row").first()).toBeHidden();
  await expect(page.getByTestId("chapter-title")).toHaveText("Chapter Two");
  expect(await pageSize()).toEqual([640, 360]);
});
