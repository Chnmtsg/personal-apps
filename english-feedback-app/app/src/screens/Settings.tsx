import { useEffect, useState } from "react";
import {
  CEFR_LEVELS,
  MODEL_ID,
  PROMPT_VERSION,
  type LearnerProfile,
} from "../../../shared/schema";
import { deleteAllData, exportAllJson, getProfile, saveProfile } from "../lib/db";

interface Props {
  showToast: (msg: string) => void;
}

/** Plain-language descriptions — "B1" alone means nothing to most people. */
const LEVEL_LABELS: Record<(typeof CEFR_LEVELS)[number], string> = {
  A1: "A1 — I know a few words and phrases",
  A2: "A2 — I can write simple sentences",
  B1: "B1 — I can describe my day and my work",
  B2: "B2 — I can talk about most things without much trouble",
  C1: "C1 — I can write clearly about complex things",
  C2: "C2 — I write English almost like a native speaker",
};

export default function SettingsScreen({ showToast }: Props) {
  const [profile, setProfile] = useState<LearnerProfile>({});
  // What is actually on disk, so the form can say when it has drifted from it.
  const [saved, setSaved] = useState<LearnerProfile>({});
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    void getProfile()
      .then((stored) => {
        setProfile(stored);
        setSaved(stored);
      })
      .catch((err) => console.error("Couldn't load your profile:", err))
      .finally(() => setProfileLoaded(true));
  }, []);

  // Saved explicitly rather than on every keystroke: this changes how future
  // feedback is written, so it should be a decision, not a side effect. The
  // cost of that choice is that switching tabs unmounts the screen and drops
  // unsaved edits, so the button has to say when there is something to lose.
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved);

  const handleSaveProfile = async () => {
    try {
      await saveProfile(profile);
    } catch (err) {
      console.error("Couldn't save your profile:", err);
      showToast("We could not save that on your device.");
      return;
    }
    setSaved(profile);
    showToast("Saved. Your next feedback will use this.");
  };

  /**
   * The caps match LearnerProfileSchema. They are enforced in the input rather
   * than only at save time because the schema validates the profile as a
   * whole: one over-long field would fail the parse on the next read and
   * silently discard every other field with it.
   */
  const FIELD_LIMITS = { nativeLanguage: 40, field: 80, goal: 120 } as const;

  const field = (key: keyof typeof FIELD_LIMITS) => ({
    value: profile[key] ?? "",
    maxLength: FIELD_LIMITS[key],
    autoCapitalize: "none" as const,
    "aria-describedby": `${key}-help`,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setProfile((p) => ({ ...p, [key]: e.target.value.slice(0, FIELD_LIMITS[key]) })),
    disabled: !profileLoaded,
    className:
      "min-h-11 w-full rounded-xl border border-rule bg-card px-3 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25",
  });

  const handleExport = async () => {
    let json: string;
    try {
      json = await exportAllJson();
    } catch (err) {
      // Export is the user's only backup route — failing silently here is how
      // someone finds out their data was unreadable only after deleting it.
      console.error("Export failed:", err);
      showToast("We could not read your data to export it.");
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `english-feedback-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    const sure = window.confirm(
      "Delete all your writing and feedback from this device? You cannot get it back. Export a copy first if you want to keep it."
    );
    if (!sure) return;
    try {
      await deleteAllData();
    } catch (err) {
      console.error("Delete failed:", err);
      showToast("We could not delete your data.");
      return;
    }
    showToast("We deleted everything.");
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-3xl leading-none">Settings</h1>

      {/* Every field is optional. The app works with none of them filled in —
          it simply teaches the English rule and does not guess at a cause. */}
      <section className="rounded-2xl border border-rule bg-card p-5">
        <h2 className="eyebrow">About you</h2>
        <p className="mt-1 mb-3 text-sm text-ink-soft">
          This helps us explain <em>why</em> you made a mistake, not only what to change. Every
          box can be left empty.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="nativeLanguage" className="mb-1 block text-sm font-medium">
              Your first language
            </label>
            <input id="nativeLanguage" type="text" placeholder="Spanish, Arabic, Mongolian…" {...field("nativeLanguage")} />
            <p id="nativeLanguage-help" className="mt-1 text-sm text-ink-soft">
              Most mistakes come from the differences between your language and English. When we
              know it, we can tell you the reason.
            </p>
          </div>

          <div>
            <label htmlFor="learnerField" className="mb-1 block text-sm font-medium">
              Your work or study
            </label>
            <input id="learnerField" type="text" placeholder="geology, nursing, software, school…" {...field("field")} />
            <p id="field-help" className="mt-1 text-sm text-ink-soft">
              We use this for examples and new words, so they are useful to you.
            </p>
          </div>

          <div>
            <label htmlFor="level" className="mb-1 block text-sm font-medium">
              Your English level
            </label>
            <select
              id="level"
              value={profile.level ?? ""}
              disabled={!profileLoaded}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  level: e.target.value ? (e.target.value as LearnerProfile["level"]) : undefined,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-rule bg-card px-3 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            >
              <option value="">I am not sure</option>
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-ink-soft">
              We write your feedback at this level, so you can read it.
            </p>
          </div>

          <div>
            <label htmlFor="goal" className="mb-1 block text-sm font-medium">
              Your goal
            </label>
            <input id="goal" type="text" placeholder="pass an exam, write better emails…" {...field("goal")} />
            <p id="goal-help" className="mt-1 text-sm text-ink-soft">
              What you want to use English for.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={!profileLoaded || !dirty}
              className="min-h-11 rounded-full bg-accent px-6 text-sm font-semibold text-paper disabled:bg-rule-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Save
            </button>
            {dirty && <span className="text-sm text-warn">Not saved yet</span>}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-rule bg-card p-5">
        <h2 className="eyebrow mb-2.5">
          Privacy
        </h2>
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-muted">
          <p>
            <strong>Your writing stays on this device.</strong> Every piece of writing and all
            feedback are saved here, inside this browser. There is no account and no cloud.
          </p>
          <p>
            <strong>What leaves this device:</strong> when you tap Analyse, that one piece of
            writing is sent to our server, together with the “About you” details above and a
            count of the error types you make most. Our server sends them to Anthropic's Claude
            to be checked, and sends the feedback back to you.
          </p>
          <p>
            <strong>What we keep:</strong> nothing. Our server does not save your writing
            anywhere. It checks it, sends the answer back, and forgets it.
          </p>
          <p>
            Because everything is saved only here, deleting this browser's data will also delete
            your writing. Use Export below to keep a copy.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-rule bg-card p-5">
        <h2 className="eyebrow mb-2.5">
          Your data
        </h2>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-paper"
          >
            Export all data (JSON)
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="min-h-11 rounded-full border border-warn/40 px-5 text-sm font-semibold text-warn"
          >
            Delete all data
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-rule bg-card p-5 text-sm text-ink-soft">
        <h2 className="eyebrow mb-2.5">About</h2>
        <p>
          Model: <code className="rounded bg-sunk px-1 font-mono text-[12px]">{MODEL_ID}</code>
        </p>
        <p>
          Teaching prompt version: <code className="rounded bg-sunk px-1 font-mono text-[12px]">{PROMPT_VERSION}</code>
        </p>
      </section>
    </div>
  );
}
