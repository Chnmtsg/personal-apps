/**
 * Goal detail — all three questions, for one goal, in the order they matter:
 * how far, how the pace compares, and where this lands.
 *
 * One card per indicator, because the answer for a goal is only ever the sum of
 * the answers for its numbers, and a user falling behind needs to see which
 * one is doing it.
 */

import { h } from '../dom.js';
import { screen, button, paceChip, notice, toast } from '../chrome.js';
import { ring, sparkline, projectionChart } from '../svg.js';
import { percent, measure, shortDate, dayCount, rate, since } from '../format.js';
import * as store from '../../core/store.js';
import { summarise, series, projection, indicatorProgress, direction } from '../../core/math.js';
import { today, daysBetween } from '../../core/time.js';
import { go } from '../router.js';

export function goalView({ id }) {
  const goal = store.goal(id);
  if (!goal) return screen({ title: 'Gone', children: [notice('That goal is not here any more.', 'warn')] });

  const now = today();
  const indicators = store.indicatorsOf(goal.id);
  const summary = summarise(goal, indicators, now);

  return screen({
    title: goal.title,
    subtitle: `${shortDate(goal.startDate)} → ${shortDate(goal.targetDate)}`,
    onBack: () => go('/'),
    actions: [h('a', { class: 'button is-primary is-compact', href: `#/goal/${goal.id}/check-in` }, 'Check in')],
    children: [
      header(goal, summary),
      goal.why ? h('blockquote', { class: 'why' }, goal.why) : null,
      !summary.hasLeading && indicators.length > 0
        ? notice('Every indicator on this goal is an outcome. When you fall behind there is no behaviour here to change — add a leading indicator.')
        : null,
      h('div', { class: 'cards' }, ...indicators.map((indicator) => indicatorCard(goal, indicator, now))),
      footer(goal),
    ],
  });
}

function header(goal, summary) {
  return h('section', { class: 'summary' },
    ring(summary.progress, summary.expected, { size: 96, stroke: 9, label: percent(summary.progress) }),
    h('dl', { class: 'summary-figures' },
      figure('Progress', percent(summary.progress), 'from where you started'),
      figure('Expected by now', percent(summary.expected), 'of the time is spent'),
      h('div', { class: 'summary-figure' },
        h('dt', null, 'Pace'),
        h('dd', null, paceChip(summary)),
        h('span', { class: 'summary-note' }, dayCount(summary.daysRemaining)))));
}

const figure = (label, value, note) => h('div', { class: 'summary-figure' },
  h('dt', null, label),
  h('dd', { class: 'is-numeric' }, value),
  h('span', { class: 'summary-note' }, note));

function indicatorCard(goal, indicator, now) {
  const checkIns = store.checkInsOf(indicator.id);
  const points = series(checkIns);
  const forecast = projection(indicator, checkIns, now);
  const progress = indicatorProgress(indicator);
  const last = points[points.length - 1];

  return h('article', { class: 'card' },
    h('div', { class: 'card-head' },
      h('div', null,
        h('h3', { class: 'card-title' }, indicator.name),
        h('p', { class: 'card-sub' },
          h('span', { class: `tag is-${indicator.kind}` }, indicator.kind),
          h('span', null, direction(indicator) === 'down' ? 'lower is better' : 'higher is better'),
          indicator.weight !== 1 ? h('span', null, `weight ${measure(indicator.weight)}`) : null)),
      sparkline(points, { baseline: indicator.baseline, target: indicator.target })),

    h('div', { class: 'readings' },
      reading('Started', measure(indicator.baseline, indicator.unit)),
      reading('Now', measure(indicator.current, indicator.unit), last ? since(last.checkIn.date, now) : 'no check-ins yet'),
      reading('Target', measure(indicator.target, indicator.unit), percent(progress))),

    points.length > 0
      ? projectionChart(indicator, points, forecast, goal, now)
      : h('p', { class: 'card-quiet' }, 'Nothing recorded yet. The first check-in starts the line.'),

    forecastLine(forecast, indicator, goal, now));
}

const reading = (label, value, note) => h('div', { class: 'reading' },
  h('span', { class: 'reading-label' }, label),
  h('span', { class: 'reading-value is-numeric' }, value),
  note ? h('span', { class: 'reading-note' }, note) : null);

/**
 * The projection, in a sentence.
 *
 * When there is no honest forecast this says so plainly. Printing a date the
 * data does not support is the failure this app is meant to avoid.
 */
function forecastLine(forecast, indicator, goal, now) {
  const speed = rate(forecast.velocity, indicator.unit);

  if (forecast.status === 'reached') {
    return h('p', { class: 'forecast is-reached' }, 'Target reached.', speed ? h('span', { class: 'forecast-rate' }, speed) : null);
  }
  if (forecast.status === 'no-movement') {
    return h('p', { class: 'forecast is-none' },
      forecast.velocity === null
        ? 'Not enough check-ins to project from — three on different days is the minimum.'
        : 'No movement towards the target at this rate, so there is no date to give.');
  }
  if (forecast.status === 'beyond-horizon') {
    return h('p', { class: 'forecast is-none' },
      'Moving, but too slowly to name a date.',
      speed ? h('span', { class: 'forecast-rate' }, speed) : null);
  }

  const slack = daysBetween(forecast.date, goal.targetDate);
  const late = slack < 0;
  return h('p', { class: `forecast ${late ? 'is-late' : 'is-in-time'}` },
    h('span', null, `At this rate: ${shortDate(forecast.date)}`),
    h('span', { class: 'forecast-gap' }, late ? `${Math.abs(slack)} days past the deadline` : `${slack} days to spare`),
    speed ? h('span', { class: 'forecast-rate' }, speed) : null);
}

function footer(goal) {
  const close = goal.status === 'active'
    ? button('Mark done', { onclick: async () => { await store.updateGoal(goal.id, { status: 'done' }); toast('Goal closed.'); } })
    : button('Reopen', { onclick: async () => { await store.updateGoal(goal.id, { status: 'active' }); toast('Goal reopened.'); } });

  return h('section', { class: 'goal-actions' },
    close,
    button('Delete goal', {
      variant: 'danger',
      onclick: async () => {
        // Deleting a goal takes its whole measurement history with it, and this
        // app has no server-side copy to restore from.
        if (!window.confirm(`Delete "${goal.title}" and every check-in on it? This cannot be undone.`)) return;
        await store.deleteGoal(goal.id);
        go('/');
        toast('Goal deleted.');
      },
    }));
}
