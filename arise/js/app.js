/* Arise — wiring: events, celebrations, install prompt, service worker. */
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

  /** Run a mutation, then diff for anything worth celebrating. */
  function act(fn) {
    const before = snapshot();
    fn();
    celebrate(before);
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
      how: howEl ? howEl.value.trim() : undefined
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
        act(() => S.hitGoalTarget(sheetDate, id));
        break;
      case 'goal-log':
        UI.openGoalLog(id, sheetDate);
        break;
      case 'goal-detail':
        UI.openGoalDetail(id);
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
        S.skipGoal(sheetDate, id);
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
        if (existing) S.updateGoal(id, data);
        else S.addGoal(data);
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
        UI.toast('📖 <span>Summary saved — reading complete</span>', 'gold');
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
      case 'onboard':
        UI.openOnboarding();
        break;
      case 'onboard-save': {
        const wake = S.activeGoals().find((g) => g.section === 'sleep' && g.direction === 'down' && g.unit === 'time');
        const bed = S.activeGoals().find((g) => g.section === 'sleep' && g !== wake);
        const t = (sel) => {
          const el = $(sel);
          return el ? A.hhmmToMin(el.value) : null;
        };
        if (wake) {
          const b = t('#ob_wake_now');
          const g2 = t('#ob_wake_goal');
          if (b != null && g2 != null && b !== g2) S.updateGoal(wake.id, { baseline: b, target: g2, startDate: S.today() });
        }
        if (bed) {
          const b = t('#ob_bed_now');
          const g2 = t('#ob_bed_goal');
          if (b != null && g2 != null && b !== g2) S.updateGoal(bed.id, { baseline: b, target: g2, startDate: S.today() });
        }
        const picked = document.querySelector('input[name="ob_mode"]:checked');
        S.completeOnboarding({
          name: ($('#ob_name') && $('#ob_name').value.trim()) || 'Hunter',
          mode: picked ? picked.value : S.settings().mode,
          dayBoundaryHour: Number(($('#ob_boundary') && $('#ob_boundary').value) || 4)
        });
        UI.closeSheet();
        UI.toast('🚀 <span>You are set. One day at a time.</span>', 'gold');
        break;
      }

      /* --- today --- */
      case 'toggle-ex':
        act(() => S.toggleExercise(date, id));
        break;
      case 'toggle-hb':
        act(() => S.toggleHabit(date, id));
        break;
      case 'complete-all':
        act(() => S.completeAll(date));
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
      case 'rm-extra':
        S.removeExtra(date, id);
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
            ? `You kept ${done.kept} of ${done.days} days. It moves to your finished runs and the counter goes back to counting plain days.`
            : `You are on day ${done.day} of ${done.days}, having kept ${done.kept}. Ending it now keeps the record — nothing you logged is lost — but the run stops here.`,
          confirmLabel: done.complete ? 'Archive it' : 'End the run',
          danger: !done.complete,
          onConfirm: () => {
            S.endChallenge(run.id);
            UI.toast('🏁 <span>Run archived</span>');
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
      case 'plan-rm':
        S.removePlanItem(day, id);
        UI.closeSheet();
        break;
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
      case 'export':
        download(`arise-backup-${A.key()}.json`, S.exportJson());
        UI.toast('⬇️ <span>Backup downloaded</span>');
        break;
      case 'download-unreadable': {
        // Arise cannot parse these bytes, but they are still the user's data and
        // getting them off the device is worth more than anything we can say.
        const raw = S.unreadableBackup();
        if (raw == null) {
          UI.openConfirm({
            title: 'The unreadable copy is gone',
            body: 'Arise could not find the data it failed to read, so there is nothing to download. Restore from a backup instead — More → Import.',
            confirmLabel: 'OK'
          });
          break;
        }
        download(`arise-unreadable-${A.key()}.json`, raw);
        UI.toast('⬇️ <span>Unreadable copy downloaded</span>');
        break;
      }
      case 'import':
        pickFile((text) => {
          try {
            S.importJson(text);
            UI.toast('✅ <span>Data restored</span>');
          } catch (err) {
            // An import failure must stay legible — the toast is transient, so the
            // reason goes in a sheet the user can actually read and dismiss.
            UI.openConfirm({
              title: 'That backup could not be read',
              body: `${err.message}\n\nYour existing data has not been touched. Pick a file exported from Arise with More → Export.`,
              confirmLabel: 'OK'
            });
          }
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

  /* ---------- inputs ---------- */

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.id === 'dayNote') S.setJournal(t.dataset.date || UI.viewDate(), { text: t.value });
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

    // Onboarding difficulty is a radio group inside a sheet we don't re-render.
    if (t.name === 'ob_mode') {
      document.querySelectorAll('.mode-card').forEach((c) => c.classList.toggle('on', c.contains(t) && t.checked));
      return;
    }
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
  window.addEventListener('appinstalled', () => UI.toast('🎉 <span>Arise installed</span>'));

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
      new Notification('Arise', {
        body: `${open.length} goal${open.length === 1 ? '' : 's'} still open — ${left} min before the day rolls over.`,
        icon: './icons/icon-192.png',
        tag: 'arise-day'
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
  } catch (err) {
    console.error('Arise: failed to start.', err);
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
  // Never invite someone to re-onboard on top of data we could not read — the
  // sheet would bury the one banner offering their history back.
  if (!S.get().meta.onboarded && !S.get().meta.storageError) setTimeout(() => UI.openOnboarding(), 400);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
    });
  }
})(window);
