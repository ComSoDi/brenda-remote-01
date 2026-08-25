import { MongoClient } from "mongodb";
import dns from "dns";
import { getCurrentUserId } from "./requestContext.js";

let cached = globalThis.__brendaMongo;
if (!cached) cached = globalThis.__brendaMongo = { client: null, db: null };

// New Relic's bundled mongodb instrumentation doesn't support driver v7 on the
// agent version pinned to our Node 20 runtime (agent v14+ adds v7 support but
// drops Node 20) -- see git history around this block. Command monitoring
// gives us the same per-operation visibility manually via custom events.
// Housekeeping/heartbeat commands are excluded to avoid event-volume noise.
//
// newrelic is loaded dynamically, and only when server.js has already loaded
// it (globalThis.__newrelicLoaded) -- standalone scripts (backup-db.js,
// seed-plans.js, migrate:* ...) import this file directly without ever
// loading newrelic, and requiring it there would start the agent's own
// timers and keep those one-off scripts from exiting after their work is done.
const IGNORED_COMMANDS = new Set([
  "hello", "ismaster", "ping", "saslStart", "saslContinue",
  "endSessions", "buildInfo", "authenticate", "getLastError",
]);
const pendingCommands = new Map();

function recordMongoCommand(newrelic, event, success, errorMessage) {
  const pending = pendingCommands.get(event.requestId);
  pendingCommands.delete(event.requestId);
  if (!pending) return;

  newrelic.recordCustomEvent("MongoCommand", {
    commandName: event.commandName,
    collection: pending.collection,
    userId: pending.userId,
    gitSha: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null,
    durationMs: event.duration ?? (Date.now() - pending.startedAt),
    success,
    ...(errorMessage ? { errorMessage } : {}),
  });
}

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
    const monitorCommands = Boolean(globalThis.__newrelicLoaded);
    cached.client = new MongoClient(uri, { ignoreUndefined: true, monitorCommands });

    if (monitorCommands) {
      const newrelic = (await import("newrelic")).default;
      cached.client.on("commandStarted", (event) => {
        if (IGNORED_COMMANDS.has(event.commandName)) return;
        // Collection name must be captured here -- commandSucceeded/commandFailed
        // events don't carry the original command document, only commandName.
        const collectionValue = event.command?.[event.commandName];
        const collection = typeof collectionValue === "string"
          ? collectionValue
          : (event.command?.collection || null);
        pendingCommands.set(event.requestId, { startedAt: Date.now(), userId: getCurrentUserId(), collection });
      });
      cached.client.on("commandSucceeded", (event) => recordMongoCommand(newrelic, event, true));
      cached.client.on("commandFailed", (event) => recordMongoCommand(newrelic, event, false, event.failure?.message));
    }

    await cached.client.connect();
  }

  cached.db = cached.client.db(dbName);
  return cached.db;
}
