/**
 * A DOM small enough to run the screens under Node.
 *
 * Not a browser and not trying to be one: no layout, no CSS, no real events
 * beyond dispatch. It exists so the views can be rendered and read in a test,
 * which is what catches the failures that actually ship — a view that throws
 * on an empty list, or prints "undefined" where a number should be.
 *
 * Anything a view relies on that is missing here shows up immediately as a
 * TypeError, which is the point.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

class ClassList {
  constructor(node) { this.node = node; }
  get set() { return new Set((this.node.attributes.class ?? '').split(/\s+/).filter(Boolean)); }
  write(set) { this.node.attributes.class = [...set].join(' '); }
  add(name) { const s = this.set; s.add(name); this.write(s); }
  remove(name) { const s = this.set; s.delete(name); this.write(s); }
  contains(name) { return this.set.has(name); }
}

class TextNode {
  constructor(text) { this.nodeValue = String(text); this.parentNode = null; this.childNodes = []; }
  get textContent() { return this.nodeValue; }
}

class Element {
  constructor(tag, namespaceURI = null) {
    this.tagName = tag.toUpperCase();
    this.localName = tag;
    this.namespaceURI = namespaceURI;
    this.attributes = {};
    this.childNodes = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.classList = new ClassList(this);

    // Properties the views assign to directly. They must exist for dom.js's
    // `key in node` test to route them here rather than to setAttribute.
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.files = null;
    this.rows = 0;
  }

  get class() { return this.attributes.class ?? ''; }
  set class(value) { this.attributes.class = value; }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return name in this.attributes; }
  removeAttribute(name) { delete this.attributes[name]; }

  append(...nodes) {
    for (const node of nodes) {
      const child = node instanceof Element || node instanceof TextNode ? node : new TextNode(node);
      child.parentNode?.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1);
      child.parentNode = this;
      this.childNodes.push(child);
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }

  remove() {
    const siblings = this.parentNode?.childNodes;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }

  get children() { return this.childNodes.filter((node) => node instanceof Element); }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join('');
  }

  set textContent(value) {
    this.replaceChildren(new TextNode(value));
  }

  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }

  dispatchEvent(event) {
    for (const handler of this.listeners[event.type] ?? []) handler({ ...event, target: this, preventDefault() {} });
    // The inline `on*` props set by dom.js are listeners too, but they are
    // registered through addEventListener, so nothing extra is needed here.
  }

  /** Views bind handlers as onclick/oninput props; tests fire them by name. */
  fire(type, event = {}) {
    for (const handler of this.listeners[type] ?? []) {
      handler({ type, target: this, preventDefault() {}, ...event });
    }
  }

  focus() {}
  click() { this.fire('click'); }
  contains(node) { return this === node || this.children.some((child) => child.contains(node)); }

  matches(selector) {
    return selector.split(',').map((part) => part.trim()).some((part) => {
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      if (part.startsWith('#')) return this.attributes.id === part.slice(1);
      return this.localName === part;
    });
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches?.(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (child.matches(selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

export function installDom() {
  const document = {
    createElement: (tag) => new Element(tag),
    createElementNS: (ns, tag) => new Element(tag, ns),
    createTextNode: (text) => new TextNode(text),
    getElementById: (id) => document.body.querySelector(`#${id}`),
    querySelector: (selector) => document.body.querySelector(selector),
    baseURI: 'http://localhost/',
  };
  document.body = new Element('body');
  document.documentElement = new Element('html');

  const listeners = {};
  const window = {
    location: { hash: '', href: 'http://localhost/' },
    history: { length: 1, replaceState() {}, back() {} },
    addEventListener: (type, handler) => { (listeners[type] ??= []).push(handler); },
    scrollTo() {},
    confirm: () => true,
    alert() {},
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout() {},
  };

  globalThis.document = document;
  globalThis.window = window;
  globalThis.Node = Element;
  globalThis.navigator ??= {};

  return {
    document,
    window,
    /** Every string the screen would show, flattened. */
    text: (node) => node.textContent,
    /** Pretend the user changed the hash. */
    navigate: (hash) => {
      window.location.hash = hash;
      for (const handler of listeners.hashchange ?? []) handler();
    },
  };
}

export { Element, TextNode, SVG_NS };
