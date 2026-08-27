/**
 * The three drawings, hand-rolled.
 *
 * No chart library. These are the only three shapes the app needs, each one has
 * a rule a general-purpose library would get wrong, and the rules are the point:
 *
 *   ring        overshoot past the target has to stay visible
 *   sparkline   a flat line must look flat, not be auto-zoomed into drama
 *   projection  the forecast is drawn against the deadline, not beside it
 *
 * Everything scales from a viewBox, so one drawing serves every screen width.
 */

import { s } from './dom.js';
import { toDayNumber } from '../core/time.js';
import { PROGRESS_CEILING } from '../core/math.js';

/**
 * A progress ring, with a tick where the calendar says the user should be.
 *
 * The tick is not the pace — pace is a separate number, printed as a chip. It
 * is there so the ring can be read at a glance without becoming a single
 * merged score.
 */
export function ring(progress, expected, { size = 72, stroke = 7, label } = {}) {
  const radius = (size - stroke) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const known = Number.isFinite(progress);
  const shown = known ? Math.min(progress, 1) : 0;

  const arc = (fraction, className) => s('circle', {
    class: className,
    cx: centre,
    cy: centre,
    r: radius,
    fill: 'none',
    'stroke-width': stroke,
    'stroke-linecap': fraction >= 1 ? 'butt' : 'round',
    'stroke-dasharray': `${Math.max(0, fraction) * circumference} ${circumference}`,
    // Start at twelve o'clock rather than three.
    transform: `rotate(-90 ${centre} ${centre})`,
  });

  const parts = [
    s('circle', { class: 'ring-track', cx: centre, cy: centre, r: radius, fill: 'none', 'stroke-width': stroke }),
    arc(shown, 'ring-arc'),
  ];

  // Past 100% the arc starts a second lap, so a target beaten by half still
  // reads as beaten by half instead of flattening into "done".
  if (known && progress > 1) {
    parts.push(arc(Math.min(progress, PROGRESS_CEILING) - 1, 'ring-overshoot'));
  }

  if (Number.isFinite(expected)) {
    const angle = (Math.min(expected, 1) * 2 * Math.PI) - Math.PI / 2;
    const inner = radius - stroke / 2 - 1;
    const outer = radius + stroke / 2 + 1;
    parts.push(s('line', {
      class: 'ring-expected',
      x1: centre + Math.cos(angle) * inner,
      y1: centre + Math.sin(angle) * inner,
      x2: centre + Math.cos(angle) * outer,
      y2: centre + Math.sin(angle) * outer,
    }));
  }

  if (label) {
    parts.push(s('text', {
      class: 'ring-label',
      x: centre,
      y: centre,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    }, label));
  }

  return s('svg', {
    class: 'ring',
    viewBox: `0 0 ${size} ${size}`,
    width: size,
    height: size,
    role: 'img',
    'aria-hidden': 'true',
  }, ...parts);
}

/**
 * A scale that refuses to lie.
 *
 * Auto-fitting to the data makes three readings of 84.1, 84.0 and 84.2 look
 * like a collapse. The span is padded to at least a tenth of the distance the
 * indicator is meant to travel, so small movement looks small.
 */
function verticalScale(values, reference) {
  const all = [...values, ...reference.filter(Number.isFinite)];
  let low = Math.min(...all);
  let high = Math.max(...all);

  const meaningful = Math.abs((reference[1] ?? high) - (reference[0] ?? low)) / 10;
  const span = high - low;
  if (span < meaningful) {
    const pad = (meaningful - span) / 2;
    low -= pad;
    high += pad;
  }
  if (high === low) { high += 1; low -= 1; }

  const headroom = (high - low) * 0.08;
  return { low: low - headroom, high: high + headroom };
}

/** The last N readings as a line. Deliberately unlabelled — it is a shape, not a chart. */
export function sparkline(points, { width = 120, height = 32, baseline, target } = {}) {
  if (points.length === 0) {
    return s('svg', { class: 'sparkline is-empty', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
  }

  const scale = verticalScale(points.map((point) => point.value), [baseline, target]);
  const firstDay = points[0].day;
  const lastDay = points[points.length - 1].day;
  const daySpan = lastDay - firstDay || 1;

  const x = (day) => ((day - firstDay) / daySpan) * (width - 4) + 2;
  const y = (value) => height - 2 - ((value - scale.low) / (scale.high - scale.low)) * (height - 4);

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.day).toFixed(2)} ${y(point.value).toFixed(2)}`).join(' ');
  const last = points[points.length - 1];

  return s('svg', {
    class: 'sparkline',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  },
  points.length > 1 ? s('path', { class: 'spark-line', d: path, fill: 'none' }) : null,
  s('circle', { class: 'spark-head', cx: x(last.day), cy: y(last.value), r: 2.5 }));
}

/**
 * The whole story of one indicator: where it has been, where the line is
 * heading, and whether that crosses the target before the deadline does.
 *
 * The deadline is a vertical rule and the target a horizontal one. They form a
 * corner, and the only question the drawing has to answer is which side of it
 * the forecast passes.
 */
export function projectionChart(indicator, points, forecast, goal, todayIso, { width = 320, height = 170 } = {}) {
  const pad = { top: 12, right: 44, bottom: 20, left: 8 };
  const startDay = toDayNumber(goal.startDate);
  const deadlineDay = toDayNumber(goal.targetDate);
  const todayDay = toDayNumber(todayIso);

  // Without both ends of the calendar there is no horizontal axis, and every
  // coordinate below would come out NaN. Validation should have caught this
  // long before here; drawing nothing is the safe answer if it did not.
  if (startDay === null || deadlineDay === null || todayDay === null) {
    return s('svg', { class: 'chart is-empty', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
  }

  const forecastDay = forecast.status === 'projected' ? toDayNumber(forecast.date) : null;

  const firstDay = Math.min(startDay, points[0]?.day ?? startDay);
  const lastDay = Math.max(deadlineDay, forecastDay ?? deadlineDay, todayDay);
  const daySpan = Math.max(1, lastDay - firstDay);

  const values = points.map((point) => point.value);
  const scale = verticalScale(values.length ? values : [indicator.baseline], [indicator.baseline, indicator.target]);

  const x = (day) => pad.left + ((day - firstDay) / daySpan) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - (value - scale.low) / (scale.high - scale.low)) * (height - pad.top - pad.bottom);

  const layers = [];

  // The corner: target across, deadline down.
  layers.push(s('line', { class: 'chart-target', x1: pad.left, y1: y(indicator.target), x2: width - pad.right, y2: y(indicator.target) }));
  layers.push(s('text', { class: 'chart-tag', x: width - pad.right + 4, y: y(indicator.target), 'dominant-baseline': 'central' }, 'target'));

  layers.push(s('line', { class: 'chart-deadline', x1: x(deadlineDay), y1: pad.top - 6, x2: x(deadlineDay), y2: height - pad.bottom }));
  layers.push(s('text', { class: 'chart-tag', x: x(deadlineDay), y: height - pad.bottom + 12, 'text-anchor': 'middle' }, 'deadline'));

  if (points.length > 0) {
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.day).toFixed(2)} ${y(point.value).toFixed(2)}`).join(' ');
    if (points.length > 1) layers.push(s('path', { class: 'chart-line', d: path, fill: 'none' }));
    for (const point of points) {
      layers.push(s('circle', { class: 'chart-point', cx: x(point.day), cy: y(point.value), r: 2.5 }));
    }
  }

  // The forecast, dashed, from the last real reading to where the line lands.
  if (forecast.status === 'projected' && points.length > 0) {
    const last = points[points.length - 1];
    const landing = Math.min(forecastDay, lastDay);
    layers.push(s('line', {
      class: `chart-forecast ${forecastDay <= deadlineDay ? 'is-in-time' : 'is-late'}`,
      x1: x(last.day),
      y1: y(last.value),
      x2: x(landing),
      y2: y(indicator.target),
    }));
    layers.push(s('circle', {
      class: `chart-landing ${forecastDay <= deadlineDay ? 'is-in-time' : 'is-late'}`,
      cx: x(landing),
      cy: y(indicator.target),
      r: 3.5,
    }));
  }

  return s('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': chartDescription(indicator, forecast),
  }, ...layers);
}

function chartDescription(indicator, forecast) {
  if (forecast.status === 'reached') return `${indicator.name}: target reached.`;
  if (forecast.status === 'projected') return `${indicator.name}: on the current trend, the target is reached on ${forecast.date}.`;
  if (forecast.status === 'beyond-horizon') return `${indicator.name}: moving too slowly to reach the target.`;
  return `${indicator.name}: no movement to project from.`;
}
