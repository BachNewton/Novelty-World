import { test } from "@playwright/test";

test("probe despawn with stale fallback", async ({ browser }) => {
  test.setTimeout(60_000);
  const room = `rpg-${Date.now()}`;
  const a = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const b = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const ap = await a.newPage();
  const bp = await b.newPage();
  try {
    await ap.goto(`/rpg?coop-room=${room}`);
    await bp.goto(`/rpg?coop-room=${room}`);
    await ap.locator("canvas").first().waitFor({ timeout: 10_000 });
    await bp.locator("canvas").first().waitFor({ timeout: 10_000 });

    await ap.waitForFunction(
      () => document.querySelector('[data-testid="coop-status"]')?.textContent === "connected",
      { timeout: 20_000 },
    );
    await bp.waitForFunction(
      () => document.querySelector('[data-testid="coop-status"]')?.textContent === "connected",
      { timeout: 20_000 },
    );

    const aRole = await ap.getByTestId("coop-role").textContent();
    const bRole = await bp.getByTestId("coop-role").textContent();
    console.log(`PROBE roles: a=${aRole} b=${bRole}`);

    await ap.keyboard.down("d");
    await bp.waitForFunction(() => {
      const c = document.querySelector('[data-testid="play-canvas"]');
      if (!c) return false;
      const ctx = c.getContext("2d");
      if (!ctx) return false;
      const dpr = window.devicePixelRatio || 1;
      const cx = c.getBoundingClientRect().width / 2;
      for (let dx = 120; dx <= 600; dx += 24) {
        const bx = Math.floor((cx + dx) * dpr);
        const by = Math.floor(c.getBoundingClientRect().height / 2 * dpr);
        if (bx < 2 || by < 2 || bx >= c.width - 2 || by >= c.height - 2) continue;
        const data = ctx.getImageData(bx - 2, by - 2, 5, 5).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
        if (sum / (data.length / 4) > 8) return true;
      }
      return false;
    }, { timeout: 15_000 });
    await ap.keyboard.up("d");

    const whileWalking = await bp.evaluate(() => {
      const c = document.querySelector('[data-testid="play-canvas"]');
      const ctx = c!.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      const cx = c.getBoundingClientRect().width / 2;
      const cy = c.getBoundingClientRect().height / 2;
      let best = 0;
      for (let dx = 120; dx <= 600; dx += 24) {
        for (const dy of [-40, 0, 40]) {
          const bx = Math.floor((cx + dx) * dpr);
          const by = Math.floor((cy + dy) * dpr);
          if (bx < 2 || by < 2 || bx >= c.width - 2 || by >= c.height - 2) continue;
          const data = ctx.getImageData(bx - 2, by - 2, 5, 5).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
          const mean = sum / (data.length / 4);
          if (mean > best) best = mean;
        }
      }
      return best;
    });
    console.log(`PROBE while walking: ${whileWalking}`);

    const remotesBefore = await bp.getByTestId("coop-remote-count").textContent();
    console.log(`PROBE remotes before: ${remotesBefore}`);

    // Close A's page
    await ap.close();
    console.log("PROBE A page closed");

    // Check remotes count after close - the stale fallback should kick in after 5 seconds
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 300));
      const remotes = await bp.getByTestId("coop-remote-count").textContent();
      const strip = await bp.evaluate(() => {
        const c = document.querySelector('[data-testid="play-canvas"]');
        const ctx = c!.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;
        const cx = c.getBoundingClientRect().width / 2;
        const cy = c.getBoundingClientRect().height / 2;
        let best = 0;
        for (let dx = 120; dx <= 600; dx += 24) {
          for (const dy of [-40, 0, 40]) {
            const bx = Math.floor((cx + dx) * dpr);
            const by = Math.floor((cy + dy) * dpr);
            if (bx < 2 || by < 2 || bx >= c.width - 2 || by >= c.height - 2) continue;
            const data = ctx.getImageData(bx - 2, by - 2, 5, 5).data;
            let sum = 0;
            for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
            const mean = sum / (data.length / 4);
            if (mean > best) best = mean;
          }
        }
        return best;
      });
      console.log(`PROBE t+${(i+1)*300}ms: remotes=${remotes} strip=${strip}`);
      if (remotes === "0" && strip < 3) {
        console.log("PROBE DESPAWNED!");
        break;
      }
    }
  } finally {
    await a.close();
    await b.close();
  }
});