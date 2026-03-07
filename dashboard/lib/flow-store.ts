import { getMongoClient } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export interface SavedFlowDoc {
  _id?: ObjectId;
  name: string;
  createdAt: Date;
  nodes: Array<{ id: string; x: number; y: number; active: boolean; selectedVariant?: string }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

const DB  = "ragflow";
const COL = "flows";

async function col() {
  const client = await getMongoClient();
  return client.db(DB).collection<SavedFlowDoc>(COL);
}

export async function saveFlow(
  name: string,
  nodes: SavedFlowDoc["nodes"],
  edges: SavedFlowDoc["edges"],
): Promise<{ ok: boolean; id: string }> {
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
  try {
    const c = await col();
    await c.deleteOne({ _id: new ObjectId(id) });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
