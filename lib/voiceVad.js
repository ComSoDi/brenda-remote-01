// lib/voiceVad.js
// Gemini Live's automatic_activity_detection (server-side VAD) — tunable via
// Render env without a redeploy. See docs/voice-vad-tuning.md for what each
// knob does. Defaults below are what production runs when nothing is set.
// Phase 0 of the Progressive Backchanneling PRD (2026-10-15): the active
// values are also attached to every latency event (vadAttrs), so New Relic
// can compare settings directly instead of by date.

function resolveVadSensitivity(envVal, fallback) {
  const v = String(envVal || "").trim().toUpperCase();
  return v === "HIGH" || v === "LOW" ? v : fallback;
}

/** Current settings, read from env on every call (no restart needed). */
export function vadSettings() {
  return {
    startSensitivity: resolveVadSensitivity(process.env.GEMINI_VAD_START_SENSITIVITY, "HIGH"),
    endSensitivity: resolveVadSensitivity(process.env.GEMINI_VAD_END_SENSITIVITY, "LOW"),
    prefixPaddingMs: Number(process.env.GEMINI_VAD_PREFIX_PADDING_MS) || 300,
    silenceDurationMs: Number(process.env.GEMINI_VAD_SILENCE_DURATION_MS) || 800,
  };
}

/** The setup block sent to Gemini Live. */
export function buildAutomaticActivityDetectionConfig() {
  const v = vadSettings();
  return {
    disabled: false,
    start_of_speech_sensitivity: `START_SENSITIVITY_${v.startSensitivity}`,
    end_of_speech_sensitivity: `END_SENSITIVITY_${v.endSensitivity}`,
    prefix_padding_ms: v.prefixPaddingMs,
    silence_duration_ms: v.silenceDurationMs,
  };
}

/** Flat New Relic attributes for an event, e.g. vadSilenceMs: 800. */
export function vadAttrs() {
  const v = vadSettings();
  return {
    vadSilenceMs: v.silenceDurationMs,
    vadEndSensitivity: v.endSensitivity,
    vadStartSensitivity: v.startSensitivity,
    vadPrefixPaddingMs: v.prefixPaddingMs,
  };
}
