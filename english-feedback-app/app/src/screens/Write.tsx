import { useEffect, useRef, useState } from "react";
import type { Screen } from "../App";
import { analyzeText, type AnalyzeFailure } from "../lib/api";
import { clearDraft, getDraft, saveDraft, saveEntry, type Entry } from "../lib/db";
import { countWords } from "../lib/categories";
import { applyFailure, type FailureOutcome } from "../lib/retry";

const MIN_WORDS = 30;

interface Props {
  navigate: (s: Screen) => void;
  showToast: (msg: string) => void;
}

/** What to tell the user after a failed analysis, and whether it will retry. */
function failureMessage(failure: AnalyzeFailure, outcome: FailureOutcome): string {
  if (outcome.status === "queued") {
    if (failure.kind === "rate_limited") {
      return "Rate limit reached — the entry is queued and will retry later.";
    }
    if (failure.kind === "network") {
      return "Couldn't reach the server. The entry is queued and will retry.";
    }
    return "The server had a problem. The entry is queued and will retry.";
  }
  switch (outcome.failReason) {
    case "refusal":
      return "This entry couldn't be analysed, but your text is saved.";
    case "too_long":
      return "That entry is too long to analyse in one go — try splitting it.";
    default:
      return "The server rejected that entry. Your text is saved in History.";
  }
}

export default function WriteScreen({ navigate, showToast }: Props) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<number>(undefined);

  useEffect(() => {
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
    if (busy || wordCount < MIN_WORDS) return;
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
      window.clearTimeout(saveTimer.current);
      await clearDraft();
    } catch (err) {
      // The text is still in the textarea, so the safe move is to keep the
      // user where they are rather than navigate away from unsaved writing.
      console.error("Couldn't save the entry:", err);
      showToast("Couldn't save to this device's storage. Your text is still here.");
      return;
    }
    setText("");

    if (!navigator.onLine) {
      showToast("Saved. It will be analysed when you're back online.");
      navigate({ name: "history" });
      return;
    }

    setBusy(true);
    let result;
    try {
      result = await analyzeText(entry.text);
    } finally {
      setBusy(false);
    }

    try {
      if (result.ok) {
        await saveEntry({
          ...entry,
          status: "analysed",
          feedback: result.feedback,
          modelId: result.model,
          promptVersion: result.promptVersion,
        });
        navigate({ name: "feedback", entryId: entry.id });
        return;
      }

      const outcome = applyFailure(entry.attempts ?? 0, result);
      await saveEntry({ ...entry, ...outcome });
      showToast(failureMessage(result, outcome));
    } catch (err) {
      console.error("Couldn't record the result:", err);
      showToast("Analysed, but the result couldn't be saved to this device.");
    }
    navigate({ name: "history" });
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Write</h1>
        {!online && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
            Offline — saved locally
          </span>
        )}
      </header>

      <label htmlFor="entry" className="sr-only">
        Your journal entry or book summary
      </label>
      <textarea
        id="entry"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        disabled={!loaded}
        placeholder="Write your journal entry or book summary here…"
        className="min-h-[55dvh] w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-base leading-relaxed shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
      />

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">
          {wordCount} {wordCount === 1 ? "word" : "words"}
          {wordCount > 0 && wordCount < MIN_WORDS && (
            <span className="text-slate-500"> · {MIN_WORDS - wordCount} more to analyse</span>
          )}
        </span>
        <button
          onClick={() => void handleAnalyse()}
          disabled={wordCount < MIN_WORDS || busy}
          className="min-h-11 rounded-full bg-blue-700 px-6 font-semibold text-white shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:bg-slate-400"
        >
          {busy ? "Analysing…" : "Analyse"}
        </button>
      </div>
    </div>
  );
}
