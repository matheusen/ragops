import { MongoClient } from "mongodb";

const DEFAULT_DEV_MONGODB_URI = "mongodb://localhost:27017";
const explicitUri = (process.env.MONGODB_URI ?? "").trim();
const uri = explicitUri || (process.env.NODE_ENV === "production" ? "" : DEFAULT_DEV_MONGODB_URI);

// Module-level cached client (reuse across hot-reloads in dev)
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function isMongoConfigured(): boolean {
  return Boolean(uri);
}

export function getMongoUri(): string {
  return uri;
}

function createClientPromise(): Promise<MongoClient> {
  if (!uri) {
    const rejected = Promise.reject(new Error("MONGODB_URI is not set")) as Promise<MongoClient>;
    (rejected as Promise<unknown>).catch(() => {});
    return rejected;
  }
  const client = new MongoClient(uri);
  return client.connect();
}

/**
 * Returns the connected MongoClient.
 * Throws if MONGODB_URI is not set.
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (process.env.NODE_ENV === "development") {
    // Reuse a single client across HMR reloads in development.
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = createClientPromise();
    }
    return global._mongoClientPromise;
  }
  return createClientPromise();
}

export default getMongoClient;
