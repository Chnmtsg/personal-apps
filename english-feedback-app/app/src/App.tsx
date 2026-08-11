import { useCallback, useEffect, useRef, useState } from "react";
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

/* No icons. The four words are short, and an emoji beside each one was the
   loudest thing on a screen whose whole subject is careful writing. */
const TABS: Array<{ name: Screen["name"]; label: string }> = [
  { name: "write", label: "Write" },
  { name: "log", label: "Patterns" },
  { name: "history", label: "History" },
  { name: "settings", label: "Settings" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "write" });
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const toastTimer = useRef<number>(undefined);

  const showToast = useCallback((message: string) => {
    // Without clearing the previous timer, a second toast within 4s is
    // dismissed by the FIRST toast's timer, not its own.
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  // Analyse queued entries on launch and whenever the connection returns (§3.3).
  //
  // Also on a timer and on regaining focus, because neither of those two
  // events is guaranteed to happen again: a device that never went offline
  // never fires `online`, so a rate limit, a server blip, or a claim left
  // behind by a killed tab would otherwise wait for a full relaunch.
  useEffect(() => {
    const run = async () => {
      const analysed = await processQueue();
      if (analysed > 0) {
        showToast(`We checked ${analysed} saved ${analysed === 1 ? "entry" : "entries"}.`);
        setRefreshKey((k) => k + 1);
      }
    };
    const runIfVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    void run();
    const timer = window.setInterval(runIfVisible, 60_000);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", runIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", runIfVisible);
    };
  }, [showToast]);

  const activeTab = screen.name === "feedback" ? "history" : screen.name;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      {/* The nav is 56px plus the home-indicator inset, so both the padding
          here and the toast below have to clear the inset as well — at a
          fixed 5rem the toast sits behind the tab bar on any device with
          one. */}
      <main className="flex-1 px-6 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {screen.name === "write" && (
          <WriteScreen navigate={setScreen} showToast={showToast} />
        )}
        {screen.name === "feedback" && (
          <FeedbackScreen entryId={screen.entryId} navigate={setScreen} showToast={showToast} />
        )}
        {screen.name === "log" && <ErrorLogScreen key={refreshKey} showToast={showToast} />}
        {screen.name === "history" && (
          <HistoryScreen key={refreshKey} navigate={setScreen} />
        )}
        {screen.name === "settings" && <SettingsScreen showToast={showToast} />}
      </main>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-20 max-w-[90vw] -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-center text-sm text-paper shadow-lg"
        >
          {toast}
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-sunk pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-xl px-2">
          {TABS.map((tab) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setScreen({ name: tab.name } as Screen)}
              aria-current={activeTab === tab.name ? "page" : undefined}
              className="flex min-h-14 flex-1 flex-col items-center gap-1.5 pt-3"
            >
              {/* The active marker is a rule above the label rather than a
                  filled pill: it reads at a glance and costs no colour. */}
              <span
                aria-hidden
                className={`h-0.5 w-5.5 ${activeTab === tab.name ? "bg-accent" : "bg-transparent"}`}
              />
              <span
                className={`text-[11px] ${
                  activeTab === tab.name ? "font-semibold text-accent" : "text-ink-faint"
                }`}
              >
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
