/**
 * Local demo seeding. DEV ONLY.
 *
 * Reached from exactly one place — a `import.meta.env.DEV` branch in main.tsx —
 * so Vite drops this module and its data from every production build. Do not
 * import it from anywhere else, and never put a seed file in `app/public/`:
 * everything there ships.
 *
 * Seeding goes through `importEntries`, the same path Settings → Import uses.
 * That is deliberate rather than convenient: it validates every record, skips
 * ids that already exist, and never deletes, so running this against a
 * database holding real writing cannot damage it. Demo ids are prefixed
 * `demo-`.
 */

import { importEntries, getProfile, saveProfile } from "../lib/db.ts";
import { demoEntries } from "./demoEntries.ts";

const DEMO_PROFILE = {
  nativeLanguage: "Mongolian",
  field: "geology",
  level: "B1" as const,
  goal: "Write clearly about my work",
};

async function seedDemo(): Promise<void> {
  const outcome = await importEntries(demoEntries());

  // Only fill an empty profile. Overwriting one the developer typed would
  // make this destructive, which the entry path deliberately is not.
  const existing = await getProfile();
  if (!existing.nativeLanguage && !existing.field && !existing.level) {
    await saveProfile(DEMO_PROFILE);
  }

  console.info(
    `[demo] imported ${outcome.imported}, skipped ${outcome.skippedExisting} already present` +
      (outcome.invalid ? `, ${outcome.invalid} invalid` : "") +
      ". Open History and tap the newest entry."
  );
}

/**
 * Wire up the two ways in: `?seed=demo` in the address bar, and `seedDemo()`
 * in the console. The URL form strips its own parameter and reloads, so the
 * app starts from a normal cold boot rather than a half-seeded render.
 */
export function installDemoSeed(): void {
  (window as unknown as { seedDemo: () => Promise<void> }).seedDemo = seedDemo;

  const url = new URL(window.location.href);
  if (url.searchParams.get("seed") === "demo") {
    void seedDemo()
      .then(() => {
        url.searchParams.delete("seed");
        window.location.replace(url.toString());
      })
      .catch((err: unknown) => console.error("[demo] seeding failed:", err));
    return;
  }

  console.info(
    "[demo] dev build. Run seedDemo() or open /?seed=demo to load 20 sample entries. " +
      "Settings → Delete all data clears them."
  );
}
