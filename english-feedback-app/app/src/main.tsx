import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

// Self-hosted rather than loaded from a font CDN. Two reasons, both project
// constraints: an installed PWA opened offline would otherwise fall back to
// Georgia and system-ui, and a CDN sees every reader's IP address on every
// launch — which the privacy statement in Settings does not mention because
// it does not happen. Bundled fonts are precached with the rest of the shell.
// Only the weights and subsets the design actually uses: importing a bare
// weight pulls in Cyrillic, Greek and Vietnamese too, and every one of those
// files then has to be precached for an app whose interface is English.
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./index.css";

registerSW({ immediate: true });

// Dev-only sample data, so the Feedback screen can be looked at without a live
// model call against a deployed Worker. `import.meta.env.DEV` is replaced with
// `false` at build time, so Rollup drops this branch and never emits the chunk.
// This is the ONLY reference to src/dev/ — keep it that way, and never put a
// seed file in app/public/, because everything there ships.
if (import.meta.env.DEV) {
  void import("./dev/seedDemo.ts").then((m) => m.installDemoSeed());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
