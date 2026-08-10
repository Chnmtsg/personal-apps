import { useCallback, useEffect, useState } from "react";
import WriteScreen from "./screens/Write";
import FeedbackScreen from "./screens/Feedback";
import ErrorLogScreen from "./screens/ErrorLog";
import HistoryScreen from "./screens/History";
import SettingsScreen from "./screens/Settings";
import { processQueue } from "./lib/queue";

export type Screen =
  | { name: "write" }
  | { name: "feedback"; entryId: string }
  | { name: "log" }
  | { name: "history" }
  | { name: "settings" };

const TABS: Array<{ name: Screen["name"]; label: string; icon: string }> = [
  { name: "write", label: "Write", icon: "✍️" },
  { name: "log", label: "Errors", icon: "📊" },
  { name: "history", label: "History", icon: "🕘" },
  { name: "settings", label: "Settings", icon: "⚙️" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "write" });
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  // Analyse queued entries on launch and whenever the connection returns (§3.3).
  useEffect(() => {
    const run = async () => {
      const analysed = await processQueue();
      if (analysed > 0) {
        showToast(`${analysed} queued ${analysed === 1 ? "entry" : "entries"} analysed`);
        setRefreshKey((k) => k + 1);
      }
    };
    void run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [showToast]);

  const activeTab = screen.name === "feedback" ? "history" : screen.name;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <main className="flex-1 px-4 pb-24 pt-4">
        {screen.name === "write" && (
          <WriteScreen navigate={setScreen} showToast={showToast} />
        )}
        {screen.name === "feedback" && (
          <FeedbackScreen entryId={screen.entryId} navigate={setScreen} />
        )}
        {screen.name === "log" && <ErrorLogScreen key={refreshKey} />}
        {screen.name === "history" && (
          <HistoryScreen key={refreshKey} navigate={setScreen} />
        )}
        {screen.name === "settings" && <SettingsScreen showToast={showToast} />}
      </main>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-20 max-w-[90vw] -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-2 text-center text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-xl">
          {TABS.map((tab) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setScreen({ name: tab.name } as Screen)}
              aria-current={activeTab === tab.name ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                activeTab === tab.name ? "font-semibold text-blue-700" : "text-slate-600"
              }`}
            >
              <span aria-hidden className="text-lg leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
