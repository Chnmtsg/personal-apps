/**
 * Boot.
 *
 * Storage first, then routes, then the service worker. The store is loaded
 * before the first render so that no screen ever has to draw a "loading"
 * state over data that is already on the device.
 */

import './styles/tokens.css';
import './styles/app.css';

import * as store from './core/store.js';
import { define, start, render, go } from './ui/router.js';
import { h } from './ui/dom.js';
import { screen, button, notice } from './ui/chrome.js';
import { goalsView } from './ui/views/goals.js';
import { goalView } from './ui/views/goal.js';
import { checkInView } from './ui/views/checkin.js';
import { wizardView } from './ui/views/wizard.js';
import { dataView } from './ui/views/data.js';

define('/', goalsView);
define('/new', wizardView);
define('/data', dataView);
define('/goal/:id', goalView);
define('/goal/:id/check-in', checkInView);

const missing = () => screen({
  title: 'Not here',
  onBack: () => go('/'),
  children: [notice('That screen does not exist.', 'warn'), button('Back to your goals', { onclick: () => go('/') })],
});

const outlet = document.getElementById('app');

async function boot() {
  try {
    await store.load();
  } catch (error) {
    // Private-mode Safari and a full disk both land here. Say so, rather than
    // showing an empty list that looks like lost data.
    outlet.replaceChildren(screen({
      title: 'No storage',
      onBack: false,
      children: [
        notice('This browser will not let the app store anything, so there is nowhere to keep your goals. Private browsing is the usual cause.', 'error'),
        h('p', { class: 'lede' }, String(error?.message ?? error)),
      ],
    }));
    return;
  }

  start(outlet, missing);
  // Every write redraws the current screen. The dataset is small enough that a
  // full redraw is cheaper than tracking what changed, and views keep their own
  // unsaved input in drafts.
  store.subscribe(() => render());
}

boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // Resolved against the document, not this module: the worker is copied
    // verbatim from public/ and must sit beside index.html, because a worker
    // served from a hashed /assets/ path could only ever control /assets/.
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' })
      .catch(() => { /* Offline is a bonus, never a requirement to run. */ });
  });
}
