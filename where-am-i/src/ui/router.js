/**
 * Hash routing.
 *
 * The hash, not the History API: this ships as a static file set with no server
 * to rewrite paths, so a refresh on /goal/abc would 404 while #/goal/abc always
 * loads. It also survives being opened from the home screen offline.
 */

const routes = [];
let outlet = null;
let notFound = null;

/** define('/goal/:id', view) — one colon segment, which is all this app needs. */
export function define(pattern, view) {
  const names = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment;
      names.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');
  routes.push({ matcher: new RegExp(`^${source}$`), names, view });
}

export function start(node, fallback) {
  outlet = node;
  notFound = fallback;
  window.addEventListener('hashchange', render);
  render();
}

export function go(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (replace) window.history.replaceState(null, '', target);
  else window.location.hash = path;
  if (replace) render();
}

export function back(fallbackPath = '/') {
  if (window.history.length > 1) window.history.back();
  else go(fallbackPath);
}

export function path() {
  return window.location.hash.slice(1) || '/';
}

export async function render() {
  if (!outlet) return;
  const current = path();

  for (const route of routes) {
    const match = current.match(route.matcher);
    if (!match) continue;

    const params = Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
    const node = await route.view(params);
    outlet.replaceChildren(node);
    // A new screen starts at the top; keeping the old scroll position is
    // disorienting when the screens are different lengths.
    window.scrollTo(0, 0);
    outlet.focus({ preventScroll: true });
    return;
  }

  outlet.replaceChildren(notFound());
}
