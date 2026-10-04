// lib/featureUsage.js
// Records Gemini REST calls made outside the main chat reply (headlines, tap
// reaction, news greeting, "Cambia tema", news questions) as charged Text
// usage — Mike, 2026-10-04: "charge the user for anything they can select
// voluntarily". Google Search fees ride along via groundingMetadata.
// Separate from lib/usage.js because it needs lib/subscriptions.js (plan stamp).

import { randomUUID } from "crypto";
import { recordChatUsage } from "./usage.js";
import { resolvePlanForUsage } from "./subscriptions.js";

/**
 * Fire-and-forget: never delays or fails the caller's response.
 * @param {object} p
 * @param {object} p.db
 * @param {{userId:string,isAnonymous?:boolean}} p.session
 * @param {"news"|"topic"|"search"} p.feature
 * @param {string} p.model
 * @param {object} p.data  raw generateContent response (usageMetadata + candidates)
 * @param {string} [p.requestId]  shared id when one action makes several calls
 * @param {number} [p.callIndex]
 */
export function recordFeatureUsage({ db, session, feature, model, data, requestId = null, callIndex = 0 }) {
  if (!db || !session?.userId || !data?.usageMetadata) return;
  resolvePlanForUsage(db, session.userId, session.isAnonymous)
    .then((planInfo) => recordChatUsage({
      db,
      userId: session.userId,
      chatRequestId: requestId || randomUUID(),
      callIndex,
      model,
      usage: data.usageMetadata,
      grounding: data.candidates?.[0]?.groundingMetadata || null,
      feature,
      planId: planInfo?.planId ?? null,
      planDisplayName: planInfo?.planDisplayName ?? null,
    }))
    .catch((e) => console.error(`[usage/${feature}]`, e?.message || e));
}
