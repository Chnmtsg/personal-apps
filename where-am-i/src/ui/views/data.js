/**
 * Export and import.
 *
 * This screen exists because the data lives in one browser's IndexedDB and
 * nowhere else. No account, no sync, no copy on a server — which is the point,
 * and also means the export button is the only backup there is. It says so.
 */

import { h } from '../dom.js';
import { screen, button, notice, toast } from '../chrome.js';
import { toJSON, filename, parse } from '../../core/exchange.js';
import * as store from '../../core/store.js';
import { go } from '../router.js';

export function dataView() {
  const state = store.state();
  const counts = `${state.goals.length} goals · ${state.indicators.length} indicators · ${state.checkIns.length} check-ins`;
  const report = h('div', { class: 'report' });

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    onchange: (event) => importFile(event.target.files?.[0], report),
  });

  return screen({
    title: 'Your data',
    subtitle: counts,
    onBack: () => go('/'),
    children: [
      h('section', { class: 'section' },
        h('h2', { class: 'section-title' }, 'Export'),
        h('p', { class: 'lede' }, 'Everything, as one JSON file you can read. Clearing site data or losing this device loses the numbers, and there is no copy anywhere else.'),
        button('Export everything', { variant: 'primary', onclick: exportAll })),

      h('section', { class: 'section' },
        h('h2', { class: 'section-title' }, 'Import'),
        h('p', { class: 'lede' }, 'Loads an exported file. It replaces what is here rather than merging — two datasets sharing ids have no honest merge.'),
        button('Choose a file', { onclick: () => fileInput.click() }),
        fileInput,
        report),

      h('section', { class: 'section' },
        h('h2', { class: 'section-title' }, 'How the numbers work'),
        h('ul', { class: 'explainer' },
          h('li', null, 'Progress is the distance from your baseline to your target, weighted across the indicators.'),
          h('li', null, 'Pace is that progress minus the share of the time already spent. It is kept separate on purpose.'),
          h('li', null, 'The projection is a least-squares line through your last five check-ins. Under three, or going the wrong way, and it stays silent rather than inventing a date.'))),
    ],
  });
}

function exportAll() {
  const blob = new Blob([toJSON(store.state())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: filename() });
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Exported.');
}

async function importFile(file, report) {
  report.replaceChildren();
  if (!file) return;

  const result = parse(await file.text());
  if (!result.ok) {
    report.append(...result.problems.map((problem) => notice(problem, 'error')));
    return;
  }

  const { goals, indicators, checkIns } = result.contents;
  const confirmed = window.confirm(
    `Replace everything here with ${goals.length} goals, ${indicators.length} indicators and ${checkIns.length} check-ins?\n\nWhat is currently stored will be gone.`,
  );
  if (!confirmed) return;

  await store.replaceAll(result.contents);
  report.append(...result.problems.map((problem) => notice(problem)));
  toast('Imported.');
  go('/');
}
