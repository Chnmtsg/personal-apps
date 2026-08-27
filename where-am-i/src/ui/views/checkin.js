/**
 * Check-in — every number for one goal, on one screen.
 *
 * One screen because measurement has to be cheap. A flow that asks four
 * questions to record four numbers is a flow people stop using in week three,
 * and an app with no check-ins cannot answer anything.
 *
 * Blank is a real answer here: skipping a number records nothing for it rather
 * than storing a zero that would drag the goal down.
 */

import { h } from '../dom.js';
import { screen, button, field, numberInput, textInput, notice, toast, empty } from '../chrome.js';
import { measure, since } from '../format.js';
import * as store from '../../core/store.js';
import { direction } from '../../core/math.js';
import { today } from '../../core/time.js';
import { go } from '../router.js';

/**
 * What has been typed but not yet saved, per goal.
 *
 * The screen redraws whenever the store changes — deleting a mistyped reading
 * from the history below is one such change — and a redraw that emptied the
 * boxes the user had just filled in would be its own small betrayal. Cleared
 * on save and on cancel.
 */
const drafts = new Map();

const draftFor = (goalId, now) => {
  if (!drafts.has(goalId)) drafts.set(goalId, { date: now, note: '', values: {} });
  return drafts.get(goalId);
};

export function checkInView({ id }) {
  const goal = store.goal(id);
  if (!goal) return screen({ title: 'Gone', children: [notice('That goal is not here any more.', 'warn')] });

  const now = today();
  const indicators = store.indicatorsOf(goal.id);
  if (indicators.length === 0) {
    return screen({ title: 'Check in', children: [empty('No indicators.', 'This goal has nothing to measure.')] });
  }

  const draft = draftFor(goal.id, now);
  const dateInput = h('input', {
    type: 'date',
    class: 'input',
    value: draft.date || now,
    max: now,
    id: 'check-in-date',
    oninput: (event) => { draft.date = event.target.value; },
  });
  const noteInput = textInput({
    placeholder: 'Anything that explains these numbers',
    id: 'check-in-note',
    value: draft.note,
    oninput: (event) => { draft.note = event.target.value; },
  });
  const inputs = new Map();
  const problem = h('p', { class: 'notice is-warn', hidden: true });

  const rows = indicators.map((indicator) => {
    const last = store.checkInsOf(indicator.id).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const input = numberInput({
      placeholder: measure(indicator.current),
      'aria-label': `${indicator.name} in ${indicator.unit}`,
      enterkeyhint: 'next',
      value: draft.values[indicator.id] ?? '',
      oninput: (event) => { draft.values[indicator.id] = event.target.value; },
    });
    inputs.set(indicator.id, input);

    return h('div', { class: 'check-row' },
      h('div', { class: 'check-copy' },
        h('span', { class: 'check-name' }, indicator.name),
        h('span', { class: 'check-note' },
          `now ${measure(indicator.current, indicator.unit)}`,
          last ? ` · last measured ${since(last.date, now)}` : ' · never measured',
          ` · target ${measure(indicator.target, indicator.unit)} (${direction(indicator) === 'down' ? 'down' : 'up'})`)),
      h('div', { class: 'check-input' }, input, h('span', { class: 'check-unit' }, indicator.unit)));
  });

  const save = async () => {
    const entries = indicators
      .map((indicator) => ({
        indicatorId: indicator.id,
        value: inputs.get(indicator.id).value,
        date: dateInput.value || now,
        note: noteInput.value,
      }))
      .filter((entry) => entry.value.trim() !== '');

    if (entries.length === 0) {
      problem.textContent = 'Nothing to record. Fill in at least one number.';
      problem.hidden = false;
      return;
    }

    const written = await store.recordCheckIns(entries);
    drafts.delete(goal.id);
    toast(`${written.length} number${written.length === 1 ? '' : 's'} recorded.`);
    go(`/goal/${goal.id}`);
  };

  const cancel = () => {
    drafts.delete(goal.id);
    go(`/goal/${goal.id}`);
  };

  return screen({
    title: 'Check in',
    subtitle: goal.title,
    onBack: () => go(`/goal/${goal.id}`),
    children: [
      h('form', {
        class: 'form',
        onsubmit: (event) => { event.preventDefault(); save(); },
      },
      field({ label: 'Date', hint: 'Backdate it if you measured earlier — the trend uses the day, not the moment you typed it.', control: dateInput }),
      h('div', { class: 'check-rows' }, ...rows),
      field({ label: 'Note', hint: 'Optional. Attached to every number you record today.', control: noteInput }),
      problem,
      h('div', { class: 'form-actions' },
        button('Save check-in', { variant: 'primary', type: 'submit' }),
        button('Cancel', { onclick: cancel }))),
      history(indicators, now),
    ],
  });
}

/**
 * The recent history, with a way to delete a mistyped reading. Deleting one
 * re-derives the indicator's current value, so a fat-fingered 840kg can be
 * taken back rather than corrected by adding a second wrong number.
 */
function history(indicators, now) {
  const recent = indicators
    .flatMap((indicator) => store.checkInsOf(indicator.id).map((checkIn) => ({ checkIn, indicator })))
    .sort((a, b) => (b.checkIn.date.localeCompare(a.checkIn.date) || (b.checkIn.createdAt ?? '').localeCompare(a.checkIn.createdAt ?? '')))
    .slice(0, 12);

  if (recent.length === 0) return null;

  return h('section', { class: 'section' },
    h('h2', { class: 'section-title' }, 'Recent'),
    h('ul', { class: 'history' }, ...recent.map(({ checkIn, indicator }) => h('li', { class: 'history-row' },
      h('span', { class: 'history-date' }, since(checkIn.date, now)),
      h('span', { class: 'history-name' }, indicator.name),
      h('span', { class: 'history-value is-numeric' }, measure(checkIn.value, indicator.unit)),
      checkIn.note ? h('span', { class: 'history-note' }, checkIn.note) : null,
      h('button', {
        class: 'link-button',
        type: 'button',
        'aria-label': `Delete the ${indicator.name} reading from ${checkIn.date}`,
        onclick: async () => { await store.deleteCheckIn(checkIn.id); toast('Reading deleted.'); },
      }, 'delete')))));
}
