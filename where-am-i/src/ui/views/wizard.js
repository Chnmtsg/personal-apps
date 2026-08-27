/**
 * The new-goal wizard: title → why → deadline → indicators.
 *
 * This is where the app earns its name. Nothing is written until the goal has
 * been turned into numbers, and the last step is the longest on purpose —
 * "get fit" takes five seconds to type and is worth nothing, so the effort is
 * spent where the value is.
 *
 * The draft lives in this module rather than in storage. A half-built goal is
 * not a goal, and the list must never show one.
 */

import { h } from '../dom.js';
import { screen, button, field, textInput, numberInput, notice, toast } from '../chrome.js';
import * as store from '../../core/store.js';
import { validateGoalDraft, makeGoal, makeIndicator } from '../../core/model.js';
import { today, addDays } from '../../core/time.js';
import { go } from '../router.js';

const STEPS = ['Goal', 'Why', 'When', 'Numbers'];

let draft = null;

function blankIndicator() {
  return { name: '', unit: '', kind: 'lagging', baseline: '', target: '', weight: '1' };
}

function blankDraft() {
  const now = today();
  return {
    step: 0,
    acknowledgedWarnings: false,
    faults: [],
    goal: { title: '', why: '', startDate: now, targetDate: addDays(now, 90) },
    indicators: [blankIndicator()],
  };
}

export function wizardView() {
  if (!draft) draft = blankDraft();
  const container = h('div', { class: 'wizard' });

  const redraw = () => {
    container.replaceChildren(steps(), body(redraw), controls(redraw));
    // Focus follows the step, so a keyboard or screen-reader user is not left
    // at the top of a screen that just changed underneath them.
    container.querySelector('input, select')?.focus({ preventScroll: true });
  };
  redraw();

  return screen({
    title: 'New goal',
    subtitle: STEPS[draft.step],
    onBack: () => {
      if (draft.step === 0) { draft = null; go('/'); return; }
      draft.step -= 1;
      draft.faults = [];
      redraw();
    },
    children: [container],
  });
}

const steps = () => h('ol', { class: 'steps' }, ...STEPS.map((label, index) => h('li', {
  class: `step${index === draft.step ? ' is-current' : ''}${index < draft.step ? ' is-done' : ''}`,
}, label)));

function body(redraw) {
  if (draft.step === 0) return titleStep();
  if (draft.step === 1) return whyStep();
  if (draft.step === 2) return whenStep();
  return indicatorStep(redraw);
}

function titleStep() {
  return h('div', { class: 'form' },
    field({
      label: 'What is the goal?',
      hint: 'Name the thing itself, not the feeling. "Run a half marathon", not "get fitter".',
      control: textInput({
        value: draft.goal.title,
        placeholder: 'Run a half marathon',
        enterkeyhint: 'next',
        oninput: (event) => { draft.goal.title = event.target.value; },
      }),
      error: faultFor('title'),
    }));
}

function whyStep() {
  return h('div', { class: 'form' },
    field({
      label: 'Why does this matter?',
      hint: 'Optional, and the field you will most want to reread in eight weeks when the numbers are flat.',
      control: h('textarea', {
        class: 'input is-multiline',
        rows: 4,
        value: draft.goal.why,
        placeholder: 'Because I want to stop negotiating with myself at 7am.',
        oninput: (event) => { draft.goal.why = event.target.value; },
      }),
    }));
}

function whenStep() {
  return h('div', { class: 'form' },
    field({
      label: 'Starting from',
      hint: 'Progress is measured from here, so backdate it if the work has already begun.',
      control: h('input', {
        type: 'date',
        class: 'input',
        value: draft.goal.startDate,
        oninput: (event) => { draft.goal.startDate = event.target.value; },
      }),
      error: faultFor('startDate'),
    }),
    field({
      label: 'By when',
      hint: 'A deadline is what makes pace a real number. Without one there is nothing to be ahead of.',
      control: h('input', {
        type: 'date',
        class: 'input',
        value: draft.goal.targetDate,
        oninput: (event) => { draft.goal.targetDate = event.target.value; },
      }),
      error: faultFor('targetDate'),
    }));
}

function indicatorStep(redraw) {
  return h('div', { class: 'form' },
    h('p', { class: 'lede' }, 'A goal is stored only once it has numbers. Give at least one, and at least one of them should be a behaviour you control.'),
    ...draft.indicators.map((indicator, index) => indicatorEditor(indicator, index, redraw)),
    button('Add another number', { onclick: () => { draft.indicators.push(blankIndicator()); redraw(); } }),
    faultFor('indicators') ? notice(faultFor('indicators'), 'error') : null,
    warningNotices());
}

function indicatorEditor(indicator, index, redraw) {
  const set = (key) => (event) => { indicator[key] = event.target.value; };

  return h('fieldset', { class: 'indicator-editor' },
    h('legend', null, `Indicator ${index + 1}`),
    draft.indicators.length > 1
      ? h('button', {
        class: 'link-button is-remove',
        type: 'button',
        onclick: () => { draft.indicators.splice(index, 1); redraw(); },
      }, 'remove')
      : null,

    field({
      label: 'What are you counting?',
      control: textInput({ value: indicator.name, placeholder: 'Longest run', oninput: set('name') }),
      error: faultFor(`indicator.${index}.name`),
    }),
    field({
      label: 'In what unit?',
      control: textInput({ value: indicator.unit, placeholder: 'km', oninput: set('unit') }),
      error: faultFor(`indicator.${index}.unit`),
    }),

    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'What kind of number is it?'),
      h('div', { class: 'choice' },
        kindChoice(indicator, 'leading', 'Leading', 'A behaviour you control — sessions a week, pages a day.', redraw),
        kindChoice(indicator, 'lagging', 'Lagging', 'An outcome you can only watch — weight, a test score.', redraw))),

    h('div', { class: 'field-pair' },
      field({
        label: 'What is this number today?',
        hint: 'Measure it. Do not assume zero — progress is counted from here.',
        control: numberInput({ value: indicator.baseline, oninput: set('baseline') }),
        error: faultFor(`indicator.${index}.baseline`),
      }),
      field({
        label: 'And the target?',
        hint: 'Lower than today is fine — falling targets work the same way.',
        control: numberInput({ value: indicator.target, oninput: set('target') }),
        error: faultFor(`indicator.${index}.target`),
      })),

    field({
      label: 'Weight',
      hint: 'How much this counts towards the goal, next to the others. Leave it at 1 unless one number really matters more.',
      control: numberInput({ value: indicator.weight, min: '0', oninput: set('weight') }),
    }));
}

const kindChoice = (indicator, kind, label, hint, redraw) => h('button', {
  type: 'button',
  class: `choice-option${indicator.kind === kind ? ' is-chosen' : ''}`,
  'aria-pressed': String(indicator.kind === kind),
  onclick: () => { indicator.kind = kind; redraw(); },
}, h('span', { class: 'choice-label' }, label), h('span', { class: 'choice-hint' }, hint));

const faultFor = (fieldName) => draft.faults.find((fault) => fault.field === fieldName)?.message ?? null;

function warningNotices() {
  if (!draft.warnings?.length) return null;
  return h('div', { class: 'warnings' }, ...draft.warnings.map((warning) => notice(warning.message)));
}

function controls(redraw) {
  const last = draft.step === STEPS.length - 1;

  return h('div', { class: 'form-actions' },
    draft.step > 0
      ? button('Back', { onclick: () => { draft.step -= 1; draft.faults = []; redraw(); } })
      : button('Cancel', { onclick: () => { draft = null; go('/'); } }),
    last
      ? button(draft.acknowledgedWarnings ? 'Save anyway' : 'Save goal', { variant: 'primary', onclick: () => save(redraw) })
      : button('Next', { variant: 'primary', onclick: () => next(redraw) }));
}

/**
 * Stepping forward validates only what the current step could have got wrong,
 * so the user is not told about missing indicators while typing the title.
 */
function next(redraw) {
  const verdict = validate();
  const owned = {
    0: ['title'],
    1: [],
    2: ['startDate', 'targetDate'],
  }[draft.step] ?? [];

  draft.faults = verdict.faults.filter((fault) => owned.includes(fault.field));
  if (draft.faults.length === 0) draft.step += 1;
  redraw();
}

function validate() {
  const goal = makeGoal(draft.goal);
  const indicators = draft.indicators.map((indicator) => makeIndicator(indicator, goal.id));
  return { ...validateGoalDraft(goal, indicators), goal, indicators };
}

/**
 * The last gate.
 *
 * Faults stop the save outright. The "no leading indicator" warning does not —
 * but it has to be seen and dismissed by pressing Save a second time, because
 * an outcome-only goal is the shape that quietly fails, and nobody should get
 * there by accident.
 */
async function save(redraw) {
  const verdict = validate();
  draft.faults = verdict.faults;
  draft.warnings = verdict.warnings;

  if (verdict.faults.length > 0) {
    draft.acknowledgedWarnings = false;
    redraw();
    return;
  }

  const blocking = verdict.warnings.filter((warning) => warning.field === 'indicators');
  if (blocking.length > 0 && !draft.acknowledgedWarnings) {
    draft.acknowledgedWarnings = true;
    redraw();
    return;
  }

  const result = await store.createGoal(draft.goal, draft.indicators);
  if (!result.ok) { draft.faults = result.faults; redraw(); return; }

  const id = result.goal.id;
  draft = null;
  toast('Goal measured and saved.');
  go(`/goal/${id}`);
}
