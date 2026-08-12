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
    star: '<path d="m12 3.6 2.6 5.5 6 .8-4.4 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.4 9.9l6-.8z"/>'
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
    if (!ex) return { icon: esc('❓'), name: 'Removed exercise', sub: '', cat: 'Other' };
    return { icon: exGlyph(ex), name: ex.name, sub: `${dose(item, ex)} · ${ex.category}`, cat: ex.category };
  }

  const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Monday-first

  /* ---------- shared fragments ---------- */

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

  function weekStrip(anchor) {
    const w = S.weekStats(anchor);
    // The logical day, not the calendar date: inside the grace window (00:00 until
    // the rollover hour) they differ, and every other surface treats the logical
    // day as "today". Marking the calendar date here would ring tomorrow's dot.
    const today = S.today();
    return `<div class="week-strip">${w.days
      .map((d) => {
        const wd = A.weekday(d.key);
        // A missed day and a day that has not happened must not differ by colour
        // alone — they carry opposite weight, and one of them is not your fault yet.
        const future = d.status === 'future';
        const mark = d.status === 'complete' ? '✓'
          : d.status === 'rest' ? '·'
          : d.status === 'partial' ? d.pct + '%'
          : future ? '' : '✕';
        return `<div class="wd"><div class="dot ${d.status}${d.key === today ? ' today' : ''}">${mark}</div>
          <small>${A.DAY_SHORT[wd][0]}</small></div>`;
      })
      .join('')}</div>`;
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
    if (tl.atTarget) return 'Target reached — now just hold it.';
    const nxt = A.formatValue(goal.unit, tl.nextTarget);
    const n = tl.toAdvance;
    if (n <= 0) return `Next step ready → ${nxt}`;
    return `${n} more good day${n === 1 ? '' : 's'} → ${nxt}`;
  }

  /* Each area gets its own hue so a card is recognisable before you read it —
     the reference app uses a photograph for this; the app is offline and ships
     no artwork, so the art is generated from the goal's own icon and area. */
  const SECTION_HUE = { sleep: 245, fitness: 8, mind: 285, reading: 205, health: 150, craft: 32, custom: 320 };

  /**
   * A goal as a full-width card: title, the ask, how it repeats, its streak, and
   * a progress line along the bottom edge. This is the primary surface of the
   * app — what today asks and one tap to record it — so it gets the room.
   */
  function goalCard(entry, dateKey) {
    const g = entry.goal;
    const tl = entry.tl;
    const locked = S.isFuture(dateKey);
    const gated = g.gate === 'summary';
    const hue = SECTION_HUE[g.section] != null ? SECTION_HUE[g.section] : SECTION_HUE.custom;
    const logged = entry.entry && entry.entry.value != null ? A.formatValue(g.unit, entry.entry.value) : null;
    const mode = A.MODES[A.Goals.modeOf(g, S.settings().mode)];
    const stepPct = tl && !tl.atTarget ? (tl.windowHits / Math.max(1, tl.windowNeeded)) * 100 : 100;

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

    return `<article class="gcard ${entry.done ? 'is-done' : ''} ${entry.skipped ? 'is-skipped' : ''} ${
      part ? 'is-part' : ''
    } ${locked ? 'locked' : ''}" style="--hue:${hue}" data-goal="${g.id}">
      <span class="gcard-mono" aria-hidden="true">${esc((g.name || '?').trim().charAt(0).toUpperCase())}</span>
      <button type="button" class="gcard-open" data-act="goal-detail" data-id="${g.id}">
        <span class="gcard-badges">
          ${entry.streak > 0 ? `<span class="gcard-streak">${icon('flame')}${entry.streak}d</span>` : ''}
          ${entry.skipped ? '<span class="gcard-streak skip">Skipped</span>' : ''}
        </span>
        <span class="gcard-title">${esc(g.name)} ${esc(targetPhrase(g, entry.target))}</span>
        <span class="gcard-meta">${meta}</span>
      </button>
      <button type="button" class="gcard-tick" data-act="${gated ? 'open-read' : 'goal-hit'}" data-id="${g.id}"
              data-date="${dateKey}" aria-label="${entry.done ? 'Undo' : 'Complete'} ${esc(g.name)}"
              ${locked ? 'disabled' : ''}>✓</button>
      <span class="gcard-bar"><i style="width:${Math.min(100, Math.max(0, stepPct))}%"></i></span>
    </article>`;
  }

  /* ================= TODAY ================= */

  function banners() {
    const st = S.get();
    let out = '';
    if (!st.meta.onboarded) {
      out += `<section class="banner accent">
        <div><b>Set your starting point</b><p>Goals only work if week one matches where you actually are today.</p></div>
        <button class="btn primary" data-act="onboard">Start</button>
      </section>`;
    }
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

    const exHtml = plan.length
      ? plan
          .map((i) => {
            const p = planLine(i);
            const done = !!(l && l.ex && l.ex[i.id]);
            // The row is a container, not a button, so the "how to" control can
            // sit beside the toggle — same shape as a .goal row.
            return `<div class="item ${done ? 'done' : ''} ${future ? 'locked' : ''}">
              <button type="button" class="item-main" data-act="toggle-ex" data-id="${i.id}" ${future ? 'disabled' : ''}>
                <span class="tick" aria-hidden="true">✓</span>
                <span class="emoji" aria-hidden="true">${p.icon}</span>
                <span class="body"><span class="name">${esc(p.name)}</span><span class="sub">${esc(p.sub)}${
              i.note ? ' · ' + esc(i.note) : ''
            }</span></span>
              </button>
              <button type="button" class="icon-btn" data-act="ex-how" data-id="${i.exerciseId}" data-item="${i.id}"
                aria-label="How to do ${esc(p.name)}">${icon('info')}</button>
            </div>`;
          })
          .join('')
      : `<div class="empty"><span class="big">🛌</span>No exercises scheduled for ${esc(A.DAY_NAMES[A.weekday(k)])}.<br>
         <button class="link" data-act="go-plan" data-day="${A.weekday(k)}">Plan this day →</button></div>`;

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
            return `<button type="button" class="item ${done ? 'done' : ''} ${future ? 'locked' : ''}" data-act="toggle-hb" data-id="${h.id}" ${
              future ? 'disabled' : ''
            }>
              <span class="tick" aria-hidden="true">✓</span>
              <span class="emoji" aria-hidden="true">${esc(h.icon || '✅')}</span>
              <span class="body"><span class="name">${esc(h.name)}</span><span class="sub">${
                S.settings().requireHabits ? 'Counts toward the day' : 'Optional'
              }</span></span>
              ${hs > 1 ? `<span class="pill fire">🔥 ${hs}</span>` : ''}
            </button>`;
          })
          .join('')
      : `<div class="empty">No habits yet.<br><button class="link" data-nav="more">Add one →</button></div>`;

    const readGoal = S.activeGoals().find((g) => g.gate === 'summary');
    const reading = S.readingEntry(k);
    const readDone = readGoal ? S.goalDone(k, readGoal.id) : false;
    const journal = S.journalEntry(k);
    const mLeft = A.minutesLeftToday(S.settings().dayBoundaryHour);
    const frozen = !!S.get().freezes[k];
    const fz = S.freezeStats();

    const readCard = readGoal
      ? `<div class="card read-card ${readDone ? 'done' : ''}">
          <div class="read-top">
            <span class="emoji" aria-hidden="true">📖</span>
            <div class="body">
              <div class="name">${readDone ? 'Summary written' : 'Reading is locked until you write'}</div>
              <div class="sub">${
                readDone
                  ? esc(((reading && reading.summary) || '').slice(0, 90) + (((reading && reading.summary) || '').length > 90 ? '…' : ''))
                  : esc(A.promptForDay(k))
              }</div>
            </div>
          </div>
          <button class="btn ${readDone ? 'ghost' : 'primary'} block" data-act="open-read" data-date="${k}">
            ${readDone ? 'Edit today’s summary' : 'Write today’s summary'}
          </button>
        </div>`
      : '';

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
    const seg = (id, label) =>
      `<button type="button" class="seg ${todayFilter === id ? 'on' : ''}" data-act="today-filter" data-filter="${id}"
         aria-pressed="${todayFilter === id}">${label} <b>${buckets[id].length}</b></button>`;

    const cards = entries.length
      ? shown.length
        ? shown.map((e) => goalCard(e, k)).join('')
        : `<div class="empty">Nothing ${esc(todayFilter === 'todo' ? 'left to do' : todayFilter)} here.</div>`
      : `<div class="empty"><span class="big">🎯</span>No goals scheduled for this day.<br>
         <button class="link" data-nav="plan">Set some up →</button></div>`;

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
      ${offset === 0 ? banners() : ''}

      <section class="dayline">
        <div>
          <h1 class="daynum">DAY <b>${dayNum}</b>${
            inChallenge ? `<i>/ ${chal.days}</i>` : ''
          }</h1>
          <div class="daydate">${esc(offset === 0 ? A.prettyDate(k) : relative + ' · ' + A.prettyDate(k))}${
            st.total ? ` · ${st.done}/${st.total} done` : ''
          }</div>
        </div>
        <div class="dayline-nav">
          <button class="icon-btn" data-act="date-prev" aria-label="Previous day" ${
            A.daysBetween(S.historyStart(), k) <= 0 ? 'disabled' : ''
          }>‹</button>
          <button class="icon-btn" data-act="date-next" aria-label="Next day" ${offset >= 6 ? 'disabled' : ''}>›</button>
        </div>
      </section>

      ${
        run
          ? `<button type="button" class="chalbar ${run.complete ? 'is-complete' : ''}" data-act="challenge-open"
               aria-label="${esc(run.challenge.name)} — day ${run.day} of ${run.days}">
              <span class="chalbar-top">
                <span>${esc(run.challenge.name)}</span>
                <span>${
                  run.complete
                    ? `Finished · ${run.kept}/${run.days} days kept`
                    : `${run.kept}/${run.day} kept · ${run.days - run.day} to go`
                }</span>
              </span>
              <span class="chalbar-track">
                <i class="elapsed" style="width:${run.pct}%"></i>
                <i class="kept" style="width:${run.keptPct}%"></i>
              </span>
            </button>`
          : ''
      }

      ${offset !== 0 ? `<button class="btn ghost block" data-act="date-today" style="margin-bottom:12px">Back to today</button>` : ''}

      <div class="segbar">
        ${seg('todo', 'To-dos')}${seg('done', 'Done')}${seg('skipped', 'Skipped')}
        <button class="icon-btn seg-add" data-act="goal-new" aria-label="New goal">＋</button>
      </div>

      ${cards}
      ${gestureHint}
      ${readCard}

      ${offset === 0 ? runSection() : ''}

      <div class="section-head"><h2>${esc(A.DAY_NAMES[A.weekday(k)])} workout</h2>
        ${plan.length && !future ? `<button class="link" data-act="complete-all">Mark all done</button>` : ''}</div>
      <div class="list">${exHtml}${extraHtml}</div>

      ${
        future
          ? ''
          : `<div class="inline-add">
              <input type="text" id="extraInput" placeholder="Log something extra you did…" maxlength="60">
              <button class="btn" data-act="add-extra">Add</button>
            </div>`
      }

      <div class="section-head"><h2>Daily habits</h2><button class="link" data-nav="more">Manage</button></div>
      <div class="list">${habitHtml}</div>

      <!-- Facts, not the app's own currency. XP, levels and ranks live on Stats,
           below the real ledger — see "This Is Not A Game" in knowledge/project.md.
           The streak stays because it is true: days in a row you actually kept. -->
      <div class="section-head"><h2>Where you are</h2><button class="link" data-nav="progress">All of it</button></div>
      <section class="hero">
        <div class="hero-stats">
          <div class="hero-stat"><b class="fire">🔥 ${streak}</b><span>day streak</span></div>
          <div class="hero-stat"><b>${hist.completeDays}</b><span>days kept</span></div>
          <div class="hero-stat"><b>${wk.complete}/${wk.goal}</b><span>this week</span></div>
        </div>
      </section>

      <div class="card">
        <div class="xpbar-top"><span>This week · ${wk.complete}/${wk.goal} days</span><span>${wk.hit ? (wk.claimed ? 'Reward claimed' : 'Reward ready!') : `${Math.max(0, wk.goal - wk.complete)} to go`}</span></div>
        ${weekStrip(k)}
        ${wk.hit && !wk.claimed ? `<button class="btn primary block" data-act="claim-weekly" style="margin-top:12px">🎁 Open weekly chest · +${fmtXp(A.XP.weeklyGoal)} XP</button>` : ''}
      </div>

      <div class="section-head"><h2>Journal</h2><button class="link" data-nav="read">All entries</button></div>
      <div class="card"><textarea id="dayNote" data-date="${k}" placeholder="How did the day actually go? Energy, mood, anything worth remembering…">${esc(
        (journal && journal.text) || ''
      )}</textarea></div>

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

  function goalManageRow(g) {
    const tl = S.goalTimeline(g.id);
    const mode = A.MODES[A.Goals.modeOf(g, S.settings().mode)];
    const from = A.formatValue(g.unit, g.baseline);
    const to = A.formatValue(g.unit, g.target);
    const pct = tl.maxLevel ? (tl.level / tl.maxLevel) * 100 : 100;
    return `<div class="row goal-manage ${g.archived ? 'is-archived' : ''}">
      <span class="emoji" style="font-size:20px">${goalGlyph(g)}</span>
      <div class="body">
        <div class="name">${esc(g.name)} ${levelChip(tl)}</div>
        <div class="sub">${esc(from)} → ${esc(to)} · ${mode.icon} ${esc(mode.name)} · ${esc(scheduleText(g))}${
      g.gate === 'summary' ? ' · ✍️ summary required' : ''
    }</div>
        <div class="mini-track">${bar(pct)}</div>
        <div class="sub">${esc(advanceHint(g, tl))}</div>
      </div>
      <button class="icon-btn" data-act="goal-edit" data-id="${g.id}" aria-label="Edit ${esc(g.name)}">✎</button>
    </div>`;
  }

  function goalManageBlock() {
    const all = S.goals();
    const active = all.filter((g) => !g.archived);
    const archived = all.filter((g) => g.archived);
    const groups = {};
    active.forEach((g) => (groups[g.section || 'custom'] = (groups[g.section || 'custom'] || []).concat(g)));

    const body = A.SECTIONS.filter((s) => groups[s.id])
      .map(
        (s) => `<div class="card flush">
          <div class="plan-day-head"><h3>${sectionGlyph(s.id)} ${esc(s.name)}</h3><span class="count">${groups[s.id].length}</span></div>
          <div>${groups[s.id].map(goalManageRow).join('')}</div>
        </div>`
      )
      .join('');

    return `
      <div class="section-head"><h2>Goals</h2><button class="link" data-act="goal-new">＋ New goal</button></div>
      <div class="card" style="display:flex;gap:10px;align-items:center">
        <span style="font-size:22px">🎯</span>
        <div class="muted" style="font-size:var(--fs-md);flex:1">Each goal moves from where you are now to a target you set — and stops there.
          You step up by <b>performing</b>, never because a week passed.</div>
      </div>
      ${body || `<div class="empty">No goals yet.</div>`}
      ${
        archived.length
          ? `<div class="section-head"><h2>Paused</h2></div><div class="card flush">${archived.map(goalManageRow).join('')}</div>`
          : ''
      }
    `;
  }

  function renderPlan() {
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

    const total = dayOrder.reduce((n, d) => n + (S.get().plan[d] || []).length, 0);
    const active = dayOrder.filter((d) => (S.get().plan[d] || []).length).length;

    return `
      ${goalManageBlock()}

      <div class="section-head"><h2>Weekly plan</h2><span class="faint" style="font-size:var(--fs-sm)">${active} training days · ${total} exercises</span></div>
      <div class="card" style="display:flex;gap:10px;align-items:center">
        <span style="font-size:22px">🗓️</span>
        <div class="muted" style="font-size:var(--fs-md);flex:1">Set what you'll do on each weekday. Today's list shows up automatically on the Today tab, and changes never rewrite days you've already logged.</div>
      </div>
      ${days}
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

  /** One form, used inline on the Read tab and inside the sheet from Today. */
  function readingForm(dateKey) {
    const g = S.activeGoals().find((x) => x.gate === 'summary');
    const r = S.readingEntry(dateKey) || {};
    const done = g ? S.goalDone(dateKey, g.id) : !!(r.summary || '').trim();
    const target = g ? S.goalTargetOn(g.id, dateKey) : null;
    const mins = r.minutes != null ? r.minutes : target != null && g && g.unit === 'minutes' ? target : '';

    return `
      <div class="grid-2">
        <label class="field"><span>Book / source</span>
          <input type="text" id="r_book" maxlength="60" value="${esc(r.book || '')}" placeholder="Deep Work, ch. 3"></label>
        <label class="field"><span>Minutes read</span>
          <input type="number" id="r_min" min="0" max="600" value="${esc(mins)}"></label>
      </div>
      <label class="field"><span>Summary — ${esc(A.promptForDay(dateKey))}</span>
        <textarea id="r_summary" rows="6" placeholder="A few honest sentences in your own words…">${esc(r.summary || '')}</textarea></label>
      <p class="faint" style="font-size:var(--fs-sm);margin:-4px 0 12px">
        Writing it is what marks the day done — there is no separate tick. Any length counts;
        a real sentence beats a long one you didn't mean.
      </p>
      <div class="btn-row">
        <button class="btn primary" data-act="read-save" data-date="${dateKey}" style="flex:1">${done ? 'Update summary' : 'Save & complete'}</button>
        ${done ? `<button class="btn ghost danger" data-act="read-clear" data-date="${dateKey}">Clear</button>` : ''}
      </div>
      ${
        g && target != null
          ? `<p class="faint" style="font-size:var(--fs-sm);margin:10px 0 0">Today's reading target: <b>${esc(
              targetPhrase(g, target)
            )}</b>. Logging fewer minutes saves the summary but leaves the goal unmet.</p>`
          : ''
      }`;
  }

  function renderRead() {
    const k = S.today();
    const g = S.activeGoals().find((x) => x.gate === 'summary');
    const tl = g ? S.goalTimeline(g.id) : null;
    const past = S.readingDays().filter((d) => d !== k);
    const jDays = S.journalDays().filter((d) => d !== k);
    const j = S.journalEntry(k) || {};

    const summaryList = past.length
      ? past
          .slice(0, ARCHIVE_MAX)
          .map((d) => {
            const r = S.readingEntry(d);
            return `<details class="entry"><summary>
                <b>${esc(A.prettyDate(d))}</b>
                <span>${esc(r.book || 'Reading')}${r.minutes ? ' · ' + r.minutes + ' min' : ''}</span>
              </summary>
              <p>${esc(r.summary)}</p>
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
      <div class="section-head"><h2>Reading</h2>${
        tl ? `<span class="faint" style="font-size:var(--fs-sm)">🔥 ${tl.streak} · ${esc(advanceHint(g, tl))}</span>` : ''
      }</div>
      <div class="card">${
        g
          ? readingForm(k)
          : `<div class="empty"><span class="big">📖</span>No reading goal yet.<br>
             <button class="link" data-act="goal-new">Create one →</button></div>`
      }</div>

      <div class="section-head"><h2>Daily journal</h2><span class="faint" style="font-size:var(--fs-sm)">separate from your summaries</span></div>
      <div class="card">
        <div class="mood-row">${MOODS.map(
          (m, i) =>
            `<button type="button" class="mood ${j.mood === i ? 'on' : ''}" data-act="mood" data-i="${i}" data-date="${k}"
              aria-label="${esc(m.name)}" aria-pressed="${j.mood === i}">${m.icon}</button>`
        ).join('')}</div>
        <textarea id="dayNote" data-date="${k}" rows="5" placeholder="How did the day actually go?">${esc(j.text || '')}</textarea>
      </div>

      <div class="section-head"><h2>Past summaries</h2><span class="faint" style="font-size:var(--fs-sm)">${archiveCount(past.length)}</span></div>
      <div class="card">${summaryList}</div>

      <div class="section-head"><h2>Past journal</h2><span class="faint" style="font-size:var(--fs-sm)">${archiveCount(jDays.length)}</span></div>
      <div class="card">${journalList}</div>
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
      const w = S.weekStats(anchor);
      weeks.push(w);
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
      <div class="section-head"><h2>What you've actually done</h2><span class="faint" style="font-size:var(--fs-sm)">since ${esc(
        A.prettyDate(life.since)
      )}</span></div>
      <div class="card">
        <p class="lifeline">${lifeSentence(life)}</p>
        ${
          life.goals.length
            ? `<div class="lifegrid">${life.goals
                .slice(0, 6)
                .map(
                  (row) => `<div class="lifeitem">
                    <b>${esc(lifeAmount(row))}</b>
                    <span>${goalGlyph(row.goal)} ${esc(row.goal.name)}</span>
                  </div>`
                )
                .join('')}</div>`
            : `<div class="empty">Nothing logged yet. This fills up with what you actually did — not points.</div>`
        }
      </div>

      <div class="section-head"><h2>Streaks</h2></div>
      <div class="stat-grid">
        <div class="stat fire"><b>🔥 ${streak}</b><span>Current streak</span></div>
        <div class="stat fire"><b>${hist.best}</b><span>Best streak</span></div>
        <div class="stat good"><b>${hist.completeDays}</b><span>Days completed</span></div>
        <div class="stat"><b>${totalEx}</b><span>Exercises done</span></div>
      </div>

      <div class="section-head"><h2>Level</h2></div>
      <div class="card">
        <div class="xpbar-top"><span>${prog.rank.icon} ${esc(prog.rank.name)} · Level ${prog.level}</span><span>${prog.into}/${prog.need} XP</span></div>
        ${bar(prog.pct)}
        <div class="faint" style="font-size:var(--fs-sm);margin-top:8px">${prog.xp.toLocaleString()} XP earned all-time · ${(A.xpForLevel(prog.level + 1) - prog.xp).toLocaleString()} XP to level ${prog.level + 1}</div>
      </div>

      <div class="section-head"><h2>Goal ladders</h2><span class="faint" style="font-size:var(--fs-sm)">baseline → target</span></div>
      <div class="card">${
        S.activeGoals().length
          ? S.activeGoals()
              .map((g) => {
                const tl = S.goalTimeline(g.id);
                const pct = tl.maxLevel ? (tl.level / tl.maxLevel) * 100 : 100;
                return `<div class="ladder">
                  <div class="ladder-top">
                    <span>${goalGlyph(g)} <b>${esc(g.name)}</b></span>
                    <span class="faint">${esc(A.formatValue(g.unit, g.baseline))} → <b>${esc(
                  A.formatValue(g.unit, tl.target)
                )}</b> → ${esc(A.formatValue(g.unit, g.target))}</span>
                  </div>
                  ${bar(pct, tl.atTarget ? 'gold' : '')}
                  <div class="faint" style="font-size:var(--fs-xs);margin-top:5px">${esc(advanceHint(g, tl))} · 🔥 ${tl.streak} · ${
                  tl.doneDays
                }/${tl.scheduledDays} days kept</div>
                </div>`;
              })
              .join('')
          : `<div class="empty">No goals yet.</div>`
      }</div>

      <div class="section-head"><h2>Last 18 weeks</h2></div>
      <div class="card">
        <div class="heat">${cells}</div>
        <div class="legend">
          <span><b style="background:var(--good)"></b>Complete</span>
          <span><b style="background:color-mix(in srgb,var(--warn) 45%,transparent)"></b>Partial</span>
          <span><b style="background:color-mix(in srgb,var(--accent-2) 14%,transparent)"></b>Rest</span>
          <span><b style="background:color-mix(in srgb,var(--bad) 22%,transparent)"></b>Missed</span>
          <span><b style="background:var(--surface-2)"></b>Not yet</span>
        </div>
      </div>

      <div class="section-head"><h2>Weekly goal history</h2><span class="faint" style="font-size:var(--fs-sm)">goal ${S.settings().goalPerWeek}/wk</span></div>
      <div class="card"><div class="bars">${bars}</div></div>

      <div class="section-head"><h2>Training mix · 30 days</h2></div>
      <div class="card">${mixRows}</div>
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
   */
  function myRewards() {
    const list = S.customRewards();
    if (!list.length) {
      return `<div class="empty"><span class="big">🎁</span>
        Promise yourself something. Fourteen days of workouts, then the sneakers.<br>
        <button class="link" data-act="reward-new">Set one up →</button></div>`;
    }
    return list
      .map((r) => {
        const p = S.customRewardProgress(r);
        return `<article class="myreward ${p.claimed ? 'is-claimed' : ''} ${p.unlocked ? 'is-ready' : ''}">
          <button type="button" class="myreward-open" data-act="reward-edit" data-id="${r.id}">
            <span class="myreward-icon" aria-hidden="true">${esc(r.icon || '🎁')}</span>
            <span class="myreward-body">
              <span class="myreward-name">${esc(r.name)}</span>
              <span class="myreward-trig">${esc(rewardTrigger(r))}</span>
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
              ? `<button class="btn ${p.claimed ? 'ghost' : 'primary'} block" data-act="reward-claim" data-id="${r.id}"
                   style="margin-top:10px">${p.claimed ? 'Collected — undo' : '🎉 I bought it'}</button>`
              : ''
          }
        </article>`;
      })
      .join('');
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

  function renderRewards() {
    const list = S.rewards();
    const next = S.nextMilestone();
    const streak = S.currentStreak();
    const best = S.history().best;
    const wk = S.weekStats();
    const claimable = list.filter((r) => r.unlocked && !r.claimed).length;

    const nextCard = next
      ? `<section class="next-reward">
          <div class="top">
            <span class="medal">${next.icon}</span>
            <div><h3>Next: ${esc(next.name)}</h3><p>${esc(next.blurb)}</p></div>
          </div>
          <div class="xpbar-top"><span>${best} / ${next.days} days</span><span>${next.days - best} to go · +${next.xp} XP</span></div>
          ${bar((best / next.days) * 100, 'gold')}
        </section>`
      : `<section class="next-reward"><div class="top"><span class="medal">🌟</span>
          <div><h3>Every milestone unlocked</h3><p>You've cleared the whole ladder. Legend.</p></div></div></section>`;

    const grid = list
      .map(
        (r) => `<div class="reward ${r.unlocked ? 'unlocked' : ''} ${r.claimed ? 'claimed' : ''}">
          <span class="medal">${r.icon}</span>
          <h4>${esc(r.name)}</h4>
          <div class="days">${r.days} DAY STREAK</div>
          ${
            r.unlocked
              ? r.claimed
                ? `<div class="pill good" style="margin-top:10px">+${r.xp} XP</div>`
                : `<button class="btn primary claim" data-act="claim" data-id="${r.id}">Claim +${r.xp} XP</button>`
              : `<div class="mini-bar">${bar(r.progress, 'gold')}</div>`
          }
        </div>`
      )
      .join('');

    return `
      <div class="section-head"><h2>Your rewards</h2><button class="link" data-act="reward-new">＋ New reward</button></div>
      ${myRewards()}

      <div class="section-head"><h2>Milestones</h2>${claimable ? `<span class="pill good">${claimable} ready</span>` : ''}</div>
      ${nextCard}

      <div class="card">
        <div class="xpbar-top"><span>🎁 Weekly chest · ${wk.complete}/${wk.goal} days</span><span>${wk.claimed ? 'Claimed' : wk.hit ? 'Ready!' : `${wk.goal - wk.complete} to go`}</span></div>
        ${bar(wk.pct, 'gold')}
        ${wk.hit && !wk.claimed ? `<button class="btn primary block" data-act="claim-weekly" style="margin-top:12px">Open chest · +${A.XP.weeklyGoal} XP</button>` : ''}
      </div>

      <div class="section-head"><h2>Streak milestones</h2><span class="faint" style="font-size:var(--fs-sm)">🔥 ${streak} now · best ${best}</span></div>
      <div class="reward-grid">${grid}</div>
    `;
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
              <button class="icon-btn" data-act="habit-rm" data-id="${h.id}" aria-label="Delete">✕</button>
            </div>`
          )
          .join('')
      : `<div class="empty">No habits yet.</div>`;

    const fz = S.freezeStats();
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
      <!-- Rewards left the tab bar for this row: it is the one screen you open
           after the fact rather than to do something, and the four daily screens
           are worth more thumb than it is. -->
      <button type="button" class="more-rewards" data-nav="rewards">
        ${icon('trophy')}<b>Rewards</b><i aria-hidden="true">›</i>
      </button>

      <button type="button" class="more-rewards" data-nav="run">
        ${icon('sun')}<b>The 66-day run</b><i aria-hidden="true">›</i>
      </button>

      <div class="section-head"><h2>Difficulty</h2></div>
      <div class="mode-grid">${modeCards}</div>
      <p class="faint" style="font-size:var(--fs-sm);margin:2px 4px 0">
        Difficulty changes how <b>big</b> each step is, never how you earn one — you always advance by
        performing. Switching re-scores your record at the new step size: nothing is wiped, days you
        already completed stay completed, but the next ask can jump. Individual goals can override this.
      </p>

      <div class="section-head"><h2>Streak rules</h2></div>
      <div class="card">
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
          <div class="body"><div class="name">Streak freezes</div><div class="sub">One earned per 10 completed days · ${fz.used} used of ${fz.earned} earned</div></div>
          <span class="pill ${fz.available ? 'good' : ''}">❄️ ${fz.available}</span>
        </div>
      </div>

      <div class="section-head"><h2>Profile</h2></div>
      <div class="card">
        <label class="field"><span>Display name</span>
          <input type="text" data-set="name" value="${esc(s.name)}" maxlength="24"></label>
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
        <div class="row">
          <div class="body"><div class="name">Rest days keep the streak</div><div class="sub">Days with nothing scheduled don't break it</div></div>
          <label class="switch"><input type="checkbox" data-set="restCountsAsStreak" ${s.restCountsAsStreak ? 'checked' : ''}><i></i></label>
        </div>
      </div>

      <div class="section-head"><h2>Daily habits</h2><button class="link" data-act="habit-add">＋ Add</button></div>
      <div class="card">${habitRows}</div>

      <div class="section-head"><h2>Exercise library</h2><button class="link" data-act="lib-add">＋ New</button></div>
      <div class="card">${libRows}</div>

      <div class="section-head"><h2>Reminders</h2></div>
      <div class="card">
        <div class="row">
          <div class="body"><div class="name">Nudge me while the app is open</div><div class="sub">A browser notification when a goal is still unlogged</div></div>
          <label class="switch"><input type="checkbox" data-set="reminders" ${s.reminders ? 'checked' : ''}><i></i></label>
        </div>
        <p class="faint" style="font-size:var(--fs-sm);margin:10px 2px 0">
          Being straight with you: a web app <b>cannot</b> be an alarm clock. Browsers don't run timers in
          the background, and iOS only delivers web notifications to a home-screen install, unreliably.
          Discipline <b>tracks</b> your wake-up; it can't wake you. Keep using your phone's alarm for that.
        </p>
      </div>

      <div class="section-head"><h2>The run</h2></div>
      <div class="card">
        <div class="row">
          <div class="body"><div class="name">${S.activeChallenge() ? esc(S.activeChallenge().name) : 'No run in progress'}</div>
            <div class="sub">${
              S.activeChallenge()
                ? `Day ${S.challengeProgress().day} of ${S.challengeProgress().days} · ${S.challengeProgress().kept} kept`
                : 'Count against a fixed length — 66 days, or whatever you choose'
            }</div></div>
          <button class="btn" data-act="challenge-open">${S.activeChallenge() ? 'Open' : 'Start'}</button>
        </div>
      </div>

      <div class="section-head"><h2>App</h2></div>
      <div class="card">
        <div class="row">
          <div class="body"><div class="name">Set your starting point</div><div class="sub">Re-run the baseline questions</div></div>
          <button class="btn" data-act="onboard">Open</button>
        </div>
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
      <p class="faint" style="text-align:center;font-size:var(--fs-xs);margin:18px 0 0">Discipline · offline-first PWA · your data never leaves this device</p>
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
        <input type="text" id="pickerQ" placeholder="Search exercises…" value="${esc(picker.q)}" autocomplete="off">
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
  function openExerciseHow(exerciseId, item) {
    const ex = S.exerciseById(exerciseId);
    if (!ex) return;
    const lines = String(ex.how || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const prescription = item ? dose(item, ex) : dose({}, ex);

    // Plain text: the sheet title goes in through `textContent`, so an inline
    // SVG would arrive as literal markup. The name alone is enough here.
    openSheet(ex.name, `
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
    openSheet(`Re-baseline ${g.name}`, `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">Move the starting point to where you actually
      are today. The target stays at <b>${esc(A.formatValue(g.unit, g.target))}</b>; the ladder is rebuilt
      from the new start and today becomes day one.</p>
      <p class="faint" style="font-size:var(--fs-sm);margin:0 0 12px">Current start: <b>${esc(
        A.formatValue(g.unit, g.baseline)
      )}</b> · asking for <b>${esc(A.formatValue(g.unit, S.goalTarget(goalId)))}</b> right now.</p>
      ${valueInput('g_base', g.unit, S.goalTarget(goalId), 'New starting point')}
      <div class="btn-row">
        <button class="btn primary" data-act="goal-restart-save" data-id="${goalId}" style="flex:1">Re-baseline</button>
        <button class="btn ghost" data-act="sheet-close">Cancel</button>
      </div>
    `);
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
      </div>`
      }
      <div class="btn-row" style="margin-top:${S.isFuture(key) ? 14 : 8}px">
        <button class="btn" data-act="goal-edit" data-id="${goalId}" style="flex:1">Edit goal</button>
        <button class="btn ghost" data-act="goal-restart" data-id="${goalId}">Re-baseline</button>
      </div>
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

      <div class="btn-row"><button class="btn primary block" data-act="goal-save" data-id="${g ? g.id : ''}">${
      g ? 'Save changes' : 'Create goal'
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
           ${p.complete ? 'Finish and archive' : 'End this run early'}
         </button>`
      : `<p class="muted" style="margin-top:0;font-size:var(--fs-md)">Give yourself a fixed run to count against.
           The counter on Today becomes <b>DAY 5 / 66</b>, and it counts the days you keep — not just the
           days that pass.</p>
         <label class="field"><span>Call it</span>
           <input type="text" id="ch_name" maxlength="32" value="Reset" placeholder="Reset"></label>
         <label class="field"><span>How long</span><select id="ch_days">
           ${CHALLENGE_LENGTHS.map((d) => `<option value="${d}" ${d === 66 ? 'selected' : ''}>${d} days</option>`).join('')}
         </select></label>
         <div class="btn-row"><button class="btn primary block" data-act="challenge-start">Start the run</button></div>`;

    openSheet(c ? c.name : 'Start a run', `
      ${body}
      ${
        past.length
          ? `<div class="section-head" style="margin-top:18px"><h2>Finished runs</h2></div>
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

  function openOnboarding() {
    const s = S.settings();
    const wake = S.activeGoals().find((g) => g.section === 'sleep' && g.direction === 'down' && g.unit === 'time');
    const bed = S.activeGoals().find((g) => g.section === 'sleep' && g !== wake);
    openSheet('Where are you starting?', `
      <p class="muted" style="margin-top:0;font-size:var(--fs-md)">
        The fastest way to fail is to start week one at someone else's number. Put in what is
        <b>true today</b> — the app moves you from there.
      </p>
      <label class="field"><span>What should we call you?</span>
        <input type="text" id="ob_name" maxlength="24" value="${esc(s.name)}"></label>
      ${wake ? `<div class="grid-2">
        ${valueInput('ob_wake_now', 'time', wake.baseline, 'You wake up now at')}
        ${valueInput('ob_wake_goal', 'time', wake.target, 'You want to wake at')}
      </div>` : ''}
      ${bed ? `<div class="grid-2">
        ${valueInput('ob_bed_now', 'time', bed.baseline, 'You go to bed now at')}
        ${valueInput('ob_bed_goal', 'time', bed.target, 'You want lights out at')}
      </div>` : ''}
      <label class="field"><span>Day rolls over at</span><select id="ob_boundary">
        ${[0, 1, 2, 3, 4, 5, 6].map((h) => `<option value="${h}" ${s.dayBoundaryHour === h ? 'selected' : ''}>${A.prettyTime(h * 60)}</option>`).join('')}
      </select></label>
      <div class="section-head" style="margin-top:2px"><h2>Pace</h2></div>
      <div class="mode-grid">${A.MODE_IDS.map((id) => {
        const m = A.MODES[id];
        return `<label class="mode-card ${s.mode === id ? 'on' : ''}">
          <input type="radio" name="ob_mode" value="${id}" ${s.mode === id ? 'checked' : ''} hidden>
          <span class="mode-glyph">${m.icon}</span><b>${esc(m.name)}</b><small>${esc(m.blurb)}</small></label>`;
      }).join('')}</div>
      <div class="btn-row"><button class="btn primary block" data-act="onboard-save">Start</button></div>
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

    return `<div class="runrow ${done ? 'is-done' : ''} ${measured && !done ? 'is-part' : ''}">
      <button type="button" class="runrow-tick" data-act="run-tick" data-id="${esc(row.id)}"
        aria-label="${done ? 'Undo' : 'Complete'} ${esc(row.name)}">✓</button>
      <button type="button" class="runrow-main" data-act="run-value" data-id="${esc(row.id)}">
        <span class="name">${esc(row.name)}</span>
        <span class="sub">${esc(runAsk(row, entry))}${
          measured ? ' · ' + esc(String(entry.did)) + ' done' : ''
        }${marks.length ? ' · ' + esc(marks.join(', ')) : ''}</span>
        ${frac != null ? `<span class="runrow-bar"><i style="width:${Math.round(frac * 100)}%"></i></span>` : ''}
      </button>
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
      <div class="section-head"><h2>The run · day ${day} of ${RUN().RUN_DAYS}</h2>
        <button class="link" data-nav="run">The whole run</button></div>
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

  function currentRunPicks() {
    if (!runPicks) runPicks = A.Run.DEFAULT_PICKS.slice();
    return runPicks.slice();
  }

  function toggleRunPick(id) {
    if (!A.Run.isKnown(id)) return;
    const list = currentRunPicks();
    const at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1);
    else list.push(id);
    runPicks = list;
  }

  /** Forget the selection once it has become a run, so the next one starts fresh. */
  function resetRunPicks() { runPicks = null; }

  function pickCard(h, chosen) {
    const ask = A.formatValue('count', h.start) + ' → ' + A.formatValue('count', h.target) + ' ' + h.unit;
    return `<button type="button" class="pick ${chosen ? 'on' : ''}" data-act="run-pick"
        data-id="${esc(h.id)}" aria-pressed="${chosen}">
      <b>${esc(h.name)}</b>
      <small>${esc(h.target === h.start ? A.formatValue('count', h.start) + ' ' + h.unit + ', every day' : ask)}</small>
      <i class="pick-effort" aria-label="effort ${h.friction} of 5">${'•'.repeat(h.friction)}</i>
    </button>`;
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
         goals, so the screen says what it costs before what it gives. */
      return `
        <div class="section-head"><h2>The 66-day run</h2></div>
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

        <p class="faint pickhint">Pick what you want in it. Anything that will not
          fit your minutes is dropped when the run is built, and you will be told
          what went — every one of the 66 days has to be a day you can actually do.
          Fewer than ${A.Run.MIN_HABITS} and the rest is filled in for you.</p>
        ${runPicker()}
        <button class="btn primary block" data-act="run-start" style="margin-top:14px">Start the run · ${
          currentRunPicks().length
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
        <div class="section-head"><h2>The run is over</h2></div>
        <section class="hero"><div class="hero-stats">
          <div class="hero-stat"><b>${RUN().RUN_DAYS}</b><span>days</span></div>
          <div class="hero-stat"><b>${kept}</b><span>kept in full</span></div>
          <div class="hero-stat"><b>${run.habits.length}</b><span>habits</span></div>
        </div></section>
        <p class="faint" style="margin:12px 4px">It finished ${st.daysOver} day${
        st.daysOver === 1 ? '' : 's'
      } ago. Nothing here is asked of you any more.</p>
        <button class="btn ghost block" data-act="run-end">Clear it and start again</button>`;
    }

    if (st.state === 'not_started') {
      return `<div class="section-head"><h2>The 66-day run</h2></div>
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
    const upcoming = (run.habits || [])
      .filter((p) => p.startDay > day && RUN().isKnown(p.habitId))
      .sort((a, b) => a.startDay - b.startDay);
    const eased = check.notes.filter((n) => n.indexOf('softened') === 0 || n.indexOf('froze') === 0);

    return `
      <section class="dayline">
        <div>
          <h1 class="daynum">DAY <b>${day}</b><i>/ ${RUN().RUN_DAYS}</i></h1>
          <div class="daydate">${esc(ph.name)} · ${run.minutesBudget} min a day · ${kept} kept in full</div>
        </div>
      </section>

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

      <div class="section-head"><h2>Today</h2></div>
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

      <div class="section-head"><h2>Still to come</h2></div>
      ${
        upcoming.length
          ? `<div class="list">${upcoming
              .map((p) => {
                const h = RUN().habit(p.habitId);
                return `<div class="row"><div class="body">
                  <div class="name">${esc(h.name)}</div>
                  <div class="sub">starts day ${p.startDay} · ${esc(
                  A.formatValue('count', h.start)
                )} → ${esc(A.formatValue('count', h.target))} ${esc(h.unit)}</div></div></div>`;
              })
              .join('')}</div>`
          : `<div class="empty">Everything in this run has started.</div>`
      }

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
  function openRunValue(habitId) {
    const run = S.run();
    const day = S.runToday();
    if (!run || day == null) return;
    const h = A.Run.habit(habitId);
    const entry = ((run.log || {})[day] || {})[habitId];
    if (!h) return;
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
    $('#streakChip').innerHTML = `${icon('flame')}<b>${S.currentStreak()}</b>`;
    $('#keptChip').innerHTML = `${icon('check')}<b>${S.history().completeDays}</b>`;
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
  UI.setViewDate = (k) => { viewDate = k; };
  UI.openReading = openReading;
  UI.openGoalLog = openGoalLog;
  UI.openRunValue = openRunValue;
  UI.runPicks = currentRunPicks;
  UI.toggleRunPick = toggleRunPick;
  UI.resetRunPicks = resetRunPicks;
  UI.openGoalDetail = openGoalDetail;
  UI.openGoalEditor = openGoalEditor;
  UI.openGoalRestart = openGoalRestart;
  UI.openExerciseHow = openExerciseHow;
  UI.openConfirm = openConfirm;
  UI.resolveConfirm = resolveConfirm;
  UI.openTextPrompt = openTextPrompt;
  UI.resolveTextPrompt = resolveTextPrompt;
  UI.openOnboarding = openOnboarding;
  UI.openRewardEditor = openRewardEditor;
  UI.openChallenge = openChallenge;
  UI.readingForm = readingForm;
  UI.openPicker = openPicker;
  UI.refreshPicker = refreshPicker;
  UI.openPlanEditor = openPlanEditor;
  UI.openExerciseEditor = openExerciseEditor;
  UI.openCopyDay = openCopyDay;
  UI.openSheet = openSheet;
  UI.todayFilter = () => todayFilter;
  UI.setTodayFilter = (f) => {
    todayFilter = f === 'done' || f === 'skipped' ? f : 'todo';
  };
  UI.picker = () => picker;
  UI.setPicker = (p) => Object.assign(picker, p);
  UI.esc = esc; // toasts built outside this module must escape user text with the same rule
})(window);
