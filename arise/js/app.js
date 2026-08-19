/* Discipline — wiring: events, celebrations, install prompt, service worker. */
(function (root) {
  'use strict';

  const A = root.Arise;
  const S = root.Store;
  const UI = root.UI;

  const $ = (s) => document.querySelector(s);
  const esc = UI.esc;
  let deferredInstall = null;

  /* ---------- celebrate level-ups and newly unlocked milestones ---------- */

  function snapshot() {
    const goals = {};
    S.activeGoals().forEach((g) => {
      const tl = S.goalTimeline(g.id);
      goals[g.id] = tl ? tl.level : 0;
    });
    return {
      level: S.progress().level,
      unlocked: S.rewards().filter((r) => r.unlocked).length,
      streak: S.currentStreak(),
      weekHit: S.weekStats().hit,
      goals: goals
    };
  }

  function celebrate(before) {
    const after = snapshot();
    let party = false;

    // A goal stepping up is the single most motivating event in the app — say it loudly.
    S.activeGoals().forEach((g) => {
      const was = before.goals[g.id];
      const now = after.goals[g.id];
      if (was == null || now == null || now <= was) return;
      const tl = S.goalTimeline(g.id);
      UI.toast(
        `${esc(g.icon || '🎯')} <span><b>${esc(g.name)}</b> steps to ${esc(A.formatValue(g.unit, tl.target))}${
          tl.atTarget ? ' — target reached!' : ''
        }</span>`,
        'gold'
      );
      party = true;
    });

    if (after.unlocked > before.unlocked) {
      const m = S.rewards().filter((r) => r.unlocked).slice(-1)[0];
      UI.toast(`${m.icon} <span>Milestone unlocked — <b>${m.name}</b>! Claim it in Rewards.</span>`, 'gold');
      party = true;
    }
    if (after.level > before.level) {
      const p = S.progress();
      UI.toast(`${p.rank.icon} <span>Level ${p.level} — <b>${p.rank.name}</b></span>`, 'gold');
      party = true;
    }
    if (after.weekHit && !before.weekHit) {
      UI.toast('🎁 <span>Weekly goal hit — chest ready!</span>', 'gold');
      party = true;
    }
    if (!party && after.streak > before.streak && after.streak > 1) {
      UI.toast(`🔥 <span><b>${after.streak}</b> day streak</span>`);
    }
    if (party) UI.confetti();
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

  /* ---------- the two day-level goal actions ----------
     Named once, because there are now three ways to reach each of them — the
     tick, the day strip and a swipe — and three copies of "what keeping a goal
     means" would be three things to keep in step. */

  /** A short buzz, where the device has one. Completion only, never undo. */
  function buzz(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (err) {
      /* a device that refuses to vibrate is not a failure worth reporting */
    }
  }

  function keepGoal(id, dateKey) {
    const g = S.goalById(id);
    if (!g) return;
    const kept = act(() => S.hitGoalTarget(dateKey, id));
    if (!kept) return; // un-ticking *is* the undo; it does not need one of its own
    buzz(12);
    UI.toastAction(`${esc(g.icon || '🎯')} <span><b>${esc(g.name)}</b> kept</span>`, {
      act: 'goal-hit',
      id: id,
      date: dateKey
    });
  }

  function skipGoal(id, dateKey) {
    const g = S.goalById(id);
    if (!g) return;
    if (!S.skipGoal(dateKey, id)) return; // un-skipping is likewise its own undo
    UI.toastAction(`⏭ <span><b>${esc(g.name)}</b> skipped</span>`, {
      act: 'goal-skip',
      id: id,
      date: dateKey
    });
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

  /** Read the goal editor sheet into a plain goal patch.
      `existing` is the goal being edited (null when creating), so a saved
      `wrapAt` can be preserved instead of re-guessed. */
  function readGoalForm(existing) {
    const unit = $('#gg_unit').value;
    const val = (sel, fallback) => {
      const el = $(sel);
      if (!el) return fallback;
      const n = el.type === 'time' ? A.hhmmToMin(el.value) : parseFloat(el.value);
      return n == null || isNaN(n) ? fallback : n;
    };
    const schedType = $('#gg_sched').value;
    const days = Array.from(document.querySelectorAll('#gg_days input:checked')).map((c) => Number(c.dataset.wd));
    const adv = {
      successes: Math.max(1, parseInt($('#gg_succ').value, 10) || 5),
      window: Math.max(1, parseInt($('#gg_win').value, 10) || 7)
    };
    if (adv.window < adv.successes) adv.window = adv.successes;

    const baseline = val('#gg_base', 0);
    const target = val('#gg_target', 0);

    const data = {
      name: $('#gg_name').value.trim() || 'Untitled goal',
      icon: $('#gg_icon').value.trim() || '🎯',
      section: $('#gg_section').value,
      unit: unit,
      // Derived from the two numbers, never read back off the form. The editor
      // shows it read-only for the same reason: a goal must not be pointable
      // away from its own target, and goal-save recomputes this regardless.
      direction: target >= baseline ? 'up' : 'down',
      baseline: baseline,
      target: target,
      step: Math.max(0.25, parseFloat($('#gg_step').value) || 1),
      mode: $('#gg_mode').value,
      schedule: schedType === 'weekdays' ? { type: 'weekdays', days: days } : { type: 'daily' },
      advance: adv,
      regress: $('#gg_reg').checked ? { misses: Math.max(2, parseInt($('#gg_miss').value, 10) || 3) } : false,
      gate: $('#gg_gate').checked ? 'summary' : null
    };
    // A bedtime that crosses midnight needs the wrap rule, or 00:30 reads as "earlier" than 23:30.
    // That's only a guess worth making for a brand-new goal — editing an existing one must
    // never silently reset a wrapAt that's already correct, or a real midnight-crossing miss
    // (e.g. 00:15 vs. a 22:30 target) would start reading as a numeric "earlier" success.
    if (data.unit !== 'time') {
      data.wrapAt = null;
    } else if (existing && existing.unit === 'time') {
      data.wrapAt = existing.wrapAt;
    } else {
      data.wrapAt = data.direction === 'down' && (data.baseline < 360 || data.target < 360) ? 720 : null;
    }
    return data;
  }

  /** Read the reward editor sheet. Shared with the source selector, which
      rebuilds the sheet to show or hide the goal picker. */
  function readRewardForm() {
    const src = $('#rw_source').value === 'goal' ? 'goal' : 'overall';
    const goalSel = $('#rw_goal');
    return {
      name: $('#rw_name').value.trim(),
      icon: $('#rw_icon').value.trim() || '🎁',
      source: src,
      goalId: src === 'goal' && goalSel ? goalSel.value : null,
      days: Math.max(1, Math.min(999, parseInt($('#rw_days').value, 10) || 14))
    };
  }

  /** Read the exercise editor sheet into a plain exercise patch. Shared with the
      unit selector, which rebuilds the sheet rather than throwing away what has
      already been typed. */
  function readExerciseForm() {
    const unit = $('#e_unit').value;
    const aVal = numVal('e_a', 3);
    const reps = unit === 'reps' ? numVal('e_b', 10) : undefined;
    const maxEl = $('#e_max');
    const rawMax = maxEl && maxEl.value.trim() !== '' ? parseFloat(maxEl.value) : NaN;
    const howEl = $('#e_how');
    const data = {
      name: $('#e_name').value.trim() || 'Untitled',
      icon: $('#e_icon').value.trim() || '🏋️',
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
      case 'goal-hit':
        keepGoal(id, sheetDate);
        break;
      case 'goal-log':
        UI.openGoalLog(id, sheetDate);
        break;
      case 'goal-detail':
        // The day being viewed, so the sheet's day-level actions land on it.
        UI.openGoalDetail(id, sheetDate);
        break;
      case 'goal-save-val': {
        const g = S.goalById(id);
        const el = $('#g_val');
        if (!g || !el) break;
        const raw = g.unit === 'time' ? A.hhmmToMin(el.value) : parseFloat(el.value);
        act(() => S.setGoalValue(sheetDate, id, isNaN(raw) || raw == null ? null : raw));
        UI.closeSheet();
        UI.toast(S.goalDone(sheetDate, id) ? '✅ <span>Target met</span>' : '📝 <span>Logged — short of target</span>');
        break;
      }
      case 'goal-skip':
        skipGoal(id, sheetDate);
        UI.closeSheet();
        break;
      case 'goal-clear':
        S.clearGoalEntry(sheetDate, id);
        UI.closeSheet();
        break;
      case 'goal-new':
        UI.openGoalEditor(null);
        break;
      case 'goal-edit':
        UI.openGoalEditor(id);
        break;
      case 'goal-save': {
        const existing = id ? S.goalById(id) : null;
        const data = readGoalForm(existing);
        // Direction is a fact about the two numbers, not a separate choice — keep them consistent
        // so a goal can never be pointed away from its own target.
        const nb = A.Goals.norm(data, data.baseline);
        const nt = A.Goals.norm(data, data.target);
        if (nb === nt) {
          UI.toast('🎯 <span>Start and target must differ — otherwise there is nothing to progress</span>');
          break;
        }
        data.direction = nt > nb ? 'up' : 'down';
        // A ladder this long is a typo, not an intention — and it is the input
        // that used to make opening the goal freeze the tab.
        const rungCount = A.Goals.maxLevel(data, S.settings().mode);
        if (rungCount > 400) {
          UI.toast(
            `🎯 <span>That is ${rungCount.toLocaleString()} steps. Raise the step size or move the target closer.</span>`
          );
          break;
        }
        const fromHabit = actEl.dataset.habit || '';
        if (existing) {
          S.updateGoal(id, data);
        } else if (fromHabit) {
          const moved = S.habitToGoal(fromHabit, data);
          if (moved) {
            UI.closeSheet();
            /* Undoable, because it deletes a habit. The restore puts it back
               under its OWN id — a fresh one would orphan every day already
               logged against it and read the streak as zero. */
            offerUndo(
              '🎯 <span><b>' + esc(moved.goal.name) + '</b> is a goal now, and off your daily habits.</span>',
              () => S.restoreHabitFromGoal(moved.habit, moved.index, moved.goal.id)
            );
            break;
          }
          // The habit went while the sheet was open. Keep the goal rather than
          // throwing away a form the user just filled in.
          S.addGoal(data);
        } else {
          S.addGoal(data);
        }
        UI.closeSheet();
        UI.toast('🎯 <span>Goal saved</span>');
        break;
      }
      case 'goal-archive':
        S.archiveGoal(id);
        UI.closeSheet();
        break;
      case 'goal-delete': {
        const g = S.goalById(id);
        if (!g) break;
        UI.openConfirm({
          title: `Delete ${g.name}?`,
          body: 'Its logged history goes with it. Pause it instead if you just need a break.',
          confirmLabel: 'Delete goal',
          danger: true,
          onConfirm: () => S.removeGoal(id),
          // This interrupted the goal editor — cancelling should put it back.
          onCancel: () => UI.openGoalEditor(id)
        });
        break;
      }
      case 'goal-restart':
        UI.openGoalRestart(id);
        break;
      case 'goal-restart-save': {
        const g = S.goalById(id);
        const el = $('#g_base');
        if (!g || !el) break;
        const n = g.unit === 'time' ? A.hhmmToMin(el.value) : parseFloat(el.value);
        if (n == null || isNaN(n)) {
          UI.toast('🔄 <span>Enter a starting point first</span>');
          break;
        }
        // A start equal to the target leaves nothing to progress through.
        if (A.Goals.norm(g, n) === A.Goals.norm(g, g.target)) {
          UI.toast('🎯 <span>That is already the target — pick a start you can climb from</span>');
          break;
        }
        S.restartGoal(id, n);
        UI.closeSheet();
        UI.toast('🔄 <span>Re-baselined from today</span>');
        break;
      }

      /* --- reading & journal --- */
      case 'open-read':
        UI.openReading(sheetDate);
        break;
      case 'read-save': {
        // The Read tab renders this form inline *and* can open it in a sheet for a past
        // day, so ids are not unique. Always read the copy the button belongs to.
        const form = actEl.closest('#sheetBody') || actEl.closest('.card') || document;
        const fld = (sel) => form.querySelector(sel);
        const text = (fld('#r_summary') && fld('#r_summary').value) || '';
        if (!text.trim()) {
          UI.toast('✍️ <span>Write a summary first — that is the point</span>', 'gold');
          break;
        }
        const minEl = fld('#r_min');
        const mins = minEl && minEl.value !== '' ? parseFloat(minEl.value) : null;
        act(() =>
          S.setReading(sheetDate, {
            book: (fld('#r_book') && fld('#r_book').value.trim()) || '',
            minutes: mins == null || isNaN(mins) ? null : mins,
            summary: text
          })
        );
        UI.closeSheet();
        /* "Reading complete" is only true if the day's ask was actually met.
           Saying it regardless made the app state something false in the
           ordinary case — a summary written with no minutes logged. The value
           path in `goal-save-val` already gets this right; this mirrors it. */
        const readGoal = S.activeGoals().find((g) => g.gate === 'summary');
        if (readGoal && S.goalDone(sheetDate, readGoal.id)) {
          UI.toast('📖 <span>Summary saved — reading complete</span>', 'gold');
        } else {
          UI.toast('📖 <span>Summary saved</span>', 'gold');
        }
        break;
      }
      case 'read-clear':
        UI.openConfirm({
          title: 'Clear this summary?',
          body: 'The reading goal will count as unmet for that day.',
          confirmLabel: 'Clear summary',
          danger: true,
          onConfirm: () => S.setReading(sheetDate, { summary: '', book: '', minutes: null }),
          onCancel: () => UI.openReading(sheetDate)
        });
        break;
      case 'mood': {
        // The Read tab always shows today's journal, but the page-back arrows on
        // Today leave viewDate on some other day. Score the mood against the day
        // the button was rendered for, or it lands on an entry nobody is looking at.
        const cur = S.journalEntry(sheetDate);
        const i = Number(actEl.dataset.i);
        S.setJournal(sheetDate, { mood: cur && cur.mood === i ? null : i });
        UI.render();
        break;
      }

      /* --- settings & streak rules --- */
      case 'set-mode':
        act(() => S.updateSettings({ mode: actEl.dataset.mode }));
        UI.toast(
          `${A.MODES[actEl.dataset.mode].icon} <span>${esc(A.MODES[actEl.dataset.mode].name)} mode · ${S.activeGoals()
            .slice(0, 1)
            .map((g) => `${esc(g.name)} now ${esc(A.formatValue(g.unit, S.goalTarget(g.id)))}`)
            .join('')}</span>`
        );
        break;
      case 'freeze':
        if (S.applyFreeze(sheetDate)) UI.toast('❄️ <span>Freeze applied — streak held</span>', 'gold');
        else UI.toast('❄️ <span>No freezes available yet</span>');
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
          body: `Everything logged for ${A.prettyDate(date)} is removed. Your streak is recalculated from what is left.`,
          confirmLabel: 'Clear day',
          danger: true,
          onConfirm: () => S.clearDay(date)
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
      case 'plan-tab':
        UI.setPlanTab(actEl.dataset.tab);
        UI.render();
        break;
      case 'today-filter':
        UI.setTodayFilter(actEl.dataset.filter);
        UI.render();
        break;
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
      case 'claim':
        if (S.claimReward(id)) {
          const m = A.MILESTONES.find((x) => x.id === id);
          UI.toast(`${m.icon} <span>Claimed <b>${m.name}</b> · +${m.xp} XP</span>`, 'gold');
          UI.confetti();
        }
        break;
      /* --- the run --- */
      case 'challenge-open':
        UI.openChallenge();
        break;
      case 'challenge-start': {
        const nameEl = $('#ch_name');
        const daysEl = $('#ch_days');
        act(() =>
          S.startChallenge({
            name: (nameEl && nameEl.value.trim()) || 'Reset',
            days: daysEl ? parseInt(daysEl.value, 10) : 66
          })
        );
        UI.closeSheet();
        UI.toast('🏁 <span>Day one. Go.</span>', 'gold');
        break;
      }
      case 'challenge-end': {
        const run = S.activeChallenge();
        if (!run) break;
        const done = S.challengeProgress(run);
        UI.openConfirm({
          title: done.complete ? `Archive ${run.name}?` : `End ${run.name} early?`,
          body: done.complete
            ? `You kept ${done.kept} of ${done.days} days. It moves to your finished countdowns and the counter goes back to counting plain days.`
            : `You are on day ${done.day} of ${done.days}, having kept ${done.kept}. Ending it now keeps the record — nothing you logged is lost — but the countdown stops here.`,
          confirmLabel: done.complete ? 'Archive it' : 'End the countdown',
          danger: !done.complete,
          onConfirm: () => {
            S.endChallenge(run.id);
            UI.toast('🏁 <span>Countdown archived</span>');
          },
          onCancel: () => UI.openChallenge()
        });
        break;
      }
      /* --- rewards the user set for themselves --- */
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
          UI.toast('🎁 <span>Create a goal first, then tie a reward to it</span>');
          break;
        }
        if (actEl.dataset.id) S.updateCustomReward(actEl.dataset.id, data);
        else S.addCustomReward(data);
        UI.closeSheet();
        UI.toast('🎁 <span>Reward set — now go earn it</span>');
        break;
      }
      case 'reward-claim':
        if (S.claimCustomReward(id)) {
          UI.toast('🎉 <span>Earned and collected. Enjoy it.</span>', 'gold');
          UI.confetti();
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
      case 'claim-weekly':
        if (S.claimWeekly(date)) {
          UI.toast(`🎁 <span>Weekly chest opened · +${A.XP.weeklyGoal} XP</span>`, 'gold');
          UI.confetti();
        }
        break;

      /* --- plan --- */
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
      case 'program-install':
        UI.openConfirm({
          title: 'Install the built-in programme?',
          body: 'The seven days of your weekly plan are replaced by the built-in dumbbell programme — ' +
                'Upper A, Lower A, Upper B, Lower B, the daily mobility, and their warm-ups and stretches. ' +
                'Anything you have arranged in the weekly plan yourself is overwritten. ' +
                'Your exercise library is not touched, nothing is deleted from it, and no day you have ' +
                'already logged changes — every logged day froze its own exercise list when you opened it.',
          confirmLabel: 'Install it',
          onConfirm: () => {
            S.reinstallProgram();
            UI.toast('🏋️ <span>The programme is installed across the week.</span>');
          }
        });
        break;
      case 'plan-copy-from': {
        const fromDay = Number(actEl.dataset.from);
        const copy = () => {
          S.copyDayPlan(fromDay, day);
          UI.closeSheet();
          UI.toast('📋 <span>Day copied</span>');
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
        UI.toast(`${esc(ex.icon || '✅')} <span>${esc(ex.name)} → ${A.DAY_NAMES[p.day]}</span>`);
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
        const data = readExerciseForm();
        if (actEl.dataset.id) S.updateExercise(actEl.dataset.id, data);
        else {
          const created = S.addExercise(data);
          if (UI.route() === 'plan') S.addToPlan(UI.picker().day, created.id);
        }
        UI.closeSheet();
        UI.toast('💾 <span>Saved</span>');
        break;
      }
      case 'habit-add':
        UI.openTextPrompt({
          title: 'New daily habit',
          label: 'Habit',
          placeholder: 'e.g. Meditate 10 min',
          confirmLabel: 'Add habit',
          onSave: (name) => S.addHabit(name, '✅')
        });
        break;
      /* A habit is a tick that asks the same thing forever; a goal ramps and is
         earned by performing. The editor opens pre-filled with the habit's name
         and icon and carries its id, so saving MOVES it rather than leaving the
         same commitment on two lists with two ticks. The numbers cannot be
         guessed — only the user knows where they actually are today — so this
         opens the form rather than converting on the tap. */
      case 'habit-to-goal': {
        const h = S.habitById(id);
        if (!h) break;
        UI.openGoalEditor(null, { name: h.name, icon: h.icon || '🎯', fromHabit: h.id });
        break;
      }
      case 'habit-rm': {
        const h = S.habitById(id);
        if (!h) break;
        UI.openConfirm({
          title: `Delete ${h.name}?`,
          body: 'The habit is removed from every future day. Days you already logged keep their record.',
          confirmLabel: 'Delete habit',
          danger: true,
          onConfirm: () => S.removeHabit(id)
        });
        break;
      }

      /* --- today ---
         These two were deleted by accident in 2026-08 along with the onboarding
         handlers that happened to sit above them in the same switch, and nothing
         noticed for a commit: ticking an exercise or a daily habit silently did
         nothing on the one screen the app is opened for. See the tests in
         tools/wire.js that now cover both. */
      case 'toggle-ex':
        act(() => S.toggleExercise(date, id));
        break;
      case 'toggle-hb':
        act(() => S.toggleHabit(date, id));
        break;
      case 'starting-ack':
        S.acknowledgeStart();
        break;
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
      case 'workout-more':
        UI.toggleWorkoutOpen();
        UI.render();
        break;
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
              UI.toast('⚠️ <span>That file could not be read as a picture — try a JPEG or PNG from your gallery.</span>', 'bad');
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
              if (saved) UI.toast('🖼 <span>Picture saved on this device.</span>');
              else UI.toast('⚠️ <span>This browser will not store pictures — it is showing but will not survive a reload.</span>', 'bad');
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
            now ? '💪 <span>Workout logged.</span>' : '<span>Workout unticked.</span>',
            () => S.restoreExercises(date, before)
          );
        }
        break;
      }

      /* --- the 66-day run --- */
      case 'run-start': {
        const sel = $('#run_budget');
        const budget = sel ? Number(sel.value) : 45;
        const picks = UI.runPicks();
        S.startRun(picks, budget, UI.runTogether(), UI.draftItems(), UI.draftCustoms());
        const refused = S.takeRunRefusals();
        UI.resetRunPicks();
        UI.go('run');
        /* Say what the budget forced out, by name. `buildRun` repairs rather
           than refusing — every one of the 66 days has to be doable — so a
           selection that does not fit comes back smaller, and a start screen
           that quietly returned four of the seven things somebody chose would
           be the app deciding for them without saying so. */
        const got = S.run().habits.map((p) => p.habitId);
        const dropped = picks.filter((id) => got.indexOf(id) < 0)
          .map((id) => (A.Run.habitIn(S.run(), id) || { name: id }).name)
          // Written habits are refused by name rather than by id — they have no
          // id until the run accepts them — so both lists say the same thing.
          .concat(refused.map((r) => r.name));
        const paused = S.takeRunPaused();
        if (paused.length) {
          UI.toast('⏸ <span><b>' + esc(paused.join(', ')) +
                   '</b> ' + (paused.length === 1 ? 'is' : 'are') +
                   ' paused while the run holds ' + (paused.length === 1 ? 'it' : 'them') +
                   ' — everything already earned stays.</span>', 'gold');
        }
        if (dropped.length) {
          UI.toast('🗓 <span>Day 1 of 66. <b>' + esc(dropped.join(', ')) +
                   '</b> did not fit ' + budget + ' min a day and was left out.</span>', 'gold');
        } else {
          UI.toast('🗓 <span>Day 1 of 66. It starts now.</span>');
        }
        break;
      }
      /* Editing a run in progress. Both refuse rather than repair: an addition
         that does not fit is not made, and a removal at the habit floor is not
         offered. Repairing either would let one tap sacrifice a habit the user
         is three weeks into. */
      case 'run-add-open':
        UI.openRunAdd();
        break;
      case 'run-add': {
        const added = S.runAddHabit(id);
        const h = A.Run.habit(id);
        if (added) {
          UI.closeSheet();
          UI.toast('➕ <span><b>' + esc(h ? h.name : id) + '</b> joins the run on day ' + added.startDay + '.</span>');
        } else {
          UI.toast('⚠️ <span>No room for <b>' + esc(h ? h.name : id) + '</b> — every legal start day is taken.</span>', 'bad');
        }
        break;
      }
      case 'run-custom-open':
        UI.openRunCustom();
        break;
      /* A goal, offered to the run. It opens the same sheet rather than adding
         on the tap, because a goal carries no minutes cost and the budget check
         is built on one — the number is asked for instead of invented. */
      case 'run-goal-add': {
        const cand = S.runCandidateGoals().find((r) => r.goal.id === id);
        if (!cand || !cand.eligible) break;
        UI.openRunCustom(cand.draft);
        break;
      }
      case 'run-custom-rm':
        UI.removeDraftCustom(actEl.dataset.key);
        UI.render();
        break;
      case 'run-custom-save': {
        /* Before the run exists there is nothing to add it TO, so it waits on
           the picker with the ticked ones and `startRun` places it. Same form,
           same validation — `addDraftCustom` cleans through `A.Run.cleanCustom`,
           which is the function the store would have used — so what the list
           shows is what the run will actually try to take. */
        if (!S.run()) {
          const draft = UI.addDraftCustom({
            name: ($('#rc_name') && $('#rc_name').value) || '',
            unit: ($('#rc_unit') && $('#rc_unit').value) || 'min',
            domain: ($('#rc_domain') && $('#rc_domain').value) || 'self_care',
            start: numVal('rc_start', NaN),
            target: numVal('rc_target', NaN),
            step: numVal('rc_step', NaN),
            friction: numVal('rc_friction', 2),
            minutesAtTarget: numVal('rc_at_target', NaN),
            fromGoal: ($('#rc_from_goal') && $('#rc_from_goal').value) || '',
            min: 1
          });
          if (!draft) {
            UI.toast('⚠️ <span>Give it a name, and numbers that build upward.</span>', 'bad');
          } else if (draft.refused === 'full') {
            UI.toast('⚠️ <span>A run holds at most ' + A.Run.MAX_HABITS + ' habits.</span>', 'bad');
          } else if (draft.refused === 'already') {
            UI.toast('⚠️ <span>That goal is already on the list.</span>', 'bad');
          } else {
            UI.closeSheet();
            UI.toast('➕ <span><b>' + esc(draft.name) + '</b> is on the list.</span>');
          }
          UI.render();
          break;
        }
        const out = S.runAddCustomHabit({
          name: ($('#rc_name') && $('#rc_name').value) || '',
          unit: ($('#rc_unit') && $('#rc_unit').value) || 'min',
          domain: ($('#rc_domain') && $('#rc_domain').value) || 'self_care',
          start: numVal('rc_start', NaN),
          target: numVal('rc_target', NaN),
          step: numVal('rc_step', NaN),
          friction: numVal('rc_friction', 2),
          min: 1
        });
        /* Each refusal says which one it is. "It didn't work" on a form the user
           just filled in is the least useful thing an app can say. */
        if (!out || out.refused === 'invalid') {
          UI.toast('⚠️ <span>Give it a name, and numbers that build upward.</span>', 'bad');
        } else if (out.refused === 'full') {
          UI.toast('⚠️ <span>This run already holds ' + A.Run.MAX_HABITS + ' habits.</span>', 'bad');
        } else if (out.refused === 'no_room') {
          UI.toast('⚠️ <span>It does not fit — every legal start day is taken, or it would make a day you could not do.</span>', 'bad');
        } else {
          UI.closeSheet();
          UI.toast('➕ <span><b>' + esc(out.name) + '</b> joins the run on day ' + out.startDay + '.</span>');
        }
        break;
      }
      case 'run-remove': {
        const h = A.Run.habitIn(S.run(), id);
        UI.openConfirm({
          title: 'Remove ' + (h ? h.name : 'this habit') + '?',
          body: 'It stops being asked for from today. Every day you have already recorded keeps exactly what it asked for, and the days you earned do not change.',
          confirmLabel: 'Remove it',
          danger: true,
          onConfirm: () => {
            const out = S.runRemoveHabit(id);
            if (out && out.refused === 'floor') {
              UI.toast('⚠️ <span>A run needs at least ' + A.Run.MIN_HABITS + ' habits.</span>', 'bad');
            } else if (out) {
              UI.toast('<span><b>' + esc(h ? h.name : id) + '</b> is out of the run.</span>');
            }
          }
        });
        break;
      }
      case 'run-together':
        UI.toggleRunTogether();
        UI.render();
        break;
      case 'run-edit-items':
        UI.openRunItems(id);
        break;
      case 'run-pick':
        // Repaint the picker, not the page. See UI.refreshRunPicker.
        UI.toggleRunPick(id);
        UI.refreshRunPicker();
        break;
      case 'run-end':
        UI.openConfirm({
          title: 'End the 66-day run?',
          body: 'The 66 days of habits and everything recorded against them are erased, and that cannot be undone. This is not your countdown — your goals, logs, streaks and journal are not touched.',
          confirmLabel: 'End the 66-day run',
          danger: true,
          onConfirm: () => {
            S.endRun();
            UI.go('run');
          }
        });
        break;
      case 'run-tick': {
        // The run's own tick. Deliberately not routed through `act()`: a run day
        // is not what the XP and milestone diff is computed from, and firing
        // confetti for it would be the app claiming credit on the wrong ledger.
        const row = S.toggleRunHabit(id);
        if (row && row.done) buzz(12);
        break;
      }
      case 'run-value':
        UI.openRunValue(id);
        break;
      case 'run-item':
        S.toggleRunItem(id, actEl.dataset.item);
        break;
      case 'run-save-items': {
        const box = $('#run_items');
        if (!box) break;
        /* Before a run exists the list has nowhere to be stored against, so it
           waits in the picker's draft and is handed to `startRun`. Editing what
           is inside a habit before committing to 66 days of it is most of why
           the editor is reachable from the picker at all. */
        const lines = box.value.split(/\r?\n/);
        const saved = S.run() ? S.setRunItems(id, lines) : UI.setDraftItems(id, lines);
        UI.closeSheet();
        if (!saved) UI.toast('🗓 <span>A checklist needs at least one step, so nothing was saved.</span>', 'gold');
        else if (!S.run()) UI.render();
        break;
      }
      case 'run-save-value': {
        const el = $('#run_val');
        if (!el) break;
        S.setRunValue(id, el.value === '' ? null : el.value);
        UI.closeSheet();
        break;
      }
      case 'run-accept': {
        /* Rebuilt from data attributes rather than an index: the list the user
           tapped and the list a handler would recompute are two different
           objects, and `applyRecommendation` re-checks anyway — it declines
           rather than repairing when the run has moved underneath it. */
        const dayAttr = actEl.dataset.day;
        const out = S.runApply({
          kind: actEl.dataset.kind,
          habitId: id,
          startDay: dayAttr === '' || dayAttr == null ? null : Number(dayAttr)
        });
        if (out) UI.toast('🗓 <span>' + esc(out.notes[0]) + '</span>');
        break;
      }

      /* --- app --- */
      case 'install':
        if (deferredInstall) {
          deferredInstall.prompt();
          deferredInstall.userChoice.finally(() => {
            deferredInstall = null;
          });
        } else {
          UI.toast('📲 <span>Use your browser menu → “Install app”</span>');
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
        UI.toast('⬇️ <span>Backup downloaded</span>');
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
        UI.toast('⬇️ <span>Unreadable copy downloaded</span>');
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
            body: `That file holds ${held}.\n\nRestoring it replaces everything currently on this device — your plan, logs, streaks, goals and journal. This cannot be undone.`,
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
                  UI.toast(n ? `✅ <span>Data restored, with ${n} picture${n === 1 ? '' : 's'}</span>`
                             : '✅ <span>Data restored</span>');
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
            UI.toast('🔄 <span>Fresh start</span>');
          }
        });
        break;
    }
  });

  /* ---------- swipe and hold on a goal card ----------
     The tick is a 40px target in the far corner of a full-width card; on a phone
     held in one hand that is the hardest pixel on the screen to reach. These
     give the same three actions a target the size of the whole card:

       swipe right    keep it          (the tick, without aiming at the tick)
       swipe left     skip it
       press and hold log part of it   (the value sheet)

     All three end in `keepGoal` / `skipGoal` / `UI.openGoalLog` — the same
     functions a tap goes through — so a gesture can never mean something a tap
     does not. Nothing here is covered by the suites: it is event wiring in
     app.js, which neither suite loads. Drive it by hand in a browser. */

  const SWIPE_COMMIT = 92; // px of travel before a gesture means it
  const HOLD_MS = 480;     // press that becomes "open it and log part of it"

  let drag = null;
  let holdTimer = null;
  /* A committed swipe still ends in a click on whatever was under the finger —
     usually .gcard-open, which would open the sheet on top of the action just
     taken. Swallow exactly one. */
  let swallowClick = false;

  function endDrag() {
    if (!drag) return;
    drag.card.classList.remove('is-swiping', 'will-keep', 'will-skip');
    drag.card.style.transform = '';
    drag = null;
  }

  function cardGoalId(card) {
    return card.dataset.goal || '';
  }

  document.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    const card = ev.target.closest && ev.target.closest('.gcard');
    if (!card || card.classList.contains('locked')) return;
    if (ev.target.closest('.gcard-tick')) return; // the tick is its own control

    const id = cardGoalId(card);
    if (!id) return;
    drag = { card: card, x: ev.clientX, dx: 0, moved: false };

    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (!drag || drag.moved) return;
      endDrag();
      swallowClick = true;
      buzz(10);
      UI.openGoalLog(id, UI.viewDate());
    }, HOLD_MS);
  });

  window.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x;
    // Under the slop threshold this is still a tap, or a vertical scroll.
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      clearTimeout(holdTimer);
      drag.card.classList.add('is-swiping');
    }
    if (!drag.moved) return;
    drag.dx = Math.max(-150, Math.min(150, dx));
    drag.card.style.transform = `translateX(${drag.dx}px)`;
    // The card states its own verdict while it moves, so releasing is never a guess.
    drag.card.classList.toggle('will-keep', drag.dx > SWIPE_COMMIT);
    drag.card.classList.toggle('will-skip', drag.dx < -SWIPE_COMMIT);
  });

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    clearTimeout(holdTimer);
    const id = cardGoalId(drag.card);
    const dx = drag.dx;
    const moved = drag.moved;
    endDrag();
    if (!moved) return;
    swallowClick = true;
    if (dx > SWIPE_COMMIT) keepGoal(id, UI.viewDate());
    else if (dx < -SWIPE_COMMIT) skipGoal(id, UI.viewDate());
  });

  window.addEventListener('pointercancel', () => {
    clearTimeout(holdTimer);
    endDrag();
  });

  document.addEventListener(
    'click',
    (ev) => {
      if (!swallowClick) return;
      swallowClick = false;
      if (ev.target.closest && ev.target.closest('.gcard')) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    },
    true // capture: it has to run before the router below it
  );

  /* ---------- inputs ---------- */

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.id === 'dayNote') S.setJournal(t.dataset.date || UI.viewDate(), { text: t.value });
    /* The word count beside the Save button, updated in place. A re-render
       would rebuild the textarea and take the caret with it, which is why this
       writes one element rather than calling UI.render(). */
    else if (t.id === 'r_summary') {
      const out = document.getElementById('r_words');
      if (out) out.textContent = UI.wordCount(t.value) + ' words · any length counts';
    }
    else if (t.id === 'pickerQ') {
      UI.setPicker({ q: t.value });
      UI.refreshPicker();
      const q = document.getElementById('pickerQ');
      if (q) {
        q.focus();
        q.setSelectionRange(q.value.length, q.value.length);
      }
    }
  });

  const NUMERIC_SETTINGS = { completionPct: 1, dayBoundaryHour: 1 };

  document.addEventListener('change', (ev) => {
    const t = ev.target;

    // Changing the unit swaps clock fields for number fields — rebuild the sheet
    // from what's already typed rather than throwing the user's input away.
    // Which goal a reward tracks only applies when it tracks a goal at all, so
    // rebuild the sheet from what is already typed rather than hiding a field
    // that would still be read on save.
    if (t.id === 'rw_source') {
      const saveBtn = document.querySelector('[data-act="reward-save"]');
      UI.openRewardEditor((saveBtn && saveBtn.dataset.id) || null, readRewardForm());
      return;
    }
    // Changing what an exercise is measured in relabels one field and retires
    // two others, so rebuild from what is already typed.
    if (t.id === 'e_unit') {
      const saveBtn = document.querySelector('[data-act="lib-save"]');
      UI.openExerciseEditor((saveBtn && saveBtn.dataset.id) || null, readExerciseForm());
      return;
    }
    // gg_sched and gg_reg decide which fields apply at all, so the sheet is
    // rebuilt to show or hide them rather than leaving dead controls on screen.
    if (t.id === 'gg_unit' || t.id === 'gg_sched' || t.id === 'gg_reg') {
      const saveBtn = document.querySelector('[data-act="goal-save"]');
      const editingId = saveBtn && saveBtn.dataset.id ? saveBtn.dataset.id : null;
      const draft = readGoalForm(editingId ? S.goalById(editingId) : null);
      if (t.id === 'gg_unit') {
        draft.baseline = null;
        draft.target = null;
      }
      UI.openGoalEditor(editingId, draft);
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
          if (p !== 'granted') UI.toast('🔕 <span>Notifications blocked — the app still tracks everything</span>');
        });
      } else if (Notification.permission === 'denied') {
        UI.toast('🔕 <span>Notifications are blocked in your browser settings</span>');
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
  window.addEventListener('appinstalled', () => UI.toast('🎉 <span>Discipline installed</span>'));

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
    const open = S.goalsForDay(k).filter((e) => !e.done && !e.skipped);
    if (!open.length) return;
    lastNudge = k;
    try {
      new Notification('Discipline', {
        body: `${open.length} goal${open.length === 1 ? '' : 's'} still open — ${left} min before the day rolls over.`,
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
      S.runCheckIn();
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
    // The run's daily check-in: a once-a-day event, deliberately not
    // something a render does. See Store.runCheckIn.
    S.runCheckIn();
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
