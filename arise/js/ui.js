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
  // Which bucket of today's goals is on screen: 'todo' | 'done' | 'skipped'.
  // View state, not user data — it resets to the work still outstanding on load.
  let todayFilter = 'todo';
  // Whether a long workout is showing all of itself. Same kind of state, and it
  // collapses again when the day changes: opening yesterday is a different
  // question from working through today.
  let workoutOpen = false;
  // Same again for the exercise library on More: a reference list you open to
  // change something, not one you read on the way past.
  let libOpen = false;
  /* Which half of Plan is on screen: 'goals' | 'week'. Artboard 2a splits the
     two subjects that used to share one scroll, and a tab is view state, not a
     setting — it opens on the goals every time, because that is the half a
     person comes to Plan to change. */
  let planTab = 'goals';
  /* Written habits waiting for a run to exist. Cleared with the rest of the
     picker, because they are a selection rather than stored data. */
  let draftCustoms = [];
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
    /* A gift, for the one control that pays something out. */
    gift: '<rect x="3.5" y="8.5" width="17" height="12" rx="2"/><path d="M3.5 12.5h17M12 8.5V20.5"/><path d="M12 8.5S10.5 4 8 4a2.2 2.2 0 0 0 0 4.5m4 0S13.5 4 16 4a2.2 2.2 0 0 1 0 4.5"/>'
  };

  /* An exercise category and a goal area each stand for one drawn icon. */
  const CATEGORY_ICON = { Strength: 'dumbbell', Cardio: 'pulse', Core: 'target', Mobility: 'move' };
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
   * given an icon carries `🎯` because the field defaulted to it, not because
   * anybody picked it, and seven goals all showing the same target is exactly
   * the noise this replaces.
   */
  const STOCK_GOAL_ICON = '🎯';
  const STOCK_EX_ICON = '🏋️';
  let stockByName = null;

  function stockExIcon(name) {
    if (!stockByName) {
      stockByName = new Map();
      (A.SEED_EXERCISES || []).forEach((e) => stockByName.set(e.name, e.icon));
      (A.PROGRAM_EXERCISES || []).forEach((e) => stockByName.set(e.name, e.icon));
    }
    return stockByName.get(name);
  }

  /** @returns {string} ready-to-insert HTML — an escaped emoji, or an inline SVG. */
  function exGlyph(ex) {
    if (!ex) return icon('dumbbell');
    const stock = stockExIcon(ex.name);
    const chosen = ex.icon && ex.icon !== stock && ex.icon !== STOCK_EX_ICON;
    return chosen ? esc(ex.icon) : icon(CATEGORY_ICON[ex.category] || 'dumbbell');
  }

  function goalGlyph(g) {
    if (!g) return icon('star');
    const seed = (A.SEED_GOALS || []).find((s) => s.key && s.key === g.key);
    const chosen = g.icon && g.icon !== (seed && seed.icon) && g.icon !== STOCK_GOAL_ICON;
    return chosen ? esc(g.icon) : icon(SECTION_ICON[g.section] || 'star');
  }

  /** The drawn icon for a goal area, used where a section labels a group. */
  const sectionGlyph = (id) => icon(SECTION_ICON[id] || 'star');

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
    if (!ex) return { icon: esc('❓'), name: 'Removed exercise', sub: '', dose: '', cat: 'Other' };
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
  const fmtXp = (n) => Number(n || 0).toLocaleString();

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
  const axisRound = (v) => {
    if (v <= 10) return Math.ceil(v);
    if (v <= 60) return Math.ceil(v / 5) * 5;
    if (v <= 240) return Math.ceil(v / 15) * 15;
    return Math.ceil(v / 30) * 30;
  };

  /**
   * A goal's last six weeks: columns for what was logged, a step line for what
   * was asked.
   *
   * @param {object} g     the goal
   * @param {object[]} pts from `S.goalSeries`
   */
  function goalChart(g, pts) {
    const asked = pts.filter((p) => p.asked);
    if (asked.length < 2) {
      return `<p class="footnote">Not enough logged yet to draw. Two days on the
        record and the shape starts showing.</p>`;
    }
    const W = 320;
    const H = 108;
    const PAD_T = 12;
    const PAD_B = 16;
    const plot = H - PAD_T - PAD_B;

    const values = pts.map((p) => p.value || 0).concat(pts.map((p) => p.target || 0));
    const top = axisRound(Math.max(1, Math.max.apply(null, values)));
    const y = (v) => PAD_T + plot - (Math.max(0, v) / top) * plot;

    const slot = W / pts.length;
    /* Cap the column and let the leftover be air. The 2px surface gap is what
       separates neighbours — never a stroke, which would add ink that is not
       data. */
    const bw = Math.max(2, Math.min(24, slot - 2));

    const cols = pts
      .map((p, i) => {
        if (!p.asked || p.value == null || p.value <= 0) return '';
        const x = i * slot + (slot - bw) / 2;
        const h = Math.max(1.5, PAD_T + plot - y(p.value));
        /* 4px rounded data-end, square at the baseline: draw the radius only
           when the column is tall enough to show one. */
        const r = h > 6 ? Math.min(4, bw / 2) : 0;
        return `<rect x="${x.toFixed(1)}" y="${y(p.value).toFixed(1)}" width="${bw.toFixed(1)}"
          height="${h.toFixed(1)}" rx="${r}" ry="${r}" fill="var(--chart-did)"
          ><title>${esc(A.prettyDate(p.date))} · ${esc(A.formatValue(g.unit, p.value))}${
          p.target != null ? ' of ' + esc(A.formatValue(g.unit, p.target)) : ''
        }</title></rect>`;
      })
      .join('');

    /* The target, as a step rather than a slope: it changes on the day it
       changes, and drawing it as a ramp would claim the ask moved gradually. */
    let d = '';
    pts.forEach((p, i) => {
      if (!p.asked || p.target == null) return;
      const x0 = i * slot;
      const x1 = x0 + slot;
      const yy = y(p.target).toFixed(1);
      d += (d ? ` L${x0.toFixed(1)},${yy}` : `M${x0.toFixed(1)},${yy}`) + ` L${x1.toFixed(1)},${yy}`;
    });

    const last = asked[asked.length - 1];
    const best = asked.reduce((a, b) => ((b.value || 0) > (a.value || 0) ? b : a), asked[0]);

    return `
      <div class="chart">
        <svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="none"
             aria-label="${esc(g.name)} over the last ${asked.length} days it was asked for. ${esc(
      'Logged between ' + A.formatValue(g.unit, Math.min.apply(null, asked.map((p) => p.value || 0))) +
      ' and ' + A.formatValue(g.unit, best.value || 0) + '.'
    )}">
          <line x1="0" y1="${PAD_T + plot}" x2="${W}" y2="${PAD_T + plot}" class="chart-base"></line>
          ${cols}
          ${d ? `<path d="${d}" class="chart-ask" fill="none"></path>` : ''}
        </svg>
        <div class="chart-foot">
          <span>${esc(A.prettyDate(pts[0].date))}</span>
          <span>${esc(A.prettyDate(pts[pts.length - 1].date))}</span>
        </div>
        <!-- Labelled selectively: the most recent and the best. A number on every
             column is chaos and goes unread. -->
        <div class="chart-keys">
          <span class="chart-key did">Logged${
            last.value != null ? ' · latest ' + esc(A.formatValue(g.unit, last.value)) : ''
          }</span>
          <span class="chart-key ask">Asked${
            last.target != null ? ' · now ' + esc(A.formatValue(g.unit, last.target)) : ''
          }</span>
          <span class="chart-key best">Best ${esc(A.formatValue(g.unit, best.value || 0))}</span>
        </div>
      </div>`;
  }

  /**
   * One small multiple per practice, on Stats.
   *
   * Small multiples rather than a multi-line chart on purpose. Six series would
   * need six validated categorical hues, and this app has three colours with
   * fixed jobs — generating three more would break that and put two
   * indistinguishable hues on screen under CVD. Faceting keeps one hue and lets
   * the LABEL carry identity, which is the honest fix.
   */
  function goalSparks() {
    const live = S.activeGoals();
    if (!live.length) return '';
    return live
      .map((g) => {
        const pts = S.goalSeries(g.id, 28).filter((p) => p.asked);
        if (pts.length < 2) return '';
        const top = Math.max(1, Math.max.apply(null, pts.map((p) => Math.max(p.value || 0, p.target || 0))));
        const W = 120;
        const H = 26;
        const slot = W / pts.length;
        const bw = Math.max(1.5, Math.min(24, slot - 1));
        const cols = pts
          .map((p, i) => {
            if (p.value == null || p.value <= 0) return '';
            const h = Math.max(1, (p.value / top) * H);
            return `<rect x="${(i * slot).toFixed(1)}" y="${(H - h).toFixed(1)}"
              width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="var(--chart-did)"></rect>`;
          })
          .join('');
        const kept = pts.filter((p) => p.done).length;
        return `<button type="button" class="spark" data-act="goal-detail" data-id="${g.id}">
          <span class="spark-name">${esc(g.name)}</span>
          <svg class="spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${cols}</svg>
          <span class="spark-val">${kept}/${pts.length}</span>
        </button>`;
      })
      .join('');
  }

  /* ================= goal fragments ================= */

  /** "by 6:30" / "at least 20 min" — an instruction, not a number.
      Words rather than ≤ and ≥: this app assumes no training and no maths, and a
      bare "30 min" beside an empty tick could equally be the target, the time
      elapsed, or what you logged. */
  function targetPhrase(goal, value) {
    const v = A.formatValue(goal.unit, value);
    if (goal.unit === 'time') return (goal.direction === 'down' ? 'by ' : 'from ') + v;
    return (goal.direction === 'down' ? 'at most ' : 'at least ') + v;
  }

  function levelChip(tl) {
    if (!tl) return '';
    if (tl.atTarget) return `<span class="lvl at">AT TARGET</span>`;
    return `<span class="lvl">Lv ${tl.level}<i>/${tl.maxLevel}</i></span>`;
  }

  /** What has to happen for the next step — the honest version. */
  function advanceHint(goal, tl) {
    if (!tl) return '';
    /* NOT "now just hold it". A target you have reached is a ceiling you set
       from an older, smaller estimate of yourself, and an app that answers the
       moment you outgrow it with "hold" has made the standard a normal person's.
       The standard is your own maximum, revised upward as you find it.

       Revised by YOU, though. The baseline-and-target pair is what stops a
       progression running away, and moving the ceiling automatically would take
       that guarantee off — so this says the ceiling is reachable, and Plan
       carries the control that moves it. */
    if (tl.atTarget) return 'At the target you set. That was an older estimate of you — raise it.';
    const nxt = A.formatValue(goal.unit, tl.nextTarget);
    const n = tl.toAdvance;
    if (n <= 0) return `Next step ready → ${nxt}`;
    return `${n} more good day${n === 1 ? '' : 's'} → ${nxt}`;
  }

  /* An area used to give its card a generated tinted "artwork" through a --hue
     custom property. Artboard 1c has no artwork: the plate carries the area's
     drawn icon and every card is the same charcoal, so seven hues would be seven
     colours competing with the three the system actually assigns a meaning to.
     `SECTION_ICON` is what tells the areas apart now. */

  /**
   * A goal as a card on Today: an icon plate, the name, one line of context, and
   * either the ask or a tick. This is the primary surface of the app — what
   * today asks, and one tap to record it.
   */
  function goalCard(entry, dateKey) {
    const g = entry.goal;
    const tl = entry.tl;
    const locked = S.isFuture(dateKey);
    const gated = g.gate === 'summary';
    const logged = entry.entry && entry.entry.value != null ? A.formatValue(g.unit, entry.entry.value) : null;
    const mode = A.MODES[A.Goals.modeOf(g, S.settings().mode)];

    const meta = [
      `<span>${icon('repeat')}${esc(scheduleText(g))}</span>`,
      `<span>${icon('level')}${esc(mode.name)}</span>`,
      logged ? `<span>${icon('check')}${esc(logged)} logged</span>` : ''
    ]
      .filter(Boolean)
      .join('');

    /* Something was logged, but it did not reach the ask. Its own state, gold:
       calling it done would be a lie and calling it nothing would erase the
       work. Derived here from the entry, never guessed from the rendered text. */
    const part = !!logged && !entry.done && !entry.skipped;

    /* The card from artboard 1c. Same element, same classes, same data-act and
       the same `data-goal` the swipe and press-and-hold handlers close on — this
       is a restyle, not a new component, so every gesture keeps working and
       nothing has to learn a second name for a goal row.

       Its shape: a 38px icon plate, the name, one 12px line of context, and
       either the ask or a tick on the right. A gated goal — reading — takes the
       amber border and a Write pill instead of the tick, because amber is
       "waiting on you" and a tick it cannot honour is a lie: the summary is what
       closes that goal, not this control.

       The brief's mockup puts a bare number in the value column — "06:15",
       "75 min". That reads correctly for a wake time and fails for anything
       counting DOWN: "Screen time 4 h" does not say which side of four hours you
       want. `targetPhrase` keeps the direction in words, which is the app's own
       rule and a test by name. The number still does the visual work; it is just
       not alone. */
    const ask = entry.target != null ? targetPhrase(g, entry.target) : '';
    /* What the gated card says instead of the ask, so the summary Today used to
       carry in its own card is not lost with it. */
    const gateLine = !gated
      ? ''
      : entry.done
      ? previewOf(S.readingEntry(dateKey))
      : 'Write the summary to close it';
    return `<article class="gcard ${entry.done ? 'is-done' : ''} ${entry.skipped ? 'is-skipped' : ''} ${
      part ? 'is-part' : ''
    } ${gated && !entry.done ? 'is-gated' : ''} ${locked ? 'locked' : ''}" data-goal="${g.id}">
      <span class="gcard-plate" aria-hidden="true">${icon(SECTION_ICON[g.section] || 'star')}</span>
      <button type="button" class="gcard-open" data-act="goal-detail" data-id="${g.id}">
        <span class="gcard-title">${esc(g.name)}</span>
        <span class="gcard-meta">${gateLine ? `<span class="gcard-gate">${esc(gateLine)}</span>` : meta}</span>
      </button>
      ${
        entry.streak > 0 || entry.skipped
          ? `<span class="gcard-badges">
              ${entry.streak > 0 ? `<span class="gcard-streak">${icon('flame')}${entry.streak}d</span>` : ''}
              ${entry.skipped ? '<span class="gcard-streak skip">Skipped</span>' : ''}
            </span>`
          : ''
      }
      ${ask && !gated ? `<span class="gcard-value">${esc(ask)}</span>` : ''}
      <button type="button" class="gcard-tick${gated ? ' is-write' : ''}" data-act="${gated ? 'open-read' : 'goal-hit'}"
              data-id="${g.id}" data-date="${dateKey}"
              aria-label="${gated ? 'Write the summary for' : entry.done ? 'Undo' : 'Complete'} ${esc(g.name)}"
              ${locked ? 'disabled' : ''}>${gated ? (entry.done ? 'Edit' : 'Write') : '✓'}</button>
    </article>`;
  }

  /** The first line of a summary, for a card that has to show it was written. */
  const previewOf = (r) => {
    const t = ((r && r.summary) || '').trim();
    return t ? (t.length > 64 ? t.slice(0, 64) + '…' : t) : 'Summary written';
  };

  /* ================= TODAY ================= */

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
    /* Rule 1 of knowledge/project.md is that a goal runs from where the user
       actually is. A fresh install seeds five and puts them on Today as
       instructions — wake at 07:30, lights out at 23:30 — and until this
       existed nothing anywhere said they were defaults. Someone who really
       wakes at 09:00 was asked for 07:30 on their first morning, missed, and
       the app's opening move was a verdict.

       This is NOT the starting-point sheet coming back. That asked four
       questions in a modal before the user had seen the app, which is why it
       went. One line, dismissible, pointing at the screen where the numbers
       actually live. It reuses `meta.onboarded`, which the sheet's removal left
       inert in the state shape — so there is no new flag and no migration. */
    if (!st.meta.onboarded && !st.meta.storageError && S.activeGoals().length) {
      out += `<section class="banner accent stack">
        <div><b>These are starting numbers, not yours</b><p>Discipline shipped with five goals so the app is not
          empty. A goal only works when it starts from where you actually are today — open Plan and move any
          that are not true for you.</p></div>
        <div class="btn-row">
          <button class="btn primary" data-nav="plan">Set my starting points</button>
          <button class="btn ghost" data-act="starting-ack">They are fine</button>
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

  function renderToday() {
    const k = viewDate;
    const today = S.today();
    const st = S.dayStatus(k);
    const plan = S.dayPlan(k);
    const habits = S.dayHabits(k);
    const l = S.log(k);
    const streak = S.currentStreak();
    const hist = S.history();
    const future = S.isFuture(k);
    const offset = A.daysBetween(today, k);
    const relative = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : offset === 1 ? 'Tomorrow' : A.prettyDate(k);
    const wk = S.weekStats(k);

    const headline = future
      ? 'Coming up'
      : st.status === 'rest'
      ? 'Rest day — recover well'
      : st.status === 'complete'
      ? 'Day complete. Well done.'
      : st.done === 0
      ? 'Nothing logged yet'
      : `${st.total - st.done} left to go`;

    /* The workout is one folded section, opened by tapping its heading.
       A leg day of eight exercises pushed the habits, the streak and the journal
       two screens down on the tab the user opens to do the day's work — and
       capping the list at four only made it shorter, not short. Folded, it costs
       one row until it is wanted.

       The heading still carries the count, so folding hides the list and never
       the fact that there is one. */
    const exDone = plan.filter((i) => l && l.ex && l.ex[i.id]).length;

    /* A programme day is written as warm-up, then the main lifts, then a
       stretch — and this list flattened all of it into one grey column. The
       structure is already in the data: every exercise carries a category, and
       the plan is stored in the order it is meant to be done.

       So a heading goes in wherever the category CHANGES, rather than grouping
       by category. Grouping would reorder the workout, and the order of a
       workout is not decoration — you do not stretch before you press. A day
       that genuinely alternates gets two headings with the same name, which is
       the honest picture of a day that alternates. */
    const exHtml = plan.length
      ? (function () {
          let lastCat = null;
          return plan
            .map((i) => {
              const p = planLine(i);
              const done = !!(l && l.ex && l.ex[i.id]);
              const ex = S.exerciseById(i.exerciseId);
              const muscles = A.cleanMuscles(ex && ex.muscles)
                .map((m) => A.MUSCLE_NAME[m])
                .join(' · ');
              /* Muscles first, the plan's own note second: "chest · triceps"
                 says what the exercise is for, "per side" says how to do it. */
              const sub = [muscles, i.note].filter(Boolean).join(' — ');
              const head = p.cat !== lastCat
                ? `<div class="block-head">${esc(p.cat)}</div>`
                : '';
              lastCat = p.cat;
              // The row is a container, not a button, so the "how to" control can
              // sit beside the toggle — same shape as a .goal row.
              return `${head}<div class="item tight ${done ? 'done' : ''} ${future ? 'locked' : ''}">
                <button type="button" class="item-main" data-act="toggle-ex" data-id="${i.id}"
                  aria-pressed="${done}" ${future ? 'disabled' : ''}>
                  <span class="tick" aria-hidden="true">✓</span>
                  <span class="emoji" aria-hidden="true">${p.icon}</span>
                  <span class="body"><span class="name">${esc(p.name)}</span></span>
                  <span class="dose">${esc(p.dose)}</span>${
                /* Its own full-width line below the name, not inside `.body`.
                   Sharing that column left roughly 150px for both, so
                   "Dumbbell Floor Press" clipped to "Dumbbell Flo…" while the
                   muscles wrapped underneath it anyway. */
                sub ? `<span class="exsub">${esc(sub)}</span>` : ''
              }
                </button>
                <button type="button" class="icon-btn" data-act="ex-how" data-id="${i.exerciseId}" data-item="${i.id}"
                  aria-label="How to do ${esc(p.name)}">${icon('info')}</button>
              </div>`;
            })
            .join('');
        })()
      : `<div class="empty"><span class="big">🛌</span>No exercises scheduled for ${esc(A.DAY_NAMES[A.weekday(k)])}.<br>
         <button class="link" data-act="go-plan" data-day="${A.weekday(k)}">Plan this day →</button></div>`;

    /* What the folded heading says, and it has to be true at a glance: how much
       of the day's training is left without opening it. */
    const exSummary = !plan.length
      ? 'Rest day'
      : future
      ? plan.length + (plan.length === 1 ? ' exercise' : ' exercises')
      : exDone === plan.length
      ? 'All ' + plan.length + ' done'
      : exDone + ' of ' + plan.length + ' done';

    const extras = (l && l.extra) || [];
    const extraHtml = extras
      .map(
        (x) => `<div class="item done"><span class="tick" aria-hidden="true">✓</span>
          <span class="emoji" aria-hidden="true">⭐</span>
          <span class="body"><span class="name">${esc(x.name)}</span><span class="sub">Bonus effort</span></span>
          <button class="icon-btn" data-act="rm-extra" data-id="${x.id}" aria-label="Remove">✕</button></div>`
      )
      .join('');

    const habitHtml = habits.length
      ? habits
          .map((h) => {
            const done = !!(l && l.hb && l.hb[h.id]);
            const hs = S.habitStreak(h.id);
            /* A habit is a thing you tick today, exactly like a goal, so it is
               the same card rather than a third visual language on one screen.
               Same data-act — only the shape changes. */
            return `<button type="button" class="item habit-row ${done ? 'done' : ''} ${future ? 'locked' : ''}" data-act="toggle-hb" data-id="${h.id}" aria-pressed="${done}" ${
              future ? 'disabled' : ''
            }>
              <span class="tick" aria-hidden="true">✓</span>
              <span class="body"><span class="name">${esc(h.name)}</span><span class="sub">${
                S.settings().requireHabits ? 'Counts toward the day' : 'Optional'
              }</span></span>
              ${hs > 1 ? `<span class="pill fire">🔥 ${hs}</span>` : ''}
            </button>`;
          })
          .join('')
      : `<div class="empty">No habits yet.<br><button class="link" data-nav="more">Add one →</button></div>`;

    const journal = S.journalEntry(k);
    const mLeft = A.minutesLeftToday(S.settings().dayBoundaryHour);
    const frozen = !!S.get().freezes[k];
    const fz = S.freezeStats();

    /* The reading card that used to sit under the goal list is gone: in 1c the
       gated goal IS that card — amber border, the prompt on its meta line, and a
       Write pill where every other row has a tick. Two cards for one commitment
       was the duplication the brief opened by naming. */

    /* The day counter is the headline. "DAY 12" says where you are in a way a
       date never does. With a challenge running it counts against its length —
       DAY 5 / 66 — and without one it simply counts days since you started,
       because a finish line nobody chose is a deadline. */
    const chal = S.activeChallenge();
    const chalDay = chal ? S.challengeDay(chal, k) : null;
    const inChallenge = chalDay != null && chalDay <= chal.days;
    const dayNum = inChallenge ? chalDay : A.daysBetween(S.historyStart(), k) + 1;
    const run = chal ? S.challengeProgress(chal) : null;
    const entries = S.goalsForDay(k);
    const buckets = {
      todo: entries.filter((e) => !e.done && !e.skipped),
      done: entries.filter((e) => e.done),
      skipped: entries.filter((e) => e.skipped)
    };
    const shown = buckets[todayFilter] || buckets.todo;
    /* The label carries its own count now — "3 left to go", "2 kept" — so the
       separate <b> that used to hold the number is gone rather than doubled. */
    const seg = (id, label) =>
      `<button type="button" class="seg ${todayFilter === id ? 'on' : ''}" data-act="today-filter" data-filter="${id}"
         aria-pressed="${todayFilter === id}">${label}</button>`;

    const cards = entries.length
      ? shown.length
        ? shown.map((e) => goalCard(e, k)).join('')
        : `<div class="empty">Nothing ${esc(todayFilter === 'todo' ? 'left to do' : todayFilter)} here.</div>`
      : `<div class="empty"><span class="big">🎯</span>No goals scheduled for this day.<br>
         <button class="link" data-nav="plan">Set some up →</button></div>`;

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
       straight after a broken one, and this app had nothing to say about it — a
       streak counter tells you what you have, not that the chain is one day from
       becoming a pattern.

       Stated as a fact and a next action, never as a reprimand. Harsh
       self-criticism measurably reduces follow-through: somebody who savages
       themselves after a miss abandons the whole domain, which is the opposite
       of what this line is for. */
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
            missed.left === 1 ? 'One thing left.' : missed.left + ' things left.'
          )} If today is falling apart, do the smallest version rather than none.</p>
        </section>`
      : '';

    /* The jar goes where the book says to read it — before the hard thing, on the
       screen where the hard thing is, and only while the day is still open. After
       the day is kept it would be a trophy cabinet, which is a different and much
       weaker object. */
    const jarCount = S.cookies().length;
    const jarRow =
      offset === 0 && !future && st.total && st.status !== 'complete'
        ? `<button type="button" class="linkrow jarrow" data-act="cookie-jar">
            <span class="linkrow-plate" aria-hidden="true">${icon('trophy')}</span>
            <span class="body"><b>${jarCount ? 'Reach into the jar' : 'Fill the cookie jar'}</b>
              <span>${
                jarCount
                  ? jarCount + ' hard ' + (jarCount === 1 ? 'thing' : 'things') + ' you have already done'
                  : 'Write down what you have already survived, while you are calm'
              }</span></span>
            ${icon('chev')}
          </button>`
        : '';

    // A gesture nobody is told about is a gesture nobody has. The wiring is in
    // js/app.js; this is the one line that makes it discoverable.
    const gestureHint =
      !future && shown.length
        ? `<p class="gesture-hint">Swipe a card right to keep it, left to skip. Press and hold to log part of it.</p>`
        : '';

    /* The day's next ask, pinned just above the tab bar.
       The primary action of the app used to live under the clock at the top of
       the screen, which on a phone is the one place a thumb cannot reach. The
       strip is fixed, so where it sits in this template is a matter of reading
       order only; it renders for today alone, never for a day being reviewed. */
    const nextUp = buckets.todo[0];
    const stripBody = !nextUp
      ? buckets.skipped.length
        ? `<b>Nothing left to log.</b><span>${buckets.skipped.length} skipped today.</span>`
        : `<b>Day kept.</b><span>Nothing else is asked of you today.</span>`
      : `<b>${buckets.todo.length} left today</b><span>Next: ${esc(nextUp.goal.name)}</span>`;
    const nextGated = nextUp && nextUp.goal.gate === 'summary';
    const strip =
      offset !== 0 || future || !entries.length
        ? ''
        : `<aside class="today-strip">
            <div class="today-strip-body">${stripBody}</div>
            ${
              nextUp
                ? `<button class="btn primary" data-act="${nextGated ? 'open-read' : 'goal-hit'}"
                     data-id="${nextUp.goal.id}" data-date="${k}">${nextGated ? 'Write it' : 'Keep it'}</button>`
                : ''
            }
          </aside>`;

    return `
      <!-- Artboard 1c's header. It is the one block on any screen painted in
           ember, and the rule the brief gives for that is "only where the
           screen's own subject is progress through time" — so it goes ember
           while a challenge is running, and charcoal when there is no length to
           count against. The two-layer bar is elapsed under kept: the day
           number says how long it has been, which is not the same thing as how
           much of it you kept and must not be dressed up as if it were.

           The whole ‹ › stepper, the day counter and the challenge bar used to
           be three separate blocks stacked down the screen. -->
      <section class="dayhead ${inChallenge ? 'ember' : ''} ${
        run && run.complete ? 'is-complete' : ''
      }">
        <div class="dayhead-top">
          <div class="dayhead-id">
            <div class="dayhead-label">${esc(inChallenge ? chal.name : relative)}</div>
            <h1 class="daynum">DAY <b>${dayNum}</b>${
              inChallenge ? `<i>/ ${chal.days}</i>` : ''
            }</h1>
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
        ${
          inChallenge
            ? `<button type="button" class="dayhead-track" data-act="challenge-open"
                 aria-label="${esc(chal.name)} — day ${run.day} of ${run.days}, ${run.kept} days kept">
                <i class="elapsed" style="width:${run.pct}%"></i>
                <i class="kept" style="width:${run.keptPct}%"></i>
              </button>`
            : ''
        }
        <div class="dayhead-foot">
          <span>${esc(A.prettyDate(k))}${st.total ? ` · ${st.done}/${st.total} done` : ''}</span>
          <span>${
            inChallenge
              ? `${run.elapsed} elapsed · ${run.kept} days kept`
              : `${hist.completeDays} days kept`
          }</span>
        </div>
        <!-- The headline was computed on every render and never inserted, so
             the day's state was said only by the fraction above and by the
             fixed strip. This is where it was plainly meant to go. -->
        <div class="dayline-headline">${esc(headline)}</div>
      </section>

      ${deloadNote}
      ${missTwice}
      ${jarRow}

      <!-- Banners sit UNDER the header, not above it. Every screen now begins
           with a header that supplies the status-bar inset, so a banner rendered
           first would be the one block on any screen with nothing between it and
           the clock. -->
      ${offset === 0 ? banners() : ''}

      <!-- The rail: seven days you can scrub, directly under the header, which
           is the brief's answer to a date stepper hidden in the corner. -->
      ${weekStrip(k)}

      ${offset !== 0 ? `<button class="btn ghost block" data-act="date-today" style="margin-bottom:12px">Back to today</button>` : ''}

      <!-- The filter, drawn as 1c's count line rather than as three tabs. The
           counts ARE the control: what is left reads as the heading it already
           looked like, and the two quiet figures beside it still switch the list.
           Nothing was made unreachable to get there. -->
      <div class="segbar countline">
        ${seg('todo', buckets.todo.length ? `${buckets.todo.length} left to go` : 'Nothing left')}
        <span class="countline-rest">${seg('done', `${buckets.done.length} kept`)}<i>·</i>${seg(
          'skipped',
          `${buckets.skipped.length} skipped`
        )}</span>
        <button class="icon-btn seg-add" data-act="goal-new" aria-label="New goal">＋</button>
      </div>

      ${cards}
      ${gestureHint}

      ${offset === 0 ? runSection() : ''}

      <!-- Folding the section used to take the only way of finishing a workout
           with it, so the tick rides the heading where it is always reachable. -->
      ${foldHead({
        id: 'workoutBody',
        act: 'workout-more',
        title: A.DAY_NAMES[A.weekday(k)] + ' workout',
        summary: exSummary,
        open: workoutOpen,
        done: plan.length && exDone === plan.length,
        tail:
          plan.length && !future
            ? `<button type="button" class="fold-tick" data-act="workout-done"
                aria-pressed="${exDone === plan.length}"
                aria-label="${exDone === plan.length ? 'Undo the whole' : 'Mark the whole'} ${esc(
                A.DAY_NAMES[A.weekday(k)]
              )} workout done">✓</button>`
            : ''
      })}
      <!-- The wrapper is always here so aria-controls always resolves; what is
           inside it is built only when open. Hiding a rendered list with the
           hidden attribute instead would leave the whole section one CSS
           display rule away from being invisible but still reachable, which is
           a failure this app has shipped before. -->
      ${
        plan.length && !future
          ? `<div class="fold-bar" aria-hidden="true"><i style="width:${
              Math.round((exDone / plan.length) * 100)
            }%"></i></div>`
          : ''
      }
      <div id="workoutBody">${
        !workoutOpen
          ? ''
          : `<div class="list">${exHtml}${extraHtml}</div>
        ${
          future
            ? ''
            : `<div class="inline-add">
                <input type="text" id="extraInput" aria-label="Log something extra you did"
                       placeholder="Log something extra you did…" maxlength="60">
                <button class="btn" data-act="add-extra">Add</button>
              </div>`
        }`
      }</div>

      <div class="label">Daily habits</div>
      <div class="list">${habitHtml}</div>

      <!-- What used to sit here: a three-figure scoreboard hero, the week strip
           a second time inside its own card, and a journal textarea. 1c has none
           of them, and each was a duplicate — the streak and days kept are in
           the header, the strip is the rail, the real totals are the first thing
           on Stats, and the journal box was the same box Read already carries
           for the same day. The brief's opening complaint was that Today is one
           long scroll of near-identical cards, and this was three quarters of
           the scroll.

           Neither of the two things that were reachable ONLY from here goes with
           them: the weekly reward, which is a payout and takes the amber, and
           the journal, which keeps a row that says whether it is written. -->
      ${
        wk.hit && !wk.claimed
          ? `<button type="button" class="paycard" data-act="claim-weekly">
              <span class="body"><b>This week is kept · ${wk.complete}/${wk.goal} days</b>
                <span>The weekly reward is waiting on you</span></span>
              <span class="paycard-go">Open · +${fmtXp(A.XP.weeklyGoal)} XP</span>
            </button>`
          : ''
      }

      <!-- Once the journal counts toward the day it is a thing the day ASKS
           for, so the row has to say whether it is done — a row that scores you
           silently is the same bug as a tick that does nothing. -->
      <button type="button" class="linkrow ${st.jrTotal ? (st.jrDone ? 'is-done' : 'is-asked') : ''}" data-nav="read">
        <span class="body"><b>Journal</b><span>${
          journal && (journal.text || '').trim()
            ? esc(previewOf({ summary: journal.text }))
            : st.jrTotal
            ? 'Not written yet — the day is asking for it'
            : 'Nothing written for this day yet'
        }</span></span>
        ${st.jrTotal && st.jrDone ? `<span class="linkrow-tick" aria-hidden="true">✓</span>` : icon('chev')}
      </button>

      ${
        offset === 0 && mLeft < 240
          ? `<p class="faint" style="text-align:center;font-size:var(--fs-sm);margin:4px 0 0">⏳ ${mLeft} min left to log ${esc(
              relative.toLowerCase()
            )} — the day rolls over at ${esc(A.prettyTime(S.settings().dayBoundaryHour * 60))}.</p>`
          : ''
      }
      ${
        offset < 0 && !frozen && st.status !== 'complete' && st.status !== 'rest'
          ? `<button class="btn ghost block" data-act="freeze" data-date="${k}" style="margin-top:10px" ${
              fz.available ? '' : 'disabled'
            }>❄️ Use a streak freeze on this day · ${fz.available} left</button>`
          : ''
      }
      ${frozen ? `<button class="btn ghost block" data-act="unfreeze" data-date="${k}" style="margin-top:10px">❄️ Frozen — tap to undo</button>` : ''}
      ${st.done > 0 ? `<button class="btn ghost block" data-act="clear-day" style="margin-top:4px">Reset this day's log</button>` : ''}
      ${strip}
    `;
  }

  /* ================= PLAN ================= */

  function scheduleText(goal) {
    const s = goal.schedule || { type: 'daily' };
    if (s.type === 'weekdays') return (s.days || []).map((d) => A.DAY_SHORT[d]).join(' ');
    return 'Every day';
  }

  /**
   * A goal, as artboard 2a draws it: the 38px icon plate, the name with its
   * level beside it in amber, and then the one line the brief asks for —
   * "every goal states its ladder in one line: baseline, today's ask, target"
   * — with what earns the next step underneath.
   *
   * The middle figure is emphasised because it is the only one of the three that
   * is a question being asked of you today; the other two are where you started
   * and where you are going. That is also why the row keeps `advanceHint`
   * verbatim: "2 more good days steps you to 06:00" is the app's core promise
   * that a level is earned by performing and never by the calendar, and the
   * mockup prints it in full.
   */
  function goalManageRow(g) {
    const tl = S.goalTimeline(g.id);
    const from = A.formatValue(g.unit, g.baseline);
    const to = A.formatValue(g.unit, g.target);
    const askOn = S.goalTargetOn(g.id, S.today());
    const ask = askOn != null ? A.formatValue(g.unit, askOn) : from;
    const pct = tl.maxLevel ? (tl.level / tl.maxLevel) * 100 : 100;
    return `<article class="goalcard ${g.archived ? 'is-archived' : ''}">
      <div class="goalcard-top">
        <span class="gcard-plate" aria-hidden="true">${icon(SECTION_ICON[g.section] || 'star')}</span>
        <div class="goalcard-body">
          <div class="goalcard-name">
            <b>${esc(g.name)}</b>${levelChip(tl)}
          </div>
          <div class="goalcard-ladder">${esc(from)} → <b>${esc(ask)}</b> → ${esc(to)} · ${esc(
      scheduleText(g)
    )}${g.gate === 'summary' ? ' · summary required' : ''}</div>
        </div>
        <button class="icon-btn" data-act="goal-edit" data-id="${g.id}" aria-label="Edit ${esc(g.name)}">✎</button>
      </div>
      <div class="goalcard-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>
      <div class="goalcard-hint">${esc(advanceHint(g, tl))}${
      tl.atTarget && !g.archived
        ? ` <button class="link" data-act="goal-raise" data-id="${g.id}">Raise it →</button>`
        : ''
    }</div>
    </article>`;
  }

  /**
   * What the goals are asking for, in hours, today and at their targets.
   *
   * The run refuses to build a day somebody cannot physically do — it checks
   * every one of its 66 days against a minutes budget. Goals have never had that
   * check, so six practices can quietly ramp to six hours a day and nothing
   * anywhere says so until the days start being missed.
   *
   * This is not a limit and it does not refuse anything. It is the accountability
   * mirror pointed at time: here is the number, and it is the one number nobody
   * works out for themselves.
   */
  function minuteBudget() {
    const live = S.activeGoals().filter((g) => g.unit === 'minutes');
    if (!live.length) return '';
    const k = S.today();
    const now = live.reduce((n, g) => {
      const t = S.goalTargetOn(g.id, k);
      return n + (t == null ? 0 : t);
    }, 0);
    const full = live.reduce((n, g) => n + (Number(g.target) || 0), 0);
    if (!now && !full) return '';
    const hrs = (m) => (m >= 90 ? Math.round((m / 60) * 10) / 10 + ' h' : Math.round(m) + ' min');
    return `<div class="minsum">
      <span>Today these ask <b>${esc(hrs(now))}</b></span>
      <span>At their targets, <b>${esc(hrs(full))}</b> a day</span>
    </div>`;
  }

  /** The goals half of Plan: a section label per area, then the cards. */
  function goalManageBlock() {
    const all = S.goals();
    const active = all.filter((g) => !g.archived);
    const archived = all.filter((g) => g.archived);
    const groups = {};
    active.forEach((g) => (groups[g.section || 'custom'] = (groups[g.section || 'custom'] || []).concat(g)));

    const body = A.SECTIONS.filter((s) => groups[s.id])
      .map(
        (s) => `<div class="label">${esc(s.name)}</div>
          ${groups[s.id].map(goalManageRow).join('')}`
      )
      .join('');

    return `
      ${minuteBudget()}
      ${body || `<div class="empty">No goals yet.<br><button class="link" data-act="goal-new">Add the first one →</button></div>`}
      ${
        archived.length
          ? `<div class="label">Paused</div>${archived.map(goalManageRow).join('')}`
          : ''
      }
      <button type="button" class="linkrow" data-act="practices-install">
        <span class="linkrow-plate" aria-hidden="true">${icon('target')}</span>
        <span class="body"><b>Only my practices</b>
          <span>Pause everything else and put the six back on the list</span></span>
        ${icon('chev')}
      </button>

      <button type="button" class="linkrow" data-act="goal-templates">
        <span class="linkrow-plate" aria-hidden="true">${icon('level')}</span>
        <span class="body"><b>Set up a practice</b>
          <span>English, AI, a sport, gratitude — the shape filled in, the numbers left to you</span></span>
        ${icon('chev')}
      </button>

      <!-- The invariant, printed where the screen that can break it lives. It is
           the verbatim line from the artboard. -->
      <p class="footnote">Editing a goal never reaches back: every day you have
        logged keeps the target it was judged against. A goal moves from where
        you are now to a target you set, and stops there — and you step up by
        performing, never because a week passed.</p>
    `;
  }

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
          : `<div class="empty" style="padding:14px">Rest day — nothing scheduled.</div>`;

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

      <button type="button" class="linkrow" data-act="program-install">
        <span class="linkrow-plate" aria-hidden="true">${icon('dumbbell')}</span>
        <span class="body"><b>Install the built-in programme</b>
          <span>Four dumbbell sessions, warm-ups and stretches, across the week</span></span>
        ${icon('chev')}
      </button>
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
  function renderPlan() {
    const goals = S.goals().filter((g) => !g.archived).length;
    const total = dayOrder.reduce((n, d) => n + (S.get().plan[d] || []).length, 0);
    const trainingDays = dayOrder.filter((d) => (S.get().plan[d] || []).length).length;
    const onGoals = planTab === 'goals';

    return `
      <header class="screenhead">
        <div class="screenhead-top">
          <h1>Plan</h1>
          ${
            onGoals
              ? `<button class="headpill" data-act="goal-new">${icon('plus')}New goal</button>`
              : `<button class="headpill" data-act="plan-add" data-day="${A.weekday(S.today())}">${icon(
                  'plus'
                )}Add today</button>`
          }
        </div>
        <div class="segbar tabs">
          <button type="button" class="seg ${onGoals ? 'on' : ''}" data-act="plan-tab" data-tab="goals"
            aria-pressed="${onGoals}">Goals · ${goals}</button>
          <button type="button" class="seg ${onGoals ? '' : 'on'}" data-act="plan-tab" data-tab="week"
            aria-pressed="${!onGoals}">Training week</button>
        </div>
        <div class="screenhead-sub">${
          onGoals
            ? 'A ladder each, from where you are to where you chose to be.'
            : `${trainingDays} training day${trainingDays === 1 ? '' : 's'} · ${total} exercise${
                total === 1 ? '' : 's'
              }`
        }</div>
      </header>

      ${onGoals ? goalManageBlock() : planWeekBlock()}
    `;
  }

  /* ================= READ ================= */

  /* Mood is stored as an index into this list, so it is append-only: reordering
     or removing an entry would silently re-label every journal entry already
     written. The name is what a screen reader announces — an emoji is not a name. */
  /* The archives render the most recent slice rather than everything. The count
     beside the heading has to say so: "Past summaries · 96" above a list that
     stops at 40 reads as the app having lost the rest, and honest is a stated
     project principle. */
  const ARCHIVE_MAX = 40;
  const archiveCount = (n) => (n > ARCHIVE_MAX ? `showing ${ARCHIVE_MAX} of ${n}` : String(n));

  const MOODS = [
    { icon: '😞', name: 'Rough' },
    { icon: '😕', name: 'Low' },
    { icon: '😐', name: 'Okay' },
    { icon: '🙂', name: 'Good' },
    { icon: '😄', name: 'Great' }
  ];

  const moodIcon = (i) => (MOODS[i] ? MOODS[i].icon : '');

  /** How many words are in it. The one number on this screen that has to be
      live, because it is next to the button that closes the day. */
  const wordCount = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

  /**
   * One form, used inline on the Read tab and inside the sheet from Today.
   *
   * Artboard 2b's order: the two facts of the entry as small cards, then the
   * prompt, then the box, then the word count beside the one button that closes
   * the day. The prompt used to be a field label three rows down — it is the
   * question being asked, so it sits above the box it is asked into.
   */
  function readingForm(dateKey) {
    const g = S.activeGoals().find((x) => x.gate === 'summary');
    const r = S.readingEntry(dateKey) || {};
    const done = g ? S.goalDone(dateKey, g.id) : !!(r.summary || '').trim();
    const target = g ? S.goalTargetOn(g.id, dateKey) : null;
    const mins = r.minutes != null ? r.minutes : target != null && g && g.unit === 'minutes' ? target : '';

    return `
      <div class="minifields">
        <label class="minifield wide"><span>Book</span>
          <input type="text" id="r_book" maxlength="60" value="${esc(r.book || '')}" placeholder="Deep Work, ch. 3"></label>
        <label class="minifield"><span>Minutes</span>
          <input type="number" id="r_min" min="0" max="600" value="${esc(mins)}"></label>
      </div>
      <p class="readprompt">${esc(A.promptForDay(dateKey))}</p>
      <textarea id="r_summary" rows="5" aria-label="Today's summary"
        placeholder="A few honest sentences in your own words…">${esc(r.summary || '')}</textarea>
      <div class="readfoot">
        <span class="readwords" id="r_words">${wordCount(r.summary)} words · any length counts</span>
        <button class="btn primary" data-act="read-save" data-date="${dateKey}">${
      done ? 'Update summary' : 'Save & complete'
    }</button>
      </div>
      <p class="footnote">Writing it is what marks the day done — there is no
        separate tick, and a real sentence beats a long one you didn't mean.${
          g && target != null
            ? ` Today asks ${esc(targetPhrase(g, target))}; logging fewer minutes saves the summary but leaves the goal unmet.`
            : ''
        }</p>
      ${
        done
          ? `<button class="btn ghost danger block" data-act="read-clear" data-date="${dateKey}">Clear this summary</button>`
          : ''
      }`;
  }

  /**
   * Read, from artboard 2b.
   *
   * "The gate is the screen's subject, so the prompt comes first and the day's
   * word count sits next to the one button that closes it."
   *
   * That is the whole change. The form used to be a stack of labelled fields
   * inside a plain card, with the prompt as a field label three rows down; the
   * prompt is the thing being asked, so it goes above the box it is asked into,
   * and the two facts of the entry — book and minutes — shrink to two small
   * cards beside each other above it. The card takes the amber border every
   * screen gives to something waiting on you, and drops it once the summary is
   * written.
   *
   * The archives collapse to counted rows. They were two full lists of forty
   * entries each on the screen you open to write today's, which is most of a
   * scroll spent on last month.
   */
  function renderRead() {
    const k = S.today();
    const g = S.activeGoals().find((x) => x.gate === 'summary');
    const tl = g ? S.goalTimeline(g.id) : null;
    const past = S.readingDays().filter((d) => d !== k);
    const jDays = S.journalDays().filter((d) => d !== k);
    const j = S.journalEntry(k) || {};
    const r = S.readingEntry(k) || {};
    const done = g ? S.goalDone(k, g.id) : !!(r.summary || '').trim();
    const target = g ? S.goalTargetOn(g.id, k) : null;

    const summaryList = past.length
      ? past
          .slice(0, ARCHIVE_MAX)
          .map((d) => {
            const e = S.readingEntry(d);
            return `<details class="entry"><summary>
                <b>${esc(A.prettyDate(d))}</b>
                <span>${esc(e.book || 'Reading')}${e.minutes ? ' · ' + e.minutes + ' min' : ''}</span>
              </summary>
              <p>${esc(e.summary)}</p>
              <button class="link" data-act="open-read" data-date="${d}">Edit</button>
            </details>`;
          })
          .join('')
      : `<div class="empty">Your summaries will collect here — it becomes the most useful thing in the app.</div>`;

    const journalList = jDays.length
      ? jDays
          .slice(0, ARCHIVE_MAX)
          .map((d) => {
            const e = S.journalEntry(d);
            return `<details class="entry"><summary>
                <b>${esc(A.prettyDate(d))}</b><span>${e.mood != null ? moodIcon(e.mood) : ''}</span>
              </summary><p>${esc(e.text || '')}</p></details>`;
          })
          .join('')
      : `<div class="empty">No journal entries yet.</div>`;

    return `
      <header class="screenhead">
        <div class="screenhead-top">
          <h1>Read</h1>
          ${
            tl
              ? `<span class="headpill quiet">${icon('flame')}${tl.streak}</span>`
              : ''
          }
        </div>
        <div class="screenhead-sub">${
          g
            ? `Reading is locked until you write. ${past.length + (done ? 1 : 0)} ${
                past.length + (done ? 1 : 0) === 1 ? 'summary' : 'summaries'
              } so far.`
            : 'A reading goal is closed by writing about it, not by ticking it.'
        }</div>
      </header>

      ${
        g
          ? `<section class="gatecard ${done ? 'is-done' : ''}">
              <div class="gatecard-label">${
                done
                  ? 'Today’s summary · written'
                  : `Today’s summary${target != null ? ' · ' + esc(targetPhrase(g, target)) : ''}`
              }</div>
              ${readingForm(k)}
            </section>`
          : `<div class="empty"><span class="big">📖</span>No reading goal yet.<br>
             <button class="link" data-act="goal-new">Create one →</button></div>`
      }

      <div class="label">Daily journal</div>
      <section class="card">
        <div class="mood-row">${MOODS.map(
          (m, i) =>
            `<button type="button" class="mood ${j.mood === i ? 'on' : ''}" data-act="mood" data-i="${i}" data-date="${k}"
              aria-label="${esc(m.name)}" aria-pressed="${j.mood === i}">${m.icon}</button>`
        ).join('')}</div>
        <textarea id="dayNote" data-date="${k}" rows="4" aria-label="Journal for this day"
          placeholder="How did the day actually go?">${esc(j.text || '')}</textarea>
      </section>

      <!-- Counted rows, not two lists of forty. The count still says
           "showing 40 of 96" rather than "96" over a list that stops at 40:
           a count that overstates what is on screen reads as lost data. -->
      <details class="archive">
        <summary>
          <span class="body"><b>Past summaries</b><span>${
            past.length ? esc(archiveCount(past.length)) + ' · newest ' + esc(A.prettyDate(past[0])) : 'None yet'
          }</span></span>
          ${icon('chev')}
        </summary>
        <div class="card">${summaryList}</div>
      </details>

      <details class="archive">
        <summary>
          <span class="body"><b>Past journal</b><span>${
            jDays.length ? esc(archiveCount(jDays.length)) : 'None yet'
          }</span></span>
          ${icon('chev')}
        </summary>
        <div class="card">${journalList}</div>
      </details>
    `;
  }

  /* ================= PROGRESS ================= */

  /** "46 hours" beats "2760 min", and a count beats both when it is a count. */
  function lifeAmount(row) {
    if (row.total == null) return `${row.kept} day${row.kept === 1 ? '' : 's'}`;
    if (row.goal.unit === 'minutes') {
      const hours = row.total / 60;
      if (hours >= 1.5) return `${Math.round(hours)} hours`;
      return `${Math.round(row.total)} min`;
    }
    if (row.goal.unit === 'seconds' && row.total >= 300) return `${Math.round(row.total / 60)} min`;
    return A.formatValue(row.goal.unit, row.total);
  }

  /** One plain sentence about a real life, with no invented currency in it. */
  function lifeSentence(life) {
    const bits = [];
    bits.push(`<b>${life.kept}</b> of <b>${life.days}</b> days kept`);
    if (life.sessions) bits.push(`<b>${life.sessions}</b> training ${life.sessions === 1 ? 'session' : 'sessions'}`);
    if (life.summaries) bits.push(`<b>${life.summaries}</b> ${life.summaries === 1 ? 'summary' : 'summaries'} written`);
    if (life.journal) bits.push(`<b>${life.journal}</b> journal ${life.journal === 1 ? 'entry' : 'entries'}`);
    return bits.join(' · ');
  }

  /**
   * Stats, from artboard 2c.
   *
   * "Real totals on the light surface at the top, in a sentence about a life.
   * The rank and XP ladder keep their place but drop below the ledger and lose
   * the accent colour — they are instruments, not the argument."
   *
   * That is this app's oldest rule given a visual form: see "This Is Not A Game"
   * in knowledge/project.md. Days you kept, sessions you trained and summaries
   * you wrote are facts about a life; XP and a rank are a number the app made up
   * about itself. So the facts get the one light surface on the screen and a
   * whole sentence, and the level gets a grey row at the bottom with no accent
   * anywhere in it. It is not deleted — it is put in proportion.
   */
  function renderProgress() {
    const hist = S.history();
    const life = S.lifeTotals();
    const prog = S.progress();
    const streak = S.currentStreak();
    const today = S.today();

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
        `<p class="faint" style="margin:10px 2px 0;font-size:var(--fs-xs);line-height:1.5">${esc(
          tally.sessions + (tally.sessions === 1 ? ' training day' : ' training days') +
          (tally.missing.length ? ' · nothing for ' + tally.missing.join(', ').toLowerCase() : '') +
          (tally.untagged ? ' · ' + tally.untagged + ' untagged' : '')
        )}${
          tally.untagged
            ? ' — <button class="link" data-nav="more" style="min-height:0;padding:0;font-size:var(--fs-xs)">tag them in the library</button>'
            : ''
        }</p>`
      : `<div class="empty">Nothing logged in this window.<br>
         <span class="faint" style="font-size:var(--fs-sm)">Tick exercises on Today, and what they work shows up here.</span></div>`;

    const mixRows = Object.keys(mix).length
      ? Object.entries(mix)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([cat, n]) =>
              `<div class="breakdown-row"><span class="lbl">${esc(cat)}</span>${bar((n / mixTotal) * 100)}<span class="val">${n}</span></div>`
          )
          .join('')
      : `<div class="empty">Complete some exercises to see your training mix.</div>`;

    const totalEx = Object.values(S.get().logs).reduce(
      (n, l) => n + Object.values(l.ex || {}).filter(Boolean).length + (l.extra || []).length,
      0
    );

    return `
      <header class="screenhead">
        <div class="screenhead-top"><h1>Stats</h1></div>
        <div class="screenhead-sub">Since ${esc(
          A.prettyDate(life.since)
        )} · everything here is recomputed from your logs</div>
      </header>

      <!-- The light surface, used once on this screen and for this alone. -->
      <section class="ledgercard">
        <div class="ledgercard-label">What you've actually done</div>
        <p class="lifeline">${lifeSentence(life)}</p>
        ${
          life.goals.length
            ? `<div class="ledgercard-grid">${life.goals
                .slice(0, 3)
                .map(
                  (row) => `<div class="ledgercard-item">
                    <b>${esc(lifeAmount(row))}</b>
                    <span>${esc(row.goal.name)}</span>
                  </div>`
                )
                .join('')}</div>`
            : ''
        }
      </section>

      <div class="statrow">
        <div class="statcard"><span class="statcard-label">Streak</span>
          <b>${streak}</b><small>best ${hist.best}</small></div>
        <div class="statcard"><span class="statcard-label">Days kept</span>
          <b class="good">${hist.completeDays}</b><small>${life.days} lived</small></div>
        <div class="statcard"><span class="statcard-label">Exercises</span>
          <b>${totalEx}</b><small>${life.sessions} session${life.sessions === 1 ? '' : 's'}</small></div>
      </div>

      <div class="label">Every practice · 4 weeks</div>
      <div class="card">${
        goalSparks() ||
        '<div class="empty">Log a few days and the shape of each one shows up here.</div>'
      }</div>

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

      <button type="button" class="linkrow" data-act="cookie-jar">
        <span class="linkrow-plate" aria-hidden="true">${icon('trophy')}</span>
        <span class="body"><b>The cookie jar</b>
          <span>${
            S.cookies().length
              ? S.cookies().length + ' hard things, in your own words'
              : 'Empty — evidence you write while calm, to read when you are not'
          }</span></span>
        ${icon('chev')}
      </button>

      <div class="label">Goal ladders</div>
      <div class="card">${
        S.activeGoals().length
          ? S.activeGoals()
              .map((g) => {
                const tl = S.goalTimeline(g.id);
                const pct = tl.maxLevel ? (tl.level / tl.maxLevel) * 100 : 100;
                return `<div class="ladder">
                  <div class="ladder-top">
                    <span><b>${esc(g.name)}</b></span>
                    <span class="faint">${esc(A.formatValue(g.unit, g.baseline))} → <b>${esc(
                  A.formatValue(g.unit, tl.target)
                )}</b> → ${esc(A.formatValue(g.unit, g.target))}</span>
                  </div>
                  ${bar(pct, tl.atTarget ? 'gold' : '')}
                  <div class="faint" style="font-size:var(--fs-xs);margin-top:5px">${esc(advanceHint(g, tl))} · ${
                  tl.doneDays
                }/${tl.scheduledDays} days kept</div>
                </div>`;
              })
              .join('')
          : `<div class="empty">No goals yet.</div>`
      }</div>

      <div class="label">Muscles trained</div>
      <div class="segbar tight">${MUSCLE_WINDOWS.map(
        (w) => `<button class="seg ${muscleWindow === w.days ? 'on' : ''}" data-act="muscle-window"
          data-days="${w.days}" aria-pressed="${muscleWindow === w.days}">${esc(w.label)}</button>`
      ).join('')}</div>
      <div class="card">${muscleRows}</div>

      <div class="label">Training mix · 30 days</div>
      <div class="card">${mixRows}</div>

      <div class="label">Weekly goal history · target ${S.settings().goalPerWeek} a week</div>
      <div class="card"><div class="bars">${bars}</div></div>

      <!-- The level, last and grey. It keeps its place and loses the accent:
           an instrument, not the argument. -->
      <div class="lvlrow">
        <span class="lvlrow-plate" aria-hidden="true">${icon('chart')}</span>
        <div class="lvlrow-body">
          <div class="lvlrow-line">Level ${prog.level} · ${esc(prog.rank.name)} · ${fmtXp(prog.xp)} XP</div>
          <div class="lvlrow-bar"><i style="width:${Math.max(0, Math.min(100, prog.pct))}%"></i></div>
        </div>
      </div>
      <p class="footnote">${fmtXp(prog.into)} of ${fmtXp(prog.need)} XP into this level. Points are
        the app talking about itself; everything above this line is your record.</p>
    `;
  }

  /* ================= REWARDS ================= */

  /** What a reward is waiting on, in words. */
  function rewardTrigger(r) {
    if (r.source === 'goal') {
      const g = S.goalById(r.goalId);
      return g ? `${r.days}-day streak on ${g.name}` : `${r.days}-day streak on a deleted goal`;
    }
    return `${r.days}-day streak`;
  }

  /**
   * Rewards the user promised themselves. These pay out in the real world, so
   * "claim" means "I actually bought it" — and it toggles, because a mistap is
   * not a purchase.
   *
   * Artboard 2d: an earned promise takes the amber border, the amber bar and the
   * button; one still running takes the plain border and a teal bar, because
   * teal is progress and amber is a debt the app owes you. And under the button,
   * verbatim from the mockup: collecting grants no XP. That is the whole point
   * of this half of the screen — the app cannot pay you, so it does not pretend
   * that noticing you paid yourself is worth points.
   */
  function myRewards() {
    const list = S.customRewards();
    if (!list.length) {
      return `<div class="promptrow">
        <span class="promptrow-plate" aria-hidden="true">${icon('gift')}</span>
        <div class="promptrow-body">Promise yourself something real. Fourteen days, then the thing.
          <button class="link" data-act="reward-new">Set one up →</button></div>
      </div>`;
    }
    return list
      .map((r) => {
        const p = S.customRewardProgress(r);
        return `<article class="myreward ${p.claimed ? 'is-claimed' : ''} ${p.unlocked ? 'is-ready' : ''}">
          <button type="button" class="myreward-open" data-act="reward-edit" data-id="${r.id}">
            <span class="myreward-icon" aria-hidden="true">${esc(r.icon || '🎁')}</span>
            <span class="myreward-body">
              <span class="myreward-name">${esc(r.name)}</span>
              <span class="myreward-trig">${esc(rewardTrigger(r))}${
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
                 <p class="myreward-note">Collecting records the purchase. No XP — you bought this, the app didn't.</p>`
              : ''
          }
        </article>`;
      })
      .join('');
  }

  /**
   * Rewards, from artboard 2d.
   *
   * "Your own promises sit above the app's milestones and get the amber. 'I
   * bought it' is the only claim here that means anything, and it grants no XP —
   * the earned milestone below states its points in muted type instead."
   *
   * So the order inverted: what the user promised themselves is the subject of
   * the screen, and the app's own ladder of medals is what follows. The XP on a
   * milestone is still stated, in the quietest type on the card, because hiding
   * it would be pretending the app does not keep score at all.
   */
  function renderRewards() {
    const list = S.rewards();
    const next = S.nextMilestone();
    const streak = S.currentStreak();
    const best = S.history().best;
    const wk = S.weekStats();
    const claimable = list.filter((r) => r.unlocked && !r.claimed).length;

    const nextCard = next
      ? `<section class="card next-reward">
          <div class="top">
            <span class="medal">${next.icon}</span>
            <div><h3>Next: ${esc(next.name)}</h3><p>${esc(next.blurb)}</p></div>
          </div>
          <div class="xpbar-top"><span>${best} / ${next.days} days</span><span>${next.days - best} to go · +${fmtXp(next.xp)} XP</span></div>
          ${bar((best / next.days) * 100, 'gold')}
        </section>`
      : `<section class="card next-reward"><div class="top"><span class="medal">🌟</span>
          <div><h3>Every milestone unlocked</h3><p>You've cleared the whole ladder. Legend.</p></div></div></section>`;

    const grid = list
      .map(
        (r) => `<div class="reward ${r.unlocked ? 'unlocked' : ''} ${r.claimed ? 'claimed' : ''}">
          <span class="medal">${r.icon}</span>
          <h4>${r.days} days</h4>
          ${
            r.unlocked
              ? r.claimed
                ? `<div class="days claimed-mark">Claimed</div>`
                : `<button class="btn primary claim" data-act="claim" data-id="${r.id}">Claim</button>`
              : `<div class="mini-bar">${bar(r.progress, 'gold')}</div>`
          }
          <div class="days">${r.claimed ? '+' + fmtXp(r.xp) + ' XP' : esc(r.name)}</div>
        </div>`
      )
      .join('');

    return `
      <header class="screenhead">
        <div class="screenhead-top">
          <span class="screenhead-plate" aria-hidden="true">${icon('trophy')}</span>
          <div style="flex:1;min-width:0">
            <h1 style="font-size:var(--fs-2xl)">Rewards</h1>
            <div class="screenhead-sub" style="margin-top:2px">Earned on your best run, never revoked</div>
          </div>
          <button class="headpill" data-act="reward-new">${icon('plus')}New</button>
        </div>
      </header>

      <div class="label">Your own rewards</div>
      ${myRewards()}

      <div class="label split">
        <span>Streak milestones</span><span>${streak} now · best ${best}${
      claimable ? ' · ' + claimable + ' ready' : ''
    }</span>
      </div>
      ${nextCard}
      <div class="reward-grid">${grid}</div>

      <!-- The weekly chest is the app's own payout, so it sits with the app's own
           ladder rather than with the promises above. -->
      <div class="card">
        <div class="xpbar-top"><span>Weekly chest · ${wk.complete}/${wk.goal} days</span><span>${
      wk.claimed ? 'Claimed' : wk.hit ? 'Ready' : `${wk.goal - wk.complete} to go`
    }</span></div>
        ${bar(wk.pct, 'gold')}
        ${
          wk.hit && !wk.claimed
            ? `<button class="btn gold block" data-act="claim-weekly" style="margin-top:12px">Open chest · +${fmtXp(
                A.XP.weeklyGoal
              )} XP</button>`
            : ''
        }
      </div>
    `;
  }

  function openRewardEditor(id, draft) {
    const r = id ? S.customRewards().find((x) => x.id === id) : null;
    const v = Object.assign({ name: '', icon: '🎁', source: 'overall', goalId: null, days: 14 }, r || {}, draft || {});
    const goals = S.activeGoals();
    openSheet(r ? 'Edit reward' : 'New reward', `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">Name something you actually want, and what it costs in
        days. Discipline will not buy it for you — it just refuses to say you earned it before you did.</p>
      <div class="grid-2">
        <label class="field"><span>Reward</span>
          <input type="text" id="rw_name" maxlength="40" value="${esc(v.name)}" placeholder="New sneakers"></label>
        <label class="field"><span>Icon</span>
          <input type="text" id="rw_icon" maxlength="4" value="${esc(v.icon || '🎁')}"></label>
      </div>
      <label class="field"><span>Earned by</span><select id="rw_source">
        <option value="overall" ${v.source !== 'goal' ? 'selected' : ''}>A streak of complete days</option>
        <option value="goal" ${v.source === 'goal' ? 'selected' : ''}>A streak on one goal</option>
      </select></label>
      <label class="field" ${v.source === 'goal' ? '' : 'hidden'}><span>Which goal</span><select id="rw_goal">
        ${goals.map((g) => `<option value="${g.id}" ${v.goalId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
      </select>${goals.length ? '' : '<small class="field-note">No goals yet — create one first.</small>'}</label>
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
          <span class="emoji" style="font-size:20px">${exGlyph(e)}</span>
          <div class="body"><div class="name">${esc(e.name)}</div><div class="sub">${esc(e.category)} · ${esc(
          e.unit === 'time' ? (e.minutes || 10) + ' min' : e.unit === 'distance' ? (e.km || 1) + ' km' : (e.sets || 3) + ' × ' + (e.reps || 10)
        )}</div></div>
          <button class="icon-btn" data-act="lib-edit" data-id="${e.id}" aria-label="Edit">✎</button>
          <button class="icon-btn" data-act="lib-rm" data-id="${e.id}" aria-label="Delete">✕</button>
        </div>`
      )
      .join('');

    const habitRows = S.get().habits.length
      ? S.get()
          .habits.map(
            (h) => `<div class="row">
              <span class="emoji" style="font-size:20px">${esc(h.icon || '✅')}</span>
              <div class="body"><div class="name">${esc(h.name)}</div><div class="sub">🔥 ${S.habitStreak(h.id)} day streak</div></div>
              <button class="icon-btn" data-act="habit-to-goal" data-id="${h.id}"
                aria-label="Make ${esc(h.name)} a goal that progresses">${icon('level')}</button>
              <button class="icon-btn" data-act="habit-rm" data-id="${h.id}" aria-label="Delete">✕</button>
            </div>`
          )
          .join('')
      : `<div class="empty">No habits yet.</div>`;

    const fz = S.freezeStats();
    /* The two destinations across the top of 2e each carry one line of state,
       so the row says what is waiting rather than only where it goes. */
    const readyRewards = S.customRewards().filter((r) => {
      const p = S.customRewardProgress(r);
      return p.unlocked && !p.claimed;
    }).length + S.rewards().filter((r) => r.unlocked && !r.claimed).length;
    const runSt = S.runStatus();
    const runLine = !runSt
      ? "Not started"
      : runSt.running
      ? "Day " + runSt.day + " of " + A.Run.RUN_DAYS
      : runSt.state === "finished"
      ? "Finished"
      : "Not started";
    const modeCards = A.MODE_IDS.map((id) => {
      const m = A.MODES[id];
      const example = S.activeGoals()[0];
      let preview = '';
      if (example) {
        const step = A.Goals.stepFor(Object.assign({}, example, { mode: 'inherit' }), id);
        preview = `step ${A.formatValue(example.unit === 'time' ? 'minutes' : example.unit, step)}`;
      }
      return `<button type="button" class="mode-card ${s.mode === id ? 'on' : ''}" data-act="set-mode" data-mode="${id}">
        <span class="mode-glyph">${m.icon}</span><b>${esc(m.name)}</b>
        <small>${esc(m.blurb)}</small>
        ${preview ? `<i>${esc(example.name)}: ${esc(preview)}</i>` : ''}
      </button>`;
    }).join('');

    return `
      <header class="screenhead">
        <div class="screenhead-top"><h1>More</h1></div>
        <!-- The artboard says "last export 3 days ago" here. There is no such
             timestamp in the state and inventing one would mean a new field and
             a migration, so this says the part that is true today. -->
        <div class="screenhead-sub">Everything lives on this device · nothing is ever uploaded</div>
      </header>

      <!-- Rewards left the tab bar for this row: it is the one screen you open
           after the fact rather than to do something, and the four daily screens
           are worth more thumb than it is. Artboard 2e pairs it with the run as
           two destinations across the top. -->
      <div class="destrow">
        <button type="button" class="dest" data-nav="rewards">
          <span class="dest-plate" aria-hidden="true">${icon('trophy')}</span>
          <b>Rewards</b>
          <span class="${readyRewards ? 'is-ready' : ''}">${
      readyRewards
        ? readyRewards + (readyRewards === 1 ? ' earned, uncollected' : ' earned, uncollected')
        : 'Promises and milestones'
    }</span>
        </button>
        <button type="button" class="dest" data-nav="run">
          <span class="dest-plate" aria-hidden="true">${icon('sun')}</span>
          <b>The 66-day run</b>
          <span>${esc(runLine)}</span>
        </button>
      </div>

      <div class="label">Difficulty</div>
      <div class="mode-grid">${modeCards}</div>
      <p class="footnote">
        Difficulty changes how <b>big</b> each step is, never how you earn one — you always advance by
        performing. Switching re-scores your record at the new step size: nothing is wiped, days you
        already completed stay completed, but the next ask can jump. Individual goals can override this.
      </p>

      <div class="label">Streak rules</div>
      <div class="card flush">
        <div class="row">
          <div class="body"><div class="name">Day rolls over at</div><div class="sub">Late-night logging still counts for the day you meant</div></div>
          <select data-set="dayBoundaryHour">
            ${[0, 1, 2, 3, 4, 5, 6].map((h) => `<option value="${h}" ${s.dayBoundaryHour === h ? 'selected' : ''}>${A.prettyTime(h * 60)}</option>`).join('')}
          </select>
        </div>
        <div class="row">
          <div class="body"><div class="name">Goals count toward the day</div><div class="sub">Turn off to score days on workouts alone</div></div>
          <label class="switch"><input type="checkbox" data-set="goalsCountTowardDay" ${s.goalsCountTowardDay ? 'checked' : ''}><i></i></label>
        </div>
        <div class="row">
          <div class="body"><div class="name">The run counts toward the day</div><div class="sub">Only days the run actually recorded — it never reaches back</div></div>
          <label class="switch"><input type="checkbox" data-set="runCountsTowardDay" ${s.runCountsTowardDay ? 'checked' : ''}><i></i></label>
        </div>
        <div class="row">
          <div class="body"><div class="name">The journal counts toward the day</div><div class="sub">Writing an entry becomes one of the things the day asks for</div></div>
          <label class="switch"><input type="checkbox" data-set="journalCountsTowardDay" ${s.journalCountsTowardDay ? 'checked' : ''}><i></i></label>
        </div>
        <div class="row">
          <div class="body"><div class="name">Deload week</div><div class="sub">Every Nth week, cut training volume by ~40% — the recovery half of the equation</div></div>
          <select data-set="deloadEveryWeeks">
            ${[0, 3, 4, 5, 6].map((n) => `<option value="${n}" ${Number(s.deloadEveryWeeks) === n ? 'selected' : ''}>${
              n === 0 ? 'Off' : 'Every ' + n + ' weeks'
            }</option>`).join('')}
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
        <div class="row">
          <div class="body"><div class="name">Weekly goal</div><div class="sub">Completed days needed for the weekly chest</div></div>
          <input type="number" data-set="goalPerWeek" min="1" max="7" value="${esc(s.goalPerWeek)}">
        </div>
        <div class="row">
          <div class="body"><div class="name">Day counts as complete at</div><div class="sub">How much of the plan you must finish</div></div>
          <select data-set="completionPct">
            ${[60, 80, 100].map((p) => `<option value="${p}" ${s.completionPct === p ? 'selected' : ''}>${p}%</option>`).join('')}
          </select>
        </div>
        <div class="row">
          <div class="body"><div class="name">Habits count toward the day</div><div class="sub">Require habits, not just exercises</div></div>
          <label class="switch"><input type="checkbox" data-set="requireHabits" ${s.requireHabits ? 'checked' : ''}><i></i></label>
        </div>
      </div>

      <div class="label split">
        <span>Daily habits</span><button class="link" data-act="habit-add">＋ Add</button>
      </div>
      <div class="card flush">${habitRows}</div>
      <p class="footnote">A habit is a tick that asks the same thing every day.
        Tap ${icon('level')} on one to turn it into a goal instead — it keeps the
        name, and starts asking a little more as you earn it. It stops being a
        habit at that point, so it is still one tick in one place.</p>

      <!-- Fifty-nine exercises pushed Reminders, Profile and the export route
           off the bottom of More. It is a reference list, opened to change
           something rather than read on the way past, so it folds. -->
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
          <div class="body"><div class="name">Nudge me while the app is open</div><div class="sub">A browser notification when a goal is still unlogged</div></div>
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
        Discipline <b>tracks</b> your wake-up; it can't wake you. Keep using your phone's alarm for that.
      </p>

      <div class="label">Countdown</div>
      <div class="card">
        <div class="row">
          <div class="body"><div class="name">${S.activeChallenge() ? esc(S.activeChallenge().name) : 'No countdown running'}</div>
            <div class="sub">${
              S.activeChallenge()
                ? `Day ${S.challengeProgress().day} of ${S.challengeProgress().days} · ${S.challengeProgress().kept} kept`
                : 'Count the days you keep against a fixed length — 66, or whatever you choose'
            }</div></div>
          <button class="btn" data-act="challenge-open">${S.activeChallenge() ? 'Open' : 'Start'}</button>
        </div>
      </div>

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
          <div class="body"><div class="name">Reset everything</div><div class="sub">Wipes plan, logs, streaks and rewards</div></div>
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
      { name: prefill, category: 'Other', unit: 'reps', sets: 3, reps: 10, minutes: 20, km: 3, icon: '🏋️' },
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
        <label class="field"><span>Icon</span><input type="text" id="e_icon" maxlength="4" value="${esc(v.icon || '🏋️')}"></label>
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
            <span class="emoji">📋</span>
            <span class="body"><span class="name">${A.DAY_NAMES[d]}</span><span class="sub">${n} exercise${n === 1 ? '' : 's'}</span></span>
            <span class="trail">COPY</span></button>`;
        })
        .join('')}</div>
    `);
  }

  /* ================= goal sheets ================= */

  /** A value field that matches the unit — a clock for times, a number otherwise. */
  function valueInput(id, unit, value, label) {
    if (unit === 'time') {
      return `<label class="field"><span>${esc(label)}</span>
        <input type="time" id="${id}" value="${A.minToHhmm(value == null ? 420 : value)}"></label>`;
    }
    const step = unit === 'litres' || unit === 'km' ? '0.25' : '1';
    return `<label class="field"><span>${esc(label)}</span>
      <input type="number" id="${id}" step="${step}" min="0" value="${esc(value == null ? '' : value)}"></label>`;
  }

  function openReading(dateKey) {
    openSheet('Reading — ' + A.prettyDate(dateKey), readingForm(dateKey));
    setTimeout(() => {
      // scoped to the sheet: the Read tab may already have an inline #r_summary
      const t = $('#r_summary', $('#sheetBody'));
      if (t) t.focus();
    }, 60);
  }

  /**
   * How to perform an exercise: the coaching cues stored on it, one per line.
   *
   * This briefly led with a generated stick-figure animation. It was removed: an
   * abstract figure could not distinguish the movements it claimed to show —
   * every upright pose read as the same vertical stroke — and a demonstration
   * you cannot trust is worse than none. The written cues carry what actually
   * matters anyway: tempo, setup, and what to avoid.
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
    if (!value) return false; // keep the sheet open rather than silently discarding
    closeSheet(); // clears both pending slots
    if (opts && opts.onSave) opts.onSave(value);
    return true;
  }

  /** Re-baselining asks for a value in the goal's own unit, so it gets the same
      validated clock/number field as every other value in the app rather than a
      free-text browser prompt. */
  function openGoalRestart(goalId) {
    const g = S.goalById(goalId);
    if (!g) return;
    openSheet(`Move the starting point — ${g.name}`, `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">Move the starting point to where you actually
      are today. The target stays at <b>${esc(A.formatValue(g.unit, g.target))}</b>; the ladder is rebuilt
      from the new start and today becomes day one.</p>
      <p class="faint" style="font-size:var(--fs-sm);margin:0 0 12px">Current start: <b>${esc(
        A.formatValue(g.unit, g.baseline)
      )}</b> · asking for <b>${esc(A.formatValue(g.unit, S.goalTarget(goalId)))}</b> right now.</p>
      ${valueInput('g_base', g.unit, S.goalTarget(goalId), 'New starting point')}
      <div class="btn-row">
        <button class="btn primary" data-act="goal-restart-save" data-id="${goalId}" style="flex:1">Move it</button>
        <button class="btn ghost" data-act="sheet-close">Cancel</button>
      </div>
    `);
  }

  /** A handful of round numbers around the ask — halves and doubles of it, plus
      the ask itself, deduplicated and in order. */
  function quickValues(target) {
    const t = Number(target);
    const raw = [Math.round(t * 0.25), Math.round(t / 2), Math.round(t * 0.75), Math.round(t), Math.round(t * 1.5)];
    return raw
      .map((v) => (v > 20 ? Math.round(v / 5) * 5 : v))
      .filter((v) => v > 0)
      .filter((v, i, all) => all.indexOf(v) === i)
      .sort((a, b) => a - b)
      .slice(0, 5);
  }

  function openGoalLog(goalId, dateKey) {
    const g = S.goalById(goalId);
    if (!g) return;
    const e = S.goalEntry(dateKey, goalId) || {};
    const target = S.goalTargetOn(goalId, dateKey);
    openSheet(g.name, `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">Asked for <b>${esc(targetPhrase(g, target))}</b> on ${esc(
      A.prettyDate(dateKey)
    )}. Log what actually happened — the honest number is what makes the graph worth having.</p>
      ${valueInput('g_val', g.unit, e.value != null ? e.value : target, 'What you actually did')}
      ${
        /* Some days it is ten minutes, some days fifteen. Typing that is four
           taps and a keyboard; these are one. Built around the ask rather than
           from a fixed list, so a goal asking 45 offers useful numbers and one
           asking 5 does not offer 60. Nothing is logged by tapping one — it
           fills the box, and Save is still Save. */
        g.unit !== 'time' && target != null && target > 0
          ? `<div class="chips quick">${quickValues(target).map(
              (v) => `<button type="button" class="chip-pick" data-act="goal-quick" data-v="${v}">${esc(
                A.formatValue(g.unit, v)
              )}</button>`
            ).join('')}</div>`
          : ''
      }
      <div class="btn-row">
        <button class="btn primary" data-act="goal-save-val" data-id="${goalId}" data-date="${dateKey}" style="flex:1">Save</button>
        <button class="btn ghost" data-act="goal-skip" data-id="${goalId}" data-date="${dateKey}">${
      e.skipped ? 'Un-skip' : 'Skip today'
    }</button>
      </div>
      ${
        e.value != null || e.checked
          ? `<button class="btn ghost danger block" data-act="goal-clear" data-id="${goalId}" data-date="${dateKey}" style="margin-top:8px">Clear this entry</button>`
          : ''
      }
    `);
  }

  /**
   * The goal's own sheet, and the whole action set for a goal in one place.
   *
   * Two kinds of action, kept in two rows because they answer different
   * questions. The top row acts on *this day* — log what actually happened, or
   * write the summary a gated goal is waiting on. The bottom row acts on the
   * *goal*. Before this, the day-level row did not exist at all: `openGoalLog`
   * had no producer anywhere in the app, so the only thing a goal card could
   * record was "I hit the target exactly", and skipping a day was unreachable.
   */
  function openGoalDetail(goalId, dateKey) {
    const g = S.goalById(goalId);
    if (!g) return;
    const key = dateKey || S.today();
    const tl = S.goalTimeline(goalId);
    const mode = A.MODES[tl.mode];
    const ups = tl.events.filter((e) => e.type === 'up').length;
    const downs = tl.events.filter((e) => e.type === 'down').length;
    /* The ladder length is (target − baseline) / step, and a step can be 0.25
       against any target — so a mistyped target asks for tens of thousands of
       rungs and freezes the tab building them. Only the *rendered* list is
       bounded: clamping maxLevel itself would change valueAt for the goal and
       re-judge every day already lived. */
    const RUNG_LIMIT = 60;
    const shownRungs = Math.min(tl.maxLevel, RUNG_LIMIT);
    const rungs = [];
    for (let i = 0; i <= shownRungs; i++) {
      rungs.push(`<div class="rung ${i === tl.level ? 'on' : ''} ${i < tl.level ? 'past' : ''}">
        <b>${i}</b><span>${esc(A.formatValue(g.unit, A.Goals.valueAt(g, i, tl.mode)))}</span></div>`);
    }
    if (tl.maxLevel > RUNG_LIMIT) {
      rungs.push(`<div class="rung more"><b>…</b><span>${tl.maxLevel - RUNG_LIMIT} more</span></div>`);
    }

    openSheet(g.icon + ' ' + g.name, `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">${esc(g.blurb || '')}</p>
      <div class="stat-grid" style="margin-bottom:12px">
        <div class="stat fire"><b>🔥 ${tl.streak}</b><span>Streak</span></div>
        <div class="stat"><b>${tl.level}/${tl.maxLevel}</b><span>Level</span></div>
        <div class="stat good"><b>${tl.doneDays}</b><span>Days kept</span></div>
        <div class="stat gold"><b>${ups}</b><span>Steps earned</span></div>
      </div>
      <div class="card">
        <div class="xpbar-top"><span>Now: ${esc(targetPhrase(g, tl.target))}</span><span>${mode.icon} ${esc(mode.name)}</span></div>
        ${bar(tl.atTarget ? 100 : (tl.windowHits / Math.max(1, tl.windowNeeded)) * 100, tl.atRisk ? 'warn' : '')}
        <div class="faint" style="font-size:var(--fs-sm);margin-top:8px">${esc(advanceHint(g, tl))}</div>
        ${
          tl.missesAllowed
            ? `<div class="faint" style="font-size:var(--fs-sm);margin-top:4px">${
                tl.atRisk
                  ? '⚠️ One more missed day steps you back a level.'
                  : `Miss ${tl.missesAllowed} scheduled days in a row and you step back one level${
                      downs ? ` (that has happened ${downs}×)` : ''
                    }.`
              }</div>`
            : ''
        }
      </div>
      <div class="section-head" style="margin-top:6px"><h2>The last six weeks</h2></div>
      ${goalChart(g, S.goalSeries(goalId, CHART_DAYS))}

      <div class="section-head" style="margin-top:6px"><h2>The ladder</h2></div>
      <div class="rungs">${rungs.join('')}</div>
      ${
        S.isFuture(key)
          ? '' // a future day is read-only, exactly as its card is
          : `<div class="btn-row" style="margin-top:14px">
        <button class="btn primary" data-act="${g.gate === 'summary' ? 'open-read' : 'goal-log'}" data-id="${goalId}"
                data-date="${key}" style="flex:1">${
              g.gate === 'summary' ? '📖 Write the summary' : '📝 Log this day'
            }</button>
      </div>
      ${
        /* The bad-day protocol, offered only on a day that is not already done.
           It logs the real number and nothing more — the day stays honestly
           short. What it is for is the other failure, the one that actually
           breaks people: doing nothing at all. */
        g.floor != null && g.gate !== 'summary' && !S.goalDone(key, goalId)
          ? `<div class="btn-row" style="margin-top:8px">
              <button class="btn ghost block" data-act="goal-floor" data-id="${goalId}" data-date="${key}">
                Bad day — log the minimum, ${esc(A.formatValue(g.unit, g.floor))}
              </button>
            </div>
            <p class="footnote">It will not mark the day kept. It is here so that the worst
              version of today is still something.</p>`
          : ''
      }`
      }
      <div class="btn-row" style="margin-top:${S.isFuture(key) ? 14 : 8}px">
        <button class="btn" data-act="goal-edit" data-id="${goalId}" style="flex:1">Edit goal</button>
        <button class="btn ghost" data-act="goal-restart" data-id="${goalId}">Move the starting point</button>
      </div>
    `);
  }

  /**
   * Common practices, offered as a shape to fill in.
   *
   * It fills in what is true of the ACTIVITY — the unit, the direction, the step
   * size, the area, which days — and leaves the two numbers that are true of the
   * person. Those are shown as suggestions and labelled as such: a goal that
   * starts where the app guessed rather than where you are is the mistake the
   * onboarding banner exists to apologise for.
   */
  /**
   * The cookie jar: what you have already survived, in your own words.
   *
   * Read before a hard thing, not after. The empty state carries the rule that
   * makes it work — an entry has to be a specific event with a detail that
   * proves it happened, because "I'm tough" is not evidence and cannot be
   * reached for. The app writes none of them.
   */
  function openCookieJar() {
    const list = S.cookies();
    openSheet('The cookie jar', `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">Hard things you have already
        done. Read it when you are about to quit something — under real strain your memory narrows
        and hands you the worst of itself, so the evidence has to be written down while you are
        calm and read while you are not.</p>
      <label class="field"><span>Add one — a specific day, with a detail that proves it happened</span>
        <textarea id="ck_text" rows="3" maxlength="240"
          placeholder="Finished the third day of the rotation on four hours of sleep and still hit my numbers."></textarea></label>
      <div class="btn-row"><button class="btn primary block" data-act="cookie-add">Put it in the jar</button></div>
      ${
        list.length
          ? `<div class="label">${list.length} in the jar</div>
             <div class="card flush">${list
               .map(
                 (c) => `<div class="row"><div class="body">
                   <div class="sub" style="color:var(--text);font-size:var(--fs-base);line-height:1.5">${esc(c.text)}</div>
                   <div class="sub">${esc(A.prettyDate(c.at))}</div>
                 </div>
                 <button class="icon-btn" data-act="cookie-rm" data-id="${esc(c.id)}" aria-label="Remove">✕</button></div>`
               )
               .join('')}</div>`
          : `<p class="footnote">Nothing in it yet. "I am tough" is not a cookie — it cannot be
             reached for and it proves nothing. "I finished the shift after the truck broke down and
             still trained that night" is one. Write fifteen tonight while you are calm.</p>`
      }
    `);
  }

  function openGoalTemplates() {
    const have = S.goals().map((g) => g.name.toLowerCase());
    openSheet('Set up a practice', `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">Each one opens the goal form with
        its shape already filled in — what it is measured in, which way it goes, how big a step is,
        and which days it runs. <b>The two numbers are yours.</b> Set the first to what you can
        honestly do today, not what you wish you could; the ladder is built from there.</p>
      <div class="card flush">${A.GOAL_TEMPLATES.map(
        (t) => `<div class="row">
          <span class="emoji" style="font-size:20px">${esc(t.icon)}</span>
          <div class="body">
            <div class="name">${esc(t.name)}</div>
            <div class="sub">${esc(t.blurb)}</div>
          </div>
          ${
            have.indexOf(t.name.toLowerCase()) >= 0
              ? `<span class="faint" style="font-size:var(--fs-xs)">have it</span>`
              : `<button class="btn" data-act="goal-template" data-key="${esc(t.key)}">Set up</button>`
          }
        </div>`
      ).join('')}</div>
      <p class="footnote">Nothing here is created until you save the form it opens.</p>
    `);
  }

  function openGoalEditor(id, draft) {
    const g = id ? S.goalById(id) : null;
    const v = Object.assign(
      {
        name: '', icon: '🎯', section: 'custom', unit: 'minutes', direction: 'up',
        baseline: 5, target: 30, step: 5, mode: 'inherit', track: 'value',
        schedule: { type: 'daily' }, advance: A.Goals.DEFAULT_ADVANCE, regress: A.Goals.DEFAULT_REGRESS, gate: null
      },
      g || {},
      draft || {}
    );
    const sch = v.schedule || { type: 'daily' };
    const adv = Object.assign({}, A.Goals.DEFAULT_ADVANCE, v.advance || {});
    const reg = v.regress === false ? null : Object.assign({}, A.Goals.DEFAULT_REGRESS, v.regress || {});

    openSheet(g ? 'Edit goal' : 'New goal', `
      <div class="grid-2">
        <label class="field"><span>Name</span><input type="text" id="gg_name" maxlength="32" value="${esc(v.name)}" placeholder="Wake up"></label>
        <label class="field"><span>Icon</span><input type="text" id="gg_icon" maxlength="4" value="${esc(v.icon || '🎯')}"></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Area</span><select id="gg_section">${A.SECTIONS.map(
          (s) => `<option value="${s.id}" ${v.section === s.id ? 'selected' : ''}>${s.icon} ${esc(s.name)}</option>`
        ).join('')}</select></label>
        <label class="field"><span>Measured in</span><select id="gg_unit">${Object.keys(A.UNITS)
          .map((u) => `<option value="${u}" ${v.unit === u ? 'selected' : ''}>${esc(A.UNITS[u].label)}</option>`)
          .join('')}</select></label>
      </div>
      <!-- Direction is a fact about the two numbers below, not a separate choice:
           goal-save always recomputes it from start and target. It used to be an
           editable select whose value was discarded, which is a control that
           does not do what it says. -->
      <label class="field"><span>Direction</span>
        <input type="text" id="gg_dir" readonly tabindex="-1" value="${esc(
          v.direction === 'down' ? 'Less / earlier is better' : 'More / later is better'
        )}">
        <small class="field-note">Set by your start and target — swap them to reverse it.</small>
      </label>

      <div class="section-head" style="margin-top:4px"><h2>The ladder</h2></div>
      <div class="grid-2">
        ${valueInput('gg_base', v.unit, v.baseline, 'Start (where you are now)')}
        ${valueInput('gg_target', v.unit, v.target, 'Target (progression stops here)')}
      </div>
      <label class="field"><span>Step size per level, at Normal</span>
        <input type="number" id="gg_step" min="0.25" step="0.25" value="${esc(v.step)}"></label>
      <!-- The bad-day protocol, defined in advance while things are fine —
           which is the only time anybody can define one.

           Not offered on a clock goal: the time input has no way to render
           "unset", so a blank one would come back as 07:00 and store a floor
           nobody chose. -->
      ${
        v.unit === 'time'
          ? ''
          : valueInput('gg_floor', v.unit, v.floor == null ? '' : v.floor, 'Bad-day minimum (optional)')
      }
      <p class="footnote" style="margin-top:-4px" ${v.unit === 'time' ? 'hidden' : ''}>The reduced version you do when the day has
        fallen apart. It will not score the day as kept — it is not a discount, and the record
        stays honest. It exists because the real failure is doing nothing, and twenty minutes
        beats zero permanently.</p>
      <label class="field"><span>Difficulty for this goal</span><select id="gg_mode">
        <option value="inherit" ${v.mode === 'inherit' ? 'selected' : ''}>Follow app setting (${esc(A.MODES[S.settings().mode].name)})</option>
        ${A.MODE_IDS.map((m) => `<option value="${m}" ${v.mode === m ? 'selected' : ''}>${A.MODES[m].icon} ${A.MODES[m].name}</option>`).join('')}
      </select></label>

      <div class="section-head" style="margin-top:4px"><h2>When it counts</h2></div>
      <label class="field"><span>Schedule</span><select id="gg_sched">
        <option value="daily" ${sch.type === 'daily' ? 'selected' : ''}>Every day</option>
        <option value="weekdays" ${sch.type === 'weekdays' ? 'selected' : ''}>Chosen weekdays</option>
      </select></label>
      <div class="wd-picker" id="gg_days" ${sch.type === 'weekdays' ? '' : 'hidden'}>${dayOrder
        .map(
          (d) => `<label class="wd-chip"><input type="checkbox" data-wd="${d}" ${
            (sch.days || [1, 2, 3, 4, 5]).indexOf(d) >= 0 ? 'checked' : ''
          }><span>${A.DAY_SHORT[d]}</span></label>`
        )
        .join('')}</div>

      <div class="section-head" style="margin-top:4px"><h2>How you level up</h2></div>
      <div class="grid-2">
        <label class="field"><span>Good days needed</span><input type="number" id="gg_succ" min="1" max="30" value="${esc(adv.successes)}"></label>
        <label class="field"><span>…out of the last</span><input type="number" id="gg_win" min="1" max="30" value="${esc(adv.window)}"></label>
      </div>
      <div class="row" style="padding:10px 0">
        <div class="body"><div class="name">Step back after misses</div><div class="sub">Stops the app outrunning you</div></div>
        <label class="switch"><input type="checkbox" id="gg_reg" ${reg ? 'checked' : ''}><i></i></label>
      </div>
      <label class="field" ${reg ? '' : 'hidden'}><span>Consecutive misses before stepping back</span>
        <input type="number" id="gg_miss" min="2" max="14" value="${esc(reg ? reg.misses : 3)}"></label>
      <div class="row" style="padding:10px 0">
        <div class="body"><div class="name">Require a written summary</div><div class="sub">Can't be completed until you write one</div></div>
        <label class="switch"><input type="checkbox" id="gg_gate" ${v.gate === 'summary' ? 'checked' : ''}><i></i></label>
      </div>

      ${
        v.fromHabit
          ? `<p class="footnote" style="margin-bottom:10px">Saving turns the daily habit
              <b>${esc(v.name)}</b> into this goal and takes it off the habit list, so it is asked
              for once rather than twice. Days you have already logged keep the habits they froze
              and their score does not move.</p>`
          : ''
      }
      <div class="btn-row"><button class="btn primary block" data-act="goal-save" data-id="${g ? g.id : ''}"
        data-habit="${esc(v.fromHabit || '')}">${
      g ? 'Save changes' : v.fromHabit ? 'Make it a goal' : 'Create goal'
    }</button></div>
      ${
        g
          ? `<div class="btn-row" style="margin-top:8px">
               <button class="btn ghost" data-act="goal-archive" data-id="${g.id}" style="flex:1">${g.archived ? 'Resume' : 'Pause'}</button>
               <button class="btn ghost danger" data-act="goal-delete" data-id="${g.id}">Delete</button>
             </div>`
          : ''
      }
    `);
  }

  const CHALLENGE_LENGTHS = [21, 30, 66, 75, 100];

  /**
   * Start, review or end a fixed-length run.
   *
   * 66 is the default because it is the figure the "how long to form a habit"
   * research actually landed on, not the 21 everyone repeats — but every length
   * here is a preset, not a rule.
   */
  function openChallenge() {
    const c = S.activeChallenge();
    const p = c ? S.challengeProgress(c) : null;
    const past = S.challenges().filter((x) => x.endedOn);

    const body = c
      ? `<div class="stat-grid" style="margin-bottom:12px">
           <div class="stat"><b>${p.day}/${p.days}</b><span>Day</span></div>
           <div class="stat good"><b>${p.kept}</b><span>Days kept</span></div>
           <div class="stat gold"><b>${p.days - p.day}</b><span>${p.complete ? 'Overrun' : 'To go'}</span></div>
         </div>
         <div class="card">
           <div class="xpbar-top"><span>${esc(c.name)}</span><span>started ${esc(A.prettyDate(c.startDate))}</span></div>
           ${bar(p.keptPct, 'gold')}
           <p class="faint" style="font-size:var(--fs-sm);margin:10px 0 0">
             The bar is days you actually kept, not days that have passed — ${p.kept} of ${p.days}.
           </p>
         </div>
         <button class="btn ghost danger block" data-act="challenge-end" data-id="${c.id}">
           ${p.complete ? 'Finish and archive' : 'End this countdown early'}
         </button>`
      : `<p class="muted" style="margin-top:0;font-size:var(--fs-md)">Give yourself a fixed stretch to count against.
           The counter on Today becomes <b>DAY 5 / 66</b>, and it counts the days you keep — not just the
           days that pass.</p>
         <label class="field"><span>Call it</span>
           <input type="text" id="ch_name" maxlength="32" value="Reset" placeholder="Reset"></label>
         <label class="field"><span>How long</span><select id="ch_days">
           ${CHALLENGE_LENGTHS.map((d) => `<option value="${d}" ${d === 66 ? 'selected' : ''}>${d} days</option>`).join('')}
         </select></label>
         <div class="btn-row"><button class="btn primary block" data-act="challenge-start">Start the countdown</button></div>`;

    openSheet(c ? c.name : 'Start a countdown', `
      ${body}
      ${
        past.length
          ? `<div class="section-head" style="margin-top:18px"><h2>Finished countdowns</h2></div>
             <div class="card flush">${past
               .slice()
               .reverse()
               .map((x) => {
                 const done = S.challengeProgress(x);
                 return `<div class="row"><div class="body">
                     <div class="name">${esc(x.name)}</div>
                     <div class="sub">${esc(A.prettyDate(x.startDate))} → ${esc(A.prettyDate(x.endedOn))} · ${done.kept}/${x.days} days kept</div>
                   </div></div>`;
               })
               .join('')}</div>`
          : ''
      }
    `);
  }

  /* ================= THE 66-DAY RUN ================= */

  /* A run is a different thing from a goal, and these screens say so rather
     than blurring it: a goal ramps a target the user chose from a baseline they
     set and earns each step by performing; a run picks from a closed catalog,
     ramps on the calendar, and is feasible-by-construction on all 66 days. A
     user may have both, and neither screen reads the other's data. */

  const RUN = () => A.Run;

  /** How much of a run habit's day is left, drawn the way the app draws goals. */
  function runAsk(row, entry) {
    const ask = entry && entry.asked != null ? entry.asked : row.dose;
    return A.formatValue(row.unit === 'min' ? 'minutes' : 'count', ask) + ' ' + row.unit;
  }

  /** One habit of today's run: what it asks, what happened, one tap to say so. */
  function runRow(row, entry) {
    const done = !!(entry && entry.done);
    const frac = RUN().fractionOf(entry);
    const measured = !!(entry && entry.did != null);
    const marks = [];
    if (row.dayOfHabit === 1) marks.push('new today');
    if (row.frozen) marks.push('steady this week');
    if (row.softened) marks.push('eased back');

    /* A checklist habit shows its checklist. Four supplements is four things
       you can miss one of, so a single tick would be the app deciding that
       three of four is the same as none — and the record already knows better. */
    const items = entry && entry.items
      ? Object.keys(entry.items).map((k) => ({ name: k, done: !!entry.items[k] }))
      : null;

    return `<div class="runrow ${done ? 'is-done' : ''} ${measured && !done ? 'is-part' : ''}">
      <div class="runrow-head">
        <button type="button" class="runrow-tick" data-act="run-tick" data-id="${esc(row.id)}"
          aria-label="${done ? 'Undo' : 'Complete'} ${esc(row.name)}">✓</button>
        <button type="button" class="runrow-main" data-act="run-value" data-id="${esc(row.id)}">
          <span class="name">${esc(row.name)}</span>
          <span class="sub">${esc(runAsk(row, entry))}${
            measured ? ' · ' + esc(String(entry.did)) + ' done' : ''
          }${marks.length ? ' · ' + esc(marks.join(', ')) : ''}</span>
          ${frac != null ? `<span class="runrow-bar"><i style="width:${Math.round(frac * 100)}%"></i></span>` : ''}
        </button>
      </div>
      ${
        items
          ? `<ul class="runitems">${items
              .map(
                (it) => `<li><button type="button" class="runitem ${it.done ? 'on' : ''}"
                  data-act="run-item" data-id="${esc(row.id)}" data-item="${esc(it.name)}"
                  aria-pressed="${it.done}"><i aria-hidden="true">${it.done ? '✓' : ''}</i>${esc(it.name)}</button></li>`
              )
              .join('')}</ul>`
          : ''
      }
    </div>`;
  }

  /** The run's section on Today. Absent entirely when there is no run. */
  function runSection() {
    const run = S.run();
    const st = S.runStatus();
    if (!run || !st || !st.running) return '';
    const day = st.day;
    const rows = RUN().runDay(run, day);
    const log = (run.log || {})[day] || {};
    const left = rows.filter((r) => !(log[r.id] && log[r.id].done)).length;
    const starts = (run.habits || []).map((h) => h.startDay).filter((d) => d > day);

    return `
      <div class="label split">
        <span>The run · day ${day} of ${RUN().RUN_DAYS}</span>
        <button class="link" data-nav="run">The whole run</button>
      </div>
      ${
        rows.length
          ? `<div class="runlist">${rows.map((r) => runRow(r, log[r.id])).join('')}</div>
             <p class="faint runnote">${
               left
                 ? esc(left + (left === 1 ? ' thing left in the run today' : ' things left in the run today'))
                 : 'Everything the run asked for today is done.'
             }</p>`
          : `<div class="empty">Nothing has started yet — that is on purpose.${
              starts.length ? '<br>The first habit arrives on day ' + Math.min.apply(null, starts) + '.' : ''
            }</div>`
      }`;
  }

  /* ---------------- the run, looked back on ---------------- */

  /* Until this existed the run screen showed today and what was still coming,
     and nothing at all about what had happened. Sixty-five days of record sat
     in storage with no way to see them: the one screen in the app you cannot
     open to ask "how has this actually gone" was the sixty-six-day commitment.

     Everything drawn here comes from `A.Run.journey`, which reads each day's
     frozen record. Nothing is re-derived from the programme as it stands, so
     easing a habit today cannot redraw a week the user already lived. */

  const MARK_LABEL = {
    kept: 'kept', part: 'part of it', missed: 'missed',
    unopened: 'not opened', today: 'today', ahead: 'to come'
  };

  /**
   * The lattice: one cell per day, seven to a row.
   *
   * A row is a week of the run, which is the unit the run's own rules are
   * written in — at most two new habits in any seven days. The day number is
   * printed in the cell rather than left to colour, because six shades of one
   * palette is exactly the kind of chart that stops meaning anything on a
   * phone in daylight, and because the content genuinely is a sequence.
   *
   * The grid is `aria-hidden` and the same counts are stated as text beneath
   * it. A screen reader walking sixty-six cells learns less than one sentence
   * does, and the sentence is not a summary of the picture — it is the picture,
   * written down.
   */
  function runLattice(marks) {
    return `<div class="lattice" aria-hidden="true">${marks
      .map((m) => {
        const label = m.state === 'unopened' || m.state === 'ahead'
          ? MARK_LABEL[m.state]
          : m.done + ' of ' + m.asked;
        return `<i class="lat ${m.state}" title="Day ${m.day} — ${esc(label)}">${m.day}</i>`;
      })
      .join('')}</div>`;
  }

  /** The same run, said in words — and the only version colour is not carrying. */
  function runTally(marks) {
    const n = (state) => marks.filter((m) => m.state === state).length;
    return ['kept', 'part', 'missed', 'unopened', 'ahead']
      .map((s) => ({ s: s, n: n(s) }))
      .filter((x) => x.n)
      .map((x) => x.n + ' ' + MARK_LABEL[x.s])
      .join(' · ');
  }

  /**
   * The whole run: what happened, the three phases, and when each habit joined.
   *
   * The ladder is every habit rather than only the ones still to come, because
   * "Read arrived on day 8" is the half of the schedule that explains the
   * lattice above it. It replaces the old "Still to come" section, which showed
   * the future half of this same list.
   */
  function runJourney(run, day) {
    const marks = RUN().journey(run, day);
    const ladder = (run.habits || [])
      /* `isKnownEntry`, not `isKnown`: the latter is catalogue-only and returns
         false for every `c_…` id, so a habit the user wrote showed on Today,
         ramped correctly and counted toward the day — while being invisible in
         the one screen that carries a remove control. */
      .filter((p) => RUN().isKnownEntry(p))
      .sort((a, b) => a.startDay - b.startDay || a.habitId.localeCompare(b.habitId));

    return `
      <div class="label">The whole run</div>
      ${runLattice(marks)}
      <p class="faint runnote">${esc(runTally(marks))}</p>

      <div class="latphases">${RUN()
        .PHASES.map((p) => {
          const now = day >= p.first && day <= p.last;
          const when = day > p.last ? 'done' : now ? 'now' : '';
          return `<div class="latphase ${now ? 'is-now' : ''}">
            <b>${esc(p.name)}</b>
            <span>day ${p.first}–${p.last}${when ? ' · ' + when : ''}</span>
          </div>`;
        })
        .join('')}</div>

      <div class="section-head"><h2>What is in it</h2>
        <button class="link" data-act="run-add-open">＋ Add a habit</button></div>
      ${
        ladder.length
          ? `<div class="card flush runlist-card">${ladder
              .map((p) => {
                const h = RUN().defOf(p);
                const away = p.startDay - day;
                const when = away <= 0
                  ? 'started day ' + p.startDay
                  : 'starts day ' + p.startDay + ' · in ' + away + (away === 1 ? ' day' : ' days');
                /* Removing is refused at the floor rather than offered and then
                   denied — a control that is going to say no is better not
                   drawn. */
                /* Counted from the run itself, which is what `runRemoveHabit`
                   checks. Counting the FILTERED ladder made the two disagree
                   the moment a custom habit existed, so the ✕ was withheld from
                   removals the store would have allowed. */
                const canDrop = (run.habits || []).length > RUN().MIN_HABITS;
                return `<div class="row ${away > 0 ? 'ahead' : ''}"><div class="body">
                  <div class="name">${esc(h.name)}</div>
                  <div class="sub">${esc(when)} · ${esc(
                  A.formatValue('count', h.start)
                )} → ${esc(A.formatValue('count', h.target))} ${esc(h.unit)}</div></div>${
                  canDrop
                    ? `<button type="button" class="icon-btn" data-act="run-remove" data-id="${esc(
                        p.habitId
                      )}" aria-label="Remove ${esc(h.name)} from the run">✕</button>`
                    : ''
                }</div>`;
              })
              .join('')}</div>
             ${
               (run.habits || []).length <= RUN().MIN_HABITS
                 ? `<p class="faint runnote">A run needs at least ${RUN().MIN_HABITS} habits, so
                    these cannot be removed. Add another first.</p>`
                 : ''
             }`
          : `<div class="empty">This run has no habits left in it.</div>`
      }`;
  }

  /**
   * Write a habit the catalog does not have.
   *
   * The numbers are asked for plainly because they are what the ramp is made
   * of: it starts at one, ends at the other, and moves by the step once a week.
   * Nothing here is guessed on the user's behalf — a habit whose numbers do not
   * work is refused when it is written, which is far kinder than an impossible
   * day 41.
   */
  function openRunCustom(pre) {
    const live = !!S.run();
    const v = Object.assign(
      { name: '', unit: 'min', domain: 'self_care', start: 10, target: 25, step: 5,
        friction: 2, minutesAtTarget: null, fromGoal: '' },
      pre || {}
    );
    openSheet(v.fromGoal ? 'Bring ' + v.name + ' into the run' : 'Write your own habit', `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">It belongs to this run and
        nothing else — the catalog is unchanged, and your goals and plan are untouched. It ramps
        the same way every other habit does: from the first number to the second, one step a week.</p>
      <label class="field"><span>Name</span>
        <input type="text" id="rc_name" maxlength="40" value="${esc(v.name)}" placeholder="e.g. Sauna"></label>
      <div class="grid-2">
        <label class="field"><span>Measured in</span>
          <input type="text" id="rc_unit" maxlength="12" value="${esc(v.unit)}" placeholder="min"></label>
        <label class="field"><span>Area</span><select id="rc_domain">
          ${[['self_care', 'Self-care'], ['fitness', 'Fitness'], ['development', 'Development']]
            .map(([id, label]) => `<option value="${id}"${v.domain === id ? ' selected' : ''}>${label}</option>`)
            .join('')}
        </select></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Start at</span>
          <input type="number" id="rc_start" min="0" step="any" value="${esc(v.start)}"></label>
        <label class="field"><span>Build up to</span>
          <input type="number" id="rc_target" min="0" step="any" value="${esc(v.target)}"></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Step each week</span>
          <input type="number" id="rc_step" min="0.1" step="any" value="${esc(v.step)}"></label>
        <label class="field"><span>Effort</span><select id="rc_friction">
          ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === v.friction ? ' selected' : ''}>${'•'.repeat(n)}</option>`).join('')}
        </select></label>
      </div>
      <!-- The minutes budget is the rule that decides whether a day is
           physically doable, and it is built on how long one unit costs. Asking
           that directly — "how many minutes is one push-up" — is a question
           nobody can answer, so this asks the whole thing at its target and
           divides. It was hardcoded to one minute per unit before, which is
           right for a habit measured in minutes and wrong for every other. -->
      <label class="field"><span>Minutes a day once you reach the target</span>
        <input type="number" id="rc_at_target" min="0" step="any" value="${esc(
          v.minutesAtTarget == null ? v.target : v.minutesAtTarget
        )}"></label>
      <input type="hidden" id="rc_from_goal" value="${esc(v.fromGoal || '')}">
      <div class="btn-row"><button class="btn primary block" data-act="run-custom-save">${
        live ? 'Add it to the run' : 'Add it to the list'
      }</button></div>
      <p class="faint" style="font-size:var(--fs-xs);margin:10px 2px 0">${
        live
          ? `It joins on the first day the run can take it. If the numbers make a day you could not
             actually do, it is refused rather than squeezed in — that is the promise the run is
             built on.`
          : `It goes on the list with the ones you have ticked, and starts on day one if the budget
             has room for it. If the numbers make a day you could not actually do, it is dropped
             when the run is built and you are told — that is the promise the run is built on.`
      }</p>
    `);
  }

  /**
   * The habits that could still be added to a run in progress.
   *
   * Everything not already in it, each with the first day the spacing and phase
   * rules would actually allow — and anything with no legal day left is shown as
   * refused rather than hidden, because "why is cold finish not on this list"
   * has a real answer and it is better said than left to be guessed at.
   */
  function openRunAdd() {
    const run = S.run();
    const day = S.runToday();
    if (!run || day == null) return;
    const have = {};
    (run.habits || []).forEach((p) => { have[p.habitId] = true; });
    /* `firstLegalStart` rather than a scan over every legal day: this runs once
       per candidate habit, so a linear search here multiplied 56 validations by
       fourteen and the sheet opened on a visible pause. See run.js. */
    const rows = RUN().HABITS.filter((h) => !have[h.id]).map((h) => ({
      h: h,
      start: RUN().firstLegalStart(run, { habitId: h.id, startDay: 1, scale: 1, frozenDay: null }, day)
    }));

    openSheet('Add a habit', `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">It joins on the first day the
        run can take it — at most two new habits in any week, and never past day
        ${RUN().LAST_INTRO_DAY}. Days you have already recorded do not change.</p>
      <button type="button" class="how-photo-add" data-act="run-custom-open" style="min-height:64px">
        <b>＋ Write your own</b>
        <small>A habit that is not on this list. It lives in this run only — the
          catalog stays as it is.</small>
      </button>
      ${
        rows.length
          ? `<div class="card flush runlist-card">${rows
              .map(
                (r) => `<div class="row"><div class="body">
                  <div class="name">${esc(r.h.name)}</div>
                  <div class="sub">${esc(
                    A.formatValue('count', r.h.start) + ' → ' + A.formatValue('count', r.h.target) + ' ' + r.h.unit
                  )}${r.start ? ' · from day ' + r.start : ''}</div></div>
                  ${
                    r.start
                      ? `<button class="btn" data-act="run-add" data-id="${esc(r.h.id)}">Add</button>`
                      : `<span class="faint" style="font-size:var(--fs-xs);max-width:96px;text-align:right">no room left in this run</span>`
                  }</div>`
              )
              .join('')}</div>`
          : `<div class="empty">Every habit in the catalog is already in this run.</div>`
      }
    `);
  }

  /* A suggestion, carried in data attributes rather than by an index into a
     list that is recomputed on every render — the list the user tapped and the
     list the handler rebuilds are two different objects. */
  function runRec(rec) {
    return `<article class="runrec">
      <div class="runrec-top"><b>${esc(rec.headline)}</b><span>${esc(rec.detail)}</span></div>
      <ul>${rec.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="btn-row">
        <button class="btn primary" data-act="run-accept" data-kind="${esc(rec.kind)}"
          data-id="${esc(rec.habitId)}" data-day="${rec.startDay == null ? '' : rec.startDay}">${
      rec.kind === 'add' ? 'Add it' : 'Give it back'
    }</button>
      </div>
    </article>`;
  }

  /* The catalog, offered as a choice.

     Until this existed the start screen asked for a minutes budget and nothing
     else, so the run was always the same six-habit fallback — the list that
     stands in for the Architect this app cannot call. Every self-care habit in
     the catalog was unreachable: not in the default run, and offered by the
     recommender only after a fortnight at 80%, around day 33 of 66.

     Selection is a checkbox and its visual state is `:has(:checked)` in CSS, so
     picking does not re-render and there is no draft to keep in step with the
     DOM. What is checked when Start is pressed is the whole of the state. */
  const PICK_DOMAINS = [
    { id: 'fitness', name: 'Fitness' },
    { id: 'self_care', name: 'Self-care' },
    { id: 'development', name: 'Development' }
  ];

  /* The selection lives here rather than in the checkboxes it used to be.
     `render()` replaces the whole of `#view` on every store commit, so anything
     held in the DOM is lost the moment something else writes — silently, and
     with the defaults back. View state survives a re-render, which is the same
     reason `todayFilter` and `picker` live up here. It also means the picks can
     be driven from tools/render.js instead of only from a browser. */
  let runPicks = null;
  let runTogether = true;   // chosen habits start today unless asked otherwise
  /* Checklists edited before the run exists have nowhere to be stored yet, so
     they wait here and are handed to `startRun`. */
  const draftItems = {};

  /* The service worker version actually serving this page. See UI.setBuild. */
  let buildVersion = '';

  function currentRunPicks() {
    if (!runPicks) runPicks = A.Run.DEFAULT_PICKS.slice();
    return runPicks.slice();
  }

  function toggleRunPick(id) {
    if (!A.Run.isCatalogId(id)) return;
    const list = currentRunPicks();
    const at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1);
    else list.push(id);
    runPicks = list;
  }

  /** Forget the selection once it has become a run, so the next one starts fresh. */
  function resetRunPicks() {
    runPicks = null;
    runTogether = true;
    draftCustoms = [];
  }

  /**
   * Repaint the picker alone after a tap.
   *
   * Toggling one habit used to call `render()`, which rebuilds the whole view:
   * twenty-four buttons and the page around them, then a scroll restore and a
   * focus restore, for a single class change. On a phone that reads as a flash
   * and a jump — a button that does not feel like it worked.
   *
   * `runPicker()` stays the only thing that builds this markup, so there is no
   * second rendering path to drift from the first. The stub DOM in
   * tools/render.js has no `getElementById` beyond a stand-in, which is why
   * both writes are guarded rather than assumed.
   */
  function refreshRunPicker() {
    const host = document.getElementById('runPicker');
    if (host) host.innerHTML = runPicker();
    const btn = document.querySelector('[data-act="run-start"]');
    if (btn) btn.textContent = 'Start the run · ' + currentRunPicks().length + ' chosen';
  }

  function pickCard(h, chosen) {
    const ask = A.formatValue('count', h.start) + ' → ' + A.formatValue('count', h.target) + ' ' + h.unit;
    return `<button type="button" class="pick ${chosen ? 'on' : ''}" data-act="run-pick"
        data-id="${esc(h.id)}" aria-pressed="${chosen}">
      <i class="pick-mark" aria-hidden="true">${chosen ? '✓' : ''}</i>
      <b>${esc(h.name)}</b>
      <small>${esc(h.target === h.start ? A.formatValue('count', h.start) + ' ' + h.unit + ', every day' : ask)}</small>
      <i class="pick-effort" aria-label="effort ${h.friction} of 5">${'•'.repeat(h.friction)}</i>
    </button>${
      h.items
        ? `<button type="button" class="pick-edit" data-act="run-edit-items" data-id="${esc(h.id)}">${
            (A.Run.itemsFor({ habitId: h.id, items: draftItems[h.id] }) || []).length
          } steps · edit</button>`
        : ''
    }`;
  }

  /**
   * The user's own goals, offered to the run.
   *
   * The ineligible ones are listed WITH their reason rather than hidden — the
   * same rule the add-habit sheet follows. "Why is Wake up not here" has a real
   * answer, and the two goals a 66-day run looks most made for are exactly the
   * two it cannot take, so saying nothing would read as a bug.
   *
   * Tapping one opens the write-your-own sheet pre-filled from the goal, because
   * a goal does not carry the one number the run's budget is built on: how many
   * minutes it costs. That is asked for rather than invented.
   */
  function runGoalPicker() {
    const rows = S.runCandidateGoals();
    if (!rows.length) return '';
    const taken = draftCustoms.map((d) => d.fromGoal).filter(Boolean);
    return `
      <div class="label">From your goals</div>
      <div class="card flush runlist-card">${rows
        .map((r) => {
          const on = taken.indexOf(r.goal.id) >= 0;
          return `<div class="row"><div class="body">
            <div class="name">${esc(r.goal.name)}</div>
            <div class="sub">${
              r.eligible
                ? esc(
                    A.formatValue(r.goal.unit, r.goal.baseline) + ' → ' +
                    A.formatValue(r.goal.unit, r.goal.target)
                  )
                : esc(r.why)
            }</div></div>
            ${
              !r.eligible
                ? `<span class="faint" style="font-size:var(--fs-xs)">can't</span>`
                : on
                ? `<span class="pill good">on the list</span>`
                : `<button class="btn" data-act="run-goal-add" data-id="${esc(r.goal.id)}">Add</button>`
            }</div>`;
        })
        .join('')}</div>
      <p class="faint pickhint">A goal the run takes over is <b>paused</b> while the run holds it,
        so it is asked for once rather than twice. Everything it has already earned stays, and Plan
        resumes it with one tap.</p>`;
  }

  function runPicker() {
    const chosen = currentRunPicks();
    return PICK_DOMAINS.map((d) => {
      const rows = A.Run.HABITS.filter((h) => h.domain === d.id);
      return `<div class="section-head"><h2>${esc(d.name)}</h2>
          <span class="faint">${rows.filter((h) => chosen.indexOf(h.id) >= 0).length} of ${rows.length}</span></div>
        <div class="pickgrid">${rows.map((h) => pickCard(h, chosen.indexOf(h.id) >= 0)).join('')}</div>`;
    }).join('');
  }

  function renderRun() {
    const run = S.run();

    if (!run) {
      /* Deliberately not a sales pitch. A run is a second commitment on top of
         goals, so the screen says what it costs before what it gives.

         There was briefly a five-question intake here that scored the catalog
         and pre-ticked the result. It went because the connection between an
         answer and a habit was never visible on screen, so it read as a
         questionnaire that got thrown away. The catalog is the choice. */
      return `
        <header class="screenhead">
          <div class="screenhead-top"><h1>The 66-day run</h1></div>
          <div class="screenhead-sub">Separate from your goals, and feasible on all 66 days by construction</div>
        </header>
        <section class="card">
          <p>A fixed 66 days built from a closed list of habits, which
             <b>cannot ask you for a day you can't do</b>. It ramps on the
             calendar rather than on performance, introduces at most two new
             habits in any week, and every one of the 66 days is checked against
             your daily minutes before the run starts.</p>
          <p class="faint">This is separate from your goals. They keep running
             exactly as they are, and nothing here touches them.</p>
          <label class="field"><span>Minutes a day you can actually give it</span>
            <select id="run_budget">${[30, 45, 60, 75, 90]
              .map((m) => `<option value="${m}"${m === 45 ? ' selected' : ''}>${m} min</option>`)
              .join('')}</select></label>
        </section>

        <button type="button" class="pick together ${runTogether ? 'on' : ''}"
          data-act="run-together" aria-pressed="${runTogether}">
          <i class="pick-mark" aria-hidden="true">${runTogether ? '✓' : ''}</i>
          <b>Start everything on day one</b>
          <small>${
            runTogether
              ? 'All of it from today. Only your minutes still limit the run.'
              : 'Eased in instead — two new habits a week, the rest waiting their turn.'
          }</small>
        </button>

        <p class="faint pickhint">Pick what you want in it. Anything that will not
          fit your minutes is dropped when the run is built, and you will be told what went — every one
          of the 66 days has to be a day you can actually do. Fewer than
          ${A.Run.MIN_HABITS} and the rest is filled in for you.</p>

        <!-- The catalog is fourteen habits and deliberately closed, so this is
             the only way a run can hold something it does not have. It used to
             exist ONLY inside the mid-run "Add a habit" sheet, which meant the
             one screen where you decide what your 66 days are was the one screen
             that could not reach it — and a habit added after the start cannot
             begin before day two, because the legal start days count from
             today + 1. Written here, it can start on day one. -->
        <button type="button" class="how-photo-add" data-act="run-custom-open" style="min-height:64px">
          <b>＋ Write your own</b>
          <small>Anything the fourteen below do not cover. It lives in this run
            only — the catalog, your goals and your plan are all untouched.</small>
        </button>
        ${
          draftCustoms.length
            ? `<div class="card flush runlist-card">${draftCustoms
                .map(
                  (d) => `<div class="row"><div class="body">
                    <div class="name">${esc(d.name)}</div>
                    <div class="sub">${esc(
                      A.formatValue('count', d.start) + ' → ' + A.formatValue('count', d.target) + ' ' + d.unit
                    )}</div></div>
                    <button class="icon-btn" data-act="run-custom-rm" data-key="${esc(d.key)}"
                      aria-label="Remove ${esc(d.name)}">✕</button></div>`
                )
                .join('')}</div>`
            : ''
        }

        ${runGoalPicker()}

        <div id="runPicker">${runPicker()}</div>
        <button class="btn primary block" data-act="run-start" style="margin-top:14px">Start the run · ${
          currentRunPicks().length + draftCustoms.length
        } chosen</button>`;
    }

    const st = S.runStatus();
    const unknown = S.runUnknownHabits();
    const log = run.log || {};
    const kept = Object.keys(log).filter((d) => {
      const ids = Object.keys(log[d]);
      return ids.length && ids.every((k) => log[d][k].done);
    }).length;

    if (st.state === 'finished') {
      return `
        <header class="screenhead">
          <div class="screenhead-top"><h1>The run is over</h1></div>
        </header>
        <section class="hero"><div class="hero-stats">
          <div class="hero-stat"><b>${RUN().RUN_DAYS}</b><span>days</span></div>
          <div class="hero-stat"><b>${kept}</b><span>kept in full</span></div>
          <div class="hero-stat"><b>${run.habits.length}</b><span>habits</span></div>
        </div></section>
        <p class="faint" style="margin:12px 4px">It finished ${st.daysOver} day${
        st.daysOver === 1 ? '' : 's'
      } ago. Nothing here is asked of you any more.</p>
        ${runJourney(run, st.day)}
        <button class="btn ghost block" data-act="run-end" style="margin-top:14px">Clear it and start again</button>`;
    }

    if (st.state === 'not_started') {
      return `<header class="screenhead">
          <div class="screenhead-top"><h1>The 66-day run</h1></div>
        </header>
        <div class="empty">It starts on ${esc(A.prettyDate(run.startDate))}.</div>
        <button class="btn ghost block" data-act="run-end">Cancel it</button>`;
    }

    const day = st.day;
    const ph = RUN().phaseFor(day);
    /* Both of these are reads. A render must not change data — calling the
       store's check-in here was a write during a render and a hang besides,
       because `commit` re-renders and the check-in ran again. The patch is a
       once-a-day event owned by app.js; this shows what it decided. */
    const patchedToday = run.lastPatchDay === day;
    const check = {
      patched: patchedToday,
      notes: patchedToday ? run.lastPatchNotes || [] : [],
      recommendations: patchedToday ? [] : RUN().recommend(run, day)
    };
    const eased = check.notes.filter((n) => n.indexOf('softened') === 0 || n.indexOf('froze') === 0);

    return `
      <!-- Ember, like Today's header. The rule for it is "a block whose subject
           is progress through a fixed length of time", and a screen called
           "day 12 of 66" is that or nothing is. -->
      <header class="dayhead ember">
        <div class="dayhead-top">
          <div class="dayhead-id">
            <div class="dayhead-label">The 66-day run</div>
            <h1 class="daynum">DAY <b>${day}</b><i>/ ${RUN().RUN_DAYS}</i></h1>
          </div>
          <div class="dayhead-side">
            <div class="dayhead-streak"><b>${kept}</b><span>kept in full</span></div>
          </div>
        </div>
        <div class="dayhead-track">
          <i class="elapsed" style="width:${Math.round((day / RUN().RUN_DAYS) * 100)}%"></i>
          <i class="kept" style="width:${Math.round((kept / RUN().RUN_DAYS) * 100)}%"></i>
        </div>
        <div class="dayhead-foot">
          <span>${esc(ph.name)} phase</span><span>${run.minutesBudget} min a day</span>
        </div>
      </header>

      ${
        unknown.length
          ? `<section class="banner warn"><div><b>This run mentions ${unknown.length} habit${
              unknown.length === 1 ? '' : 's'
            } this version does not have</b><p>They are kept in your data and simply not shown, so a later
             version can bring them back. Nothing has been deleted.</p></div></section>`
          : ''
      }
      ${
        check.patched
          ? `<section class="banner"><div><b>The run eased off</b><p>${
              eased.length
                ? esc(eased.join('. '))
                : 'It was asking for more than the last two weeks say you can give it.'
            }</p></div></section>`
          : ''
      }

      <div class="label">Today</div>
      <div class="runlist">${RUN()
        .runDay(run, day)
        .map((r) => runRow(r, (log[day] || {})[r.id]))
        .join('') || '<div class="empty">Nothing is asked of you today.</div>'}</div>

      ${
        check.recommendations.length
          ? `<div class="section-head"><h2>What you could take on</h2></div>
             ${check.recommendations.map(runRec).join('')}`
          : ''
      }

      ${runJourney(run, day)}

      <button class="btn ghost block" data-act="run-end" style="margin-top:14px">End this run</button>`;
  }

  /**
   * Log what actually happened for one run habit today.
   *
   * The ask shown is the one frozen into today's record, not what `doseOn` says
   * now — a check-in can ease the run part-way through a day, and the number
   * the user has been working toward since this morning is the one they were
   * given this morning.
   */
  /**
   * Edit what is inside a checklist habit.
   *
   * The catalog is closed and stays closed — this changes only the run's own
   * copy of the list. Days already recorded keep the list they actually asked
   * for, which is the reason the record stores the item names rather than a
   * count of them.
   */
  function openRunItems(habitId) {
    const h = A.Run.habitIn(S.run(), habitId);
    if (!h) return;
    const run = S.run();
    /* Reachable from the picker too, where there is no run yet — the list is
       held in a draft until `startRun` is given it. Editing what is in a habit
       before committing to 66 days of it is the whole point of the screen. */
    const p = run
      ? (run.habits || []).find((x) => x.habitId === habitId)
      : { habitId: habitId, items: draftItems[habitId] };
    const list = A.Run.itemsFor(p) || [];
    openSheet(h.name, `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">One per line, in the order you
        do them. This changes your run only — days you have already recorded keep the list they
        actually asked for.</p>
      <label class="field"><span>The steps</span>
        <textarea id="run_items" rows="8">${esc(list.join('\n'))}</textarea></label>
      <div class="btn-row">
        <button class="btn primary" data-act="run-save-items" data-id="${esc(habitId)}" style="flex:1">Save</button>
      </div>
      <p class="faint" style="font-size:var(--fs-xs);margin:10px 2px 0">Blank lines and repeats are
        dropped. An empty list is not saved — a habit with nothing in it is not a habit.</p>
    `);
  }

  function openRunValue(habitId) {
    const run = S.run();
    const day = S.runToday();
    if (!run || day == null) return;
    const h = A.Run.habitIn(run, habitId);
    const entry = ((run.log || {})[day] || {})[habitId];
    if (!h) return;
    // A checklist is ticked item by item on the row itself, so tapping its name
    // means "change what is in it" rather than "log a number".
    if (A.Run.isItemHabit(habitId)) return openRunItems(habitId);
    const ask = entry && entry.asked != null ? entry.asked : A.Run.doseOn(
      (run.habits || []).find((p) => p.habitId === habitId) || { habitId: habitId, startDay: day }, day);

    openSheet(h.name, `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">Asked for
        <b>${esc(A.formatValue('count', ask))} ${esc(h.unit)}</b> on day ${day}.
        Log what actually happened — the honest number is what makes the record
        worth keeping, and short of the ask is still recorded.</p>
      ${valueInput('run_val', h.unit === 'min' ? 'minutes' : 'count',
                   entry && entry.did != null ? entry.did : null, 'What you actually did')}
      <div class="btn-row">
        <button class="btn primary" data-act="run-save-value" data-id="${esc(habitId)}" style="flex:1">Save</button>
        <button class="btn ghost" data-act="run-tick" data-id="${esc(habitId)}">${
          entry && entry.done ? 'Untick it' : 'Just tick it'
        }</button>
      </div>
      <p class="faint" style="font-size:var(--fs-xs);margin:10px 2px 0">Ticking clears any number:
        a tick is a claim with no measurement in it, and keeping a stale one beside it
        would store two facts that disagree.</p>
    `);
  }

  /* ================= toasts & confetti ================= */

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
    today: renderToday, plan: renderPlan, read: renderRead,
    progress: renderProgress, rewards: renderRewards, more: renderMore, run: renderRun
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
    const tabRoute = route === 'rewards' || route === 'run' ? 'more' : route;
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
  UI.setViewDate = (k) => { viewDate = k; workoutOpen = false; };
  UI.toggleWorkoutOpen = () => { workoutOpen = !workoutOpen; };
  UI.workoutOpen = () => workoutOpen;
  UI.toggleLibOpen = () => { libOpen = !libOpen; };
  UI.libOpen = () => libOpen;
  UI.setMuscleWindow = (d) => {
    const n = Number(d);
    if (MUSCLE_WINDOWS.some((w) => w.days === n)) muscleWindow = n;
  };
  UI.muscleWindow = () => muscleWindow;
  UI.openReading = openReading;
  UI.openGoalLog = openGoalLog;
  UI.openRunValue = openRunValue;
  UI.openRunAdd = openRunAdd;
  UI.openRunCustom = openRunCustom;
  UI.openRunItems = openRunItems;
  UI.runPicks = currentRunPicks;
  UI.toggleRunPick = toggleRunPick;
  UI.resetRunPicks = resetRunPicks;
  UI.refreshRunPicker = refreshRunPicker;
  UI.setBuild = (v) => { buildVersion = v; };
  UI.runTogether = () => runTogether;
  UI.toggleRunTogether = () => { runTogether = !runTogether; };
  /** A checklist edited before the run exists. Cleaned by the same rule the
      store uses, so what the picker shows is what `startRun` will get. */
  UI.setDraftItems = (id, lines) => {
    const clean = (lines || [])
      .map((x) => String(x == null ? '' : x).trim())
      .filter((x, i, all) => x && all.indexOf(x) === i)
      .slice(0, 20);
    if (!clean.length) return null;
    draftItems[id] = clean;
    return clean;
  };
  UI.draftItems = () => draftItems;
  /* Habits the user wrote on the start screen, before there is a run to store
     them against — the same shape of problem `draftItems` already solves for
     checklists. Cleaned on the way in, so what the picker lists is what
     `startRun` will actually try to place. */
  UI.draftCustoms = () => draftCustoms.slice();
  UI.addDraftCustom = (def) => {
    const clean = RUN().cleanCustom(Object.assign({ id: 'c_draft' }, def || {}));
    if (!clean) return null;
    if (draftCustoms.length + currentRunPicks().length >= RUN().MAX_HABITS) return { refused: 'full' };
    /* One goal, once. Two drafts from the same goal would pause it once and put
       the same commitment in the run twice, which is the whole thing this is
       meant to prevent. */
    if (def && def.fromGoal && draftCustoms.some((d) => d.fromGoal === def.fromGoal)) {
      return { refused: 'already' };
    }
    const row = {
      key: A.uid('dc'), name: clean.name, unit: clean.unit, domain: clean.domain,
      start: clean.start, target: clean.target, step: clean.step,
      min: clean.min, friction: clean.friction,
      /* Neither of these survives `cleanCustom`, which returns a fixed shape —
         they are carried alongside it. `minutesAtTarget` is what the budget cost
         is derived from, and `fromGoal` is what `startRun` pauses. */
      minutesAtTarget: def && isFinite(Number(def.minutesAtTarget)) ? Number(def.minutesAtTarget) : null,
      fromGoal: (def && def.fromGoal) || ''
    };
    draftCustoms.push(row);
    return row;
  };
  UI.removeDraftCustom = (key) => { draftCustoms = draftCustoms.filter((d) => d.key !== key); };
  UI.openGoalDetail = openGoalDetail;
  UI.openCookieJar = openCookieJar;
  UI.openGoalTemplates = openGoalTemplates;
  UI.openGoalEditor = openGoalEditor;
  UI.openGoalRestart = openGoalRestart;
  UI.openExerciseHow = openExerciseHow;
  UI.refreshExerciseHow = refreshExerciseHow;
  UI.openConfirm = openConfirm;
  UI.resolveConfirm = resolveConfirm;
  UI.openTextPrompt = openTextPrompt;
  UI.resolveTextPrompt = resolveTextPrompt;
  UI.openRewardEditor = openRewardEditor;
  UI.openChallenge = openChallenge;
  UI.readingForm = readingForm;
  UI.openPicker = openPicker;
  UI.refreshPicker = refreshPicker;
  UI.openPlanEditor = openPlanEditor;
  UI.openExerciseEditor = openExerciseEditor;
  UI.openCopyDay = openCopyDay;
  UI.openSheet = openSheet;
  UI.wordCount = wordCount;
  UI.planTab = () => planTab;
  UI.setPlanTab = (t) => { planTab = t === 'week' ? 'week' : 'goals'; };
  UI.todayFilter = () => todayFilter;
  UI.setTodayFilter = (f) => {
    todayFilter = f === 'done' || f === 'skipped' ? f : 'todo';
  };
  UI.picker = () => picker;
  UI.setPicker = (p) => Object.assign(picker, p);
  UI.esc = esc; // toasts built outside this module must escape user text with the same rule
})(window);
