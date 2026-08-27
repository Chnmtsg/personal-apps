/**
 * The maths, tested by property before any of it was drawn on a screen.
 *
 * Example tests pin the spec's formulas. The property tests exist because the
 * failures that matter here are not the ones anybody thinks to type in: a
 * falling target, a division by zero, a duplicate check-in bending a forecast.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

import {
  PACE_BANDS,
  PACE_AT_RISK,
  PACE_ON_TRACK,
  PROGRESS_CEILING,
  PROJECTION_HORIZON_DAYS,
  VELOCITY_MIN_POINTS,
  direction,
  expectedProgress,
  goalProgress,
  indicatorProgress,
  pace,
  paceLabel,
  projection,
  reachedTarget,
  series,
  summarise,
  velocity,
} from '../src/core/math.js';
import { fromDayNumber } from '../src/core/time.js';

/** Values a person could actually type. Wide, but not 1e308 wide. */
const measurement = () => fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true });

const dayIso = (day) => fromDayNumber(day);

const checkInsFrom = (values, startDay = 20000, step = 7) =>
  values.map((value, index) => ({
    id: `chk_${index}`,
    indicatorId: 'ind_1',
    value,
    date: dayIso(startDay + index * step),
    createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
  }));

// ---------------------------------------------------------------- the formula

test('indicatorProgress is the fraction of the distance from baseline to target', () => {
  assert.equal(indicatorProgress({ baseline: 0, current: 25, target: 100 }), 0.25);
  assert.equal(indicatorProgress({ baseline: 40, current: 55, target: 100 }), 0.25);
});

test('a falling target needs no special case', () => {
  // 92kg down to 84kg, currently 88kg — half way, by the same formula.
  assert.equal(indicatorProgress({ baseline: 92, current: 88, target: 84, direction: 'down' }), 0.5);
});

test('progress clamps to [0, 1.25] so overshoot stays visible', () => {
  assert.equal(indicatorProgress({ baseline: 0, current: -50, target: 100 }), 0);
  assert.equal(indicatorProgress({ baseline: 0, current: 200, target: 100 }), PROGRESS_CEILING);
  assert.equal(indicatorProgress({ baseline: 0, current: 110, target: 100 }), 1.1);
});

test('baseline == target is complete only once the number is reached', () => {
  assert.equal(indicatorProgress({ baseline: 70, current: 70, target: 70, direction: 'up' }), 1);
  assert.equal(indicatorProgress({ baseline: 70, current: 69, target: 70, direction: 'up' }), 0);
  assert.equal(indicatorProgress({ baseline: 70, current: 71, target: 70, direction: 'up' }), 1);
  assert.equal(indicatorProgress({ baseline: 70, current: 69, target: 70, direction: 'down' }), 1);
  assert.equal(indicatorProgress({ baseline: 70, current: 71, target: 70, direction: 'down' }), 0);
});

test('unreadable numbers give null, never a fabricated zero', () => {
  assert.equal(indicatorProgress({ baseline: null, current: 5, target: 10 }), null);
  assert.equal(indicatorProgress({ baseline: 0, current: undefined, target: 10 }), null);
  assert.equal(indicatorProgress(undefined), null);
});

test('goalProgress is the weighted mean, and skips indicators it cannot read', () => {
  const indicators = [
    { baseline: 0, current: 100, target: 100, weight: 3 },
    { baseline: 0, current: 0, target: 100, weight: 1 },
  ];
  assert.equal(goalProgress(indicators), 0.75);
  assert.equal(goalProgress([...indicators, { baseline: null, current: 1, target: 2, weight: 99 }]), 0.75);
  assert.equal(goalProgress([]), null);
  assert.equal(goalProgress([{ baseline: null, current: null, target: null }]), null);
});

test('expectedProgress is the fraction of the calendar spent, clamped', () => {
  assert.equal(expectedProgress('2026-01-01', '2026-01-11', '2026-01-06'), 0.5);
  assert.equal(expectedProgress('2026-01-01', '2026-01-11', '2025-12-01'), 0);
  assert.equal(expectedProgress('2026-01-01', '2026-01-11', '2027-01-01'), 1);
});

test('an inverted or zero-length window never divides by zero', () => {
  assert.equal(expectedProgress('2026-01-01', '2026-01-01', '2026-01-01'), 1);
  assert.equal(expectedProgress('2026-01-01', '2026-01-01', '2025-12-31'), 0);
  assert.equal(expectedProgress('2026-06-01', '2026-01-01', '2026-03-01'), 1);
});

test('pace is progress minus the calendar, and is never merged into progress', () => {
  assert.ok(Math.abs(pace(0.6, 0.8) + 0.2) < 1e-12);
  assert.equal(pace(0.5, 0.5), 0);
  assert.equal(pace(null, 0.5), null);
});

// ------------------------------------------------------------------ the bands

test('pace labels sit where the spec puts them, boundaries included', () => {
  assert.equal(paceLabel(0.2), 'ahead');
  assert.equal(paceLabel(PACE_ON_TRACK), 'on-track');
  assert.equal(paceLabel(-PACE_ON_TRACK), 'on-track');
  assert.equal(paceLabel(0), 'on-track');
  assert.equal(paceLabel(-0.1), 'behind');
  assert.equal(paceLabel(PACE_AT_RISK), 'behind');
  assert.equal(paceLabel(-0.5), 'at-risk');
  assert.equal(paceLabel(null), null);
  assert.equal(paceLabel(NaN), null);
});

test('property: pace labels are exhaustive and mutually exclusive', () => {
  fc.assert(fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (value) => {
    const label = paceLabel(value);
    assert.ok(PACE_BANDS.includes(label), `no band for ${value}`);

    // Written out independently of the implementation, so a reordered chain of
    // ifs in math.js cannot quietly agree with itself.
    const bands = {
      'at-risk': value < PACE_AT_RISK,
      behind: value >= PACE_AT_RISK && value < -PACE_ON_TRACK,
      'on-track': value >= -PACE_ON_TRACK && value <= PACE_ON_TRACK,
      ahead: value > PACE_ON_TRACK,
    };
    const matched = Object.entries(bands).filter(([, hit]) => hit).map(([name]) => name);
    assert.equal(matched.length, 1, `${value} matched ${matched.join(', ')}`);
    assert.equal(label, matched[0]);
  }));
});

// ------------------------------------------------------------- the properties

test('property: progress is monotonic in current, in the direction of travel', () => {
  fc.assert(fc.property(measurement(), measurement(), measurement(), measurement(), (baseline, target, a, b) => {
    fc.pre(baseline !== target);
    const [lower, higher] = a <= b ? [a, b] : [b, a];

    const at = (current) => indicatorProgress({ baseline, current, target });
    if (target > baseline) {
      assert.ok(at(lower) <= at(higher), `rising: ${at(lower)} > ${at(higher)}`);
    } else {
      assert.ok(at(lower) >= at(higher), `falling: ${at(lower)} < ${at(higher)}`);
    }
  }));
});

test('property: progress stays inside [0, 1.25] for anything readable', () => {
  fc.assert(fc.property(measurement(), measurement(), measurement(), (baseline, current, target) => {
    const progress = indicatorProgress({ baseline, current, target });
    assert.ok(progress >= 0 && progress <= PROGRESS_CEILING, `${progress} out of range`);
  }));
});

test("property: 'down' is the mirror image of 'up'", () => {
  fc.assert(fc.property(measurement(), measurement(), measurement(), (baseline, current, target) => {
    const rising = { baseline, current, target, direction: 'up' };
    // Mirror every number through zero. The distance travelled is unchanged,
    // only its sign, so every answer about it must be unchanged too.
    const falling = { baseline: -baseline, current: -current, target: -target, direction: 'down' };

    assert.equal(indicatorProgress(falling), indicatorProgress(rising));
    assert.equal(reachedTarget(falling), reachedTarget(rising));
  }));
});

test("property: a projection mirrors with the indicator it belongs to", () => {
  fc.assert(fc.property(
    fc.array(fc.double({ min: -1000, max: 1000, noNaN: true }), { minLength: 3, maxLength: 8 }),
    fc.double({ min: -1000, max: 1000, noNaN: true }),
    (values, target) => {
      const current = values[values.length - 1];
      const rising = projection({ baseline: values[0], current, target, direction: 'up' }, checkInsFrom(values), '2026-01-01');
      const falling = projection(
        { baseline: -values[0], current: -current, target: -target, direction: 'down' },
        checkInsFrom(values.map((value) => -value)),
        '2026-01-01',
      );
      assert.equal(falling.status, rising.status);
      assert.equal(falling.date ?? null, rising.date ?? null);
    },
  ));
});

test('property: baseline == target never throws, and answers 0 or 1', () => {
  fc.assert(fc.property(measurement(), measurement(), fc.constantFrom('up', 'down'), (value, current, dir) => {
    const indicator = { baseline: value, current, target: value, direction: dir };
    const progress = indicatorProgress(indicator);
    assert.ok(progress === 0 || progress === 1, `${progress} is neither 0 nor 1`);
    assert.equal(goalProgress([indicator]), progress);
    assert.doesNotThrow(() => projection(indicator, [], '2026-01-01'));
  }));
});

test('property: a duplicate check-in does not move the projection', () => {
  fc.assert(fc.property(
    fc.array(fc.double({ min: -500, max: 500, noNaN: true }), { minLength: 3, maxLength: 8 }),
    fc.nat(),
    fc.double({ min: -500, max: 500, noNaN: true }),
    (values, pick, target) => {
      const checkIns = checkInsFrom(values);
      const original = checkIns[pick % checkIns.length];
      // The same reading, entered twice — a double tap on Save, or a sync that
      // ran once too often. It is one measurement and must count once.
      const duplicate = { ...original, id: `${original.id}_again`, createdAt: '2027-01-01T00:00:00.000Z' };

      const indicator = { baseline: values[0], current: values[values.length - 1], target, direction: 'up' };
      const before = projection(indicator, checkIns, '2026-01-01');
      const after = projection(indicator, [...checkIns, duplicate], '2026-01-01');

      assert.deepEqual(after, before);
      assert.equal(velocity([...checkIns, duplicate]), velocity(checkIns));
      assert.equal(series([...checkIns, duplicate]).length, series(checkIns).length);
    },
  ));
});

// ------------------------------------------------------------ velocity & date

test('velocity is the least-squares slope in units per day', () => {
  // 10 units every 7 days.
  const checkIns = checkInsFrom([0, 10, 20, 30]);
  assert.ok(Math.abs(velocity(checkIns) - 10 / 7) < 1e-12);
});

test('velocity refuses to guess from too few points, or from one day', () => {
  assert.equal(velocity(checkInsFrom([1, 2])), null);
  assert.equal(velocity([]), null);
  const sameDay = checkInsFrom([1, 2, 3], 20000, 0);
  assert.equal(velocity(sameDay), null, 'every reading on one day has no slope');
  assert.equal(VELOCITY_MIN_POINTS, 3);
});

test('velocity reads only the last five readings', () => {
  const stalled = [...checkInsFrom([0, 50, 100, 150], 20000, 7), ...checkInsFrom([150, 150, 150, 150], 20028, 7)];
  assert.ok(Math.abs(velocity(stalled)) < 1e-12, 'an old sprint must not hide a current stall');
});

test('a same-day correction replaces the reading it corrects', () => {
  const checkIns = checkInsFrom([10, 20, 30]);
  const corrected = [...checkIns, { ...checkIns[2], id: 'fix', value: 25, createdAt: '2027-01-01T00:00:00.000Z' }];
  assert.equal(series(corrected).length, 3);
  assert.equal(series(corrected)[2].value, 25);
});

test('projection turns velocity into a date', () => {
  const checkIns = checkInsFrom([0, 10, 20, 30]);
  const result = projection({ baseline: 0, current: 30, target: 100, direction: 'up' }, checkIns, '2026-01-01');
  assert.equal(result.status, 'projected');
  // 70 to go at 10/7 per day is 49 days.
  assert.equal(result.days, 49);
  assert.equal(result.date, '2026-02-19');
});

test('projection says "no movement" instead of printing a date in 2098', () => {
  const flat = projection({ baseline: 0, current: 30, target: 100 }, checkInsFrom([30, 30, 30, 30]), '2026-01-01');
  assert.equal(flat.status, 'no-movement');

  const backwards = projection({ baseline: 0, current: 30, target: 100 }, checkInsFrom([60, 50, 40, 30]), '2026-01-01');
  assert.equal(backwards.status, 'no-movement', 'moving away from the target is not a forecast');

  const tooSlow = projection({ baseline: 0, current: 30, target: 1e6 }, checkInsFrom([0, 10, 20, 30]), '2026-01-01');
  assert.equal(tooSlow.status, 'beyond-horizon');
  assert.ok(tooSlow.days > PROJECTION_HORIZON_DAYS);
  assert.equal(tooSlow.date, undefined);
});

test('projection reports a target already met', () => {
  const reached = projection({ baseline: 0, current: 120, target: 100, direction: 'up' }, checkInsFrom([0, 40, 80, 120]), '2026-01-01');
  assert.equal(reached.status, 'reached');

  const lost = projection({ baseline: 92, current: 83, target: 84, direction: 'down' }, checkInsFrom([92, 89, 86, 83]), '2026-01-01');
  assert.equal(lost.status, 'reached');
});

test('direction is inferred from the numbers when it was never stated', () => {
  assert.equal(direction({ baseline: 92, target: 84 }), 'down');
  assert.equal(direction({ baseline: 0, target: 100 }), 'up');
  assert.equal(direction({ baseline: 92, target: 84, direction: 'up' }), 'up', 'a stated direction wins');
});

test('summarise keeps progress and pace as two separate numbers', () => {
  const goal = { startDate: '2026-01-01', targetDate: '2026-01-11' };
  const indicators = [{ baseline: 0, current: 20, target: 100, weight: 1, kind: 'lagging' }];
  const summary = summarise(goal, indicators, '2026-01-06');

  assert.equal(summary.progress, 0.2);
  assert.equal(summary.expected, 0.5);
  assert.ok(Math.abs(summary.pace + 0.3) < 1e-12);
  assert.equal(summary.paceLabel, 'at-risk');
  assert.equal(summary.daysRemaining, 5);
  assert.equal(summary.hasLeading, false);
});
