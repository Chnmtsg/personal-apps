/* Discipline — wiring: events, celebrations, install prompt, service worker. */
(function (root) {
  'use strict';

  const A = root.Arise;
  const S = root.Store;
  const UI = root.UI;

  const $ = (s) => document.querySelector(s);
  const esc = UI.esc;
  let deferredInstall = null;

  /* ---------- celebrate what was actually earned ----------

     What used to be here diffed levels, XP, ranks and an eleven-medal ladder —
     every one of them a number the app invented about itself. All that survives
     is the two things that are facts: a streak that grew, and a promise the
     user made to themselves that has now come due. */

  function snapshot() {
    return {
      streak: S.currentStreak(),
      ready: S.customRewards().filter((r) => S.customRewardProgress(r).unlocked).length
    };
  }

  function celebrate(before) {
    const after = snapshot();
    if (after.ready > before.ready) {
      UI.toast('<span>A reward is earned — collect it in Rewards.</span>', 'gold');
      UI.confetti();
      return;
    }
    if (after.streak > before.streak && after.streak > 1) {
      UI.toast(`<span><b>${after.streak}</b> day streak</span>`);
    }
  }

  /* ---------- undo, for the actions that destroy something ----------

     One slot, because one toast is on screen at a time and it lives five
     seconds. Holding a stack would be pretending we keep a history we do not.

     The toast can only carry strings through `data-` attributes, so the thing
     that actually puts the state back lives here and the toast carries a token
     for it. Taking the undo clears the slot, so a stale toast cannot fire a
     restore a second time and overwrite work done since. */
  let pendingUndo = null;
  let undoSeq = 0;

  /**
   * Offer an undo, and make sure the button that appears belongs to it.
   *
   * Toasts STACK — `toast()` appends and an action toast lives five seconds — so
   * two of these inside five seconds put two UNDO buttons on screen against one
   * slot. Tapping the older one ran the newer restore: remove extra A, remove
   * extra B, tap "Removed A." and B came back while A stayed gone. It crossed
   * action types too.
   *
   * The token rides the `data-id` channel `toastAction` already serialises, so
   * a button only fires the restore it was created for. Any earlier action toast
   * is dismissed as well, because one slot only ever made sense with one button.
   */
  function offerUndo(msg, restore) {
    const id = 'u' + ++undoSeq;
    pendingUndo = { id: id, restore: restore };
    UI.dismissActionToasts();
    UI.toastAction(msg, { act: 'undo-last', id: id });
  }

  /** Run a mutation, then diff for anything worth celebrating. */
  function act(fn) {
    const before = snapshot();
    const out = fn();
    celebrate(before);
    return out;
  }

  /** A short buzz, where the device has one. Completion only, never undo. */
  function buzz(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (err) {
      /* a device that refuses to vibrate is not a failure worth reporting */
    }
  }

  /* ---------- the rest timer ----------

     `js/ui.js` owns the rest itself and paints it a field at a time; this owns
     the heartbeat, because an interval is an event and events live here.

     It runs only while a rest is running and stops itself the moment there is
     none, so an idle app has one 30-second interval and nothing else. Twice a
     second rather than once: a clock that ticks on a 1000ms interval visibly
     skips a second whenever the browser throttles it, and half a second of
     wasted work is cheaper than a countdown that reads 2:00, 1:58.

     Everything is derived from `Date.now()` and not from a count of ticks, so a
     backgrounded tab that stops being serviced comes back with the right number
     rather than one that is however many ticks behind. */

  let restTicker = null;

  function armRest() {
    if (restTicker != null) return;
    restTicker = setInterval(() => {
      if (!UI.rest()) {
        clearInterval(restTicker);
        restTicker = null;
        return;
      }
      // True exactly once, on the tick it runs out.
      if (UI.paintRest()) buzz(30);
    }, 500);
  }

  /* ---------- reading a set out of the row ----------

     The inputs are rebuilt on every render, so they are addressed by the id the
     view stamps on them rather than held onto. A blank weight is `null` and not
     zero: a bodyweight set is a real answer, and zero would put it into the
     volume total as a zero-kilo barbell. */

  function readSet(itemId) {
    const w = document.getElementById('w_' + itemId);
    const r = document.getElementById('r_' + itemId);
    const raw = w ? String(w.value).trim() : '';
    const weight = raw === '' ? null : parseFloat(raw);
    return {
      weight: weight == null || isNaN(weight) ? null : weight,
      reps: Math.max(0, Math.round(parseFloat(r ? r.value : 0) || 0))
    };
  }

  /* ---------- helpers ---------- */

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Ask for an image from the device.
   *
   * No `capture` attribute: that forces the camera on a phone, and the pictures
   * people want here are ones they already have — saved from a search, cropped
   * out of a book. Leaving it off offers the library and the camera both.
   */
  function pickImage(onFile) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => onFile(input.files && input.files[0]);
    input.click();
  }

  function pickFile(onText) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => onText(String(reader.result));
      reader.readAsText(f);
    };
    input.click();
  }

  const numVal = (id, fallback) => {
    const el = document.getElementById(id);
    const n = el ? parseFloat(el.value) : NaN;
    return isNaN(n) ? fallback : n;
  };

  /** Read the reward editor sheet. */
  function readRewardForm() {
    return {
      name: $('#rw_name').value.trim(),
      // A reward keeps a glyph the user typed; it just no longer gets a stock one.
      icon: ($('#rw_icon') && $('#rw_icon').value.trim()) || '',
      days: Math.max(1, Math.min(999, parseInt($('#rw_days').value, 10) || 14))
    };
  }

  /** Read the exercise editor sheet into a plain exercise patch. Shared with the
      unit selector, which rebuilds the sheet rather than throwing away what has
      already been typed. */
  function readExerciseForm(existing) {
    const unit = $('#e_unit').value;
    const aVal = numVal('e_a', 3);
    const reps = unit === 'reps' ? numVal('e_b', 10) : undefined;
    const maxEl = $('#e_max');
    const rawMax = maxEl && maxEl.value.trim() !== '' ? parseFloat(maxEl.value) : NaN;
    const howEl = $('#e_how');
    const data = {
      name: $('#e_name').value.trim() || 'Untitled',
      // Same as the goal editor: the control is gone, the stored value stays.
      icon: (existing && existing.icon) || '',
      category: $('#e_cat').value,
      unit: unit,
      sets: unit === 'reps' ? aVal : undefined,
      reps: reps,
      // An upper end below the lower one is not a range; drop it rather than
      // render "4 × 12–8".
      repsMax: unit === 'reps' && !isNaN(rawMax) && rawMax > reps ? rawMax : null,
      minutes: unit === 'time' ? aVal : undefined,
      km: unit === 'distance' ? aVal : undefined,
      how: howEl ? howEl.value.trim() : undefined,
      /* Read off the chips that are actually on, so an untagged exercise saves
         as an empty list rather than as "leave it alone" — clearing every
         muscle has to be something the user can do. */
      muscles: Array.from(document.querySelectorAll('[data-act="ex-muscle"][aria-pressed="true"]'))
        .map((el) => el.dataset.muscle)
    };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    return data;
  }

  /* ---------- click routing ---------- */

  document.addEventListener('click', (ev) => {
    const navEl = ev.target.closest('[data-nav]');
    const actEl = ev.target.closest('[data-act]');

    if (navEl && !actEl) {
      UI.go(navEl.dataset.nav);
      return;
    }
    if (!actEl) return;

    const a = actEl.dataset.act;
    const id = actEl.dataset.id;
    const day = actEl.dataset.day != null ? Number(actEl.dataset.day) : null;
    const date = UI.viewDate();

    const sheetDate = actEl.dataset.date || date;

    switch (a) {
      /* --- goals --- */
      case 'freeze':
        if (S.applyFreeze(sheetDate)) UI.toast('<span>Freeze applied — streak held</span>', 'gold');
        else UI.toast('<span>No freezes available yet</span>');
        break;
      case 'unfreeze':
        S.clearFreeze(sheetDate);
        break;
      case 'clock-ack':
        S.acknowledgeClock();
        break;
      case 'clear-day':
        UI.openConfirm({
          title: 'Clear this day?',
          body: `Every tick and every set logged for ${A.prettyDate(date)} is removed. Your streak is recalculated from what is left.`,
          confirmLabel: 'Clear day',
          danger: true,
          onConfirm: () => {
            /* Both halves come back together or the undo would restore a day
               that says three sets were lifted and none were done. */
            const before = S.clearDay(date);
            if (before) offerUndo('<span>Day cleared.</span>', () => S.restoreExercises(date, before));
          }
        });
        break;
      case 'add-extra': {
        const input = $('#extraInput');
        if (input && input.value.trim()) act(() => S.addExtra(date, input.value));
        break;
      }
      case 'rm-extra': {
        const wasExtras = ((S.log(date) || {}).extra || []).map((x) => Object.assign({}, x));
        const gone = wasExtras.filter((x) => x.id === id)[0];
        S.removeExtra(date, id);
        offerUndo('<span>Removed <b>' + esc(gone ? gone.name : 'it') + '</b>.</span>',
                  () => S.restoreExtras(date, wasExtras));
        break;
      }
      case 'date-prev':
        UI.setViewDate(A.addDays(date, -1));
        UI.render();
        break;
      case 'date-next':
        UI.setViewDate(A.addDays(date, 1));
        UI.render();
        break;
      /* The seven-day rail. `sheetDate`, not `date` — `date` is the day already
         being viewed, so using it here would make every cell a no-op. The cell
         carries the day it opens in its own data-date, which is the only thing
         that can be right for a control whose whole job is to change the view
         date. Which days are offered is the rail's decision; a disabled cell
         fires nothing. */
      case 'date-set':
        UI.setViewDate(sheetDate);
        UI.render();
        break;
      case 'date-today':
        // The logical day, not the calendar date. Inside the grace window the
        // calendar date is already tomorrow, so A.key() would send "Back to today"
        // to a read-only future day and leave the button on screen.
        UI.setViewDate(S.today());
        UI.render();
        break;
      case 'go-plan':
        UI.go('plan', { day: day });
        break;

      /* --- rewards --- */
      case 'reward-new':
        UI.openRewardEditor(null);
        break;
      case 'reward-edit':
        UI.openRewardEditor(id);
        break;
      case 'reward-save': {
        const data = readRewardForm();
        data.name = data.name || 'My reward';
        if (data.source === 'goal' && !data.goalId) {
          UI.toast('<span>Create a goal first, then tie a reward to it</span>');
          break;
        }
        if (actEl.dataset.id) S.updateCustomReward(actEl.dataset.id, data);
        else S.addCustomReward(data);
        UI.closeSheet();
        UI.toast('<span>Reward set — now go earn it</span>');
        break;
      }
      case 'reward-claim':
        if (S.claimCustomReward(id)) {
          /* No confetti. You bought yourself the thing; the app did not, and
              noticing that does not earn a celebration — project.md is explicit. */
          UI.toast('<span>Earned and collected. Enjoy it.</span>', 'gold');
        }
        break;
      case 'reward-delete': {
        const rw = S.customRewards().find((x) => x.id === id);
        if (!rw) break;
        UI.openConfirm({
          title: `Delete ${rw.name}?`,
          body: 'The reward and the progress you have made toward it are removed.',
          confirmLabel: 'Delete reward',
          danger: true,
          onConfirm: () => S.removeCustomReward(id),
          onCancel: () => UI.openRewardEditor(id)
        });
        break;
      }
      case 'plan-add':
        UI.openPicker(day);
        break;
      case 'plan-edit':
        UI.openPlanEditor(day, id);
        break;
      case 'plan-rm': {
        /* It carries the sets, reps and note the user configured, and the row
           beside it (`plan-clear`) is confirmed while this one was not. */
        const wasPlan = (S.get().plan[day] || []).map((i) => Object.assign({}, i));
        S.removePlanItem(day, id);
        UI.closeSheet();
        offerUndo('<span>Removed from ' + esc(A.DAY_NAMES[day]) + '.</span>',
                  () => S.restorePlanDay(day, wasPlan));
        break;
      }
      case 'plan-move':
        S.movePlanItem(day, id, Number(actEl.dataset.delta));
        break;
      case 'plan-clear':
        UI.openConfirm({
          title: `Clear ${A.DAY_NAMES[day]}?`,
          body: 'Removes every exercise from that day of your weekly template. Days you have already logged keep what they froze.',
          confirmLabel: 'Clear day',
          danger: true,
          onConfirm: () => S.clearDayPlan(day)
        });
        break;
      case 'plan-copy':
        UI.openCopyDay(day);
        break;
      /* The one route by which a NEW built-in programme reaches an account that
         already installed the old one. It has to be a tap rather than a
         migration: `installProgram` replaces the weekly plan, and doing that to
         somebody silently on an update would throw away a week they built by
         hand. So the sheet says exactly what goes and exactly what stays. */
      case 'program-install': {
        const ctxId = actEl.dataset.context || 'site';
        const ctx = (A.PROGRAM_CONTEXTS || []).find((c) => c.id === ctxId);
        UI.openConfirm({
          title: 'Install ' + (ctx ? ctx.name.toLowerCase() : 'the programme') + '?',
          body: 'The seven days of your weekly plan are replaced by the built-in dumbbell programme — ' +
                'Upper A, Lower A, Upper B, Lower B, the daily mobility, and their warm-ups and stretches. ' +
                'Anything you have arranged in the weekly plan yourself is overwritten. ' +
                'Your exercise library is not touched, nothing is deleted from it, and no day you have ' +
                'already logged changes — every logged day froze its own exercise list when you opened it.',
          confirmLabel: 'Install it',
          onConfirm: () => {
            S.reinstallProgram(ctxId);
            UI.toast('<span>' + esc(ctx ? ctx.name : 'The programme') +
                     ' is installed across the week.</span>');
          }
        });
        break;
      }
      case 'plan-copy-from': {
        const fromDay = Number(actEl.dataset.from);
        const copy = () => {
          S.copyDayPlan(fromDay, day);
          UI.closeSheet();
          UI.toast('<span>Day copied</span>');
        };
        const existing = (S.get().plan[day] || []).length;
        // Replacing a day you configured is as destructive as clearing it, and
        // clearing is confirmed. This was the last unprotected one.
        if (!existing) {
          copy();
          break;
        }
        UI.openConfirm({
          title: `Replace ${A.DAY_NAMES[day]}?`,
          body: `${A.DAY_NAMES[day]} has ${existing} exercise${existing === 1 ? '' : 's'} on it. Copying ${A.DAY_NAMES[fromDay]} over the top replaces them. Days you have already logged keep what they froze.`,
          confirmLabel: 'Replace day',
          danger: true,
          onConfirm: copy,
          onCancel: () => UI.openCopyDay(day)
        });
        break;
      }
      case 'plan-save': {
        const ex = S.exerciseById((S.get().plan[day].find((i) => i.id === id) || {}).exerciseId) || {};
        const patch = { note: ($('#f_note') && $('#f_note').value.trim()) || '' };
        if (ex.unit === 'time') patch.minutes = numVal('f_minutes', 10);
        else if (ex.unit === 'distance') patch.km = numVal('f_km', 3);
        else {
          patch.sets = numVal('f_sets', 3);
          patch.reps = numVal('f_reps', 10);
        }
        S.updatePlanItem(day, id, patch);
        UI.closeSheet();
        break;
      }

      /* --- picker --- */
      case 'pick-cat':
        UI.setPicker({ cat: actEl.dataset.cat });
        UI.refreshPicker();
        break;
      case 'pick-ex': {
        const p = UI.picker();
        S.addToPlan(p.day, id);
        const ex = S.exerciseById(id);
        UI.toast(`<span>${esc(ex.name)} → ${A.DAY_NAMES[p.day]}</span>`);
        break;
      }
      case 'sheet-close':
        UI.closeSheet();
        break;
      case 'confirm-yes':
        UI.resolveConfirm(true);
        break;
      case 'confirm-no':
        UI.resolveConfirm(false);
        break;
      case 'text-prompt-save':
        UI.resolveTextPrompt();
        break;

      /* --- library & habits --- */
      case 'lib-add':
        UI.openExerciseEditor(null);
        break;
      case 'ex-how': {
        const itemId = actEl.dataset.item;
        const item = itemId ? S.dayPlan(date).find((i) => i.id === itemId) : null;
        UI.openExerciseHow(id, item);
        break;
      }
      case 'lib-edit':
        UI.openExerciseEditor(id);
        break;
      case 'lib-rm': {
        const ex = S.exerciseById(id);
        if (!ex) break;
        UI.openConfirm({
          title: `Delete ${ex.name}?`,
          body: 'It is removed from your weekly plan too.',
          confirmLabel: 'Delete exercise',
          danger: true,
          onConfirm: () => S.removeExercise(id)
        });
        break;
      }
      case 'lib-save': {
        const data = readExerciseForm(actEl.dataset.id ? S.exerciseById(actEl.dataset.id) : null);
        if (actEl.dataset.id) S.updateExercise(actEl.dataset.id, data);
        else {
          const created = S.addExercise(data);
          if (UI.route() === 'plan') S.addToPlan(UI.picker().day, created.id);
        }
        UI.closeSheet();
        UI.toast('<span>Saved</span>');
        break;
      }
      case 'toggle-ex':
        act(() => S.toggleExercise(date, id));
        break;

      /* --- the set log ---
         Every one of these is a write against ONE day and one exercise. The
         store refuses a future date itself, so nothing here has to guard it. */
      case 'log-set': {
        const v = readSet(id);
        if (!v.reps) {
          UI.toast('<span>How many reps? A set with no reps is not a set.</span>', 'bad');
          break;
        }
        const editing = UI.editSet();
        if (editing && editing.itemId === id) {
          S.updateSet(date, id, editing.index, v.weight, v.reps);
          UI.setEditSet(null);
          UI.render();
          break;
        }
        const before = S.dayStatus(date).status;
        /* The rest starts on the set, not on a button: finishing a set IS the
           start of the rest, and a timer you have to remember to press is a
           timer nobody presses. `startRest` reads the interval off the plan
           item's own note.

           BEFORE the write, and that ordering is the whole point. The write
           commits, the commit notifies the view, and the view repaints — so a
           rest started after it is a rest the screen does not know about until
           something unrelated happens to repaint. It cost nothing to get wrong
           in either stub suite and showed up the first time a real browser
           logged a real set. It stores nothing, so starting it early is free;
           the refusal path below takes it back. */
        if (S.settings().restTimer) UI.startRest(date, id);
        const added = act(() => S.addSet(date, id, v.weight, v.reps));
        if (!added) {
          UI.stopRest();
          UI.render();
          break;
        }
        armRest();
        buzz(10);
        /* Only when logging the set is what finished the exercise — the tick
           moving on its own is the one thing here worth saying out loud. */
        if (before !== 'complete' && S.dayStatus(date).status === 'complete') {
          UI.toast('<span>Session complete.</span>', 'gold');
        }
        break;
      }
      case 'rest-skip':
        UI.stopRest();
        UI.render();
        break;
      case 'set-edit':
        UI.setEditSet(id, actEl.dataset.index);
        UI.render();
        break;
      case 'set-cancel':
        UI.setEditSet(null);
        UI.render();
        break;
      case 'set-rm': {
        const index = Number(actEl.dataset.index);
        const gone = S.removeSet(date, id, index);
        if (!gone) break;
        UI.setEditSet(null);
        offerUndo('<span>Set removed.</span>', () => S.restoreSet(date, id, index, gone));
        break;
      }
      case 'save-amount': {
        const min = document.getElementById('min_' + id);
        const km = document.getElementById('km_' + id);
        const patch = {};
        if (min) patch.min = String(min.value).trim();
        if (km) patch.km = String(km.value).trim();
        const before = S.dayStatus(date).status;
        act(() => S.setAmount(date, id, patch));
        if (before !== 'complete' && S.dayStatus(date).status === 'complete') {
          UI.toast('<span>Session complete.</span>', 'gold');
        }
        break;
      }
      /* --- the tape and the scale ---
         A record, not a task: none of these touch a day, a streak or a log. */
      case 'weigh-in':
        UI.openWeighIn(actEl.dataset.date || S.today());
        break;
      case 'weigh-save': {
        const el = $('#bw_kg');
        const raw = el ? String(el.value).trim() : '';
        const kg = parseFloat(raw);
        if (raw === '' || isNaN(kg) || kg <= 0) {
          UI.toast('<span>A weight, in numbers. Blank removes the reading instead.</span>', 'bad');
          break;
        }
        S.setBody(sheetDate, { kg: kg, u: S.settings().weightUnit === 'lb' ? 'lb' : 'kg' });
        UI.closeSheet();
        break;
      }
      case 'weigh-clear': {
        const before = S.bodyEntry(sheetDate);
        S.setBody(sheetDate, { kg: '' });
        UI.closeSheet();
        offerUndo('<span>Reading removed.</span>', () => S.restoreBody(sheetDate, before));
        break;
      }
      case 'tape-open':
        UI.openTape(actEl.dataset.date || S.today());
        break;
      case 'tape-save': {
        /* Read every field, blank included: a blank CLEARS rather than being
           skipped, so a measurement typed by mistake can be taken back out. */
        const patch = {};
        A.BODY_KEYS.forEach((key) => {
          const el = document.getElementById('bm_' + key);
          if (el) patch[key] = String(el.value).trim();
        });
        const before = S.bodyEntry(sheetDate);
        S.setBody(sheetDate, patch);
        const after = S.bodyEntry(sheetDate) || {};
        const n = A.BODY_KEYS.filter((k) => after[k] != null).length;
        UI.closeSheet();
        if (!n) {
          UI.toast('<span>Nothing was filled in, so nothing was recorded.</span>');
        } else {
          offerUndo('<span>' + n + (n === 1 ? ' measurement' : ' measurements') + ' recorded.</span>',
                    () => (before ? S.restoreBody(sheetDate, before) : S.clearBody(sheetDate)));
        }
        break;
      }

      case 'perf-note': {
        const l = S.log(date);
        const current = ((l && l.perf && l.perf[id]) || {}).note || '';
        UI.openTextPrompt({
          title: 'Note on this exercise',
          label: 'How did it feel? What did the bar do?',
          value: current,
          placeholder: 'Left shoulder tight on the last set',
          confirmLabel: 'Save note',
          maxlength: 240,
          allowEmpty: true,     // clearing a note is a real answer
          onSave: (text) => S.setPerfNote(date, id, text)
        });
        break;
      }
      /* The day strip's one button. It scrolls rather than logs: the numbers
         are the user's to type, and a button that filled them in would be the
         app writing a set nobody did. */
      case 'ex-focus': {
        const el = document.getElementById('w_' + id) || document.getElementById('min_' + id);
        if (el) {
          if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (el.focus) el.focus();
        }
        break;
      }
      case 'undo-last': {
        const slot = pendingUndo;
        /* Only the button this restore was made for. A stale one says so rather
           than silently doing nothing, which is what it used to do. */
        if (!slot || slot.id !== id) {
          UI.toast('<span>That undo has expired.</span>');
          break;
        }
        pendingUndo = null;              // one shot
        act(slot.restore);
        break;
      }
      case 'lib-open':
        UI.toggleLibOpen();
        UI.render();
        break;
      /* Toggled in the DOM rather than through a re-render: the editor is a
         form the user is part-way through, and rebuilding it to flip one chip
         would throw away everything typed above it. */
      case 'muscle-window':
        UI.setMuscleWindow(actEl.dataset.days);
        UI.render();
        break;
      case 'ex-muscle': {
        const on = actEl.getAttribute('aria-pressed') === 'true';
        actEl.setAttribute('aria-pressed', on ? 'false' : 'true');
        if (actEl.classList) actEl.classList.toggle('on', !on);
        break;
      }

      /* --- exercise pictures --- */
      case 'ex-photo-pick': {
        /* The only genuinely async action in the app: a 3-8MB camera file is
           read, decoded, repainted to a canvas and re-encoded, which is one to
           several seconds on a mid-range phone. Nothing on screen used to
           change in that window — the card still looked untapped and stayed
           tappable — so the natural response was to tap it again and queue a
           second decode on top of the first. */
        const busy = actEl;
        const label = (busy && busy.querySelector && busy.querySelector('b')) || busy;
        const wasText = label && label.textContent;
        const setBusy = (on) => {
          if (!busy) return;
          busy.disabled = on;
          if (busy.setAttribute) busy.setAttribute('aria-busy', on ? 'true' : 'false');
          if (label) label.textContent = on ? 'Adding…' : wasText;
        };
        pickImage((file) => {
          if (!file) return;
          setBusy(true);
          A.Photos.shrink(file).then((dataUrl) => {
            if (!dataUrl) {
              setBusy(false);
              UI.toast('<span>That file could not be read as a picture — try a JPEG or PNG from your gallery.</span>', 'bad');
              return;
            }
            A.Photos.put(id, dataUrl).then((saved) => {
              /* `refreshExerciseHow` rebuilds the sheet, so the busy state goes
                 with the element that carried it — nothing to undo by hand. */
              UI.refreshExerciseHow();
              /* Said out loud on purpose. A picture that looks added and is gone
                 after a reload is worse than one that was refused, and a device
                 with no IndexedDB — private mode, mostly — fails exactly that
                 way. */
              if (saved) UI.toast('<span>Picture saved on this device.</span>');
              else UI.toast('<span>This browser will not store pictures — it is showing but will not survive a reload.</span>', 'bad');
            });
          });
        });
        break;
      }
      case 'ex-photo-rm':
        UI.openConfirm({
          title: 'Remove this picture?',
          body: 'The exercise and its written cues are kept. Only the picture goes, and it cannot be undone — you would have to pick the file again.',
          confirmLabel: 'Remove picture',
          danger: true,
          onConfirm: () => {
            A.Photos.remove(id).then(() => {
              UI.refreshExerciseHow();
              UI.toast('<span>Picture removed.</span>');
            });
          }
        });
        break;
      /* The whole workout in one tap, from the heading, without opening it.
         Toggling rather than only completing means the tap is its own undo. */
      case 'workout-done': {
        /* Snapshot first. `toggleWorkout` is all-or-nothing: with five of six
           ticked by hand it sets all six, and the NEXT tap deletes all six —
           including the five the user ticked one at a time. "The tap is its own
           undo" was only ever true for what that tap set. */
        const before = Object.assign({}, (S.log(date) || {}).ex || {});
        const now = act(() => S.toggleWorkout(date));
        if (now != null) {
          buzz(now ? 18 : 0);
          offerUndo(
            now ? '<span>Workout logged.</span>' : '<span>Workout unticked.</span>',
            () => S.restoreExercises(date, before)
          );
        }
        break;
      }

      /* --- the 66-day run --- */
      case 'install':
        if (deferredInstall) {
          deferredInstall.prompt();
          deferredInstall.userChoice.finally(() => {
            deferredInstall = null;
          });
        } else {
          UI.toast('<span>Use your browser menu → “Install app”</span>');
        }
        break;
      /* The pictures ride along in the backup, and they have to: they are the
         user's own files, they live outside `arise.state.v1` in a database of
         their own, and a backup that quietly left them behind would lose them
         on the one move it exists to survive — a change of origin. `photos` is
         an extra top-level key, so an older build reading this file simply
         ignores it, and a backup written before pictures existed restores
         none. */
      case 'export': {
        const backup = JSON.parse(S.exportJson());
        const shots = A.Photos.all();
        if (Object.keys(shots).length) backup.photos = shots;
        download(`discipline-backup-${A.key()}.json`, JSON.stringify(backup, null, 2));
        UI.toast('<span>Backup downloaded</span>');
        break;
      }
      case 'download-unreadable': {
        // Discipline cannot parse these bytes, but they are still the user's data and
        // getting them off the device is worth more than anything we can say.
        const raw = S.unreadableBackup();
        if (raw == null) {
          UI.openConfirm({
            title: 'The unreadable copy is gone',
            body: 'Discipline could not find the data it failed to read, so there is nothing to download. Restore from a backup instead — More → Import.',
            confirmLabel: 'OK'
          });
          break;
        }
        download(`discipline-unreadable-${A.key()}.json`, raw);
        UI.toast('<span>Unreadable copy downloaded</span>');
        break;
      }
      case 'import':
        pickFile((text) => {
          /* Restoring replaces every byte on the device and there is no undo, so
             it is checked before it is trusted and confirmed before it runs —
             Reset, the identically irreversible action one row below, has always
             asked. The order matters: read the file, then ask, then commit. */
          let info;
          try {
            info = S.inspectBackup(text);
          } catch (err) {
            // An import failure must stay legible — the toast is transient, so the
            // reason goes in a sheet the user can actually read and dismiss.
            UI.openConfirm({
              title: 'That backup could not be read',
              body: `${err.message}\n\nYour existing data has not been touched. Pick a file exported from Discipline with More → Export.`,
              confirmLabel: 'OK'
            });
            return;
          }
          const held = [
            `${info.days} logged ${info.days === 1 ? 'day' : 'days'}`,
            `${info.goals} ${info.goals === 1 ? 'goal' : 'goals'}`,
            `${info.summaries} ${info.summaries === 1 ? 'summary' : 'summaries'}`
          ].join(', ');
          UI.openConfirm({
            title: 'Restore this backup?',
            body: `That file holds ${held}.\n\nRestoring it replaces everything currently on this device — your plan, every logged set, your streaks and your rewards. This cannot be undone.`,
            confirmLabel: 'Replace my data',
            danger: true,
            onConfirm: () => {
              try {
                S.importJson(text);
                /* After the state, and never instead of it. The pictures live in
                   their own database, so a failure to restore them must not be
                   able to take the restore of the ledger down with it — that is
                   the whole reason they are kept apart. Additive: a backup with
                   no `photos` key removes nothing. */
                let shots = null;
                try {
                  shots = JSON.parse(text).photos;
                } catch (err2) {
                  shots = null;   // already restored; the state is what mattered
                }
                A.Photos.restore(shots).then((n) => {
                  UI.toast(n ? `<span>Data restored, with ${n} picture${n === 1 ? '' : 's'}</span>`
                             : '<span>Data restored</span>');
                });
              } catch (err) {
                UI.openConfirm({
                  title: 'That backup could not be restored',
                  body: `${err.message}\n\nYour existing data has not been touched.`,
                  confirmLabel: 'OK'
                });
              }
            }
          });
        });
        break;
      case 'reset':
        UI.openConfirm({
          title: 'Reset everything?',
          body: 'Your plan, logs, streaks and rewards are erased and cannot be recovered. Export a backup first if there is any doubt.',
          confirmLabel: 'Erase everything',
          danger: true,
          onConfirm: () => {
            S.resetAll();
            UI.toast('<span>Fresh start</span>');
          }
        });
        break;
    }
  });

  /* The swipe-and-hold gestures that used to live here belonged to the goal
     cards: swipe right to keep, left to skip, hold to log part of it. There is
     no card with a single yes/no answer on Today any more — an exercise is a
     list of sets and the numbers have to be typed — so the gestures went with
     the thing they operated on rather than being remapped onto something they
     do not fit. */

  /* ---------- inputs ---------- */

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.id === 'pickerQ') {
      UI.setPicker({ q: t.value });
      UI.refreshPicker();
      const q = document.getElementById('pickerQ');
      if (q) {
        q.focus();
        q.setSelectionRange(q.value.length, q.value.length);
      }
    }
  });

  /* Selects hand back strings. Anything read as a number has to be named here or
     it is stored as one, and `deloadEveryWeeks` would then never match the `< 2`
     guard that turns the cycle off. */
  const NUMERIC_SETTINGS = { completionPct: 1, dayBoundaryHour: 1, deloadEveryWeeks: 1 };

  document.addEventListener('change', (ev) => {
    const t = ev.target;

    // Changing what an exercise is measured in relabels one field and retires
    // two others, so rebuild from what is already typed.
    if (t.id === 'e_unit') {
      const saveBtn = document.querySelector('[data-act="lib-save"]');
      UI.openExerciseEditor(
        (saveBtn && saveBtn.dataset.id) || null,
        readExerciseForm(saveBtn && saveBtn.dataset.id ? S.exerciseById(saveBtn.dataset.id) : null)
      );
      return;
    }
    const setting = t.dataset && t.dataset.set;
    if (!setting) return;
    let value;
    if (t.type === 'checkbox') value = t.checked;
    else if (NUMERIC_SETTINGS[setting]) value = parseInt(t.value, 10) || 0;
    else if (t.type === 'number') value = Math.max(1, Math.min(7, parseInt(t.value, 10) || 1));
    else value = t.value;
    act(() => S.updateSettings({ [setting]: value }));

    if (setting === 'reminders' && value && typeof Notification !== 'undefined') {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((p) => {
          if (p !== 'granted') UI.toast('<span>Notifications blocked — the app still tracks everything</span>');
        });
      } else if (Notification.permission === 'denied') {
        UI.toast('<span>Notifications are blocked in your browser settings</span>');
      }
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !$('#sheetBackdrop').hidden) UI.closeSheet();
    if (ev.key === 'Enter' && ev.target.id === 'extraInput') {
      ev.preventDefault();
      const v = ev.target.value.trim();
      if (v) act(() => S.addExtra(UI.viewDate(), v));
    }
    // Same convention in the prompt sheet: Enter commits the single field.
    if (ev.key === 'Enter' && ev.target.id === 'tp_value') {
      ev.preventDefault();
      UI.resolveTextPrompt();
    }
  });

  $('#sheetClose').addEventListener('click', UI.closeSheet);
  $('#sheetBackdrop').addEventListener('click', (ev) => {
    if (ev.target.id === 'sheetBackdrop') UI.closeSheet();
  });

  /* ---------- store → view ---------- */

  S.subscribe(() => {
    if (!$('#sheetBackdrop').hidden && UI.picker() && UI.route() === 'plan') {
      // keep the picker open while the plan behind it updates
      const scroll = window.scrollY;
      UI.render();
      window.scrollTo({ top: scroll });
      return;
    }
    UI.render();
  });

  /* ---------- boot ---------- */

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
  });
  window.addEventListener('appinstalled', () => UI.toast('<span>Discipline installed</span>'));

  window.addEventListener('hashchange', () => {
    UI.go((location.hash || '').replace('#/', '') || 'today');
  });

  // Saving is debounced, and a phone can freeze or discard a backgrounded PWA
  // without ever running the timer. These two are the last moments we are
  // guaranteed to get, so the last tap of the day is written before we lose them.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') S.flush();
  });
  window.addEventListener('pagehide', () => S.flush());

  /* ---------- reminders (honest about what a PWA can do) ---------- */

  let lastNudge = null;

  function maybeNudge() {
    if (!S.settings().reminders) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const k = S.today();
    if (lastNudge === k) return;
    const left = A.minutesLeftToday(S.settings().dayBoundaryHour);
    if (left > 90) return; // only near the rollover, when it still matters
    const st = S.dayStatus(k);
    const open = Math.max(0, st.total - st.done);
    if (!open) return;
    lastNudge = k;
    try {
      new Notification('Discipline', {
        body: `${open} exercise${open === 1 ? '' : 's'} still unlogged — ${left} min before the day rolls over.`,
        icon: './icons/icon-192.png',
        tag: 'discipline-day'
      });
    } catch (err) {
      /* notifications are best-effort by design */
    }
  }

  // Roll the view over at the day boundary so a left-open tab doesn't log to yesterday.
  let lastKey = null;
  setInterval(() => {
    const now = S.today();
    if (lastKey && now !== lastKey) {
      UI.setViewDate(now);
      UI.render();
    }
    lastKey = now;
    maybeNudge();
  }, 30000);

  // Boot is the one place a throw is unrecoverable: nothing has rendered yet, so
  // the failure mode is a blank page with no route to an export.
  try {
    S.load();
    lastKey = S.today();
    UI.go((location.hash || '').replace('#/', '') || 'today');

    /* Fill the picture cache, then repaint. Reading IndexedDB is async and
       rendering is not, so the first paint is drawn without pictures and the
       one after has them — which is right for a screen nobody is looking at
       yet. Deliberately after `UI.go`: making the app wait on a database it may
       not even have would trade a whole app for a picture. */
    A.Photos.load().then((map) => {
      if (map && Object.keys(map).length) UI.render();
    });
  } catch (err) {
    console.error('Discipline: failed to start.', err);
    const view = $('#view');
    if (view) view.innerHTML = UI.recoveryPanel(err);
  }

  // One panel, once. A repeat handler would stamp over whatever the user is
  // reading every time a stray async error fires.
  let raised = false;
  window.addEventListener('error', (ev) => {
    if (raised) return;
    raised = true;
    const view = $('#view');
    if (view && !view.innerHTML) view.innerHTML = UI.recoveryPanel((ev && ev.error) || (ev && ev.message));
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        /* `updateViaCache: 'none'` is the whole difference between a fix
           reaching somebody and not. Without it the browser may serve `sw.js`
           itself from the HTTP cache, so `update()` re-reads the *old* worker,
           finds it byte-identical to what is installed, and concludes there is
           nothing new — while a newer build sits on the server untouched. The
           spec only forces a network fetch once the cached copy is 24 hours
           old, which is no help at all on the day you are shipping. */
        .register('./sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          /* Check for a new build on every open. The worker is cache-first by
             design — that is what makes the app work on a plane — but it also
             means a shell can sit there for days after a fix ships, and
             "nothing happened when I tapped it" is what a stale build looks
             like from the outside. */
          reg.update().catch(() => {});
          if (reg.waiting) reg.waiting.postMessage('skip-waiting');
        })
        .catch((err) => console.warn('SW registration failed', err));

      /* One reload when a new worker takes over, and only one: `sw.js` calls
         skipWaiting on install, so control changes as soon as the new build is
         cached. Without the guard this is an refresh loop. */
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });

      /* What is actually serving this page, for the footer on More. */
      navigator.serviceWorker.addEventListener('message', (ev) => {
        if (ev.data && ev.data.version) {
          UI.setBuild(ev.data.version);
          UI.render();
        }
      });
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('version');
      }
    });
  }
})(window);
