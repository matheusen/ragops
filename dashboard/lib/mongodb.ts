import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";

// Module-level cached client (reuse across hot-reloads in dev)
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

export function isMongoConfigured(): boolean {
  return Boolean(uri);
}

if (!uri) {
  // No URI → callers must check isMongoConfigured() before using the client.
  // The .catch() suppresses the unhandled-rejection crash in Node 15+.
  clientPromise = Promise.reject(new Error("MONGODB_URI is not set")) as Promise<MongoClient>;
  (clientPromise as Promise<unknown>).catch(() => {});
} else if (process.env.NODE_ENV === "development") {
  // In development, use a global variable so the MongoClient is reused across
  // HMR (hot module replacement) to prevent multiple connections.
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

/**
 * Returns the connected MongoClient.
 * Throws if MONGODB_URI is not set.
 */
export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}

export default clientPromise;
