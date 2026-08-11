import { useEffect, useState, type DependencyList } from "react";
import { StorageBlockedError, StorageUnavailableError } from "./db";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

/**
 * Load data for a screen, surfacing failures instead of hanging.
 *
 * Every screen reads from IndexedDB, which can refuse to open (private
 * browsing, exhausted quota, a blocked upgrade). Without this, a rejected read
 * leaves the screen on its loading branch forever with nothing on screen and
 * an unhandled rejection in the console.
 */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    load().then(
      (data) => {
        if (live) setState({ status: "ready", data });
      },
      (err: unknown) => {
        console.error("Screen data failed to load:", err);
        if (!live) return;
        setState({
          status: "error",
          // Most specific first: a blocked upgrade is the one the learner can
          // fix, and telling them "private browsing" for it is a wrong answer.
          message:
            err instanceof StorageBlockedError
              ? "The app is open in another tab, and that tab is blocking an update. Close the other tabs, then reload this one."
              : err instanceof StorageUnavailableError
                ? "This browser will not let the app save your writing. Private browsing is the usual reason. Try opening the app in a normal window."
                : "We could not open your writing. Please try again.",
        });
      }
    );
    return () => {
      live = false;
    };
    // The caller owns the dependency list; `load` is re-created each render.
  }, deps);

  return state;
}
