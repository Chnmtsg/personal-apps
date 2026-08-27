/**
 * Element building, without a framework and without innerHTML.
 *
 * Every string that reaches the screen is set as `textContent`. Goal titles,
 * units and notes are user text, and the app has no server to sanitise them —
 * building nodes instead of concatenating HTML is what makes that safe by
 * construction rather than by remembering to escape.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(node, props) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') node.setAttribute('class', value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key in node && node.namespaceURI !== SVG_NS) node[key] = value;
    else node.setAttribute(key, value);
  }
}

function fill(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** h('p', { class: 'note' }, 'text') */
export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  apply(node, props);
  fill(node, children);
  return node;
}

/** The same, in the SVG namespace — where createElement silently makes nothing. */
export function s(tag, props, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  apply(node, props);
  fill(node, children);
  return node;
}


