import { AsyncLocalStorage } from "node:async_hooks";

// Carries userId across async boundaries that have no request/response object
// to pass it through explicitly -- currently just the shared MongoClient's
// command-monitoring listeners in lib/mongo.js, which fire on a connection
// shared by every concurrent request/voice session with no context of their
// own. Entered once per REST request (server.js Express middleware) and once
// per voice WS lifecycle (upgrade handler's profile lookup, then the
// connection handler for the rest of the session).
export const requestContext = new AsyncLocalStorage();

export function getCurrentUserId() {
  return requestContext.getStore()?.userId ?? null;
}
