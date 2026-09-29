// scripts/reset-pin.js
// Admin: set a new 4-digit PIN for an existing Nick (user forgot their PIN,
// or the account hard-locked after 3 wrong attempts). Also clears the lockout.
//
// Run with:  npm run admin:reset-pin -- <Nick> <newPin>
// Example:   npm run admin:reset-pin -- Maria 4821
//
// Writes to the LIVE database (single cluster for dev + prod), so it shows
// the account and asks you to retype the Nick before changing anything.
// Refuses deleted accounts (userAccountStatus "Inactive") — those stay locked
// on purpose (see CLAUDE.md → Login & Lockout).

import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import dns from "dns";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const DNS_SERVERS = process.env.DNS_SERVERS || process.env.DNS_SERVER || "";
if (DNS_SERVERS) {
  const servers = DNS_SERVERS.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  if (servers.length) dns.setServers(servers);
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ai_chat";

// Same rules as api/auth/login.js — duplicated (not imported) because that
// module only exports its request handler. Keep in sync if login changes.
function normalizeUsername(raw) {
  const ascii = String(raw || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .trim();
  if (!ascii) return "";
  return ascii.charAt(0).toUpperCase() + ascii.slice(1).toLowerCase();
}
const isValidUsername = (u) => /^[A-Za-z0-9_]{4,20}$/.test(u);
const isValidPin = (p) => /^\d{4}$/.test(p);

const fmt = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const [rawNick, newPin] = process.argv.slice(2);

  if (!uri) fail("MONGODB_URI not set — run with: npm run admin:reset-pin -- <Nick> <newPin>");
  if (!rawNick || !newPin) fail("Usage: npm run admin:reset-pin -- <Nick> <newPin>   (e.g. -- Maria 4821)");

  const username = normalizeUsername(rawNick);
  if (!isValidUsername(username)) fail(`"${rawNick}" is not a valid Nick (4–20 letters, digits or _).`);
  if (!isValidPin(newPin)) fail("The new PIN must be exactly 4 digits.");

  const userId = `user_${username}`;
  const client = new MongoClient(uri);
  await client.connect();

  try {
    const users = client.db(dbName).collection("users");
    const user = await users.findOne({ userId });

    if (!user) fail(`No account found for Nick "${username}" (userId ${userId}).`);
    if (user.userAccountStatus === "Inactive") {
      fail(`"${username}" is a DELETED account (userAccountStatus: Inactive) — left locked on purpose. Not changed.`);
    }

    const prefs = user.preferences || {};
    console.log("\n=== RESET PIN ===");
    console.log(`  Database:        ${dbName}`);
    console.log(`  Nick / userId:   ${user.username} / ${user.userId}`);
    console.log(`  Created:         ${fmt(user.createdAt)}`);
    console.log(`  Last login:      ${fmt(user.lastLogin)}`);
    console.log(`  Failed attempts: ${prefs.failedPinAttempts || 0}`);
    console.log(`  Locked:          ${prefs.lockedAt ? `yes, since ${fmt(prefs.lockedAt)}` : "no"}`);

    const rl = readline.createInterface({ input: stdin, output: stdout });
    const typed = await rl.question(`\nType the Nick "${user.username}" to set the new PIN (anything else cancels): `);
    rl.close();
    if (typed.trim() !== user.username) {
      console.log("\nCancelled — nothing changed.\n");
      return;
    }

    const pinHash = await bcrypt.hash(newPin, 10);
    const r = await users.updateOne(
      { _id: user._id },
      {
        $set: {
          pinHash,
          "preferences.failedPinAttempts": 0,
          "preferences.lockedAt": null,
          "preferences.pinResetAt": new Date(),
        },
      }
    );
    if (r.modifiedCount !== 1) fail("Update did not apply (modifiedCount 0) — nothing changed.");

    // Read back and prove the new PIN actually verifies against the stored hash.
    const check = await users.findOne({ _id: user._id }, { projection: { pinHash: 1 } });
    if (!(await bcrypt.compare(newPin, check?.pinHash || ""))) {
      fail("Stored PIN did not verify after update — check the account manually.");
    }

    console.log(`\n✔ PIN reset for "${user.username}". Lockout cleared. They can log in with the new PIN now.\n`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
