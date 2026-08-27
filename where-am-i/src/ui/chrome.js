/**
 * The furniture every screen shares: the bar at the top, buttons, fields,
 * the pace chip, and the one toast.
 *
 * Kept together so that a change to how a field looks is one edit, and so that
 * views stay about goals rather than about markup.
 */

import { h } from './dom.js';
import { back } from './router.js';
import { PACE_TEXT, signedPercent } from './format.js';

export function screen({ title, subtitle, onBack, actions, children }) {
  const bar = h('header', { class: 'app-bar' },
    onBack !== false
      ? h('button', {
        class: 'icon-button',
        type: 'button',
        'aria-label': 'Back',
        onclick: () => (typeof onBack === 'function' ? onBack() : back()),
      }, chevron())
      : h('span', { class: 'app-bar-mark', 'aria-hidden': 'true' }, '·'),
    h('div', { class: 'app-bar-titles' },
      h('h1', { class: 'app-bar-title' }, title),
      subtitle ? h('p', { class: 'app-bar-subtitle' }, subtitle) : null),
    h('div', { class: 'app-bar-actions' }, ...(actions ?? [])));

  return h('div', { class: 'screen' }, bar, h('div', { class: 'screen-body' }, ...children));
}

const chevron = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M15 5 8 12l7 7');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
};

export function button(label, { variant = 'secondary', type = 'button', onclick, disabled } = {}) {
  return h('button', { class: `button is-${variant}`, type, onclick, disabled }, label);
}

/**
 * The pace chip. Always the word and the number together: "behind" alone is a
 * mood, "behind −12%" is a measurement.
 */
export function paceChip(summary) {
  if (!summary.paceLabel) return h('span', { class: 'chip is-unknown' }, 'not measured');
  return h('span', { class: `chip is-${summary.paceLabel}` },
    h('span', { class: 'chip-word' }, PACE_TEXT[summary.paceLabel]),
    h('span', { class: 'chip-number' }, signedPercent(summary.pace)));
}

export function field({ label, hint, control, error }) {
  return h('label', { class: `field${error ? ' is-invalid' : ''}` },
    h('span', { class: 'field-label' }, label),
    hint ? h('span', { class: 'field-hint' }, hint) : null,
    control,
    error ? h('span', { class: 'field-error' }, error) : null);
}

/**
 * A numeric input.
 *
 * `inputmode="decimal"` rather than `type="number"` alone, because on a phone
 * this is the difference between the number pad and the full keyboard. `step`
 * stays "any": weights and kilograms are not integers.
 */
export function numberInput(props) {
  return h('input', {
    type: 'number',
    inputmode: 'decimal',
    step: 'any',
    autocomplete: 'off',
    class: 'input is-numeric',
    ...props,
  });
}

export function textInput(props) {
  return h('input', { type: 'text', class: 'input', autocomplete: 'off', ...props });
}

export function empty(title, body, action) {
  return h('div', { class: 'empty' },
    h('p', { class: 'empty-title' }, title),
    h('p', { class: 'empty-body' }, body),
    action ?? null);
}

export function notice(message, variant = 'warn') {
  return h('p', { class: `notice is-${variant}` }, message);
}

let toastTimer = null;

export function toast(message) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2600);
}
