/**
 * settings-store.ts
 *
 * Dual-backend settings store:
 *   1. MongoDB (preferred) — when MONGODB_URI is set
 *   2. .env file (fallback) — writes the key=value line directly
 *
 * The .env file is always read by parseEnvFile() in dashboard-data.ts,
 * so changes are reflected on next page load regardless of which backend is used.
 */

import { promises as fs } from "fs";
import path from "path";

import { getMongoClient, isMongoConfigured } from "./mongodb";

const DB_NAME = "ragflow";
const COLLECTION = "settings";

const ENV_PATH = path.resolve(process.cwd(), "..", ".env");

export interface SettingDoc {
  _id: string;
  value: string;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────

/**
 * Returns MongoDB overrides (or empty record when using .env fallback).
 * When MongoDB is not configured, values are already in the .env that
 * parseEnvFile() reads — no extra overrides needed.
 */
export async function getSettingsOverrides(): Promise<Record<string, string>> {
  if (!isMongoConfigured()) return {};
  try {
    const mongo = await getMongoClient();
    const docs = await mongo
      .db(DB_NAME)
      .collection<SettingDoc>(COLLECTION)
      .find({})
      .toArray();
    return Object.fromEntries(docs.map((d) => [d._id, d.value]));
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────

/**
 * Upsert a setting.
 * Uses MongoDB when available, otherwise writes to the .env file.
 */
export async function saveSetting(key: string, value: string): Promise<void> {
  if (isMongoConfigured()) {
    try {
      await saveToMongo(key, value);
      return;
    } catch {
      // Keep the app editable even if the local Mongo sidecar is down.
    }
  }
  return saveToEnv(key, value);
}

/**
 * Delete/reset a setting override.
 * MongoDB: removes the document.
 * .env fallback: sets the value to empty string (KEY=).
 */
export async function deleteSetting(key: string): Promise<void> {
  if (isMongoConfigured()) {
    try {
      const mongo = await getMongoClient();
      await mongo.db(DB_NAME).collection<SettingDoc>(COLLECTION).deleteOne({ _id: key });
      return;
    } catch {
      // Fall back to clearing the .env value when Mongo is unavailable.
    }
  }
  // In .env fallback, "reset" means clear the value
  await saveToEnv(key, "");
}

// ─────────────────────────────────────────────────────────────
// Backends
// ─────────────────────────────────────────────────────────────

async function saveToMongo(key: string, value: string): Promise<void> {
  const mongo = await getMongoClient();
  await mongo
    .db(DB_NAME)
    .collection<SettingDoc>(COLLECTION)
    .updateOne(
      { _id: key },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true },
    );
}

async function saveToEnv(key: string, value: string): Promise<void> {
  let raw = "";
  try {
    raw = await fs.readFile(ENV_PATH, "utf-8");
  } catch {
    // .env doesn't exist yet — create it
  }

  const lines = raw.split(/\r?\n/);
  const keyPattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=`);
  const newLine = `${key}=${value}`;
  let found = false;

  const updated = lines.map((line) => {
    if (keyPattern.test(line)) {
      found = true;
      return newLine;
    }
    return line;
  });

  if (!found) {
    // Append at end (ensure trailing newline)
    updated.push(newLine);
  }

  // Remove trailing blank lines then ensure one trailing newline
  const trimmed = updated.join("\n").trimEnd() + "\n";
  await fs.writeFile(ENV_PATH, trimmed, "utf-8");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
