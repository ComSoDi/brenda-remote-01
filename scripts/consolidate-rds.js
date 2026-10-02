// scripts/consolidate-rds.js
// One-time / manual RDS clean-up: merges near-duplicate facts, drops passing
// moments, caps each domain (see lib/rdsConsolidate.js for the rules).
//
// Dry run (default — writes NOTHING to the DB, only a review report):
//   npm run rds:consolidate -- Maria Rick Alejandra
// Apply for real (run `npm run backup:db` first):
//   npm run rds:consolidate -- --apply Maria Rick Alejandra
//   npm run rds:consolidate -- --apply --all
//
// Review reports (contain users' personal facts — gitignored) go to
// backups/rds-consolidation/<timestamp>/<userId>.md

import fs from "fs";
import path from "path";
import { getDb } from "../lib/mongo.js";
import { consolidateRdsProfile, factTokens } from "../lib/rdsConsolidate.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const all = args.includes("--all");
const nicks = args.filter((a) => !a.startsWith("--"));
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.RDS_CONSOLIDATE_MODEL || process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";

if (!apiKey) { console.error("GEMINI_API_KEY not set — run with: npm run rds:consolidate -- <Nick…>"); process.exit(1); }
if (!all && !nicks.length) { console.error("Usage: npm run rds:consolidate -- [--apply] <Nick…> | --all"); process.exit(1); }

const db = await getDb();
const userIds = all
  ? (await db.collection("rds_profiles").find({ consolidationExempt: { $ne: true } }, { projection: { userId: 1 } }).toArray()).map((p) => p.userId)
  : nicks.map((n) => (n.startsWith("user_") ? n : `user_${n}`));

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join("backups", "rds-consolidation", stamp);
fs.mkdirSync(outDir, { recursive: true });

console.log(`=== RDS CONSOLIDATION (${apply ? "APPLY — writing to DB" : "DRY RUN — nothing written"}) model=${model} ===\n`);
for (const userId of userIds) {
  const r = await consolidateRdsProfile(db, apiKey, model, userId, { dryRun: !apply });
  const before = r.domains.flatMap((d) => d.before);
  const after = r.domains.flatMap((d) => d.after);
  const errors = r.domains.filter((d) => d.error);
  console.log(`${userId.padEnd(26)} facts ${String(before.length).padStart(4)} → ${String(after.length).padStart(4)}   ` +
    `≈ tokens ${String(factTokens(before)).padStart(5)} → ${String(factTokens(after)).padStart(5)}` +
    (errors.length ? `   ⚠ unchanged (error): ${errors.map((e) => `${e.domain}: ${e.error}`).join("; ")}` : ""));

  const md = [`# RDS consolidation — ${userId} (${apply ? "APPLIED" : "dry run"}, ${stamp})`, ""];
  for (const d of r.domains) {
    md.push(`## ${d.domain} — ${d.before.length} → ${d.after.length}${d.error ? `  ⚠ left unchanged: ${d.error}` : ""}`, "");
    md.push("**Before**", "", ...d.before.map((t) => `- ${t}`), "", "**After**", "", ...d.after.map((t) => `- ${t}`), "");
  }
  fs.writeFileSync(path.join(outDir, `${userId}.md`), md.join("\n"));
}
console.log(`\nReview reports: ${outDir}`);
process.exit(0);
