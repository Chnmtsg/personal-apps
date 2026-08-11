import type { ErrorCategory, RecurringCategory } from "../../../shared/schema";
import { normalizeCategory } from "../../../shared/taxonomy.ts";
import { DETERMINISTIC_PATTERNS } from "../../../shared/patterns.ts";
import { labelFor } from "./categories.ts";
import type { Entry } from "./db";

/**
 * Everything the app derives from stored entries, computed on read and never
 * duplicated into storage.
 *
 * Entries written before taxonomy v2 carry legacy category names inside their
 * corrections; every function here normalises through
 * shared/taxonomy.ts so old and new entries count into one history.
 *
 * These live apart from db.ts so the numbers the user is shown can be tested
 * without an IndexedDB — db.ts opens a database the moment it is imported.
 */

// An acute entry is stored with status "analysed" and corrections: [] — the
// Worker deliberately never grades a crisis. Left in this predicate, it would
// read back as a flawless entry: 0.0 errors per 100 words, a clean-streak
// increment, a "your last entry was 0.0" comparison right after a crisis
// entry. Excluding risk === "acute" here is a read-time fix only — nothing
// stored changes, and the entry still appears in History and is still
// readable; it just stops being counted as graded writing.
const analysed = (entries: Entry[]) =>
  entries.filter((e) => e.status === "analysed" && e.feedback && e.feedback.risk !== "acute");

/** Errors per 100 words for one entry — comparable between a 60-word note and
 * a 400-word summary. The one number the History row and the Feedback card
 * both show, so it lives here rather than being defined twice. Null for an
 * acute entry: it was deliberately never graded, so "0.0" would read as a
 * perfect score rather than as ungraded. */
export function per100(entry: Entry): number | null {
  if (!entry.feedback || entry.feedback.risk === "acute" || entry.wordCount === 0) return null;
  return (entry.feedback.corrections.length / entry.wordCount) * 100;
}

/**
 * The most recent OTHER analysed entry's rate before the given one — what
 * lets the closing card say whether this entry improved on the last, instead
 * of reporting a number with no reference point. `entries` must be
 * newest-first, as `getEntries()` returns them; a queued or failed entry
 * between the two says nothing about the learner's writing, so it is skipped
 * rather than breaking the comparison — and so is an acute entry, which was
 * never graded and must never be offered as a "last entry was 0.0" baseline.
 */
export function previousRate(entries: Entry[], entryId: string): number | null {
  const index = entries.findIndex((e) => e.id === entryId);
  if (index === -1) return null;
  for (let i = index + 1; i < entries.length; i++) {
    const e = entries[i];
    if (e.status === "analysed" && e.feedback && e.feedback.risk !== "acute") {
      return per100(e);
    }
  }
  return null;
}

export function getErrorCounts(entries: Entry[]): Map<ErrorCategory, number> {
  const counts = new Map<ErrorCategory, number>();
  for (const entry of analysed(entries)) {
    for (const c of entry.feedback!.corrections) {
      const cat = normalizeCategory(c.category);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The learner's error log as plain text, ready to paste into a chat assistant
 * at the start of a session. Uses the taxonomy keys rather than the screen
 * labels, so both sides agree on what a category is called.
 */
export function formatErrorLog(entries: Entry[]): string {
  const counts = [...getErrorCounts(entries).entries()].sort((a, b) => b[1] - a[1]);
  if (counts.length === 0) return "";

  const column = Math.max(...counts.map(([category]) => category.length)) + 2;
  const rows = counts
    .map(([category, count]) => `${category} ${".".repeat(column - category.length)} ${count}`)
    .join("\n");

  return [
    "Here is my error log so far. Please continue counting from these numbers.",
    "",
    rows,
    "",
    "Please keep counting these, and tell me when one of them comes back.",
  ].join("\n");
}

/**
 * The learner's most frequent categories, sent to the Worker as context for
 * teacher-voice selection and drill targeting — computed here and sent fresh
 * with each request, never stored server-side.
 *
 * `cleanStreak` is what makes truthful teaching possible: how many of the
 * most recent analysed entries did NOT contain this category.
 */
export function getRecurringCategories(entries: Entry[], limit = 5): RecurringCategory[] {
  const analysedEntries = analysed(entries);
  return [...getErrorCounts(entries).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, count]) => ({
      category,
      count,
      cleanStreak: cleanStreakFor(analysedEntries, category),
    }));
}

/** The two categories that cost one entry the most, for a History row's
 * second line. Grouped from the entry's own corrections, so it works for
 * entries from every prompt version. */
export function topCategories(entry: Entry): string {
  if (!entry.feedback) return "";
  const counts = new Map<string, number>();
  for (const c of entry.feedback.corrections) {
    const key = normalizeCategory(c.category);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([cat, n]) => `${labelFor(cat).split(" (")[0]} ×${n}`)
    .join(" · ");
}

/** How many of the most recent analysed entries are free of this category. */
function cleanStreakFor(analysedNewestFirst: Entry[], category: ErrorCategory): number {
  let streak = 0;
  for (const entry of analysedNewestFirst) {
    if (entry.feedback!.corrections.some((c) => normalizeCategory(c.category) === category)) {
      return streak;
    }
    streak++;
  }
  return streak;
}

/** How many entries have been analysed — the denominator for a clean streak,
 * and the `entryNumber` the teacher voice welcomes a first entry with. */
export function getAnalysedCount(entries: Entry[]): number {
  return analysed(entries).length;
}

export interface TrendPoint {
  date: string; // yyyy-mm-dd
  errorsPer100Words: number;
}

/** The learner's own calendar day, not UTC. */
function localDay(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Errors per 100 words per day — the number that should fall. */
export function getTrend(entries: Entry[]): TrendPoint[] {
  const byDay = new Map<string, { errors: number; words: number }>();
  for (const entry of analysed(entries)) {
    const day = localDay(entry.createdAt);
    const agg = byDay.get(day) ?? { errors: 0, words: 0 };
    agg.errors += entry.feedback!.corrections.length;
    agg.words += entry.wordCount;
    byDay.set(day, agg);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { errors, words }]) => ({
      date,
      errorsPer100Words: words > 0 ? Math.round((errors / words) * 1000) / 10 : 0,
    }));
}

export interface CategoryExample {
  entryId: string;
  createdAt: number;
  original: string;
  corrected: string;
  rule: string;
}

export function getExamples(entries: Entry[], category: ErrorCategory): CategoryExample[] {
  const out: CategoryExample[] = [];
  for (const entry of analysed(entries)) {
    for (const c of entry.feedback!.corrections) {
      if (normalizeCategory(c.category) === category) {
        out.push({
          entryId: entry.id,
          createdAt: entry.createdAt,
          original: c.original,
          corrected: c.corrected,
          // v2 stores `explanation`; pre-v2 entries stored `rule`.
          rule: c.explanation ?? c.rule ?? "",
        });
      }
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// The progress map. A streak measures attendance; "you have fixed 34 of the
// 49 traps the app can catch automatically" measures competence against a
// finite, visible list the learner can see the end of.
//
// This maps DETERMINISTIC_PATTERNS (49), not the full Top-100 checklist
// (WORK-11 / ruling C2): `pattern_id` is only ever written by the
// deterministic matcher (worker/src/patterns.ts), so the other ~50
// checklist entries could never leave "unseen" — a denominator the code
// cannot deliver. Contracting the map to what can actually be detected is
// honesty, not a smaller feature.
// ---------------------------------------------------------------------------

export type PatternStatus = "unseen" | "active" | "fading";

export interface PatternCell {
  id: number;
  category: ErrorCategory;
  wrong: string;
  right: string;
  status: PatternStatus;
  hits: number;
}

/** An occurrence is "recent" within this many analysed entries. */
const PATTERN_ACTIVE_WINDOW = 14;

/**
 * Status per checklist pattern, derived from stored pattern-sourced
 * corrections. Deliberately has no "fixed" state yet: fixed requires knowing
 * the learner ATTEMPTED the structure correctly, not merely avoided it, and
 * nothing stored today can tell attempts from avoidance. Congratulating
 * avoidance would be a lie, so the map stops at "fading".
 */
export function getPatternMap(entries: Entry[]): PatternCell[] {
  const analysedNewestFirst = analysed(entries);
  const lastSeenIndex = new Map<number, number>();
  const hitCounts = new Map<number, number>();
  analysedNewestFirst.forEach((entry, index) => {
    for (const c of entry.feedback!.corrections) {
      if (c.pattern_id === undefined) continue;
      hitCounts.set(c.pattern_id, (hitCounts.get(c.pattern_id) ?? 0) + 1);
      if (!lastSeenIndex.has(c.pattern_id)) lastSeenIndex.set(c.pattern_id, index);
    }
  });
  return DETERMINISTIC_PATTERNS.map((p) => {
    const last = lastSeenIndex.get(p.id);
    const status: PatternStatus =
      last === undefined ? "unseen" : last < PATTERN_ACTIVE_WINDOW ? "active" : "fading";
    return {
      id: p.id,
      category: p.category,
      wrong: p.wrong,
      right: p.right,
      status,
      hits: hitCounts.get(p.id) ?? 0,
    };
  });
}

// The level-metrics and weekly-input derivations were removed with their
// agents (docs/adr/0001). They return with the level estimator and the
// weekly review.
