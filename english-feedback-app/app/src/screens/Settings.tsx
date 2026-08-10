import { MODEL_ID, PROMPT_VERSION } from "../../../shared/schema";
import { deleteAllData, exportAllJson } from "../lib/db";

interface Props {
  showToast: (msg: string) => void;
}

export default function SettingsScreen({ showToast }: Props) {
  const handleExport = async () => {
    let json: string;
    try {
      json = await exportAllJson();
    } catch (err) {
      // Export is the user's only backup route — failing silently here is how
      // someone finds out their data was unreadable only after deleting it.
      console.error("Export failed:", err);
      showToast("Couldn't read your data to export it.");
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
      "Delete ALL entries and feedback from this device? This cannot be undone. Consider exporting first."
    );
    if (!sure) return;
    try {
      await deleteAllData();
    } catch (err) {
      console.error("Delete failed:", err);
      showToast("Couldn't delete your data.");
      return;
    }
    showToast("All data deleted.");
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Privacy
        </h2>
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-slate-700">
          <p>
            <strong>Your writing stays on this device.</strong> Every entry and all feedback are
            stored locally, in this browser's storage. There are no accounts and no cloud sync.
          </p>
          <p>
            <strong>What leaves the device:</strong> when you tap Analyse, the text of that one
            entry is sent over HTTPS to our own server, which forwards it to Anthropic's Claude
            API for analysis and returns the feedback.
          </p>
          <p>
            <strong>What is not stored elsewhere:</strong> our server does not log or keep your
            text — it processes the request and discards it.
          </p>
          <p>
            Because data lives only here, clearing this browser's site data deletes it. Use
            Export below to keep a backup.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Your data
        </h2>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="min-h-11 rounded-full bg-blue-700 px-5 font-semibold text-white"
          >
            Export all data (JSON)
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="min-h-11 rounded-full border border-red-400 px-5 font-semibold text-red-700"
          >
            Delete all data
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">About</h2>
        <p>
          Model: <code className="rounded bg-slate-100 px-1">{MODEL_ID}</code>
        </p>
        <p>
          Teaching prompt version: <code className="rounded bg-slate-100 px-1">{PROMPT_VERSION}</code>
        </p>
      </section>
    </div>
  );
}
