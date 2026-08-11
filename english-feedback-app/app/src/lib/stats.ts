import type { ErrorCategory, RecurringCategory } from "../../../shared/schema";
import { normalizeCategory } from "../../../shared/taxonomy.ts";
import { JOURNAL_PATTERNS } from "../../../shared/patterns.ts";
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

const analysed = (entries: Entry[]) =>
  entries.filter((e) => e.status === "analysed" && e.feedback);

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
// The Top-100 progress map. A streak measures attendance; "you have fixed 34
// of the 100 most common errors" measures competence against a finite,
// visible list the learner can see the end of.
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
  return JOURNAL_PATTERNS.map((p) => {
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
