import type { Screen } from "../App";
import ErrorNote from "../components/ErrorNote";
import EditSpan from "../components/EditSpan";
import { getEntry } from "../lib/db";
import { buildSegments } from "../lib/highlight";
import { CATEGORY_LABELS, FAIL_REASON_LABELS, SEVERITY_STYLES } from "../lib/categories";
import { useLoad } from "../lib/useLoad";

interface Props {
  entryId: string;
  navigate: (s: Screen) => void;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function FeedbackScreen({ entryId, navigate }: Props) {
  const state = useLoad(() => getEntry(entryId), [entryId]);

  const back = (
    <button
      type="button"
      onClick={() => navigate({ name: "history" })}
      className="min-h-11 rounded-full bg-slate-200 px-4 text-sm font-medium"
    >
      ← Back
    </button>
  );

  if (state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex items-center gap-3">{back}</header>
        <ErrorNote message={state.message} />
      </div>
    );
  }

  const entry = state.data;
  if (!entry) {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex items-center gap-3">{back}</header>
        <p className="text-slate-600">Entry not found.</p>
      </div>
    );
  }

  const fb = entry.feedback;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        {back}
        <h1 className="text-xl font-bold">Feedback</h1>
      </header>

      {!fb ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">
          {entry.status === "queued"
            ? "This entry is waiting to be analysed."
            : `${FAIL_REASON_LABELS[entry.failReason ?? "server"] ?? "Couldn't analyse"} — your text is safe below.`}
          <p className="mt-3 whitespace-pre-wrap text-slate-800">{entry.text}</p>
        </div>
      ) : (
        <>
          {/* 1. One thing to fix */}
          <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-amber-800">
              One thing to fix
            </h2>
            <p className="text-amber-900">{fb.one_thing_to_fix}</p>
          </section>

          {/* 2. Corrected text with changed segments highlighted */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              Corrected text
            </h2>
            <p className="whitespace-pre-wrap leading-relaxed">
              {buildSegments(
                fb.corrected_text,
                fb.corrections.map((c) => c.corrected)
              ).map((seg, i) =>
                seg.highlighted ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>
              )}
            </p>
          </section>

          {/* 3. Corrections list */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              Corrections ({fb.corrections.length})
            </h2>
            <div className="flex flex-col divide-y divide-slate-100">
              {fb.corrections.map((c, i) => (
                <details key={i} className="group py-1">
                  <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 py-1.5">
                    <span
                      aria-hidden
                      className="mt-1 shrink-0 text-xs text-slate-400 transition-transform group-open:rotate-90"
                    >
                      ▸
                    </span>
                    <span className="flex-1 py-0.5">
                      <span className="block">
                        <EditSpan original={c.original} corrected={c.corrected} />
                      </span>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_STYLES[c.severity]}`}
                      >
                        {CATEGORY_LABELS[c.category]}
                      </span>
                    </span>
                  </summary>
                  <p className="ml-5 mt-1 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{c.rule}</p>
                </details>
              ))}
            </div>
          </section>

          {/* 3.5 Fluency notes — nothing was wrong, just less native-sounding */}
          {fb.fluency_notes && fb.fluency_notes.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                Sounds more natural
              </h2>
              <div className="flex flex-col gap-3">
                {fb.fluency_notes.map((n, i) => (
                  <div key={i}>
                    <p>
                      <span className="text-slate-500">{n.before}</span>{" "}
                      <span className="font-medium text-blue-700">→ {n.after}</span>
                    </p>
                    <p className="text-sm text-slate-600">{n.why}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4. Patterns in this entry */}
          {fb.patterns.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                Patterns in this entry
              </h2>
              <div className="flex flex-col gap-3">
                {fb.patterns.map((p, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{CATEGORY_LABELS[p.category]}</span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                        {p.count}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{p.explanation}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5. Scores */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Scores</h2>
            <div className="flex flex-col gap-3">
              <ScoreBar label="Grammar" value={fb.scores.grammar} />
              <ScoreBar label="Vocabulary" value={fb.scores.vocabulary} />
              <ScoreBar label="Naturalness" value={fb.scores.naturalness} />
            </div>
          </section>

          {/* 6. CEFR estimate + what went well */}
          <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <span className="rounded-xl bg-blue-700 px-3 py-2 text-lg font-bold text-white">
              {fb.cefr_estimate}
            </span>
            <div className="text-sm text-slate-600">
              Estimated CEFR level for this entry. Target: C1 (IELTS 7.5).
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-emerald-700">
              What went well
            </h2>
            <p className="text-emerald-900">{fb.what_went_well}</p>
          </section>

          {/* 7. Practice — targets the learner's worst category, using this entry's own vocabulary */}
          {fb.drills && fb.drills.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                Practice
              </h2>
              <div className="flex flex-col divide-y divide-slate-100">
                {fb.drills.map((d, i) => (
                  <details key={i} className="group py-1">
                    <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 py-1.5">
                      <span
                        aria-hidden
                        className="mt-1 shrink-0 text-xs text-slate-400 transition-transform group-open:rotate-90"
                      >
                        ▸
                      </span>
                      <span className="flex-1 py-0.5">
                        <p>{d.prompt}</p>
                        <p className="mt-1 text-xs text-slate-500">{d.hint}</p>
                      </span>
                    </summary>
                    <p className="ml-5 mt-1 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
                      <span className="font-semibold">Answer: </span>
                      {d.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* 8. Coach reply — a personal note about the content, deliberately not styled
              like the teaching cards above it */}
          {fb.coach_reply && (
            <section className="rounded-2xl bg-slate-100 p-4">
              <p className="text-sm italic leading-relaxed text-slate-700">{fb.coach_reply}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
