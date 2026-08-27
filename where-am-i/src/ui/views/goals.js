/**
 * The goal list — the first of the three questions, answered for everything at
 * once: how far have I come, and am I keeping up.
 *
 * One row per goal, and the two numbers side by side. Progress and pace are
 * never averaged into a single score, here or anywhere.
 */

import { h } from '../dom.js';
import { screen, button, paceChip, empty } from '../chrome.js';
import { go } from '../router.js';
import { ring } from '../svg.js';
import { percent, dayCount } from '../format.js';
import * as store from '../../core/store.js';
import { summarise } from '../../core/math.js';
import { today } from '../../core/time.js';

export function goalsView() {
  const now = today();
  const goals = store.goals();
  const active = goals.filter((goal) => goal.status === 'active');
  const closed = goals.filter((goal) => goal.status !== 'active');

  const body = goals.length === 0
    ? [empty(
      'Nothing measured yet.',
      'A goal here has to carry numbers: where you are today, where you want to be, and by when. That is the whole app.',
      button('Add the first goal', { variant: 'primary', onclick: () => go('/new') }),
    )]
    : [
      h('ul', { class: 'goal-list' }, ...active.map((goal) => goalRow(goal, now))),
      closed.length > 0
        ? h('section', { class: 'section' },
          h('h2', { class: 'section-title' }, 'Closed'),
          h('ul', { class: 'goal-list is-quiet' }, ...closed.map((goal) => goalRow(goal, now))))
        : null,
    ];

  return screen({
    title: 'Where am I',
    subtitle: goals.length > 0 ? `${active.length} live goal${active.length === 1 ? '' : 's'}` : null,
    onBack: false,
    actions: [
      h('a', { class: 'icon-button', href: '#/data', 'aria-label': 'Data' }, '↕'),
      h('a', { class: 'button is-primary is-compact', href: '#/new' }, 'New goal'),
    ],
    children: body,
  });
}

function goalRow(goal, now) {
  const indicators = store.indicatorsOf(goal.id);
  const summary = summarise(goal, indicators, now);

  return h('li', { class: 'goal-row' },
    h('a', { class: 'goal-link', href: `#/goal/${goal.id}` },
      ring(summary.progress, summary.expected, { size: 56, stroke: 6, label: percent(summary.progress) }),
      h('div', { class: 'goal-copy' },
        h('h2', { class: 'goal-title' }, goal.title),
        h('p', { class: 'goal-meta' },
          h('span', null, dayCount(summary.daysRemaining)),
          h('span', { class: 'dot', 'aria-hidden': 'true' }, '·'),
          h('span', null, `${indicators.length} indicator${indicators.length === 1 ? '' : 's'}`)),
        h('div', { class: 'goal-numbers' },
          paceChip(summary),
          // Spelling out the comparison the pace number is made of, so the
          // chip is never something the user has to take on trust.
          h('span', { class: 'goal-versus' }, `${percent(summary.progress)} done vs ${percent(summary.expected)} of the time`)),
        !summary.hasLeading && indicators.length > 0
          ? h('p', { class: 'goal-flag' }, 'No leading indicator — nothing here you control directly.')
          : null)));
}
