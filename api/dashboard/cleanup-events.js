// GET /api/dashboard/cleanup-events — see api/dashboard/events.js
import { makeEventsHandler } from "./events.js";

export default makeEventsHandler("cleanup");
