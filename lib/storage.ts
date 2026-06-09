import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { HistoryRecord } from "./types";

export interface AppConfig {
  githubToken: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
}

const CONFIG_STORAGE_KEY = "pr-manager-config";
const DATABASE_NAME = "pr-manager";
const HISTORY_STORE_NAME = "history";
const SECRET_KEY_PATTERN = /(authorization|api[-_]?key|token|secret|password)/i;

interface PrManagerDatabase extends DBSchema {
  history: {
    key: string;
    value: HistoryRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<PrManagerDatabase>> | undefined;

export function loadAppConfig(): AppConfig | undefined {
  const storage = getLocalStorage();
  const saved = storage.getItem(CONFIG_STORAGE_KEY);
  if (!saved) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    storage.removeItem(CONFIG_STORAGE_KEY);
    return undefined;
  }

  if (!isAppConfig(parsed)) {
    storage.removeItem(CONFIG_STORAGE_KEY);
    return undefined;
  }

  return parsed;
}

export function saveAppConfig(config: AppConfig): void {
  getLocalStorage().setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function hasCompleteConfig(config: Partial<AppConfig> | null | undefined): config is AppConfig {
  return Boolean(
    hasContent(config?.githubToken) &&
      hasContent(config.llmBaseUrl) &&
      hasContent(config.llmApiKey) &&
      hasContent(config.llmModel),
  );
}

export async function saveHistoryRecord(record: HistoryRecord): Promise<void> {
  assertNoSecretKeys(record);
  const db = await getDatabase();
  await db.put(HISTORY_STORE_NAME, record);
}

export async function listHistoryRecords(): Promise<HistoryRecord[]> {
  const db = await getDatabase();
  const records = await db.getAll(HISTORY_STORE_NAME);
  return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getHistoryRecord(id: string): Promise<HistoryRecord | undefined> {
  const db = await getDatabase();
  return db.get(HISTORY_STORE_NAME, id);
}

export async function deleteHistoryRecord(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete(HISTORY_STORE_NAME, id);
}

export async function clearHistoryRecords(): Promise<void> {
  const db = await getDatabase();
  await db.clear(HISTORY_STORE_NAME);
}

function getLocalStorage(): Storage {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("Browser localStorage is not available");
  }

  return window.localStorage;
}

function getDatabase(): Promise<IDBPDatabase<PrManagerDatabase>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("Browser IndexedDB is not available");
  }

  dbPromise ??= openDB<PrManagerDatabase>(DATABASE_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        database.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
      }
    },
  });

  return dbPromise;
}

function isAppConfig(value: unknown): value is AppConfig {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const config = value as Record<string, unknown>;
  return (
    typeof config.githubToken === "string" &&
    typeof config.llmBaseUrl === "string" &&
    typeof config.llmApiKey === "string" &&
    typeof config.llmModel === "string"
  );
}

function hasContent(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertNoSecretKeys(value: unknown): void {
  visitRecord(value, new WeakSet<object>());
}

function visitRecord(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      visitRecord(item, seen);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`History records must not include secret-looking key "${key}"`);
    }
    visitRecord(child, seen);
  }
}
