import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const appDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * Refuse to build a bundle that can't reach its backend.
 *
 * VITE_API_URL is inlined at build time, so a wrong value is not a
 * misconfiguration you notice at startup — it is baked into a deployed,
 * installed PWA that silently fails every analysis.
 */
function assertDeployableApiUrl(raw: string | undefined): void {
  const value = (raw ?? "").trim();
  const fail = (why: string): never => {
    throw new Error(
      `VITE_API_URL ${why}.\n\n` +
        `A production build must point at your deployed Worker. Create\n` +
        `app/.env.production (copy app/.env.production.example) containing:\n\n` +
        `  VITE_API_URL=https://english-feedback-proxy.<your-subdomain>.workers.dev\n`
    );
  };

  if (!value) fail("is not set");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(`is not an absolute URL (got "${value}")`);
  }

  if (url.protocol !== "https:") {
    fail(`must use https, or the installed PWA blocks it as mixed content (got "${value}")`);
  }
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)) {
    fail(`points at a local dev server (got "${value}")`);
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    assertDeployableApiUrl(loadEnv(mode, appDir, "").VITE_API_URL);
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "English Feedback",
          short_name: "EnFeedback",
          description: "English writing feedback with persistent error tracking",
          theme_color: "#1e40af",
          background_color: "#f8fafc",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ],
  };
});
