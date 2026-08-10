import { openDB, type DBSchema } from "idb";
import type { Feedback } from "../../../shared/schema";

export interface Entry {
  id: string;
  createdAt: number;
  text: string;
  wordCount: number;
  status: "draft" | "queued" | "analysed" | "failed";
  feedback: Feedback | null;
  // Stored alongside each entry so historical feedback stays interpretable
  // after the model or prompt changes (§13).
  modelId?: string;
  promptVersion?: number;
  /**
   * How many transient failures this entry has absorbed. Absent on entries
   * written before retry accounting existed, which read as 0.
   */
  attempts?: number;
  /**
   * "server" only appears on entries stored before failures were classified.
   */
  failReason?: "refusal" | "rejected" | "too_long" | "gave_up" | "server";
}

interface AppDB extends DBSchema {
  entries: {
    key: string;
    value: Entry;
    indexes: { "by-createdAt": number };
  };
  meta: {
    key: string;
    value: string;
  };
}

/**
 * Thrown when the browser will not give us IndexedDB at all — private
 * browsing, a blocked upgrade, or an exhausted quota. Screens catch this and
 * say so, rather than waiting on a promise that will never resolve.
 */
export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Local storage is unavailable in this browser.");
    this.name = "StorageUnavailableError";
    this.cause = cause;
  }
}

const dbPromise = openDB<AppDB>("english-feedback", 1, {
  upgrade(db) {
    const entries = db.createObjectStore("entries", { keyPath: "id" });
    entries.createIndex("by-createdAt", "createdAt");
    db.createObjectStore("meta");
  },
  blocked() {
    console.warn("IndexedDB upgrade blocked by another open tab.");
  },
  terminated() {
    console.error("IndexedDB connection was terminated unexpectedly.");
  },
}).catch((err) => {
  console.error("IndexedDB unavailable:", err);
  throw new StorageUnavailableError(err);
});

// The rejection above is only observed when a caller awaits the database. Tail
// it here so a browser that has no IndexedDB doesn't log an unhandled
// rejection before the first screen mounts.
void dbPromise.catch(() => {});

export async function saveEntry(entry: Entry): Promise<void> {
  const db = await dbPromise;
  await db.put("entries", entry);
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const db = await dbPromise;
  return db.get("entries", id);
}

/** All non-draft entries, newest first. */
export async function getEntries(): Promise<Entry[]> {
  const db = await dbPromise;
  const all = await db.getAllFromIndex("entries", "by-createdAt");
  return all.filter((e) => e.status !== "draft").reverse();
}

export async function getQueuedEntries(): Promise<Entry[]> {
  const db = await dbPromise;
  const all = await db.getAllFromIndex("entries", "by-createdAt");
  return all.filter((e) => e.status === "queued");
}

// --- Draft autosave (never lose an entry, §3.3) ---

export async function saveDraft(text: string): Promise<void> {
  const db = await dbPromise;
  await db.put("meta", text, "draft");
}

export async function getDraft(): Promise<string> {
  const db = await dbPromise;
  return (await db.get("meta", "draft")) ?? "";
}

export async function clearDraft(): Promise<void> {
  const db = await dbPromise;
  await db.delete("meta", "draft");
}

// --- Export / delete (§3.6) ---

export async function exportAllJson(): Promise<string> {
  const db = await dbPromise;
  const entries = await db.getAllFromIndex("entries", "by-createdAt");
  const draft = await db.get("meta", "draft");
  return JSON.stringify(
    { app: "english-feedback", exportedAt: new Date().toISOString(), draft: draft ?? "", entries },
    null,
    2
  );
}

export async function deleteAllData(): Promise<void> {
  const db = await dbPromise;
  await db.clear("entries");
  await db.clear("meta");
}

// --- Derived data ---
//
// Computed from entries on read, never duplicated into storage (§8). The
// implementations live in stats.ts so they can be tested without IndexedDB;
// they are re-exported here so callers keep a single import site.
export {
  getErrorCounts,
  getTrend,
  getExamples,
  getPatternExplanations,
  type TrendPoint,
  type CategoryExample,
} from "./stats";
