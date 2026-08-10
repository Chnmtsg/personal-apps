import { analyzeText } from "./api";
import { getQueuedEntries, saveEntry } from "./db";
import { applyFailure } from "./retry";

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
    const queued = await getQueuedEntries();
    for (const entry of queued) {
      const result = await analyzeText(entry.text);

      if (result.ok) {
        await saveEntry({
          ...entry,
          status: "analysed",
          feedback: result.feedback,
          modelId: result.model,
          promptVersion: result.promptVersion,
        });
        done++;
        continue;
      }

      await saveEntry({ ...entry, ...applyFailure(entry.attempts ?? 0, result) });

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
