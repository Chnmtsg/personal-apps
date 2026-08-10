import type { ErrorCategory } from "../../../shared/schema";
import type { Entry } from "./db";

/**
 * Everything the app derives from stored entries, computed on read and never
 * duplicated into storage (§8).
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
      counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    }
  }
  return counts;
}

export interface TrendPoint {
  date: string; // yyyy-mm-dd
  errorsPer100Words: number;
}

/** Errors per 100 words per day — the number that should fall (§5.3, §13). */
export function getTrend(entries: Entry[]): TrendPoint[] {
  const byDay = new Map<string, { errors: number; words: number }>();
  for (const entry of analysed(entries)) {
    const day = new Date(entry.createdAt).toISOString().slice(0, 10);
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
      if (c.category === category) {
        out.push({
          entryId: entry.id,
          createdAt: entry.createdAt,
          original: c.original,
          corrected: c.corrected,
          rule: c.rule,
        });
      }
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** Most recent pattern explanation per category — used for the top-3 list. */
export function getPatternExplanations(entries: Entry[]): Map<ErrorCategory, string> {
  const explanations = new Map<ErrorCategory, string>();
  // entries are newest-first; keep the first (most recent) explanation seen
  for (const entry of analysed(entries)) {
    for (const p of entry.feedback!.patterns) {
      if (!explanations.has(p.category)) explanations.set(p.category, p.explanation);
    }
  }
  return explanations;
}
