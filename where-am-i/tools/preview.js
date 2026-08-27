/**
 * Renders every screen to one static HTML page, using the real views and the
 * real stylesheets.
 *
 * There is no browser in the test loop, and the stub DOM in dom-stub.js has no
 * layout — so nothing in `npm test` can tell you that a card is a mess or that
 * a chip has vanished into its own background. This closes that gap: seed some
 * plausible data, render the screens through the same code the app runs, and
 * write the markup out to look at.
 *
 *   npm run preview:screens   ->   preview/index.html
 *
 * It is a development tool. Nothing here ships.
 */

import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

import { installDom, Element } from './dom-stub.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'preview');

installDom();

const store = await import('../src/core/store.js');
const { goalsView } = await import('../src/ui/views/goals.js');
const { goalView } = await import('../src/ui/views/goal.js');
const { checkInView } = await import('../src/ui/views/checkin.js');
const { wizardView } = await import('../src/ui/views/wizard.js');
const { dataView } = await import('../src/ui/views/data.js');

const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr']);
const SVG_SHAPES = new Set(['circle', 'line', 'path', 'rect', 'polyline']);

const escape = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function serialise(node) {
  if (!(node instanceof Element)) return escape(node.nodeValue ?? '');

  const attributes = { ...node.attributes };
  if (node.value !== '' && node.value !== undefined) attributes.value = node.value;
  if (node.hidden) attributes.hidden = 'hidden';

  const pairs = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escape(value)}"`)
    .join('');

  const tag = node.localName;
  if (VOID.has(tag)) return `<${tag}${pairs}>`;
  if (SVG_SHAPES.has(tag)) return `<${tag}${pairs} />`;

  return `<${tag}${pairs}>${node.childNodes.map(serialise).join('')}</${tag}>`;
}

// A goal that is genuinely behind, so the pace chip and the late forecast are
// both on show. A preview where everything is fine proves nothing.
//
// Every date is relative to the real today. Fixed dates would drift into the
// past and quietly turn this into a preview of overdue goals instead.
const { today, addDays } = await import('../src/core/time.js');
const now = today();
const day = (offset) => addDays(now, offset);

const { goal } = await store.createGoal(
  {
    title: 'Run a half marathon',
    why: 'To stop negotiating with myself at 7am, and to find out whether I keep a promise nobody is checking.',
    startDate: day(-74),
    targetDate: day(78),
  },
  [
    { name: 'Longest run', unit: 'km', kind: 'lagging', baseline: 5, target: 21, weight: 2 },
    { name: 'Sessions', unit: 'per week', kind: 'leading', baseline: 1, target: 4 },
  ],
);

const [run, sessions] = store.indicatorsOf(goal.id);
for (const [offset, value] of [[-67, 6], [-53, 7.5], [-39, 9], [-25, 10], [-11, 11.5]]) {
  await store.recordCheckIns([{ indicatorId: run.id, value, date: day(offset) }]);
}
for (const [offset, value] of [[-67, 2], [-39, 3], [-11, 3]]) {
  await store.recordCheckIns([{ indicatorId: sessions.id, value, date: day(offset), note: offset === -11 ? 'one was a walk, counted anyway' : '' }]);
}

await store.createGoal(
  { title: 'Read 24 books', why: '', startDate: day(-74), targetDate: day(291) },
  [{ name: 'Books finished', unit: 'books', kind: 'lagging', baseline: 0, target: 24 }],
);

const screens = [
  ['Goal list', goalsView()],
  ['Goal detail', goalView({ id: goal.id })],
  ['Check-in', checkInView({ id: goal.id })],
  ['New goal', wizardView()],
  ['Your data', dataView()],
];

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Where Am I — screens</title>
    <link rel="stylesheet" href="./tokens.css" />
    <link rel="stylesheet" href="./app.css" />
    <style>
      body { background: var(--surface-sunken); }
      .gallery { display: flex; flex-wrap: wrap; gap: 32px; padding: 32px; align-items: flex-start; }
      .frame { width: 400px; border: 1px solid var(--border-strong); border-radius: 20px; overflow: hidden; background: var(--surface); }
      .frame > .screen { min-height: 0; }
      .frame-name { padding: 8px 12px; background: var(--ink); color: var(--surface); font: 600 12px var(--font); letter-spacing: 0.08em; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <div class="gallery">
      ${screens.map(([name, node]) => `<div class="frame"><div class="frame-name">${escape(name)}</div>${serialise(node)}</div>`).join('\n      ')}
    </div>
  </body>
</html>
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), page);
copyFileSync(join(ROOT, 'src', 'styles', 'tokens.css'), join(OUT, 'tokens.css'));
copyFileSync(join(ROOT, 'src', 'styles', 'app.css'), join(OUT, 'app.css'));
console.log(`preview/index.html — ${screens.length} screens, dated around ${now}`);
