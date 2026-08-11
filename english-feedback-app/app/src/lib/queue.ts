import { analyzeText } from "./api";
import {
  claimForAnalysis,
  finishAnalysis,
  getEntries,
  getProfile,
  getQueuedEntries,
  reclaimStaleAnalysing,
} from "./db";
import { getAnalysedCount, getRecurringCategories } from "./stats";
import { applyFailure } from "./retry";
import { STALE_CLAIM_MS } from "./claim";

let processing = false;

/**
 * Analyse every queued entry (oldest first). Returns how many were analysed.
 *
 * An entry is never lost (§3.3): a transient failure leaves it queued for the
 * next attempt, and a permanent one — a refusal, a rejected request, or too
 * many failed attempts — marks it failed with the text intact.
 */
export async function processQueue(): Promise<number> {
  if (processing || !navigator.onLine) return 0;
  processing = true;
  let done = 0;
  try {
    // A tab killed mid-analysis leaves its claim behind. Release those first,
    // or the entry is never picked up again by anyone.
    await reclaimStaleAnalysing(STALE_CLAIM_MS);

    const queued = await getQueuedEntries();

    // The same ranking context the Write screen sends. Without it every entry
    // written offline, or requeued after a blip, is analysed blind to the
    // learner's recurring categories — the teacher voice and the drills would
    // treat it as their first ever entry. Read once for the whole run;
    // best-effort, exactly as on the Write screen.
    const [context, profile] = await Promise.all([
      getEntries()
        .then((entries) => ({
          history: getRecurringCategories(entries),
          analysedSoFar: getAnalysedCount(entries),
        }))
        .catch((err) => {
          console.error("Couldn't read entry history for context:", err);
          return { history: [], analysedSoFar: undefined };
        }),
      getProfile().catch((err) => {
        console.error("Couldn't read the learner profile:", err);
        return {};
      }),
    ]);

    for (const entry of queued) {
      // Another tab, or the Write screen, may hold this one already — the
      // snapshot above is only a candidate list. The claim decides.
      const claimed = await claimForAnalysis(entry.id);
      if (!claimed) continue;

      const entryNumber =
        context.analysedSoFar === undefined ? undefined : context.analysedSoFar + done + 1;
      const result = await analyzeText(claimed.text, context.history, profile, entryNumber);

      if (result.ok) {
        await finishAnalysis(
          claimed.id,
          {
            status: "analysed",
            feedback: result.feedback,
            modelId: result.model,
            promptVersion: result.promptVersion,
          },
          claimed.analysingSince
        );
        done++;
        continue;
      }

      await finishAnalysis(
        claimed.id,
        applyFailure(claimed.attempts ?? 0, result),
        claimed.analysingSince
      );

      // A retryable failure means the network or the service is unhappy right
      // now — running the rest of the queue into it just burns the quota.
      // A permanent one only concerns this entry, so keep going.
      if (result.retryable) break;
    }
  } catch (err) {
    // Storage is gone, or something equally structural. Callers only need to
    // know nothing was analysed; the entries are still queued.
    console.error("Queue processing failed:", err);
  } finally {
    processing = false;
  }
  return done;
}
