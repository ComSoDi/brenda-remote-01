import { MongoClient } from "mongodb";
import dns from "dns";

let cached = globalThis.__brendaMongo;
if (!cached) cached = globalThis.__brendaMongo = { client: null, db: null };

const DNS_SERVERS = process.env.DNS_SERVERS || process.env.DNS_SERVER || "";
if (DNS_SERVERS) {
  const servers = DNS_SERVERS
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length) {
    dns.setServers(servers);
  }
}

export async function getDb() {
  if (cached.db) return cached.db;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "ai_chat";

  if (!uri) {
    // IMPORTANT: throw here (inside handler try/catch) not at import-time.
    throw new Error("MONGODB_URI is not set on Vercel");
  }

  if (!cached.client) {
    cached.client = new MongoClient(uri, { ignoreUndefined: true });
    await cached.client.connect();
  }

  cached.db = cached.client.db(dbName);
  return cached.db;
}
