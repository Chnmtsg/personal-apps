import { useEffect, useRef, useState } from "react";
import type { Screen } from "../App";
import { analyzeText, type AnalyzeFailure } from "../lib/api";
import {
  claimForAnalysis,
  clearDraft,
  finishAnalysis,
  getAnalysedCount,
  getAnalysingEntries,
  getDraft,
  getEntries,
  getProfile,
  getRecurringCategories,
  saveDraft,
  saveEntry,
  type Entry,
} from "../lib/db";
import { countWords, FAIL_REASON_MESSAGES } from "../lib/categories";
import { activeClaim, STALE_CLAIM_MS } from "../lib/claim";
import { applyFailure, type FailureOutcome } from "../lib/retry";
import { MIN_WORDS } from "../../../shared/schema.ts";

/**
 * A soft heads-up only — nothing blocks a learner from writing past this.
 * `MAX_BODY_BYTES` (worker/src/index.ts) rejects a request outright around
 * 12KB, roughly 1,800–1,900 English words; this sits comfortably below that
 * so the caution has time to be read before a long entry risks the harder
 * "too long to check" failure.
 */
const LONG_ENTRY_CAUTION_WORDS = 1200;

interface Props {
  navigate: (s: Screen) => void;
  showToast: (msg: string) => void;
}

/** What to tell the user after a failed analysis, and whether it will retry. */
function failureMessage(failure: AnalyzeFailure, outcome: FailureOutcome): string {
  if (outcome.status === "queued") {
    if (failure.kind === "rate_limited") {
      return "The server is busy right now. We saved your writing and will try again later.";
    }
    if (failure.kind === "network") {
      return "We could not reach the server. We saved your writing and will try again.";
    }
    return "The server had a problem. We saved your writing and will try again.";
  }
  // One source of truth for the failure wording, so the toast and the
  // Feedback screen can never explain the same failure two different ways.
  return `${FAIL_REASON_MESSAGES[outcome.failReason ?? "server"]} It is saved in History.`;
}

/* The writing surface is ruled paper: a 32px repeating rule behind text set on
   a 32px line box. Both numbers have to move together or the text drifts off
   the lines as it wraps. */
const LINE = 32;
// Driven from var(--color-paper) rather than a literal hex, so the writing
// surface can never drift from the page it sits on if the token changes.
const RULED: React.CSSProperties = {
  lineHeight: `${LINE}px`,
  backgroundImage:
    "repeating-linear-gradient(var(--color-paper) 0px, var(--color-paper) " +
    (LINE - 1) +
    "px, rgba(28,26,23,0.09) " +
    (LINE - 1) +
    "px, rgba(28,26,23,0.09) " +
    LINE +
    "px)",
  backgroundAttachment: "local",
};

export default function WriteScreen({ navigate, showToast }: Props) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [profileEmpty, setProfileEmpty] = useState(false);
  const saveTimer = useRef<number>(undefined);
  /** Synchronous re-entrancy guard; see handleAnalyse. */
  const submitting = useRef(false);

  useEffect(() => {
    // Best-effort: a profile we cannot read is treated as set, so a storage
    // fault shows no nudge rather than a permanent one.
    void getProfile()
      .then((p) => setProfileEmpty(Object.values(p).every((v) => !v)))
      .catch((err) => console.error("Couldn't read the learner profile:", err));

    // A missing draft must not leave the editor permanently disabled.
    void getDraft()
      .then(setText)
      .catch((err) => console.error("Couldn't load the saved draft:", err))
      .finally(() => setLoaded(true));

    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Whether an analysis is running is derived from the stored claim, not from
  // this component's state: the in-flight promise dies with a tab switch, but
  // the claim does not, so the screen still says so after any remount.
  // Best-effort — a storage fault means no banner, not a broken screen.
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void getAnalysingEntries()
        .then((entries) => {
          if (alive) setChecking(activeClaim(entries, Date.now(), STALE_CLAIM_MS) !== null);
        })
        .catch((err) => console.error("Couldn't check for a running analysis:", err));
    };
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // Autosave to IndexedDB on every keystroke, debounced ~500 ms (§3.3, §5.1).
  const handleChange = (value: string) => {
    setText(value);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveDraft(value).catch((err) => console.error("Draft autosave failed:", err));
    }, 500);
  };

  const wordCount = countWords(text);

  const handleAnalyse = async () => {
    // `busy` is React state, so it is not set until after the three awaits
    // below — the button stays enabled for that whole window and a second tap
    // would store the writing twice and pay for two analyses. The ref closes
    // the window synchronously; `busy` only drives the label.
    if (submitting.current || wordCount < MIN_WORDS) return;
    submitting.current = true;

    // Before the first await: a debounced autosave firing during it would
    // otherwise land after clearDraft() and resurrect the entry as a draft.
    window.clearTimeout(saveTimer.current);

    try {
      await runAnalysis();
    } finally {
      submitting.current = false;
    }
  };

  const runAnalysis = async () => {
    const entry: Entry = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      text,
      wordCount,
      status: "queued",
      feedback: null,
      attempts: 0,
    };

    try {
      // Save first — the entry exists locally before any network call.
      await saveEntry(entry);
    } catch (err) {
      // The text is still in the textarea, so the safe move is to keep the
      // user where they are rather than navigate away from unsaved writing.
      console.error("Couldn't save the entry:", err);
      showToast("We could not save this on your device. Your writing is still here.");
      return;
    }
    // The entry is safely stored at this point — a failure here is only a
    // stale draft left behind, never a lost or duplicated entry. Reporting it
    // as a save failure would send the learner back to a textarea that then
    // resubmits an entry already on disk, paying for a second analysis.
    try {
      await clearDraft();
    } catch (err) {
      console.error("Couldn't clear the saved draft:", err);
    }
    setText("");

    if (!navigator.onLine) {
      showToast("Saved. We will check it when you are online again.");
      navigate({ name: "history" });
      return;
    }

    // Take the claim before the network call so the queue — which can start on
    // any `online` event, including one that fires mid-submit — cannot pick up
    // the same entry and pay to analyse it a second time.
    let claimed: Entry | null;
    try {
      claimed = await claimForAnalysis(entry.id);
    } catch (err) {
      console.error("Couldn't claim the entry for analysis:", err);
      showToast("Saved. We will check it soon.");
      navigate({ name: "history" });
      return;
    }
    if (!claimed) {
      showToast("Saved. We are checking it now.");
      navigate({ name: "history" });
      return;
    }

    // Best-effort context for teacher-voice selection and drills — never
    // worth failing the analysis over, so a read error just means no history.
    const [context, profile] = await Promise.all([
      getEntries()
        .then((entries) => ({
          history: getRecurringCategories(entries),
          entryNumber: getAnalysedCount(entries) + 1,
        }))
        .catch((err) => {
          console.error("Couldn't read entry history for context:", err);
          return { history: [], entryNumber: undefined };
        }),
      getProfile().catch((err) => {
        console.error("Couldn't read the learner profile:", err);
        return {};
      }),
    ]);

    setBusy(true);
    let result;
    try {
      result = await analyzeText(entry.text, context.history, profile, context.entryNumber);
    } finally {
      setBusy(false);
    }

    try {
      if (result.ok) {
        // finishAnalysis merges onto what is stored now, not onto this
        // minutes-old snapshot, which still carries feedback: null.
        await finishAnalysis(
          entry.id,
          {
            status: "analysed",
            feedback: result.feedback,
            modelId: result.model,
            promptVersion: result.promptVersion,
          },
          claimed.analysingSince
        );
        navigate({ name: "feedback", entryId: entry.id });
        return;
      }

      const outcome = applyFailure(claimed.attempts ?? 0, result);
      await finishAnalysis(entry.id, outcome, claimed.analysingSince);
      showToast(failureMessage(result, outcome));
    } catch (err) {
      console.error("Couldn't record the result:", err);
      showToast("We checked your writing, but could not save it on this device.");
    }
    navigate({ name: "history" });
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="flex h-full flex-col">
      {!online && (
        /* Full-width, above the heading: offline is a fact about the whole
           screen, and as a badge beside the title it read as a status of the
           title. */
        <div className="-mx-6 mb-4 flex items-center gap-2 border-b border-warn/20 bg-warn-soft px-6 py-2">
          <span aria-hidden className="size-1.5 rounded-full bg-warn" />
          <span className="text-xs font-medium text-warn">
            No connection — saving to this device
          </span>
        </div>
      )}

      {(busy || checking) && (
        /* Same full-width strip as the offline notice: a running analysis is a
           fact about the whole screen. `busy` covers the seconds before the
           claim is readable back; `checking` carries it across remounts. */
        <div
          role="status"
          className="-mx-6 mb-4 flex items-center gap-2 border-b border-accent/20 bg-accent-soft px-6 py-2"
        >
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
          <span className="text-xs font-medium text-accent">
            Checking your last entry — this can take a few minutes. You can keep writing.
          </span>
        </div>
      )}

      <header className="flex items-baseline justify-between">
        <h1 className="font-serif text-3xl leading-none">Write</h1>
        <span className="eyebrow">{today}</span>
      </header>

      {/* Without a first language we can correct the writing but not say why
          the mistake happened, which is the part worth reading. Nothing else
          in the app mentions the profile exists, so a learner who never opens
          Settings would get the thinner feedback forever without knowing why.
          Disappears as soon as anything is filled in. */}
      {profileEmpty && (
        <button
          type="button"
          onClick={() => navigate({ name: "settings" })}
          className="mt-4 flex w-full items-baseline gap-2 border-l-2 border-accent bg-accent-soft px-3.5 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="text-[14.5px] leading-snug text-ink-muted">
            <strong className="font-semibold text-ink">Tell us your first language.</strong> Then
            we can explain why a mistake happened, not only what to change.
          </span>
          <span aria-hidden className="ml-auto shrink-0 text-accent">
            ›
          </span>
        </button>
      )}

      <label htmlFor="entry" className="sr-only">
        Your journal entry or book summary
      </label>
      <textarea
        id="entry"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        disabled={!loaded}
        style={RULED}
        placeholder="Yesterday I…"
        className="mt-4 min-h-[55dvh] w-full flex-1 resize-none rounded-2xl border border-rule px-4 py-2 font-serif text-[16.5px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:ring-2 focus:ring-accent/25"
      />

      <div className="mt-4 flex items-center justify-between">
        <span className="flex flex-col gap-0.5">
          <span className="tnum font-mono text-[13px] font-medium text-ink">
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </span>
          {/* Shown from zero words too: at zero the Analyse button is disabled
              with nothing on screen saying why, on the first screen the
              learner ever sees. A caution past LONG_ENTRY_CAUTION_WORDS never
              disables anything — it only says splitting is an option. */}
          <span className="text-[11.5px] text-ink-faint">
            {wordCount < MIN_WORDS
              ? `write ${MIN_WORDS - wordCount} more to analyse`
              : wordCount >= LONG_ENTRY_CAUTION_WORDS
                ? "Long entry — you can still send it, or split it into two"
                : "Saved on this device"}
          </span>
        </span>
        <button
          onClick={() => void handleAnalyse()}
          disabled={wordCount < MIN_WORDS || busy}
          className="min-h-11 rounded-full bg-accent px-8 font-semibold text-paper shadow-[0_2px_8px_rgba(51,65,143,0.3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:bg-rule-strong disabled:text-ink-faint disabled:shadow-none"
        >
          {busy ? "Analysing…" : "Analyse"}
        </button>
      </div>
    </div>
  );
}
