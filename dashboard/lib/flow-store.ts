import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { promises as fs } from "fs";
import path from "path";

import { getMongoClient, isMongoConfigured } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export interface SavedFlowDoc {
  _id?: ObjectId;
  name: string;
  createdAt: Date;
  nodes: Array<{ id: string; x: number; y: number; active: boolean; selectedVariant?: string }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

interface LocalSavedFlowDoc {
  id: string;
  name: string;
  createdAt: string;
  nodes: SavedFlowDoc["nodes"];
  edges: SavedFlowDoc["edges"];
}

const DB = "ragflow";
const COL = "flows";

function getDashboardRoot(): string {
  const nestedDashboard = path.join(process.cwd(), "dashboard");
  if (existsSync(path.join(nestedDashboard, "app"))) {
    return nestedDashboard;
  }
  return process.cwd();
}

const LOCAL_FLOW_FILE = path.join(getDashboardRoot(), "data", "flows.local.json");

async function col() {
  const client = await getMongoClient();
  return client.db(DB).collection<SavedFlowDoc>(COL);
}

async function readLocalFlows(): Promise<LocalSavedFlowDoc[]> {
  try {
    const raw = await fs.readFile(LOCAL_FLOW_FILE, "utf-8");
    const parsed = JSON.parse(raw) as LocalSavedFlowDoc[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeLocalFlows(flows: LocalSavedFlowDoc[]): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FLOW_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FLOW_FILE, JSON.stringify(flows, null, 2), "utf-8");
}

export async function saveFlow(
  name: string,
  nodes: SavedFlowDoc["nodes"],
  edges: SavedFlowDoc["edges"],
): Promise<{ ok: boolean; id: string }> {
  if (!isMongoConfigured()) {
    try {
      const id = randomUUID();
      const flows = await readLocalFlows();
      flows.unshift({ id, name, createdAt: new Date().toISOString(), nodes, edges });
      await writeLocalFlows(flows.slice(0, 50));
      return { ok: true, id };
    } catch (err) {
      console.error("[flow-store] saveFlow(local):", err);
      return { ok: false, id: "" };
    }
  }

  try {
    const c = await col();
    const result = await c.insertOne({ name, createdAt: new Date(), nodes, edges });
    return { ok: true, id: result.insertedId.toString() };
  } catch (err) {
    console.error("[flow-store] saveFlow:", err);
    return { ok: false, id: "" };
  }
}

export async function getFlows(): Promise<
  Array<{ id: string; name: string; createdAt: string; nodes: SavedFlowDoc["nodes"]; edges: SavedFlowDoc["edges"] }>
> {
  if (!isMongoConfigured()) {
    try {
      const flows = await readLocalFlows();
      return flows
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((flow) => ({
          id: flow.id,
          name: flow.name,
          createdAt: flow.createdAt,
          nodes: flow.nodes,
          edges: flow.edges,
        }));
    } catch {
      return [];
    }
  }

  try {
    const c = await col();
    const docs = await c.find({}).sort({ createdAt: -1 }).limit(50).toArray();
    return docs.map((d) => ({
      id: d._id!.toString(),
      name: d.name,
      createdAt: d.createdAt.toISOString(),
      nodes: d.nodes,
      edges: d.edges,
    }));
  } catch {
    return [];
  }
}

export async function deleteFlow(id: string): Promise<{ ok: boolean }> {
  if (!isMongoConfigured()) {
    try {
      const flows = await readLocalFlows();
      const nextFlows = flows.filter((flow) => flow.id !== id);
      await writeLocalFlows(nextFlows);
      return { ok: nextFlows.length !== flows.length };
    } catch {
      return { ok: false };
    }
  }

  try {
    const c = await col();
    await c.deleteOne({ _id: new ObjectId(id) });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
