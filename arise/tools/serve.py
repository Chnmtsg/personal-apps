"""A local server that never lets the browser cache anything.

    python tools/serve.py [port]

`python -m http.server` sends no `Cache-Control` at all, so the browser applies
heuristic caching to everything — including `sw.js`. A cached service worker
script is the worst case of that: `registration.update()` re-reads the stale
copy, finds it identical to what is installed, and reports that there is nothing
new, while the fix you just wrote sits on disk unread. The spec only forces a
network fetch once the cached copy is 24 hours old.

Production wants the opposite of this — see `_headers`, where the app is
cache-first on purpose so it works on a plane. This is for the machine where the
code is changing every few minutes.
"""

import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoStore(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    print(f"\n  Discipline at http://localhost:{port}  (nothing is cached)\n")
    HTTPServer(("", port), NoStore).serve_forever()
