// GET /api/dashboard/voice-events — see api/dashboard/events.js
import { makeEventsHandler } from "./events.js";

export default makeEventsHandler("voice");
