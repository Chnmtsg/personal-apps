/* Discipline — views, rendering and interaction. */
(function (root) {
  'use strict';

  const A = root.Arise;
  const S = root.Store;
  const UI = (root.UI = {});

  const $ = (sel, el) => (el || document).querySelector(sel);
  const view = () => $('#view');

  let route = 'today';
  let viewDate = null; // resolved on first render, once settings (and the grace window) are loaded
  let picker = { day: 1, q: '', cat: 'All' };
  /* Which set row is being corrected. View state, not user data — see
     `UI.setEditSet`. It is cleared whenever the day on screen changes, because a
     correction to Monday's third set means nothing while looking at Tuesday. */
  let editSet = null;
  /* A rest in progress: `{ itemId, name, startedAt, seconds, upper, rang }`.
     View state and nothing else, and deliberately NOT persisted — a half-finished
     rest is not something the user did. Storing it would mean telling somebody
     who reopened the app on the bus that they have forty seconds left of a rest
     they took at the gym. It dies with the page, which is the honest lifetime
     for it. `seconds` is null when the plan prescribes no interval; then it
     counts up instead of down, because inventing a rest nobody wrote down is
     exactly the number this app refuses to show. */
  let rest = null;
  /* Which pose the Progress screen is filtered to. View state: a filter is not
     a setting, and it opens on the front view every time. */
  let pose = 'front';
  // Same again for the exercise library on More: a reference list you open to
  // change something, not one you read on the way past.
  let libOpen = false;
  /* The service worker's cache name, reported on More. Set once from js/app.js
     when the worker answers; empty until it does, which is the honest reading
     on a first load or with the worker unregistered. */
  let buildVersion = '';
  /* Which window the muscle breakdown on Stats is showing. View state, like the
     folds — a look at the last week is not a setting anybody wants remembered
     across devices. */
  const MUSCLE_WINDOWS = [{ days: 7, label: 'Week' }, { days: 30, label: 'Month' }, { days: 90, label: '3 months' }];
  let muscleWindow = 7;

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- icons ----------
   *
   * Line icons, drawn rather than typed. An emoji is a picture of someone
   * else's idea of the thing, rendered in the platform's own colours at the
   * platform's own weight — six of them in a row is what made this app read as
   * a toy. These are one stroke weight, one grid, and they take `currentColor`,
   * so an icon is the same colour as the text beside it and inherits every
   * theme change for free.
   *
   * 24x24 grid, 2px stroke, round caps. No files: an inline SVG ships with the
   * markup, which keeps the "no assets, no network" rule intact.
   */
  const ICONS = {
    /* A flame is a droplet unless it leans and its base is wider than its point,
       so it carries one asymmetric lick. Proofed at 12px — the size the streak
       pill uses — where a symmetric teardrop reads unmistakably as water. */
    flame: '<path d="M12 2.6c.5 3 2.3 4.4 3.8 6.2C17.2 10.5 18 12 18 13.8a6 6 0 1 1-12 0c0-1.7.6-3.1 1.8-4.5.2 1 .6 1.7 1.3 2.1-.6-3 .1-5.9 2.9-8.8Z"/>',
    check: '<path d="m4 12.5 5.2 5L20 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/>',
    repeat: '<path d="M4 9a5 5 0 0 1 5-5h11m0 0-3-3m3 3-3 3"/><path d="M20 15a5 5 0 0 1-5 5H4m0 0 3 3m-3-3 3-3"/>',
    // Difficulty reads as three ascending bars — the same shape the reference uses.
    level: '<path d="M5 20v-5"/><path d="M12 20V9"/><path d="M19 20V4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    /* Plan is the *weekly* training programme, so it takes a calendar rather
       than a dumbbell. A dumbbell at 13px is a horizontal line with two ticks
       and nothing more; this also says "a week" instead of "a weight", which is
       what the screen actually is. */
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4m8-4v4M3 10h18"/>',
    // An open book, not a closed one: a rectangle with a line down it is a
    // rectangle, and that is exactly what the first attempt looked like.
    book: '<path d="M12 7v13"/><path d="M12 7a4.5 4.5 0 0 0-4.5-3H3v13h4.5a4.5 4.5 0 0 1 4.5 3"/><path d="M12 7a4.5 4.5 0 0 1 4.5-3H21v13h-4.5a4.5 4.5 0 0 0-4.5 3"/>',
    chart: '<path d="M4 20V10m6 10V4m6 16v-7"/>',
    /* A frame with a horizon and a sun — the shape reads as "picture" at 13px,
       where a mountain outline alone reads as a triangle. */
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-6.5 7"/>',
    trophy: '<path d="M7 3h10v5.5a5 5 0 0 1-10 0V3Z"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 13.5V17m-3.5 3.5h7"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',

    /* Areas and categories. These stand in for the emoji a seed used to carry,
       so there is one for every `SECTIONS` id and every exercise category. */
    dumbbell: '<path d="M6.5 6.5v11m11-11v11M3.5 9.5v5m17-5v5M6.5 12h11"/>',
    pulse: '<path d="M3 12h4l2.5-6 4 12L16 12h5"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>',
    move: '<path d="M12 3v18M3 12h18"/><path d="m8.5 6.5 3.5-3.5 3.5 3.5m-7 11 3.5 3.5 3.5-3.5M6.5 8.5 3 12l3.5 3.5m11-7L21 12l-3.5 3.5"/>',
    moon: '<path d="M20 14.6A8.5 8.5 0 0 1 9.4 4 8.5 8.5 0 1 0 20 14.6Z"/>',
    bulb: '<path d="M9.5 17.5h5M10 20.5h4"/><path d="M12 3.2a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2h5c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.2Z"/>',
    heart: '<path d="M12 20.4S4.5 15.8 4.5 10.7A4.3 4.3 0 0 1 12 7.9a4.3 4.3 0 0 1 7.5 2.8c0 5.1-7.5 9.7-7.5 9.7Z"/>',
    pen: '<path d="M14.6 4.4a4.5 4.5 0 0 0 5.6 5.6L9.9 20.3a2.6 2.6 0 0 1-3.7-3.7L14.6 4.4Z"/>',
    star: '<path d="m12 3.6 2.6 5.5 6 .8-4.4 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.4 9.9l6-.8z"/>',
    /* The affordance on a row that leads somewhere. Drawn rather than the "›"
       character the folds use, because at 18px a glyph inherits the font's own
       weight and sits a pixel high next to a 2px-stroke icon set. */
    chev: '<path d="M9 6l6 6-6 6"/>',
    /* The plus on a header pill. The fullwidth "＋" the buttons used sits on the
       text baseline and is a different weight from every drawn icon beside it. */
    plus: '<path d="M12 5v14M5 12h14"/>',
    /* A warm-up and a stretch are not lifts, and falling through to `dumbbell`
       made a nine-row Monday nine dumbbells with no way to see the shape of the
       session. The warm-up is a rising line through three steps; the stretch is
       a figure reaching, drawn as an arc with a stem so it does not read as the
       same shape at 13px. */
    warmup: '<path d="M3 18h4l3-8 3 12 2.5-8H21"/>',
    stretch: '<path d="M12 5.5a1.6 1.6 0 1 0 0-.1Z"/><path d="M12 8v6"/><path d="M8 10.5 12 9l4 1.5"/><path d="m9.5 20 2.5-6 2.5 6"/>',
    /* The back control on a screen reached from another. Its own entry rather
       than `chev` flipped at the call site: geometry in a template is geometry
       nobody finds when it is wrong. */
    'chev-back': '<path d="M15 6l-6 6 6 6"/>',
    /* Measurements. `level` was free once difficulty went with the goal engine,
       but a name that says "difficulty" on a row about a tape measure is a lie
       the next reader has to unpick. */
    tape: '<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M7 7v3m3.5-3v4.5M14 7v3m3.5-3v4.5"/>',
    /* A gift, for the one control that pays something out. */
    gift: '<rect x="3.5" y="8.5" width="17" height="12" rx="2"/><path d="M3.5 12.5h17M12 8.5V20.5"/><path d="M12 8.5S10.5 4 8 4a2.2 2.2 0 0 0 0 4.5m4 0S13.5 4 16 4a2.2 2.2 0 0 1 0 4.5"/>'
  };

  /* An exercise category and a goal area each stand for one drawn icon. */
  const CATEGORY_ICON = {
    Strength: 'dumbbell', Cardio: 'pulse', Core: 'target', Mobility: 'move',
    'Warm-up': 'warmup', Stretch: 'stretch'
  };
  const SECTION_ICON = {
    sleep: 'moon', fitness: 'dumbbell', mind: 'bulb', reading: 'book',
    health: 'heart', craft: 'pen', custom: 'star'
  };

  /**
   * @param {string} name a key of ICONS
   * @param {string} [cls] extra class names
   * Decorative by default: every icon here sits beside its own label, so it is
   * `aria-hidden` and the label carries the meaning. An icon that ever stands
   * alone needs an `aria-label` on the control around it, not on the glyph.
   */
  function icon(name, cls) {
    const d = ICONS[name];
    if (!d) return '';
    return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  }
  UI.icon = icon;

  /* ---------- an item's glyph ----------
   *
   * Exercises and goals each carry an `icon` field the user can edit. Chrome is
   * drawn now, but that field is theirs, so the rule is: **a glyph the user
   * chose wins; a glyph a seed handed them yields to the drawn icon for its
   * category.** Nothing is deleted and nothing is migrated — which of the two it
   * is gets *derived* by comparing against the seed, the same way day status is
   * derived rather than stored.
   *
   * The editors' own placeholders count as stock too. A goal created and never
   * given an icon carried a stock one because the field defaulted to it, not
   * anybody picked it, and seven goals all showing the same target is exactly
   * the noise this replaces.
   */
  /* Membership in the set of every stock icon, NOT a lookup keyed by name.
     Keyed by name it was defeated by an ordinary rename: `stockExIcon('Press-ups')`
     returns nothing for a renamed 'Push-ups', so the seed's own glyph — which
     nobody chose — passed both tests and was rendered. One sentinel covered one
     of seventeen distinct seed icons.

     A set cannot be renamed out of. Nothing stored changes, nothing is migrated,
     and the derivation stays derived: "did the user pick this, or did a seed hand
     it to them" is still answered by comparing, never by a flag. */
  let stockIcons = null;

  function isStockIcon(glyph) {
    if (!stockIcons) {
      stockIcons = new Set();
      (A.SEED_EXERCISES || []).forEach((e) => { if (e.icon) stockIcons.add(e.icon); });
      (A.PROGRAM_EXERCISES || []).forEach((e) => { if (e.icon) stockIcons.add(e.icon); });
    }
    return stockIcons.has(glyph);
  }

  /** @returns {string} ready-to-insert HTML — an escaped glyph, or an inline SVG. */
  function exGlyph(ex) {
    if (!ex) return icon('dumbbell');
    const chosen = ex.icon && !isStockIcon(ex.icon);
    return chosen ? esc(ex.icon) : icon(CATEGORY_ICON[ex.category] || 'dumbbell');
  }

  /* `goalGlyph` and `sectionGlyph` used to live here and had NO CALLERS anywhere
     in the tree — Today and Plan both went straight to `icon(SECTION_ICON[...])`.
     A goal's mark is drawn from its area now and neither editor offers an icon
     field, so there is nothing left for them to resolve. `exGlyph` above is the
     one still needed: an exercise given a glyph before the field was removed
     still renders it. */

  /* ---------- formatting ---------- */

  function dose(item, ex) {
    const unit = (ex && ex.unit) || 'reps';
    if (unit === 'time') return `${item.minutes || ex.minutes || 10} min`;
    if (unit === 'distance') return `${item.km || ex.km || 1} km`;
    const sets = item.sets || ex.sets || 3;
    const reps = item.reps || ex.reps || 10;
    // A programmed lift is usually a range ("4 × 8–12"); collapsing that to a
    // single number would quietly misreport what the day is asking for.
    const max = item.repsMax != null ? item.repsMax : ex.repsMax;
    return max != null && max > reps ? `${sets} × ${reps}–${max}` : `${sets} × ${reps}`;
  }

  function planLine(item) {
    const ex = S.exerciseById(item.exerciseId);
    // `icon` is ready-to-insert HTML from here down, so its call sites must not
    // escape it a second time. Anything user-typed is escaped inside exGlyph.
    if (!ex) return { icon: '', name: 'Removed exercise', sub: '', dose: '', cat: 'Other' };
    /* `dose` on its own as well as inside `sub`: Today puts it in a column of
       its own so the row fits on one line, and Plan still reads as a sentence. */
    return {
      icon: exGlyph(ex), name: ex.name, dose: dose(item, ex),
      sub: `${dose(item, ex)} · ${ex.category}`, cat: ex.category
    };
  }

  const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Monday-first

  /* ---------- shared fragments ---------- */

  /**
   * A section heading that is also its own disclosure.
   *
   * Two screens fold a long list behind their heading — Today's workout and the
   * exercise library — and this is the only thing that builds the markup for it,
   * so there is no second copy to drift from the first.
   *
   * It renders a *container*, not a button: `tail` sits beside the fold rather
   * than inside it, because a button nested in a button does not survive a
   * browser. The heading keeps the summary whether it is open or shut — folding
   * may hide a list, it may not hide the fact that there is one.
   */
  function foldHead(o) {
    return `<div class="section-fold ${o.open ? 'is-open' : ''} ${o.done ? 'is-done' : ''}">
      <button type="button" class="fold-main" data-act="${esc(o.act)}"
        aria-expanded="${!!o.open}" aria-controls="${esc(o.id)}">
        <h2>${esc(o.title)}</h2>
        <span class="fold-sum">${esc(o.summary)}</span>
        <i class="fold-chev" aria-hidden="true">›</i>
      </button>
      ${o.tail || ''}
    </div>`;
  }

  /** Every XP figure goes through one formatter, so a card cannot show
      "12,480" beside "1240 / 2200". */
  function ring(pct, top, bottom, cls) {
    const r = 42;
    const c = 2 * Math.PI * r;
    const on = (Math.min(100, Math.max(0, pct)) / 100) * c;
    return `<div class="ring ${cls || ''}">
      <svg viewBox="0 0 100 100">
        <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ff7a18"/><stop offset="100%" stop-color="#ffb020"/>
        </linearGradient></defs>
        <circle class="track" cx="50" cy="50" r="${r}" fill="none" stroke-width="9"/>
        <circle class="bar" cx="50" cy="50" r="${r}" fill="none" stroke-width="9"
                stroke-dasharray="${on.toFixed(1)} ${(c - on).toFixed(1)}"/>
      </svg>
      <div class="ring-label"><b>${top}</b><small>${esc(bottom)}</small></div>
    </div>`;
  }

  function bar(pct, cls) {
    return `<div class="bar ${cls || ''}"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>`;
  }

  /**
   * The seven-day rail, from the redesign brief: "a seven-day rail you can
   * scrub". It is the same strip that used to sit near the bottom of Today as a
   * read-only scoreboard — the brief moves it directly under the header and
   * makes every cell a day you can open, which is what let the ‹ › stepper stop
   * being the only way to reach yesterday.
   *
   */
  function weekStrip(anchor) {
    const w = S.weekStats(anchor);
    // The logical day, not the calendar date: inside the grace window (00:00 until
    // the rollover hour) they differ, and every other surface treats the logical
    // day as "today". Marking the calendar date here would ring tomorrow's dot.
    const today = S.today();
    const first = S.historyStart();
    return `<div class="week-strip rail">${w.days
      .map((d) => {
        const wd = A.weekday(d.key);
        // A missed day and a day that has not happened must not differ by colour
        // alone — they carry opposite weight, and one of them is not your fault yet.
        const future = d.status === 'future';
        const mark = d.status === 'complete' ? '✓'
          : d.status === 'rest' ? '·'
          : d.status === 'partial' ? d.pct + '%'
          : future ? '' : '✕';
        /* The date number joins the weekday letter rather than replacing the
           mark: the mark is the one thing here that is not colour, and the rail
           is a control now, so it has to say which date each cell opens. */
        const label = `<small>${A.DAY_SHORT[wd]} ${A.fromKey(d.key).getDate()}</small>`;
        const body = `<div class="dot ${d.status}${d.key === today ? ' today' : ''}">${mark}</div>${label}`;
        /* Out of range in either direction: before the account existed, or more
           than a week out. Both are days the ‹ › stepper also refuses. */
        const reach = A.daysBetween(today, d.key);
        const off = A.daysBetween(first, d.key) < 0 || reach > 6;
        return `<button type="button" class="wd${d.key === viewDate ? ' on' : ''}" data-act="date-set"
          data-date="${d.key}" ${off ? 'disabled' : ''}
          aria-current="${d.key === viewDate ? 'date' : 'false'}"
          aria-label="${esc(A.prettyDate(d.key))}">${body}</button>`;
      })
      .join('')}</div>`;
  }

  /* ================= charts =================

     Drawn as inline SVG, from the record, with no library — this app makes no
     network calls and ships no dependencies.

     The form was chosen before the colour, which is the order that matters.
     The job here is "how much did I actually do, against what was being asked" —
     change over time with a moving baseline. That is columns for what was logged
     (each day is a discrete observation, and a line would invent continuity
     across days nothing was recorded) plus a stepped line for the target. One
     axis, in minutes. Never two.

     TWO SERIES, SO TWO VALIDATED COLOURS. `--chart-did` and `--chart-ask` are
     their own steps rather than `--accent` and `--gold`: the UI tokens sit at
     OKLCH L 0.73 and 0.77, outside the 0.48–0.67 band a mark may occupy on a
     dark surface, and read as glare at chart scale. The steps below were run
     through the palette validator in both modes and pass all six checks —
     lightness band, chroma floor, CVD separation, normal-vision separation and
     contrast against the surface they are drawn on. Do not "tidy" them back to
     the UI tokens; that reintroduces a failure the eye does not catch.

     The two are also told apart by FORM — solid columns against a thin line — so
     identity never rests on hue alone. */

  const CHART_DAYS = 42;

  /** Round to something a person would say out loud. */
  function banners() {
    const st = S.get();
    let out = '';
    // Deliberately not dismissible: the data is still missing after any tap that
    // would hide it, and the two routes out are the only recovery there is.
    if (st.meta.storageError === 'unreadable') {
      out += `<section class="banner warn stack">
        <div><b>Saved data could not be read</b><p>Discipline started fresh rather than guess at it. Your previous data has
          <b>not</b> been deleted — download the unreadable copy to keep it, or restore from a backup.</p></div>
        <div class="btn-row">
          <button class="btn primary" data-act="import">Restore from backup</button>
          <button class="btn ghost" data-act="download-unreadable">Download the unreadable copy</button>
        </div>
      </section>`;
    }
    if (st.meta.storageError === 'unwritable') {
      out += `<section class="banner warn stack">
        <div><b>Changes are not being saved</b><p>This device refused the last write — storage may be full, or private
          browsing may be blocking it. Anything you log now lives only in this tab. Export a backup while you can.</p></div>
        <div class="btn-row">
          <button class="btn primary" data-act="export">Export a backup now</button>
        </div>
      </section>`;
    }
    if (st.meta.clockWarning) {
      out += `<section class="banner warn">
        <div><b>Device clock moved backwards</b><p>Streaks are dated on this device, so winding the clock back can distort them. Nothing was changed.</p></div>
        <button class="btn ghost" data-act="clock-ack">Dismiss</button>
      </section>`;
    }
    return out;
  }

  /* ---------- the set log on a row ----------

     The whole app narrows to this block. Everything above it decides WHICH
     exercises today asks for; this is where a number gets written down.

     Three shapes, one card. Which one a row draws is decided by the exercise
     (`A.logShape`) and never by what happens to be stored, so a row is the same
     row before and after anything is logged into it. */

  /** A number for an input's `value`: never `NaN`, never `undefined`. */
  const numVal = (n) => (n == null || !isFinite(n) ? '' : String(A.round1(n)));

  /**
   * The sets already written down, as chips on one line.
   *
   * Chips rather than stacked rows because nine lifts times three sets is
   * twenty-seven rows on a screen that also has to hold the entry fields. The
   * chip is the whole target — 44px, and tapping it loads the set back into the
   * boxes to be corrected, which is why there is no separate edit control.
   *
   * The ✕ stays a control of its own rather than a swipe or a long-press: a
   * gesture is an accelerator, never the only route to something destructive.
   */
  function setRows(itemId, perf, unit, locked) {
    const sets = (perf && perf.sets) || [];
    if (!sets.length) return '';
    return `<ol class="setchips">${sets
      .map((set, i) => {
        const editing = editSet && editSet.itemId === itemId && editSet.index === i;
        return `<li class="setchip ${editing ? 'is-editing' : ''}">
          <button type="button" class="setchip-main" data-act="set-edit" data-id="${itemId}" data-index="${i}"
            aria-label="Set ${i + 1}, ${esc(A.fmtLoad(set, unit))} — tap to correct"
            ${locked ? 'disabled' : ''}><i aria-hidden="true">${i + 1}</i>${esc(A.fmtLoad(set, unit))}</button>
          <button type="button" class="setchip-rm" data-act="set-rm" data-id="${itemId}" data-index="${i}"
            aria-label="Remove set ${i + 1}" ${locked ? 'disabled' : ''}>✕</button>
        </li>`;
      })
      .join('')}</ol>`;
  }

  /**
   * The one line that makes this a training log rather than a checklist:
   * what this exercise weighed the last time it was done.
   *
   * It names the DATE as well as the numbers. "60 kg x 8, 8, 7" is only useful
   * if you know whether that was Thursday or in March.
   */
  function lastLine(sug, ex, unit) {
    const last = sug && sug.last;
    if (!last) return '';
    const said = A.describeEntry(last.perf, ex, unit);
    if (!said) return '';
    /* Say where the numbers in the boxes came from, not just what happened last
       time. The boxes are pre-filled from one of three places and the reader has
       no way to tell which; naming it is what makes a pre-filled number
       something to confirm rather than something to check. */
    const from =
      sug.from === 'today' ? 'Prefilled from the set above'
      : sug.from === 'last' ? 'Prefilled from last session'
      : 'Prefilled from the plan';
    return `<p class="setmeta">${esc(from)} — ${esc(A.prettyDate(last.date))} · ${esc(said)}</p>`;
  }

  /** The input strip. `sug` comes from `S.suggestSet` and is only ever a hint. */
  function setEntry(itemId, sug, locked) {
    if (locked) return '';
    const editing = editSet && editSet.itemId === itemId;
    if (sug.shape === 'time' || sug.shape === 'distance') {
      const perf = sug.perf || {};
      return `<div class="setentry">
        ${
          sug.shape === 'distance'
            ? `<label class="setfield"><span>km</span>
                <input type="number" inputmode="decimal" step="0.1" min="0" id="km_${itemId}"
                  value="${numVal(perf.km)}" placeholder="${numVal(sug.asked.km)}"></label>`
            : ''
        }
        <label class="setfield"><span>min</span>
          <input type="number" inputmode="decimal" step="0.5" min="0" id="min_${itemId}"
            value="${numVal(perf.min)}" placeholder="${numVal(sug.asked.min)}"></label>
        <button type="button" class="btn primary setentry-go" data-act="save-amount" data-id="${itemId}">Save</button>
      </div>`;
    }
    return `<div class="setentry">
      <label class="setfield"><span>${esc(sug.unit)}</span>
        <input type="number" inputmode="decimal" step="0.5" min="0" id="w_${itemId}"
          value="${numVal(sug.weight)}" placeholder="body"></label>
      <span class="setentry-x" aria-hidden="true">×</span>
      <label class="setfield"><span>reps</span>
        <input type="number" inputmode="numeric" step="1" min="0" id="r_${itemId}" value="${numVal(sug.reps)}"></label>
      <button type="button" class="btn primary setentry-go" data-act="log-set" data-id="${itemId}">${
      editing ? 'Update' : 'Log set'
    }</button>
      ${
        editing
          ? `<button type="button" class="btn ghost setentry-cancel" data-act="set-cancel">Cancel</button>`
          : ''
      }
    </div>`;
  }

  /**
   * One exercise, with everything recorded against it on this day.
   *
   * The tick and the sets are deliberately two controls. Logging the last
   * prescribed set ticks the row for you (see `maybeComplete` in js/store.js);
   * nothing ever un-ticks it, so a corrected typo cannot retract a session.
   */
  function exerciseCard(item, k, locked, live) {
    const ex = S.exerciseById(item.exerciseId);
    const l = S.log(k);
    const done = !!(l && l.ex && l.ex[item.id]);
    const perf = (l && l.perf && l.perf[item.id]) || null;
    const unit = S.settings().weightUnit === 'lb' ? 'lb' : 'kg';
    const name = ex ? ex.name : 'Removed exercise';
    const muscles = A.cleanMuscles(ex && ex.muscles).map((m) => A.MUSCLE_NAME[m]).join(' · ');
    const sub = [muscles, item.note].filter(Boolean).join(' — ');
    const sug = S.suggestSet(k, item.id) || { shape: 'reps', unit: unit, weight: null, reps: 0 };
    if (editSet && editSet.itemId === item.id && perf && perf.sets && perf.sets[editSet.index]) {
      const set = perf.sets[editSet.index];
      sug.weight = set.w == null ? null : A.round1(A.convertWeight(set.w, set.u || 'kg', unit));
      sug.reps = set.r;
    }
    sug.perf = perf || {};
    const vol = A.entryVolume(perf, unit);

    return `<article class="exercise ${done ? 'is-done' : ''} ${live ? 'is-live' : ''} ${locked ? 'locked' : ''}">
      <div class="exercise-head">
        <button type="button" class="exercise-tick" data-act="toggle-ex" data-id="${item.id}"
          aria-pressed="${done}" aria-label="${done ? 'Undo' : 'Mark'} ${esc(name)} done"
          ${locked ? 'disabled' : ''}><span aria-hidden="true">✓</span></button>
        <span class="exercise-plate" aria-hidden="true">${exGlyph(ex)}</span>
        <span class="exercise-body">
          <span class="exercise-name">${esc(name)}</span>
          ${sub ? `<span class="exsub">${esc(sub)}</span>` : ''}
        </span>
        <span class="exercise-dose">${esc(A.targetPhrase(item, ex))}</span>
        <button type="button" class="icon-btn" data-act="ex-how" data-id="${item.exerciseId}" data-item="${item.id}"
          aria-label="How to do ${esc(name)}">${icon('info')}</button>
      </div>
      ${setRows(item.id, perf, unit, locked)}
      ${setEntry(item.id, sug, locked)}
      ${
        vol > 0
          ? `<p class="setmeta setmeta-vol">${esc(A.round1(vol) + ' ' + unit + ' moved')}</p>`
          : ''
      }
      ${lastLine(sug, ex, unit)}
      ${perf && perf.note ? `<p class="setnote">${esc(perf.note)}</p>` : ''}
      ${
        locked
          ? ''
          : `<button type="button" class="link setnote-add" data-act="perf-note" data-id="${item.id}">${
              perf && perf.note ? 'Edit note' : 'Add a note'
            }</button>`
      }
    </article>`;
  }

  /* ---------- the rest between sets ----------

     The one block on any screen whose subject is progress through a fixed
     length of time, which is the rule the design brief gives for ember and the
     only thing ember is for. Today's strip was already painted in it; while a
     rest runs it is literally what the rule describes rather than the nearest
     thing to it.

     It is drawn ONCE per render and then written into in place, a field at a
     time, by `paintRest`. A full re-render every second would rebuild the
     weight and reps inputs and take whatever the user was part-way through
     typing with them — the same reason the picker's search box is repainted by
     hand rather than through `render()`. */

  /** How far through the rest we are right now. Pure; safe to call in a render. */
  function restNow() {
    if (!rest) return null;
    const elapsed = Math.max(0, Math.floor((Date.now() - rest.startedAt) / 1000));
    const left = rest.seconds == null ? null : rest.seconds - elapsed;
    return {
      elapsed: elapsed,
      left: left,
      ready: left != null && left <= 0,
      pct: rest.seconds ? Math.min(100, (elapsed / rest.seconds) * 100) : 0,
      clock: left == null ? A.fmtClock(elapsed) : left > 0 ? A.fmtClock(left) : '+' + A.fmtClock(-left)
    };
  }

  /** What the strip says under the clock, in words. */
  function restLabel(now) {
    if (!rest) return '';
    if (rest.seconds == null) return 'Since your last set · ' + rest.name;
    if (now.ready) return 'Ready · ' + rest.name;
    return rest.name + ' · ' + rest.text;
  }

  function restStrip() {
    const now = restNow();
    return `<aside class="today-strip is-rest ${now.ready ? 'is-ready' : ''}" id="restBox"
        role="timer" aria-live="off">
      ${
        rest.seconds
          ? `<div class="rest-track" aria-hidden="true"><i id="restBar" style="width:${now.pct.toFixed(1)}%"></i></div>`
          : ''
      }
      <div class="today-strip-body">
        <b id="restClock">${esc(now.clock)}</b>
        <span id="restLabel">${esc(restLabel(now))}</span>
      </div>
      <button class="btn" data-act="rest-skip">${now.ready ? 'Done' : 'Skip'}</button>
    </aside>`;
  }

  /**
   * Write the running numbers into the block that is already on screen.
   *
   * @returns {boolean} true exactly once, on the tick the rest runs out, so the
   *   caller can buzz. Every later tick returns false — a device that buzzed
   *   every second until you looked at it would be uninstalled by Tuesday.
   */
  function paintRest() {
    if (!rest) return false;
    const now = restNow();
    let crossed = false;
    if (now.ready && !rest.rang) {
      rest.rang = true;
      crossed = true;
    }
    /* Every one of these may be absent: the user can be on Plan, or on
       yesterday, while the rest keeps running. A timer that throws because
       nobody is looking at it is worse than one nobody is looking at. */
    const clock = $('#restClock');
    if (clock) clock.textContent = now.clock;
    const label = $('#restLabel');
    if (label) label.textContent = restLabel(now);
    const bar = $('#restBar');
    if (bar && bar.style) bar.style.width = now.pct.toFixed(1) + '%';
    const box = $('#restBox');
    if (box && box.classList) box.classList.toggle('is-ready', now.ready);
    return crossed;
  }

  /**
   * Today, which is now the session screen.
   *
   * What used to be here — goal cards, a run section, a reading gate, a habit
   * list and a journal row — is gone with the subjects they belonged to. The
   * screen has one job: show what today asks you to lift, and take the numbers.
   */
  function renderToday() {
    const k = viewDate;
    const today = S.today();
    const st = S.dayStatus(k);
    const plan = S.dayPlan(k);
    const l = S.log(k);
    const streak = S.currentStreak();
    const hist = S.history();
    const future = S.isFuture(k);
    const offset = A.daysBetween(today, k);
    const relative = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : offset === 1 ? 'Tomorrow' : A.prettyDate(k);
    const unit = S.settings().weightUnit === 'lb' ? 'lb' : 'kg';
    const vol = S.dayVolume(k, unit);
    const dayNum = A.daysBetween(S.historyStart(), k) + 1;

    const headline = future
      ? 'Coming up'
      : !plan.length
      ? 'Rest day — recover well'
      : st.status === 'complete'
      ? 'Session complete. Well done.'
      : st.done === 0
      ? 'Nothing logged yet'
      : `${st.total - st.done} exercise${st.total - st.done === 1 ? '' : 's'} left`;

    /* A programme day is written as warm-up, then the main lifts, then a
       stretch, and the structure is already in the data: every exercise carries
       a category and the plan is stored in the order it is meant to be done. So
       a heading goes in wherever the category CHANGES rather than grouping by
       it — grouping would reorder the workout, and you do not stretch before
       you press. */
    /* The live exercise is the first one not yet done. It gets the ringed node
       on the spine, which is the only thing on the screen that answers "where am
       I in this session" without a counter. */
    const liveItem = plan.find((i) => !(l && l.ex && l.ex[i.id]));
    let lastCat = null;
    const exHtml = plan.length
      ? `<div class="spine">
          <i class="spine-fill" style="height:${
            Math.round((st.exDone / plan.length) * 100)
          }%" aria-hidden="true"></i>
          ${plan
            .map((i) => {
              const ex = S.exerciseById(i.exerciseId);
              const cat = (ex && ex.category) || 'Other';
              const head = cat !== lastCat ? `<div class="block-head">${esc(cat)}</div>` : '';
              lastCat = cat;
              return head + exerciseCard(i, k, future, !future && liveItem === i);
            })
            .join('')}
        </div>`
      : `<div class="empty">No exercises scheduled for ${esc(A.DAY_NAMES[A.weekday(k)])}.<br>
         <button class="link" data-act="go-plan" data-day="${A.weekday(k)}">Plan this day →</button></div>`;

    const extras = (l && l.extra) || [];
    const extraHtml = extras
      .map(
        (x) => `<div class="item done"><span class="tick" aria-hidden="true">✓</span>
          <span class="emoji" aria-hidden="true">${icon('star')}</span>
          <span class="body"><span class="name">${esc(x.name)}</span><span class="sub">Extra work</span></span>
          <button class="icon-btn" data-act="rm-extra" data-id="${x.id}" aria-label="Remove">✕</button></div>`
      )
      .join('');

    const mLeft = A.minutesLeftToday(S.settings().dayBoundaryHour);
    const frozen = !!S.get().freezes[k];
    const fz = S.freezeStats();

    /* The recovery half. Every push this app makes is only safe underneath it,
       which is why it is the first thing on the screen when the week comes
       round — above the miss-twice line, because on a deload week "never miss
       twice" must not read as "train through it". */
    const dl = S.deloadWeek(k);
    const deloadNote =
      offset === 0 && dl.on && dl.isDeload
        ? `<section class="deload">
            <div class="deload-head">Deload week · ${dl.week} of ${dl.of}</div>
            <p>Cut every working set by about 40% and stop there. Same sessions, same days,
            far less of them. This is the half of the equation that turns the other three weeks
            into adaptation instead of damage — it is not a week off and it is not optional.</p>
          </section>`
        : '';

    /* "Never miss twice." The single highest-leverage day of a year is the one
       straight after a broken one. Stated as a fact and a next action, never as
       a reprimand: harsh self-criticism measurably reduces follow-through, and
       somebody who savages themselves after a missed session abandons the gym,
       which is the opposite of what this line is for. */
    const missed = offset === 0 ? S.missedYesterday(k) : null;
    const missTwice = missed
      ? `<section class="misstwice">
          <div class="misstwice-head">Never miss twice</div>
          <p>${esc(
            missed.status === 'missed'
              ? 'Yesterday went unlogged.'
              : 'Yesterday came in at ' + missed.pct + '%.'
          )} One miss is noise. Two is a new pattern, and today is the day that decides which
          this was. ${esc(
            missed.left === 1 ? 'One exercise left.' : missed.left + ' exercises left.'
          )} If today is falling apart, do the lightest version rather than none.</p>
        </section>`
      : '';

    /* The day's next lift, pinned above the tab bar. The primary action of the
       app used to live at the top of the screen, which on a phone is the one
       place a thumb cannot reach. */
    const nextUp = plan.find((i) => !(l && l.ex && l.ex[i.id]));
    const nextEx = nextUp ? S.exerciseById(nextUp.exerciseId) : null;
    /* The rest owns the strip while it runs. It is the more urgent of the two
       answers to "what now" — the next exercise is still there underneath, and
       is what comes back the moment the rest is skipped or done. */
    const strip =
      offset !== 0 || future || !plan.length
        ? ''
        : rest
        ? restStrip()
        : `<aside class="today-strip">
            <div class="today-strip-body">${
              nextUp
                ? `<b>${st.total - st.done} left today</b><span>Next: ${esc(
                    (nextEx && nextEx.name) || 'Exercise'
                  )}</span>`
                : `<b>Session done.</b><span>${esc(
                    vol.volume > 0 ? A.round1(vol.volume) + ' ' + unit + ' moved' : 'Nothing else is asked of you today.'
                  )}</span>`
            }</div>
            ${
              nextUp
                ? `<button class="btn primary" data-act="ex-focus" data-id="${nextUp.id}">Log it</button>`
                : ''
            }
          </aside>`;

    return `
      <!-- Artboard 1c's header, minus the countdown it used to run. The ember
           paint went with the challenge: the brief allows it only where the
           screen's own subject is progress through a fixed length of time, and
           nothing on this screen is that any more. -->
      <section class="dayhead">
        <div class="dayhead-top">
          <div class="dayhead-id">
            <div class="dayhead-label">${esc(relative)}</div>
            <h1 class="daynum">DAY <b>${dayNum}</b></h1>
          </div>
          <div class="dayhead-side">
            ${
              streak > 0
                ? `<div class="dayhead-streak"><b>${streak}</b><span>day streak</span></div>`
                : ''
            }
            <div class="dayline-nav">
              <button class="icon-btn" data-act="date-prev" aria-label="Previous day" ${
                A.daysBetween(S.historyStart(), k) <= 0 ? 'disabled' : ''
              }>‹</button>
              <button class="icon-btn" data-act="date-next" aria-label="Next day" ${offset >= 6 ? 'disabled' : ''}>›</button>
            </div>
          </div>
        </div>
        <div class="dayhead-foot">
          <span>${esc(A.prettyDate(k))}${st.total ? ` · ${st.done}/${st.total} done` : ''}</span>
          <span>${hist.completeDays} ${hist.completeDays === 1 ? 'session' : 'sessions'} kept</span>
        </div>
        <div class="dayline-headline">${esc(headline)}</div>
      </section>

      ${deloadNote}
      ${missTwice}

      <!-- Banners sit UNDER the header, not above it. Every screen begins with a
           header that supplies the status-bar inset, so a banner rendered first
           would be the one block with nothing between it and the clock. -->
      ${offset === 0 ? banners() : ''}

      ${weekStrip(k)}

      ${offset !== 0 ? `<button class="btn ghost block" data-act="date-today" style="margin-bottom:12px">Back to today</button>` : ''}

      <div class="label split">
        <span>${esc(A.DAY_NAMES[A.weekday(k)])} session</span>
        <span>${esc(
          (function () {
            if (!plan.length) return 'Rest';
            if (!vol.sets) return plan.length + (plan.length === 1 ? ' exercise' : ' exercises');
            const sets = vol.sets + (vol.sets === 1 ? ' set' : ' sets');
            /* A bodyweight session moves no load, and "0 kg" would say it moved
               none — a different claim from "none of it was loaded". Reps are
               the honest total for a day of chin-ups. */
            return vol.volume > 0
              ? sets + ' · ' + A.round1(vol.volume) + ' ' + unit
              : sets + ' · ' + vol.reps + ' reps';
          })()
        )}</span>
      </div>

      ${
        plan.length && !future
          ? `<button type="button" class="btn ghost block" data-act="workout-done"
              aria-pressed="${st.exDone === plan.length}" style="margin-bottom:10px">${
              st.exDone === plan.length ? 'Undo the whole session' : 'Mark the whole session done'
            }</button>`
          : ''
      }

      ${exHtml}
      ${extraHtml ? `<div class="list">${extraHtml}</div>` : ''}

      ${
        future
          ? ''
          : `<div class="inline-add">
              <input type="text" id="extraInput" aria-label="Log something extra you trained"
                     placeholder="Log something extra you trained…" maxlength="60">
              <button class="btn" data-act="add-extra">Add</button>
            </div>`
      }

      ${
        offset === 0 && mLeft < 240
          ? `<p class="faint" style="text-align:center;margin-top:10px">${mLeft} min left to log ${esc(
              relative.toLowerCase()
            )} — the day rolls over at ${esc(A.prettyTime(S.settings().dayBoundaryHour * 60))}.</p>`
          : ''
      }
      ${
        offset < 0 && !frozen && st.status !== 'complete' && st.status !== 'rest'
          ? `<button class="btn ghost block" data-act="freeze" data-date="${k}" style="margin-top:10px" ${
              fz.available ? '' : 'disabled'
            }>${icon('snow')} Use a streak freeze on this day · ${fz.available} left</button>`
          : ''
      }
      ${frozen ? `<button class="btn ghost block" data-act="unfreeze" data-date="${k}" style="margin-top:10px">${icon('snow')} Frozen — tap to undo</button>` : ''}
      ${st.done > 0 || vol.sets ? `<button class="btn ghost block" data-act="clear-day" style="margin-top:4px">Reset this day's log</button>` : ''}
      ${strip}
    `;
  }

  /* ================= PLAN ================= */

  function planWeekBlock() {
    const todayWd = A.weekday(S.today());
    const days = dayOrder
      .map((d) => {
        const items = S.get().plan[d] || [];
        const rows = items.length
          ? items
              .map((i, idx) => {
                const p = planLine(i);
                return `<div class="plan-row">
                  <button type="button" class="plan-main" data-act="plan-edit" data-day="${d}" data-id="${i.id}">
                    <span class="emoji" aria-hidden="true">${p.icon}</span>
                    <span class="body"><span class="name">${esc(p.name)}</span><span class="sub">${esc(p.sub)}${
                  i.note ? ' · ' + esc(i.note) : ''
                }</span></span>
                  </button>
                  <button class="icon-btn" data-act="plan-move" data-day="${d}" data-id="${i.id}" data-delta="-1" aria-label="Move ${esc(p.name)} up" ${idx === 0 ? 'disabled' : ''}>↑</button>
                  <button class="icon-btn" data-act="plan-move" data-day="${d}" data-id="${i.id}" data-delta="1" aria-label="Move ${esc(p.name)} down" ${idx === items.length - 1 ? 'disabled' : ''}>↓</button>
                  <button class="icon-btn" data-act="plan-rm" data-day="${d}" data-id="${i.id}" aria-label="Remove ${esc(p.name)}">✕</button>
                </div>`;
              })
              .join('')
          : `<div class="empty tight">Rest day — nothing scheduled.</div>`;

        return `<section class="card flush plan-day ${d === todayWd ? 'is-today' : ''}" id="plan-day-${d}">
          <div class="plan-day-head">
            <h3>${esc(A.DAY_NAMES[d])}</h3>
            <span class="count">${items.length} exercise${items.length === 1 ? '' : 's'}</span>
          </div>
          <div class="plan-rows">${rows}</div>
          <div class="plan-actions">
            <button class="btn primary" data-act="plan-add" data-day="${d}">＋ Add exercise</button>
            <button class="btn ghost" data-act="plan-copy" data-day="${d}">Copy from…</button>
            ${items.length ? `<button class="btn ghost danger" data-act="plan-clear" data-day="${d}">Clear</button>` : ''}
          </div>
        </section>`;
      })
      .join('');

    const dl = S.deloadWeek(S.today());
    return `${
      dl.on
        ? `<div class="cyclebar ${dl.isDeload ? 'is-deload' : ''}">
            <span>Week <b>${dl.week}</b> of ${dl.of}</span>
            <span>${dl.isDeload ? 'Deload — cut sets by ~40%' : 'Building'}</span>
          </div>`
        : ''
    }${days}
      <!-- The book gives no stopping rule. This app has to. -->
      <div class="label">When to stop</div>
      <div class="card">
        <p class="footnote" style="margin-top:0">Stop the session immediately on <b>sharp pain,
          joint pain, chest symptoms, dizziness or numbness</b>. These are not the same signal as
          discomfort, fatigue or boredom — those are diffuse and fade afterwards, these are sharp,
          localised and get worse under load.</p>
        <p class="footnote">Reassess the whole block if any of these run for more than a week:
          performance falling while effort rises, three or more nights of broken sleep, an injury
          that will not resolve, or losing interest in things you used to enjoy. Every one of them
          means less, not more.</p>
      </div>

      <!-- One row per context. The app stores one weekly plan, so these are
           alternatives rather than a pair: you are on site or you are at home,
           and installing one replaces the week. -->
      <div class="label">Install a programme</div>
      ${(A.PROGRAM_CONTEXTS || [])
        .map(
          (c) => `<button type="button" class="linkrow ${
            S.programContext() === c.id ? 'is-done' : ''
          }" data-act="program-install" data-context="${esc(c.id)}">
            <span class="linkrow-plate" aria-hidden="true">${icon('dumbbell')}</span>
            <span class="body"><b>${esc(c.name)}${
            S.programContext() === c.id ? ' · installed' : ''
          }</b><span>${esc(c.blurb)}</span></span>
            ${icon('chev')}
          </button>`
        )
        .join('')}
      <p class="footnote">Today's list shows up on the Today tab by
      itself, and changing a day here never rewrites one you have already
      logged — every day's log freezes its own exercise list.</p>`;
  }

  /**
   * Plan, from artboard 2a.
   *
   * "Two things lived on one scroll before. A segmented header splits them."
   * That is exactly what was wrong: the goals and the seven training days were
   * one continuous column, so the screen had two subjects and no way to say
   * which one you had come for. The segment is a view switch and stores nothing
   * — a tab is not user data.
   */
  /**
   * Plan, from artboard 2a.
   *
   * The segmented header is gone with the half it switched to. Plan had two
   * subjects sharing one scroll — goals and the training week — and a tab that
   * only ever has one destination is a control that says nothing.
   */
  function renderPlan() {
    const total = dayOrder.reduce((n, d) => n + (S.get().plan[d] || []).length, 0);
    const trainingDays = dayOrder.filter((d) => (S.get().plan[d] || []).length).length;

    return `
      <header class="screenhead">
        <div class="screenhead-top">
          <h1>Plan</h1>
          <button class="headpill" data-act="plan-add" data-day="${A.weekday(S.today())}">${icon('plus')}Add today</button>
        </div>
        <div class="screenhead-sub">${trainingDays} training day${trainingDays === 1 ? '' : 's'} · ${total} exercise${
      total === 1 ? '' : 's'
    } a week</div>
      </header>

      ${planWeekBlock()}
    `;
  }

  /* ================= STATS ================= */

  /**
   * One exercise's last 90 days: a column per session, height = the top set.
   *
   * The form was picked before the colour, which is the order that matters. The
   * question is "is the bar going up", which is change over time on an uneven
   * calendar — so it is columns for the sessions that happened and nothing at
   * all for the days between. A line would invent a continuous climb across
   * days nothing was recorded, which is the one thing this app must never draw.
   *
   * ONE series, so there is no legend box: the label above the chart names it.
   * The colour is `--chart-did`, which is a validated step for a mark on this
   * surface — see the chart invariant in CLAUDE.md. Do not swap it for
   * `--accent`; that failed the chroma floor at chart scale.
   */
  function exerciseSparks() {
    const life = S.lifeTotals();
    const unit = life.unit;
    const rows = life.exercises.filter((r) => r.days >= 2).slice(0, 8);
    if (!rows.length) return '';
    return rows
      .map((row) => {
        const pts = S.exerciseSeries(row.id, 90, unit).filter((x) => x.top != null);
        if (pts.length < 2) return '';
        const top = Math.max.apply(null, pts.map((x) => x.top));
        const floor = Math.min.apply(null, pts.map((x) => x.top));
        /* Zero-based would flatten every real strength gain into a rounding
           error — 60 to 65 kg on a 0-65 axis is four pixels. The baseline is
           the lightest session drawn, and the label says both ends so the
           reader is never guessing what the floor is. */
        const span = Math.max(1, top - floor * 0.94);
        const W = 120;
        const H = 26;
        const slot = W / pts.length;
        const bw = Math.max(1.5, Math.min(20, slot - 2)); // 2px surface gap between columns
        const cols = pts
          .map((x, i) => {
            const h = Math.max(1.5, ((x.top - floor * 0.94) / span) * H);
            const r = h > 6 ? Math.min(4, bw / 2) : 0;
            return `<rect x="${(i * slot).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}"
              height="${h.toFixed(1)}" rx="${r}" ry="${r}" fill="var(--chart-did)"
              ><title>${esc(A.prettyDate(x.date) + ' · ' + A.fmtWeight(x.top, unit))}</title></rect>`;
          })
          .join('');
        const latest = pts[pts.length - 1];
        return `<div class="spark">
          <span class="spark-name">${esc(row.name)}</span>
          <svg class="spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
            role="img" aria-label="${esc(
              row.name + ': top set over ' + pts.length + ' sessions, ' +
              A.fmtWeight(floor, unit) + ' to ' + A.fmtWeight(top, unit) +
              ', latest ' + A.fmtWeight(latest.top, unit)
            )}">${cols}</svg>
          <span class="spark-val">${esc(A.fmtWeight(latest.top, unit))}</span>
        </div>`;
      })
      .join('');
  }

  /* ---------- the tape and the scale ----------

     A record, never a task. Nothing here scores a day, and the copy has to keep
     saying so — a weigh-in that looked like a tick would turn standing on the
     scales into training. */

  /**
   * Body weight by week, as columns.
   *
   * WEEKLY AVERAGES, because that is what the programme says to read and a
   * single morning is water and food. A week with no readings is simply absent:
   * a gap in the record is not a measurement of nothing, which is the same rule
   * the top-set chart runs on.
   *
   * The baseline is the lightest week drawn rather than zero. A person moving
   * from 59 to 61 kg on a 0-61 axis is three pixels of change, and a chart that
   * cannot show the thing it is drawn for is decoration.
   */
  function weightChart(trend) {
    const rows = trend.weeks;
    if (rows.length < 2) return '';
    const top = Math.max.apply(null, rows.map((r) => r.kg));
    const floor = Math.min.apply(null, rows.map((r) => r.kg));
    const span = Math.max(0.5, top - floor * 0.997);
    const W = 320;
    const H = 64;
    const slot = W / rows.length;
    const bw = Math.max(2, Math.min(28, slot - 2));   // 2px surface gap
    const cols = rows
      .map((r, i) => {
        const h = Math.max(2, ((r.kg - floor * 0.997) / span) * H);
        const rad = h > 6 ? Math.min(4, bw / 2) : 0;
        return `<rect x="${(i * slot).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}"
          height="${h.toFixed(1)}" rx="${rad}" ry="${rad}" fill="var(--chart-did)"
          ><title>${esc(
            'Week of ' + A.prettyDate(r.week) + ' · ' + A.round1(r.kg) + ' ' + trend.unit +
            ' · ' + r.readings + (r.readings === 1 ? ' reading' : ' readings')
          )}</title></rect>`;
      })
      .join('');
    return `<div class="bodychart">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
        aria-label="${esc(
          'Body weight by week, ' + A.round1(floor) + ' to ' + A.round1(top) + ' ' + trend.unit +
          ' over ' + rows.length + ' weeks.'
        )}">${cols}</svg>
      <div class="bodychart-foot">
        <span>${esc(A.prettyDate(rows[0].week))}</span>
        <span>${esc(A.round1(floor) + '–' + A.round1(top) + ' ' + trend.unit)}</span>
        <span>${esc(A.prettyDate(rows[rows.length - 1].week))}</span>
      </div>
    </div>`;
  }

  /** The scale, in a sentence and a chart. */
  function weightBlock() {
    const trend = S.weightTrend(12);
    if (!trend) {
      return `<div class="promptrow">
        <span class="promptrow-plate" aria-hidden="true">${icon('chart')}</span>
        <div class="promptrow-body">Three mornings a week, after the toilet and before food.
          One morning is water and food; a week of them is a weight.
          <button class="link" data-act="weigh-in">Log the first one →</button></div>
      </div>`;
    }
    const last = trend.weeks[trend.weeks.length - 1];
    return `<section class="card">
      <div class="bodyhead">
        <b>${esc(A.round1(trend.latest) + ' ' + trend.unit)}</b>
        <span>${esc(
          'week of ' + A.prettyDate(trend.to) + ' · average of ' + last.readings +
          (last.readings === 1 ? ' reading' : ' readings')
        )}</span>
      </div>
      ${
        trend.perWeek == null
          ? `<p class="footnote bodynote">One week on the record. A rate needs two.</p>`
          : `<p class="bodyrate">${esc(
              A.fmtDelta(trend.change, trend.unit) + ' over ' +
              Math.round(trend.spanWeeks) + (Math.round(trend.spanWeeks) === 1 ? ' week' : ' weeks') +
              ' · ' + A.fmtDelta(trend.perWeek, trend.unit) + ' a week' +
              ' · ' + A.fmtDelta(trend.perMonth, trend.unit) + ' a month'
            )}</p>`
      }
      ${weightChart(trend)}
      <p class="footnote">Weekly averages, never a single morning — a kilo of day-to-day
        swing is water and food rather than muscle or fat. ${
          last.readings === 1 ? 'This week rests on one reading so far.' : ''
        }</p>
    </section>`;
  }

  /* ---------- Progress: the photos and the tape ----------

     Reached from More, with no tab of its own. Both halves are things you open
     after the fact rather than to do something, which is the same test that put
     Rewards behind More rather than in the tab bar.

     The photos live in the same IndexedDB store as the exercise pictures, under
     a `bp_` key — see js/photos.js. They never touch `arise.state.v1`, they
     never leave the device, and they ride the existing backup. */

  /** Every progress photo, newest first, as `{ id, date, pose }`. */
  function progressShots(forPose) {
    return A.Photos.ids(A.Photos.PROGRESS_PREFIX)
      .map((id) => {
        const rest2 = id.slice(A.Photos.PROGRESS_PREFIX.length);
        const cut = rest2.lastIndexOf('_');
        return { id: id, date: rest2.slice(0, cut), pose: rest2.slice(cut + 1) };
      })
      .filter((x) => !forPose || x.pose === forPose)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function photoBlock() {
    const shots = progressShots(pose);
    const poseName = (A.POSES.find((x) => x.id === pose) || A.POSES[0]).name;
    const filter = `<div class="segbar tight">${A.POSES.map(
      (x) => `<button type="button" class="seg ${pose === x.id ? 'on' : ''}" data-act="pose-filter"
        data-pose="${x.id}" aria-pressed="${pose === x.id}">${esc(x.name)}</button>`
    ).join('')}</div>`;

    if (!shots.length) {
      return `${filter}
      <div class="promptrow">
        <span class="promptrow-plate" aria-hidden="true">${icon('image')}</span>
        <div class="promptrow-body">No ${esc(poseName.toLowerCase())} photos yet. Same spot, same
          light, same time of day — a photo is only a comparison if the conditions are.
          <button class="link" data-act="photo-add">Take the first one →</button></div>
      </div>`;
    }

    /* First and latest, side by side. It is the whole reason to keep photos:
       a month-to-month change is invisible in a mirror and obvious in a pair. */
    const first = shots[shots.length - 1];
    const latest = shots[0];
    const pair =
      shots.length > 1
        ? `<div class="shotpair">
            ${[first, latest]
              .map(
                (x, i) => `<figure class="shot">
                  <img src="${esc(A.Photos.get(x.id) || '')}" alt="${esc(
                  (i ? 'Latest' : 'First') + ' ' + poseName.toLowerCase() + ' photo, ' + A.prettyDate(x.date)
                )}">
                  <figcaption>${esc((i ? 'Latest · ' : 'First · ') + A.prettyDate(x.date))}</figcaption>
                </figure>`
              )
              .join('')}
          </div>
          <p class="footnote">${esc(
            A.daysBetween(first.date, latest.date) + ' days apart'
          )}. Nothing here is measured — the tape below is what turns a photo into a number.</p>`
        : '';

    const grid = `<div class="shotgrid">${shots
      .map(
        (x) => `<figure class="shot">
          <img src="${esc(A.Photos.get(x.id) || '')}" alt="${esc(
          poseName + ' photo, ' + A.prettyDate(x.date)
        )}">
          <figcaption>${esc(A.prettyDate(x.date))}</figcaption>
          <button type="button" class="shot-rm" data-act="photo-rm" data-id="${esc(x.id)}"
            aria-label="Delete the ${esc(poseName.toLowerCase())} photo from ${esc(A.prettyDate(x.date))}">✕</button>
        </figure>`
      )
      .join('')}</div>`;

    return filter + pair + `<div class="label">Every ${esc(poseName.toLowerCase())} photo · ${shots.length}</div>` + grid;
  }

  /**
   * The tape, in full: each measurement's latest value, its change, and its
   * last readings as bars.
   *
   * Bars rather than a line, and only where there ARE readings: the tape is
   * used once a rotation and unevenly, so a line between two points a month
   * apart would draw a month of change that was never measured.
   */
  function tapeDetail() {
    const days = S.tapeDays().slice().reverse();   // oldest first
    if (!days.length) {
      return `<div class="promptrow">
        <span class="promptrow-plate" aria-hidden="true">${icon('tape')}</span>
        <div class="promptrow-body">The tape catches what the scale cannot: whether the weight
          went on the chest and arms or on the waist.
          <button class="link" data-act="tape-open">Take the first measurements →</button></div>
      </div>`;
    }
    const hist = {};
    S.tapeHistory().forEach((r) => { hist[r.key] = r; });
    const rows = A.BODY_FIELDS.map((f) => {
      const keys = f.paired ? [f.id + '_l', f.id + '_r'] : [f.id];
      const lead = keys.map((k) => hist[k]).find((r) => r && r.readings);
      if (!lead) return '';
      /* One series per measurement, so the bars carry the LEAD side of a pair.
         Two overlaid series would need a second validated hue for a difference
         of about a centimetre, which is not worth a colour. */
      const series = days
        .map((d) => ({ date: d, v: S.bodyEntry(d)[keys[0]] }))
        .filter((x) => x.v != null)
        .slice(-8);
      const value = keys.map((k) => (hist[k] && hist[k].readings ? A.round1(hist[k].last) : '—')).join(' / ');
      const change = keys.every((k) => !hist[k] || hist[k].change == null)
        ? ''
        : keys.map((k) => (hist[k] && hist[k].change != null ? A.fmtDelta(hist[k].change, 'cm') : '—')).join(' / ');
      let bars = '';
      if (series.length > 1) {
        const top = Math.max.apply(null, series.map((x) => x.v));
        const floor = Math.min.apply(null, series.map((x) => x.v));
        const span = Math.max(0.4, top - floor * 0.985);
        bars = `<div class="tapebars" role="img" aria-label="${esc(
          f.name + ': ' + series.length + ' readings, ' + A.round1(floor) + ' to ' + A.round1(top) + ' cm'
        )}">${series
          .map((x) => {
            const h = Math.max(8, ((x.v - floor * 0.985) / span) * 100);
            return `<i style="height:${h.toFixed(0)}%" title="${esc(
              A.prettyDate(x.date) + ' · ' + A.round1(x.v) + ' cm'
            )}"></i>`;
          })
          .join('')}</div>`;
      }
      return `<article class="tapecard">
        <div class="tapecard-head">
          <span class="tapecard-name">${esc(f.name)}${f.paired ? ' · L / R' : ''}</span>
          <span class="tapeval">${esc(value + ' cm')}${change ? `<i>${esc(change)}</i>` : ''}</span>
        </div>
        ${bars}
        <p class="setmeta">${esc(
          lead.readings + (lead.readings === 1 ? ' reading · ' : ' readings · ') + 'last ' + A.prettyDate(lead.lastOn)
        )}</p>
      </article>`;
    }).join('');
    return rows;
  }

  function renderBody() {
    const shots = A.Photos.progressCount();
    return `
      <header class="screenhead">
        <div class="screenhead-top">
          <button class="icon-btn" data-nav="more" aria-label="Back to More">${icon('chev-back')}</button>
          <div style="flex:1;min-width:0">
            <h1>Progress</h1>
            <div class="screenhead-sub">${esc(
              shots + (shots === 1 ? ' photo' : ' photos') + ' · ' + S.tapeDays().length +
              (S.tapeDays().length === 1 ? ' measuring session' : ' measuring sessions')
            )}</div>
          </div>
          <button class="headpill" data-act="photo-add">${icon('plus')}Photo</button>
        </div>
      </header>

      ${photoBlock()}

      <div class="label split">
        <span>The tape</span>
        <button class="link" data-act="tape-open">Measure</button>
      </div>
      ${tapeDetail()}

      <p class="footnote">Photos live on this device in the same store as the exercise
        pictures, never leave it, and travel in your backup. Nothing on this screen
        counts toward a day or a streak.</p>
    `;
  }

  /** One plain sentence about a real record, with no invented currency in it. */
  function lifeSentence(life) {
    const bits = [];
    bits.push(`<b>${life.kept}</b> of <b>${life.days}</b> ${life.days === 1 ? 'day' : 'days'} kept`);
    if (life.sessions) bits.push(`<b>${life.sessions}</b> ${life.sessions === 1 ? 'exercise' : 'exercises'} done`);
    if (life.sets) bits.push(`<b>${life.sets}</b> ${life.sets === 1 ? 'set' : 'sets'} logged`);
    if (life.reps) bits.push(`<b>${life.reps}</b> reps`);
    return bits.join(' · ');
  }

  /**
   * Stats, from artboard 2c.
   *
   * The rank and XP ladder that used to close this screen are gone rather than
   * demoted. They were the app's own invention about itself, and with the goal
   * engine removed there is nothing left they were even counting — every figure
   * here is now a fact: sessions kept, sets performed, weight moved.
   */
  function renderProgress() {
    const hist = S.history();
    const life = S.lifeTotals();
    const streak = S.currentStreak();
    const today = S.today();
    const unit = life.unit;

    // 18-week heat map, Monday-first columns
    const start = A.addDays(A.weekStart(today), -17 * 7);
    const floor = S.historyStart();
    let cells = '';
    for (let w = 0; w < 18; w++) {
      for (let d = 0; d < 7; d++) {
        const k = A.addDays(start, w * 7 + d);
        const before = A.daysBetween(floor, k) < 0;
        const st = before ? 'future' : S.dayStatus(k).status;
        cells += `<i class="${st}${k === today ? ' today' : ''}" title="${k} · ${st}"></i>`;
      }
    }

    // last 8 weeks of completed days
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const anchor = A.addDays(A.weekStart(today), -i * 7);
      weeks.push(S.weekStats(anchor));
    }
    const maxW = Math.max(1, ...weeks.map((w) => w.complete), S.settings().goalPerWeek);
    const bars = weeks
      .map((w) => {
        const h = Math.round((w.complete / maxW) * 100);
        const label = A.fromKey(w.start).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
        return `<div class="col ${w.hit ? 'hit' : ''}"><i style="height:${Math.max(3, h)}%"></i><small>${label}</small></div>`;
      })
      .join('');

    // category mix over the last 30 days
    const mix = {};
    let mixTotal = 0;
    for (let i = 0; i < 30; i++) {
      const k = A.addDays(today, -i);
      const l = S.log(k);
      if (!l) continue;
      S.dayPlan(k).forEach((it) => {
        if (!l.ex || !l.ex[it.id]) return;
        const ex = S.exerciseById(it.exerciseId);
        const cat = (ex && ex.category) || 'Other';
        mix[cat] = (mix[cat] || 0) + 1;
        mixTotal++;
      });
    }
    /* Muscles over a window the user picks. This is the question a training
       plan is actually built around — "have I trained legs this week" — and
       `category` could never answer it: Strength is not a muscle.

       Bars are drawn against the busiest group, never against a total. The
       counts overlap on purpose (a deadlift is back and legs and glutes), so a
       percentage would be dividing by a number that means nothing. */
    const tally = S.muscleTally(muscleWindow);
    const muscleRows = tally.rows.length
      ? tally.rows
          .map(
            (r) =>
              `<div class="breakdown-row"><span class="lbl">${esc(r.name)}</span>${bar(
                (r.count / tally.most) * 100
              )}<span class="val">${r.count}</span></div>`
          )
          .join('') +
        `<p class="faint" style="margin:10px 2px 0;line-height:1.5">${esc(
          tally.sessions + (tally.sessions === 1 ? ' training day' : ' training days') +
          (tally.missing.length ? ' · nothing for ' + tally.missing.join(', ').toLowerCase() : '') +
          (tally.untagged ? ' · ' + tally.untagged + ' untagged' : '')
        )}${
          tally.untagged
            ? ' — <button class="link" data-nav="more" style="min-height:0">tag them in the library</button>'
            : ''
        }</p>`
      : `<div class="empty">Nothing logged in this window.<br>
         <span class="faint">Tick exercises on Today, and what they work shows up here.</span></div>`;

    const mixRows = Object.keys(mix).length
      ? Object.entries(mix)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([cat, n]) =>
              `<div class="breakdown-row"><span class="lbl">${esc(cat)}</span>${bar((n / mixTotal) * 100)}<span class="val">${n}</span></div>`
          )
          .join('')
      : `<div class="empty">Complete some exercises to see your training mix.</div>`;

    const sparks = exerciseSparks();

    /* Heaviest set ever, per exercise. A table rather than a chart: eight
       single numbers have no shape to show, and a bar chart of unrelated lifts
       invites comparing a curl to a deadlift, which means nothing. */
    const bestRows = life.exercises.filter((r) => r.best).slice(0, 12);

    return `
      <header class="screenhead">
        <div class="screenhead-top"><h1>Stats</h1></div>
        <div class="screenhead-sub">Since ${esc(
          A.prettyDate(life.since)
        )} · everything here is recomputed from your logs</div>
      </header>

      <!-- The light surface, used once on this screen and for this alone. -->
      <section class="ledgercard">
        <div class="ledgercard-label">What you've actually lifted</div>
        <p class="lifeline">${lifeSentence(life)}</p>
        <div class="ledgercard-grid">
          <div class="ledgercard-item"><b>${esc(A.round1(life.volume) + ' ' + unit)}</b><span>total moved</span></div>
          <div class="ledgercard-item"><b>${life.workoutDays}</b><span>${
            life.workoutDays === 1 ? 'day trained' : 'days trained'
          }</span></div>
          <div class="ledgercard-item"><b>${life.exercises.length}</b><span>${
            life.exercises.length === 1 ? 'lift logged' : 'lifts logged'
          }</span></div>
        </div>
      </section>

      <div class="statrow">
        <div class="statcard"><span class="statcard-label">Streak</span>
          <b>${streak}</b><small>best ${hist.best}</small></div>
        <div class="statcard"><span class="statcard-label">Days kept</span>
          <b class="good">${hist.completeDays}</b><small>${life.days} lived</small></div>
        <div class="statcard"><span class="statcard-label">Sets</span>
          <b>${life.sets}</b><small>${life.reps} reps</small></div>
      </div>

      ${
        sparks
          ? `<div class="label split"><span>Top set · 90 days</span><span>heaviest set each session</span></div>
             <div class="card">${sparks}</div>
             <p class="footnote">Each column is one session, not one day — nothing is drawn for a
               day the lift was not trained, because a gap in the record is not a zero. The
               baseline is the lightest session shown, so a real 5 ${esc(unit)} is visible
               rather than rounded flat.</p>`
          : ''
      }

      ${
        bestRows.length
          ? `<div class="label">Heaviest set</div>
             <div class="card flush">${bestRows
               .map(
                 (r) => `<div class="row">
                   <div class="body"><div class="name">${esc(r.name)}</div>
                     <div class="sub">${esc(
                       r.days + (r.days === 1 ? ' session · ' : ' sessions · ') + r.sets + ' sets · last ' + A.prettyDate(r.last)
                     )}</div></div>
                   <span class="pill">${esc(A.fmtWeight(r.best.w, unit) + ' × ' + r.best.r)}</span>
                 </div>`
               )
               .join('')}</div>`
          : ''
      }

      <div class="label">Last 18 weeks</div>
      <div class="card">
        <div class="heat">${cells}</div>
        <div class="legend">
          <span><b style="background:var(--good)"></b>Kept</span>
          <span><b style="background:color-mix(in srgb,var(--warn) 45%,transparent)"></b>Partial</span>
          <span><b style="background:color-mix(in srgb,var(--accent) 14%,transparent)"></b>Rest</span>
          <span><b style="background:color-mix(in srgb,var(--bad) 22%,transparent)"></b>Missed</span>
          <span><b style="background:var(--surface-2)"></b>Not yet</span>
        </div>
      </div>

      <div class="label">Muscles trained</div>
      <div class="segbar tight">${MUSCLE_WINDOWS.map(
        (w) => `<button class="seg ${muscleWindow === w.days ? 'on' : ''}" data-act="muscle-window"
          data-days="${w.days}" aria-pressed="${muscleWindow === w.days}">${esc(w.label)}</button>`
      ).join('')}</div>
      <div class="card">${muscleRows}</div>

      <div class="label">Training mix · 30 days</div>
      <div class="card">${mixRows}</div>

      <div class="label">Sessions a week · target ${S.settings().goalPerWeek}</div>
      <div class="card"><div class="bars">${bars}</div></div>

      <div class="label split">
        <span>Body weight</span>
        <button class="link" data-act="weigh-in">Weigh in</button>
      </div>
      ${weightBlock()}

      <button type="button" class="linkrow" data-nav="body">
        <span class="linkrow-plate" aria-hidden="true">${icon('tape')}</span>
        <span class="body"><b>Progress</b><span>${esc(
          S.tapeDays().length
            ? 'The tape, and your photos'
            : 'Measurements and progress photos'
        )}</span></span>
        ${icon('chev')}
      </button>
      <p class="footnote">Nothing here counts toward a day or a streak. Standing on
        the scales is not a training session, and a month you did not measure is
        not a month you missed.</p>
    `;
  }

  /* ================= REWARDS ================= */

  /**
   * Rewards the user promised themselves. These pay out in the real world, so
   * "claim" means "I actually bought it" — and it toggles, because a mistap is
   * not a purchase.
   *
   * This is the whole of Rewards now. The eleven-milestone ladder, the XP on
   * each medal and the weekly chest went with the points system: a badge for
   * fourteen days is the app paying itself, and knowledge/project.md says a
   * reward that costs something real beats one that costs the app nothing.
   */
  function myRewards() {
    const list = S.customRewards();
    if (!list.length) {
      return `<div class="promptrow">
        <span class="promptrow-plate" aria-hidden="true">${icon('gift')}</span>
        <div class="promptrow-body">Promise yourself something real. Fourteen sessions, then the thing.
          <button class="link" data-act="reward-new">Set one up →</button></div>
      </div>`;
    }
    return list
      .map((r) => {
        const p = S.customRewardProgress(r);
        return `<article class="myreward ${p.claimed ? 'is-claimed' : ''} ${p.unlocked ? 'is-ready' : ''}">
          <button type="button" class="myreward-open" data-act="reward-edit" data-id="${r.id}">
            <span class="myreward-icon" aria-hidden="true">${r.icon ? esc(r.icon) : icon('gift')}</span>
            <span class="myreward-body">
              <span class="myreward-name">${esc(r.name)}</span>
              <span class="myreward-trig">${r.days}-day streak${
          p.unlocked ? ' · earned on your best run of ' + S.history().best : ''
        }</span>
            </span>
          </button>
          <div class="myreward-track">
            <div class="xpbar-top"><span>${p.have} / ${p.need} days</span><span>${
          p.claimed ? 'Collected ' + esc(A.prettyDate(p.claimedOn)) : p.unlocked ? 'Earned — go get it' : `${p.need - p.have} to go`
        }</span></div>
            ${bar(p.pct, p.unlocked ? 'gold' : '')}
          </div>
          ${
            p.unlocked
              ? `<button class="btn ${p.claimed ? 'ghost' : 'gold'} block" data-act="reward-claim" data-id="${r.id}"
                   style="margin-top:13px">${p.claimed ? 'Collected — undo' : 'I bought it'}</button>
                 <p class="myreward-note">Collecting records the purchase. The app did not buy this — you did.</p>`
              : ''
          }
        </article>`;
      })
      .join('');
  }

  function renderRewards() {
    const streak = S.currentStreak();
    const best = S.history().best;
    return `
      <header class="screenhead">
        <div class="screenhead-top">
          <span class="screenhead-plate" aria-hidden="true">${icon('trophy')}</span>
          <div style="flex:1;min-width:0">
            <h1>Rewards</h1>
            <div class="screenhead-sub">Earned on your best run, never revoked</div>
          </div>
          <button class="headpill" data-act="reward-new">${icon('plus')}New</button>
        </div>
      </header>

      <div class="label split"><span>Your own rewards</span><span>${streak} now · best ${best}</span></div>
      ${myRewards()}
      <p class="footnote">A reward is a promise you make to yourself and pay yourself:
        "fourteen sessions kept, then the shoes". It is earned on the best run your streak
        ever reached, so a slip afterwards cannot take back something you already did.</p>
    `;
  }

  /**
   * The weigh-in. One field, because it is done three mornings a week and
   * anything longer would not get done.
   *
   * It carries the unit it was typed in, exactly as a logged set does, so
   * switching the display unit later re-reads the history rather than
   * re-valuing it.
   */
  function openWeighIn(dateKey) {
    const k = dateKey || S.today();
    const unit = S.settings().weightUnit === 'lb' ? 'lb' : 'kg';
    const cur = S.bodyEntry(k);
    const shown = cur && cur.kg != null ? A.round1(A.convertWeight(cur.kg, cur.u || 'kg', unit)) : '';
    const trend = S.weightTrend(12);
    openSheet('Weigh in', `
      <p class="muted" style="margin-top:0">${esc(A.prettyDate(k))}. After the toilet, before
        food, same conditions each time. One morning is not a weight — the app reads the
        weekly average.</p>
      <label class="field"><span>Body weight (${esc(unit)})</span>
        <input type="number" inputmode="decimal" step="0.1" min="0" id="bw_kg" value="${esc(shown)}"></label>
      ${
        trend
          ? `<p class="footnote" style="margin-top:0">Last week's average was ${esc(
              A.round1(trend.latest) + ' ' + trend.unit
            )}.</p>`
          : ''
      }
      <div class="btn-row"><button class="btn primary block" data-act="weigh-save" data-date="${k}">Save</button></div>
      ${
        cur && cur.kg != null
          ? `<button class="btn ghost danger block" data-act="weigh-clear" data-date="${k}" style="margin-top:8px">Remove this reading</button>`
          : ''
      }
    `);
    const field = $('#bw_kg');
    if (field && field.focus) field.focus();
  }

  /**
   * The tape. Every field optional, and deliberately NOT pre-filled.
   *
   * The set log pre-fills because you confirm each set as you do it. A whole
   * form of last month's numbers, saved in one tap, would record ten
   * measurements you did not take. The previous reading is shown BESIDE each
   * field instead, so it is there to compare against and impossible to save by
   * accident.
   */
  function openTape(dateKey) {
    const k = dateKey || S.today();
    const cur = S.bodyEntry(k) || {};
    const hist = {};
    S.tapeHistory().forEach((r) => { hist[r.key] = r; });
    const box = (key, label) => {
      const prev = hist[key] && hist[key].readings ? hist[key] : null;
      return `<label class="field minifield"><span>${esc(label)}</span>
        <input type="number" inputmode="decimal" step="0.1" min="0" id="bm_${key}"
          value="${esc(cur[key] != null ? A.round1(cur[key]) : '')}">
        ${prev ? `<small class="field-note">was ${esc(A.round1(prev.last) + ' cm, ' + A.prettyDate(prev.lastOn))}</small>` : ''}
      </label>`;
    };
    openSheet('Measurements', `
      <p class="muted" style="margin-top:0">${esc(A.prettyDate(k))}. First thing in the morning,
        before eating, tape snug but not compressing. Centimetres.</p>
      <p class="footnote" style="margin-top:0">Fill in what you measured and leave the rest
        blank — a blank field records nothing rather than repeating last month's number.</p>
      ${A.BODY_FIELDS.map((f) =>
        f.paired
          ? `<div class="grid-2">${box(f.id + '_l', f.name + ' L')}${box(f.id + '_r', f.name + ' R')}</div>`
          : box(f.id, f.name)
      ).join('')}
      <div class="btn-row"><button class="btn primary block" data-act="tape-save" data-date="${k}">Save measurements</button></div>
    `);
  }

  function openRewardEditor(id, draft) {
    const r = id ? S.customRewards().find((x) => x.id === id) : null;
    const v = Object.assign({ name: '', icon: '', days: 14 }, r || {}, draft || {});
    openSheet(r ? 'Edit reward' : 'New reward', `
      <p class="muted" style="margin-top:0">Name something you actually want, and what it costs in
        sessions. Discipline will not buy it for you — it just refuses to say you earned it before you did.</p>
      <div class="grid-2">
        <label class="field"><span>Reward</span>
          <input type="text" id="rw_name" maxlength="40" value="${esc(v.name)}" placeholder="New shoes"></label>
        <label class="field"><span>Icon</span>
          <input type="text" id="rw_icon" maxlength="4" value="${esc(v.icon || '')}" placeholder="optional"></label>
      </div>
      <label class="field"><span>Days needed</span>
        <input type="number" id="rw_days" min="1" max="999" value="${esc(v.days)}"></label>
      <div class="btn-row"><button class="btn primary block" data-act="reward-save" data-id="${r ? r.id : ''}">${
      r ? 'Save reward' : 'Add reward'
    }</button></div>
      ${r ? `<button class="btn ghost danger block" data-act="reward-delete" data-id="${r.id}" style="margin-top:8px">Delete</button>` : ''}
    `);
  }

  /* ================= MORE ================= */

  function renderMore() {
    const s = S.settings();
    const exs = S.get().exercises.slice().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    const libRows = !exs.length
      ? `<div class="empty">No exercises yet.<br><button class="link" data-act="lib-add">Create one →</button></div>`
      : exs
      .map(
        (e) => `<div class="row">
          <span class="emoji">${exGlyph(e)}</span>
          <div class="body"><div class="name">${esc(e.name)}</div><div class="sub">${esc(e.category)} · ${esc(
          e.unit === 'time' ? (e.minutes || 10) + ' min' : e.unit === 'distance' ? (e.km || 1) + ' km' : (e.sets || 3) + ' × ' + (e.reps || 10)
        )}</div></div>
          <button class="icon-btn" data-act="lib-edit" data-id="${e.id}" aria-label="Edit">${icon('pen')}</button>
          <button class="icon-btn" data-act="lib-rm" data-id="${e.id}" aria-label="Delete">✕</button>
        </div>`
      )
      .join('');

    const fz = S.freezeStats();
    const readyRewards = S.customRewards().filter((r) => {
      const pr = S.customRewardProgress(r);
      return pr.unlocked && !pr.claimed;
    }).length;

    return `
      <header class="screenhead">
        <div class="screenhead-top"><h1>More</h1></div>
        <div class="screenhead-sub">Everything lives on this device · nothing is ever uploaded</div>
      </header>

      <!-- Rewards left the tab bar for this row: it is the one screen you open
           after the fact rather than to do something, and the three daily
           screens are worth more thumb than it is. -->
      <button type="button" class="linkrow" data-nav="rewards">
        <span class="linkrow-plate" aria-hidden="true">${icon('trophy')}</span>
        <span class="body"><b>Rewards</b><span class="${readyRewards ? 'is-ready' : ''}">${
      readyRewards
        ? readyRewards + ' earned, uncollected'
        : 'Promises you make to yourself, paid in the real world'
    }</span></span>
        ${icon('chev')}
      </button>

      <button type="button" class="linkrow" data-nav="body">
        <span class="linkrow-plate" aria-hidden="true">${icon('tape')}</span>
        <span class="body"><b>Progress</b><span>${esc(
          A.Photos.progressCount() || S.tapeDays().length
            ? A.Photos.progressCount() + ' photos · ' + S.tapeDays().length + ' measuring sessions'
            : 'Progress photos and the tape'
        )}</span></span>
        ${icon('chev')}
      </button>

      <div class="label">Training</div>
      <div class="card flush">
        <div class="row">
          <div class="body"><div class="name">Weight unit</div><div class="sub">Every set keeps the unit it was typed in, so switching only changes how they read</div></div>
          <select data-set="weightUnit">
            ${Object.keys(A.WEIGHT_UNITS)
              .map(
                (u) => `<option value="${u}" ${s.weightUnit === u ? 'selected' : ''}>${esc(A.WEIGHT_UNITS[u].label)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="row">
          <div class="body"><div class="name">Rest timer</div><div class="sub">Starts when you log a set, counting the rest the plan prescribes — and counting up when it prescribes none</div></div>
          <label class="switch"><input type="checkbox" data-set="restTimer" ${s.restTimer ? 'checked' : ''}><i></i></label>
        </div>
        <div class="row">
          <div class="body"><div class="name">Sessions a week</div><div class="sub">The target the weekly bars on Stats are drawn against</div></div>
          <input type="number" data-set="goalPerWeek" min="1" max="7" value="${esc(s.goalPerWeek)}">
        </div>
        <div class="row">
          <div class="body"><div class="name">Deload week</div><div class="sub">Every Nth week, cut training volume by ~40% — the recovery half of the equation</div></div>
          <select data-set="deloadEveryWeeks">
            ${[0, 3, 4, 5, 6].map((n) => `<option value="${n}" ${Number(s.deloadEveryWeeks) === n ? 'selected' : ''}>${
              n === 0 ? 'Off' : 'Every ' + n + ' weeks'
            }</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="label">Streak rules</div>
      <div class="card flush">
        <div class="row">
          <div class="body"><div class="name">Day rolls over at</div><div class="sub">A late session still counts for the day you meant</div></div>
          <select data-set="dayBoundaryHour">
            ${[0, 1, 2, 3, 4, 5, 6].map((h) => `<option value="${h}" ${s.dayBoundaryHour === h ? 'selected' : ''}>${A.prettyTime(h * 60)}</option>`).join('')}
          </select>
        </div>
        <div class="row">
          <div class="body"><div class="name">Session counts as complete at</div><div class="sub">How much of the day's plan you must finish</div></div>
          <select data-set="completionPct">
            ${[60, 80, 100].map((pc) => `<option value="${pc}" ${s.completionPct === pc ? 'selected' : ''}>${pc}%</option>`).join('')}
          </select>
        </div>
        <div class="row">
          <div class="body"><div class="name">Rest days keep the streak</div><div class="sub">Days with nothing scheduled don't break it</div></div>
          <label class="switch"><input type="checkbox" data-set="restCountsAsStreak" ${s.restCountsAsStreak ? 'checked' : ''}><i></i></label>
        </div>
        <div class="row">
          <div class="body"><div class="name">Streak freezes</div><div class="sub">One earned per 10 completed days · ${fz.used} used of ${fz.earned} earned</div></div>
          <span class="pill ${fz.available ? 'gold' : ''}">${fz.available} left</span>
        </div>
      </div>

      <div class="label">Profile</div>
      <div class="card flush">
        <div class="row">
          <div class="body"><div class="name">Display name</div><div class="sub">What the app calls you</div></div>
          <input type="text" data-set="name" value="${esc(s.name)}" maxlength="24" style="max-width:150px">
        </div>
      </div>

      <!-- Eighty-odd exercises would push Reminders, Profile and the export
           route off the bottom of More. It is a reference list, opened to
           change something rather than read on the way past, so it folds. -->
      ${foldHead({
        id: 'libBody',
        act: 'lib-open',
        title: 'Exercise library',
        /* The picture count rides the heading rather than hiding in a settings
           screen: they are the only thing this app stores outside its own
           backup-able state, so the user should be able to see they exist. */
        summary: (exs.length ? exs.length + ' exercises' : 'empty') +
          (A.Photos.count() ? ' · ' + A.Photos.count() + ' pictures' : ''),
        open: libOpen,
        tail: `<button type="button" class="icon-btn" data-act="lib-add" aria-label="New exercise">＋</button>`
      })}
      <div id="libBody">${libOpen ? `<div class="card">${libRows}</div>` : ''}</div>

      <div class="label">Reminders</div>
      <div class="card">
        <div class="row">
          <div class="body"><div class="name">Nudge me while the app is open</div><div class="sub">A browser notification when the session is still unlogged</div></div>
          <label class="switch"><input type="checkbox" data-set="reminders" ${s.reminders ? 'checked' : ''}><i></i></label>
        </div>
      </div>
      <!-- Verbatim, and it stays that way. The artboard's note about this screen
           says "the honest disclaimers stay verbatim — the app cannot be an
           alarm clock and says so", which is the one thing on More that is worth
           more than the layout. -->
      <p class="footnote">
        Being straight with you: a web app <b>cannot</b> be an alarm clock. Browsers don't run timers in
        the background, and iOS only delivers web notifications to a home-screen install, unreliably.
        Discipline <b>tracks</b> your training; it can't get you to the gym. Keep using your phone's alarm for that.
      </p>

      <div class="label">App</div>
      <div class="card">
        <div class="row">
          <div class="body"><div class="name">Install Discipline</div><div class="sub">Add to your home screen and run offline</div></div>
          <button class="btn" data-act="install">Install</button>
        </div>
        <div class="row">
          <div class="body"><div class="name">Backup your data</div><div class="sub">Everything is stored on this device only</div></div>
          <button class="btn" data-act="export">Export</button>
        </div>
        <div class="row">
          <div class="body"><div class="name">Restore from backup</div><div class="sub">Replaces all current data</div></div>
          <button class="btn" data-act="import">Import</button>
        </div>
        <div class="row">
          <div class="body"><div class="name">Reset everything</div><div class="sub">Wipes the plan, every logged set, streaks and rewards</div></div>
          <button class="btn danger" data-act="reset">Reset</button>
        </div>
      </div>
      <p class="footnote" style="text-align:center;margin-top:18px">Discipline · offline-first PWA · your data never leaves this device<br>
        build ${esc(buildVersion || 'not yet installed')}</p>
    `;
  }

  /* ================= sheets ================= */

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // The element that opened the sheet, so the keyboard can be handed back on close.
  let sheetOpener = null;

  /** Tabbable controls inside the sheet, in document order, skipping hidden ones
      (the weekday checkboxes are display:none while a goal is scheduled daily). */
  function sheetFocusable() {
    const sheet = $('#sheet');
    if (!sheet || !sheet.querySelectorAll) return [];
    return Array.from(sheet.querySelectorAll(FOCUSABLE)).filter(
      (el) => typeof el.getClientRects !== 'function' || el.getClientRects().length > 0
    );
  }

  function openSheet(title, html) {
    const backdrop = $('#sheetBackdrop');
    // Sheets re-render themselves in place (changing a goal's unit rebuilds the
    // form); only a genuine open should capture the opener or move focus, or
    // typing would be interrupted every time the form is rebuilt.
    const wasOpen = backdrop && !backdrop.hidden;
    if (!wasOpen) sheetOpener = document.activeElement || null;

    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = html;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';

    if (!wasOpen) {
      const target = sheetFocusable()[0] || $('#sheetClose');
      if (target && target.focus) target.focus();
    }
  }

  function closeSheet() {
    const backdrop = $('#sheetBackdrop');
    const wasOpen = backdrop && !backdrop.hidden;
    backdrop.hidden = true;
    $('#sheetBody').innerHTML = '';
    document.body.style.overflow = '';
    // Escape, the X and the backdrop all land here; drop any armed callback so a
    // dismissed confirmation can never fire against a later sheet.
    pendingConfirm = null;
    pendingPrompt = null;

    // Views re-render often, so the opener may no longer be in the document.
    const alive = sheetOpener && (typeof sheetOpener.isConnected === 'boolean' ? sheetOpener.isConnected : true);
    if (wasOpen && alive && sheetOpener.focus) sheetOpener.focus();
    sheetOpener = null;
  }
  UI.closeSheet = closeSheet;

  // Keep Tab inside the open sheet — without this, aria-modal is a claim the
  // keyboard does not honour and Tab walks off into the page behind it.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab') return;
    const backdrop = $('#sheetBackdrop');
    if (!backdrop || backdrop.hidden) return;

    const items = sheetFocusable();
    if (!items.length) return;
    const sheet = $('#sheet');
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (!(sheet && sheet.contains && sheet.contains(active))) {
      ev.preventDefault();
      first.focus();
    } else if (ev.shiftKey && active === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  });

  function pickerHtml() {
    const cats = ['All'].concat(A.CATEGORIES);
    const q = picker.q.toLowerCase();
    const list = S.get()
      .exercises.filter((e) => (picker.cat === 'All' || e.category === picker.cat) && (!q || e.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));

    return `
      <div class="picker-search">
        <input type="text" id="pickerQ" aria-label="Search exercises"
          placeholder="Search exercises…" value="${esc(picker.q)}" autocomplete="off">
      </div>
      <div class="cat-tabs">${cats
        .map((c) => `<button class="cat-tab ${picker.cat === c ? 'active' : ''}" data-act="pick-cat" data-cat="${esc(c)}">${esc(c)}</button>`)
        .join('')}</div>
      <div class="pick-list">
        ${
          list.length
            ? list
                .map(
                  (e) => `<button type="button" class="item" data-act="pick-ex" data-id="${e.id}">
                    <span class="emoji" aria-hidden="true">${exGlyph(e)}</span>
                    <span class="body"><span class="name">${esc(e.name)}</span><span class="sub">${esc(e.category)} · ${esc(
                    dose({}, e)
                  )}</span></span>
                    <span class="trail">ADD ＋</span>
                  </button>`
                )
                .join('')
            : `<div class="empty">No match. <button class="link" data-act="lib-add">Create "${esc(
                picker.q
              )}"</button></div>`
        }
      </div>
      <button class="btn block" data-act="sheet-close" style="margin-top:14px">Done</button>
    `;
  }

  function openPicker(day) {
    picker = { day: day, q: '', cat: 'All' };
    openSheet(`Add to ${A.DAY_NAMES[day]}`, pickerHtml());
  }

  function refreshPicker() {
    $('#sheetBody').innerHTML = pickerHtml();
  }

  function openPlanEditor(day, itemId) {
    const item = (S.get().plan[day] || []).find((i) => i.id === itemId);
    if (!item) return;
    const ex = S.exerciseById(item.exerciseId) || { unit: 'reps', name: 'Exercise' };
    const fields =
      ex.unit === 'time'
        ? `<label class="field"><span>Minutes</span><input type="number" id="f_minutes" min="1" max="600" value="${esc(item.minutes || ex.minutes || 10)}"></label>`
        : ex.unit === 'distance'
        ? `<label class="field"><span>Kilometres</span><input type="number" id="f_km" min="0.5" step="0.5" max="200" value="${esc(item.km || ex.km || 3)}"></label>`
        : `<div class="grid-2">
             <label class="field"><span>Sets</span><input type="number" id="f_sets" min="1" max="20" value="${esc(item.sets || ex.sets || 3)}"></label>
             <label class="field"><span>Reps</span><input type="number" id="f_reps" min="1" max="200" value="${esc(item.reps || ex.reps || 10)}"></label>
           </div>`;

    // Not escaped: openSheet assigns the title with textContent, which does no
    // HTML parsing, so escaping here would print the entities literally.
    openSheet(ex.name, `
      ${fields}
      <label class="field"><span>Note (optional)</span><input type="text" id="f_note" maxlength="60" value="${esc(item.note || '')}" placeholder="e.g. slow tempo, 40kg"></label>
      <div class="btn-row">
        <button class="btn primary" data-act="plan-save" data-day="${day}" data-id="${itemId}" style="flex:1">Save</button>
        <button class="btn danger" data-act="plan-rm" data-day="${day}" data-id="${itemId}">Remove</button>
      </div>
    `);
  }

  function openExerciseEditor(id, draft) {
    const e = id ? S.exerciseById(id) : null;
    // Prefill from the picker search only when the editor was opened from the plan picker.
    const prefill = route === 'plan' ? picker.q : '';
    const v = Object.assign(
      { name: prefill, category: 'Other', unit: 'reps', sets: 3, reps: 10, minutes: 20, km: 3 },
      e || {},
      draft || {}
    );
    // The first field means a different thing per unit, and the rep fields mean
    // nothing at all outside sets×reps — lib-save discards them. Label the one
    // and hide the others rather than leaving controls that do nothing.
    const reps = v.unit !== 'time' && v.unit !== 'distance';
    openSheet(e ? 'Edit exercise' : 'New exercise', `
      <label class="field"><span>Name</span><input type="text" id="e_name" maxlength="40" value="${esc(v.name)}" placeholder="Incline dumbbell press"></label>
      <div class="grid-2">
        <!-- No Icon field here either. What was typed in it rendered at 24px in
           the workout list beside drawn icons, in the platform's own colours at
           its own weight. The stored value stays and an exercise that already
           has a glyph still shows it; there is just no control inviting a new
           one. -->
        <label class="field"><span>Category</span><select id="e_cat">${A.CATEGORIES.map(
          (c) => `<option ${v.category === c ? 'selected' : ''}>${c}</option>`
        ).join('')}</select></label>
      </div>
      <label class="field"><span>Measured in</span><select id="e_unit">
        <option value="reps" ${v.unit === 'reps' ? 'selected' : ''}>Sets × reps</option>
        <option value="time" ${v.unit === 'time' ? 'selected' : ''}>Minutes</option>
        <option value="distance" ${v.unit === 'distance' ? 'selected' : ''}>Kilometres</option>
      </select></label>
      <div class="grid-2">
        <label class="field"><span>${esc(
          v.unit === 'time' ? 'Minutes' : v.unit === 'distance' ? 'Kilometres' : 'Sets'
        )}</span><input type="number" id="e_a" min="1" value="${esc(v.unit === 'time' ? v.minutes || 20 : v.unit === 'distance' ? v.km || 3 : v.sets || 3)}"></label>
        <label class="field" ${reps ? '' : 'hidden'}><span>Reps</span><input type="number" id="e_b" min="1" value="${esc(v.reps || 10)}"></label>
      </div>
      <label class="field" ${reps ? '' : 'hidden'}><span>Reps — upper end (optional)</span>
        <input type="number" id="e_max" min="1" placeholder="e.g. 12 for a 8–12 range" value="${
          esc(v.repsMax != null ? v.repsMax : '')
        }"></label>
      <!-- What it works, as opposed to what kind of thing it is. Chips rather
           than a select: most exercises are more than one muscle, and a
           multi-select on a phone is a scroll list nobody opens twice. -->
      <div class="field"><span>What it works</span>
        ${(function () {
          /* Grouped by region. Nineteen chips in one wrap is a wall; six short
             rows under their own heading is a list you can find "triceps" in. */
          const seen = [];
          A.MUSCLES.forEach((m) => { if (seen.indexOf(m.group) < 0) seen.push(m.group); });
          return seen.map((g) => `<div class="chip-group"><i>${esc(g)}</i>
            <div class="chips">${A.MUSCLES.filter((m) => m.group === g).map((m) => {
              const on = (v.muscles || []).indexOf(m.id) >= 0;
              return `<button type="button" class="chip-pick ${on ? 'on' : ''}" data-act="ex-muscle"
                data-muscle="${esc(m.id)}" aria-pressed="${on}">${esc(m.name)}</button>`;
            }).join('')}</div></div>`).join('');
        })()}
      </div>
      <label class="field"><span>How to do it — one step per line</span>
        <textarea id="e_how" rows="7" placeholder="Lie on the floor, knees bent…">${esc(v.how || '')}</textarea></label>
      <div class="btn-row"><button class="btn primary block" data-act="lib-save" data-id="${e ? e.id : ''}">${e ? 'Save changes' : 'Create exercise'}</button></div>
    `);
  }

  function openCopyDay(target) {
    openSheet(`Copy into ${A.DAY_NAMES[target]}`, `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">Replaces ${esc(A.DAY_NAMES[target])} with a copy of another day.</p>
      <div class="list">${dayOrder
        .filter((d) => d !== target)
        .map((d) => {
          const n = (S.get().plan[d] || []).length;
          return `<button type="button" class="item" data-act="plan-copy-from" data-from="${d}" data-day="${target}">
            <span class="emoji">${icon('calendar')}</span>
            <span class="body"><span class="name">${A.DAY_NAMES[d]}</span><span class="sub">${n} exercise${n === 1 ? '' : 's'}</span></span>
            <span class="trail">COPY</span></button>`;
        })
        .join('')}</div>
    `);
  }

  /**
   * The how-to sheet: the written cues for one exercise, plus its pictures.
   *
   * There is deliberately no drawn demonstration. An abstract figure could not
   * distinguish the movements it claimed to show — every upright pose read as
   * the same vertical stroke — and a demonstration you cannot trust is worse
   * than none. The cues carry what actually matters: tempo, setup, what to
   * avoid.
   */
  /* What the how-to sheet was last opened with, so adding a picture can rebuild
     it without losing the prescription it was showing. */
  let howArgs = null;

  function openExerciseHow(exerciseId, item) {
    const ex = S.exerciseById(exerciseId);
    if (!ex) return;
    howArgs = { id: exerciseId, item: item || null };
    const lines = String(ex.how || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const prescription = item ? dose(item, ex) : dose({}, ex);

    /* The picture of the movement, if the user has added one. It goes above the
       written cues because that is the order they are used in: you look at the
       shape, then read the detail. `A.Photos.get` is a synchronous read of a
       cache filled at boot — nothing here waits on a database, and nothing here
       reaches the network, which is what the whole app is built on. */
    const photo = A.Photos.get(ex.id);

    // Plain text: the sheet title goes in through `textContent`, so an inline
    // SVG would arrive as literal markup. The name alone is enough here.
    openSheet(ex.name, `
      ${
        photo
          ? `<figure class="how-photo">
              <img src="${esc(photo)}" alt="How to do ${esc(ex.name)}">
              <figcaption>
                <button class="link" data-act="ex-photo-pick" data-id="${esc(ex.id)}">Replace</button>
                <button class="link danger" data-act="ex-photo-rm" data-id="${esc(ex.id)}">Remove</button>
              </figcaption>
            </figure>`
          : `<button type="button" class="how-photo-add" data-act="ex-photo-pick" data-id="${esc(ex.id)}">
              ${icon('image')}<b>Add a picture</b>
              <small>From your phone. Kept on this device — it is never uploaded anywhere.</small>
            </button>`
      }
      <div class="how-dose">
        <b>${esc(prescription)}</b>
        <span>${esc(ex.category)}${item && item.note ? ' · ' + esc(item.note) : ''}</span>
      </div>
      ${
        lines.length
          ? `<ol class="how-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>`
          : `<div class="empty">No written cues for this exercise yet.<br>
             <button class="link" data-act="lib-edit" data-id="${ex.id}">Add them →</button></div>`
      }
      <button class="btn ghost block" data-act="lib-edit" data-id="${ex.id}" style="margin-top:12px">Edit exercise</button>
    `);
  }

  /** Rebuild the how-to sheet in place — after a picture is added or removed. */
  function refreshExerciseHow() {
    if (howArgs) openExerciseHow(howArgs.id, howArgs.item);
  }

  /* ---------- confirm / prompt sheets ----------
     Destructive actions and free-text entry used the browser's own dialogs, which
     ignore the app's theme and, for anything asking a value, bypass the validated
     inputs used everywhere else. These two sheets replace them. The pending
     callback lives here rather than in the click router because a confirmation is
     a continuation, not a new action to route. */

  let pendingConfirm = null;
  let pendingPrompt = null;

  /**
   * @param {object} opts
   *  title, body, confirmLabel, danger — presentation
   *  onConfirm — run when confirmed
   *  onCancel  — run instead of a plain close; use it to reopen the sheet this
   *              confirmation interrupted, so cancelling is genuinely a no-op
   */
  function openConfirm(opts) {
    pendingConfirm = opts;
    openSheet(opts.title, `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md);line-height:1.55">${esc(opts.body || '')}</p>
      <div class="btn-row">
        <button class="btn ${opts.danger ? 'danger' : 'primary'}" data-act="confirm-yes" style="flex:1">${esc(
      opts.confirmLabel || 'Confirm'
    )}</button>
        <button class="btn ghost" data-act="confirm-no">Cancel</button>
      </div>
    `);
    // A confirmation often replaces a sheet that is already open, and openSheet
    // deliberately leaves focus alone on a re-render — so claim it here. On a
    // destructive prompt the safe button takes focus, so a stray Enter cancels.
    const first = $(opts.danger ? '[data-act="confirm-no"]' : '[data-act="confirm-yes"]');
    if (first && first.focus) first.focus();
  }

  function resolveConfirm(agreed) {
    const opts = pendingConfirm;
    closeSheet(); // clears both pending slots
    if (!opts) return;
    if (agreed && opts.onConfirm) opts.onConfirm();
    else if (!agreed && opts.onCancel) opts.onCancel();
  }

  /** A single-line text sheet, for the places that asked with prompt(). */
  function openTextPrompt(opts) {
    pendingPrompt = opts;
    openSheet(opts.title, `
      ${opts.body ? `<p class="muted" style="margin-top:0;font-size:var(--fs-md)">${esc(opts.body)}</p>` : ''}
      <label class="field"><span>${esc(opts.label || 'Name')}</span>
        <input type="text" id="tp_value" maxlength="${Number(opts.maxlength) || 40}" value="${esc(
      opts.value || ''
    )}" placeholder="${esc(opts.placeholder || '')}"></label>
      <div class="btn-row">
        <button class="btn primary" data-act="text-prompt-save" style="flex:1">${esc(opts.confirmLabel || 'Add')}</button>
        <button class="btn ghost" data-act="confirm-no">Cancel</button>
      </div>
    `);
    const field = $('#tp_value');
    if (field && field.focus) field.focus();
  }

  function resolveTextPrompt() {
    const opts = pendingPrompt;
    const el = $('#tp_value');
    const value = el ? String(el.value || '').trim() : '';
    /* Empty keeps the sheet open rather than silently discarding — unless the
       caller says an empty answer is a real one. Clearing a note the user wrote
       has to be reachable, and "delete every character then save" is the only
       gesture anybody tries. */
    if (!value && !(opts && opts.allowEmpty)) return false;
    closeSheet(); // clears both pending slots
    if (opts && opts.onSave) opts.onSave(value);
    return true;
  }

  /** Re-baselining asks for a value in the goal's own unit, so it gets the same
      validated clock/number field as every other value in the app rather than a
      free-text browser prompt. */
  function toast(msg, kind, ms) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = msg;
    $('#toasts').appendChild(el);
    // An action taken from the toast has answered it; the toast should not sit
    // there afterwards offering to be taken again.
    const btn = el.querySelector('.undo-btn');
    if (btn) btn.addEventListener('click', () => el.remove());
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, ms || 2400);
  }
  UI.toast = toast;

  /**
   * A toast carrying one action — undo, in practice.
   *
   * The button is an ordinary `data-act` control, so the router in `js/app.js`
   * runs it exactly as it would from a card, and there is no second copy of
   * what undoing means. It lives longer than a plain toast because a message
   * you must read *and then act on* needs longer than one you only read.
   */
  function toastAction(msg, action) {
    const attrs = ['act', 'id', 'date']
      .filter((k) => action[k] != null)
      .map((k) => `data-${k}="${esc(String(action[k]))}"`)
      .join(' ');
    toast(`${msg}<button type="button" class="undo-btn" ${attrs}>${esc(action.label || 'UNDO')}</button>`, 'has-action', 5000);
  }
  UI.toastAction = toastAction;
  /** Clear any action toast still on screen. One undo slot only ever made sense
      with one UNDO button; toasts stack, so this is what keeps that true. */
  UI.dismissActionToasts = () => {
    const host = $('#toasts');
    if (!host || !host.querySelectorAll) return;
    const live = host.querySelectorAll('.toast.has-action');
    if (live && live.forEach) live.forEach((t) => t.remove && t.remove());
  };

  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('#confetti');
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    cv.classList.add('on');
    const colors = ['#ff7a18', '#ffb020', '#ffc24d', '#4fd18b', '#f0e6d8'];
    const parts = Array.from({ length: 110 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: innerHeight * 0.42,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 11 - 3,
      w: 5 + Math.random() * 6,
      h: 4 + Math.random() * 5,
      c: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.35
    }));
    let frames = 0;
    (function tick() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach((p) => {
        p.vy += 0.28;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - frames / 130);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (++frames < 130) requestAnimationFrame(tick);
      else {
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        cv.classList.remove('on');
      }
    })();
  }
  UI.confetti = confetti;

  /* ================= router ================= */

  const VIEWS = {
    today: renderToday, plan: renderPlan,
    progress: renderProgress, rewards: renderRewards, more: renderMore,
    /* `body`, not `progress` — Stats already owns that route name. The screen is
       called Progress and the route is not, which is worth knowing before
       hunting for a bug that is only a name. */
    body: renderBody
  };

  /**
   * The screen shown when a view throws.
   *
   * It owns `#view` outright and must stay self-sufficient: it carries its own
   * Export button rather than reaching for `banners()`, because `banners()` is
   * rendered inside `renderToday()` — the very thing that just failed.
   */
  function recoveryPanel(err) {
    return `<section class="recovery">
      <h1>This screen could not be drawn</h1>
      <p>Your data has not been touched — this is a display failure, not a data one.
         Export a backup now, then reload the app.</p>
      <pre>${esc(String((err && err.message) || err || 'Unknown error'))}</pre>
      <div class="btn-row">
        <button class="btn primary" data-act="export">Export a backup</button>
        <button class="btn ghost" data-nav="today">Back to Today</button>
      </div>
    </section>`;
  }
  UI.recoveryPanel = recoveryPanel;

  /* A re-render replaces every node, so the control you just pressed is gone and
     focus lands on <body>. Identify it by what it does rather than by identity,
     and put it back. Without this a keyboard user re-tabs from the top of the
     document after every single tick. */
  function focusKey(el) {
    if (!el || !el.dataset) return null;
    const d = el.dataset;
    if (!d.act && !d.nav) return null;
    return [d.act || '', d.nav || '', d.id || '', d.date || '', d.day || ''].join('|');
  }

  function restoreFocus(el, key) {
    if (!key || !el.querySelectorAll) return;
    const all = el.querySelectorAll('[data-act],[data-nav]');
    for (let i = 0; i < all.length; i++) {
      if (focusKey(all[i]) === key && all[i].focus) {
        all[i].focus();
        return;
      }
    }
  }

  function render() {
    if (viewDate == null) viewDate = S.today();
    const fn = VIEWS[route] || renderToday;
    const el = view();
    const keepScroll = el.dataset.route === route ? window.scrollY : 0;
    // The stub DOM in tools/render.js has no activeElement, so this must not assume one.
    const focused = focusKey(document.activeElement);
    el.dataset.route = route;

    try {
      el.innerHTML = fn();
    } catch (err) {
      // Previously this left a white screen and a console line nobody would see.
      console.error('Discipline: a view failed to render.', err);
      el.innerHTML = recoveryPanel(err);
      return; // never restore focus onto a panel the user did not ask for
    }

    window.scrollTo({ top: keepScroll, behavior: 'instant' });
    restoreFocus(el, focused);

    /* Rewards has no tab of its own any more — it is reached from More, so More
       is the tab you are on while you are there. Without this, opening Rewards
       leaves the bar with nothing lit and no sense of where you have got to. */
    const tabRoute = route === 'rewards' || route === 'run' || route === 'body' ? 'more' : route;
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.nav === tabRoute;
      /* The tab's icon is drawn from the same table as every other icon in the
         app, rather than sitting as a second copy of the paths in index.html
         where the two would drift apart. Painted once: the tab bar is static
         chrome, so this does nothing on every later render. */
      if (t.dataset.icon && !t.querySelector('.ico')) {
        t.insertAdjacentHTML('afterbegin', icon(t.dataset.icon));
      }
      t.classList.toggle('active', on);
      // The active tab was styling alone, so assistive tech had no way to tell
      // which of the five you were on.
      if (t.setAttribute) {
        if (on) t.setAttribute('aria-current', 'page');
        else t.removeAttribute('aria-current');
      }
    });
  }
  UI.render = render;

  UI.go = function (next, opts) {
    if (!VIEWS[next]) next = 'today';
    route = next;
    if (location.hash !== '#/' + next) history.replaceState(null, '', '#/' + next);
    render();
    if (opts && opts.day != null) {
      const target = document.getElementById('plan-day-' + opts.day);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0 });
    }
  };

  UI.route = () => route;
  UI.viewDate = () => viewDate || (viewDate = S.today());
  UI.setViewDate = (k) => { viewDate = k; editSet = null; rest = null; };
  UI.toggleLibOpen = () => { libOpen = !libOpen; };
  UI.libOpen = () => libOpen;
  UI.setMuscleWindow = (d) => {
    const n = Number(d);
    if (MUSCLE_WINDOWS.some((w) => w.days === n)) muscleWindow = n;
  };
  UI.muscleWindow = () => muscleWindow;
  UI.openExerciseHow = openExerciseHow;
  UI.refreshExerciseHow = refreshExerciseHow;
  UI.openConfirm = openConfirm;
  UI.resolveConfirm = resolveConfirm;
  UI.openTextPrompt = openTextPrompt;
  UI.resolveTextPrompt = resolveTextPrompt;
  UI.openRewardEditor = openRewardEditor;
  UI.openWeighIn = openWeighIn;
  UI.openTape = openTape;
  UI.openPicker = openPicker;
  UI.refreshPicker = refreshPicker;
  UI.openPlanEditor = openPlanEditor;
  UI.openExerciseEditor = openExerciseEditor;
  UI.openCopyDay = openCopyDay;
  UI.openSheet = openSheet;
  UI.setBuild = (v) => { buildVersion = v; };
  UI.picker = () => picker;
  UI.setPicker = (p) => Object.assign(picker, p);
  /* Which set row is being corrected, if any. View state and nothing else: a
     half-typed correction is not user data, and it clears the moment the day
     being looked at changes. */
  UI.editSet = () => editSet;
  UI.setEditSet = (itemId, index) => {
    editSet = itemId == null ? null : { itemId: itemId, index: Number(index) };
  };
  /* The rest timer. `startRest` reads the interval off the plan item's own note
     and stores nothing — see the note on `rest` at the top of this file. */
  UI.rest = () => rest;
  UI.restNow = restNow;
  UI.paintRest = paintRest;
  UI.stopRest = () => { rest = null; };
  UI.startRest = (dateKey, itemId) => {
    const item = S.dayPlan(dateKey).find((i) => i.id === itemId);
    if (!item) return null;
    const ex = S.exerciseById(item.exerciseId);
    const from = A.restFromNote(item.note);
    rest = {
      itemId: itemId,
      name: (ex && ex.name) || 'that set',
      startedAt: Date.now(),
      seconds: from ? from.seconds : null,
      text: from ? from.text.replace(/^rest /i, 'rest ') : '',
      rang: false
    };
    return rest;
  };
  UI.pose = () => pose;
  UI.setPose = (id) => { pose = A.POSES.some((x) => x.id === id) ? id : 'front'; };
  UI.esc = esc; // toasts built outside this module must escape user text with the same rule
})(window);
