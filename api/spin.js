// Secret Santa server part. On GitHub this file must live at: api/spin.js
// POST /api/spin  { name, tries }  -> picks a random name for that person
// GET  /api/spin?reset=YOUR_ADMIN_KEY -> clears every pick (set ADMIN_KEY in Vercel first)
const crypto = require("crypto");

// Keep these in sync with the list inside index.html
const NAMES = ["Chloe", "Darasimi", "Krysinte", "Lindsey", "Emmeri", "Kenny", "Louis", "Areez"];
const BANNED = [
  ["Areez", "Darasimi"],
  ["Areez", "Kenny"],
  ["Areez", "Louis"],
  ["Lindsey", "Krysinte"],
  ["Emmeri", "Chloe"]
];

const BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PICKS = "santa:picks";
const LOCK = "santa:lock";

async function redis(...command) {
  const r = await fetch(BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command)
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

const isBanned = (a, b) => BANNED.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const allowed = (giver, getter) => giver !== getter && !isBanned(giver, getter);

// Can everyone who still needs a match still get one?
function canFinish(picks) {
  const givers = NAMES.filter((n) => !(n in picks));
  const taken = new Set(Object.values(picks));
  const free = NAMES.filter((n) => !taken.has(n));
  const matchOf = {};
  const place = (g, seen) => {
    for (const t of free) {
      if (!allowed(g, t) || seen.has(t)) continue;
      seen.add(t);
      if (!(t in matchOf) || place(matchOf[t], seen)) { matchOf[t] = g; return true; }
    }
    return false;
  };
  return givers.every((g) => place(g, new Set()));
}

function toObject(flat) {
  const out = {};
  for (let i = 0; i < (flat || []).length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!BASE || !TOKEN) {
    return res.status(500).json({ error: "Storage isn’t connected yet. Add Upstash Redis in Vercel, then redeploy." });
  }

  // Organizer reset: /api/spin?reset=YOUR_ADMIN_KEY
  if (req.method === "GET") {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || !req.query || req.query.reset !== adminKey) return res.status(403).send("Wrong key, or ADMIN_KEY isn’t set in Vercel.");
    await redis("DEL", PICKS);
    await redis("DEL", LOCK);
    return res.status(200).send("All picks cleared. Everyone can spin again.");
  }

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const name = body && body.name;
  const tries = Math.max(0, parseInt(body && body.tries, 10) || 0);
  if (!NAMES.includes(name)) return res.status(400).json({ error: "Unknown name" });

  try {
    // One spin at a time, so two phones can never grab the same person.
    const gotLock = await redis("SET", LOCK, crypto.randomUUID(), "NX", "EX", "10");
    if (gotLock !== "OK") return res.status(200).json({ status: "busy" });

    try {
      const picks = toObject(await redis("HGETALL", PICKS));

      // Already spun before? Same answer every time.
      if (picks[name]) return res.status(200).json({ status: "ok", landed: picks[name] });

      const taken = new Set(Object.values(picks));
      const valid = (t) => allowed(name, t) && !taken.has(t) && canFinish({ ...picks, [name]: t });

      let landed;
      if (tries >= 2) {
        // After two unlucky spins, land on someone who works, so nobody spins forever.
        const options = NAMES.filter(valid);
        if (!options.length) return res.status(500).json({ error: "No valid match left. Ask the organizer to reset." });
        landed = options[crypto.randomInt(options.length)];
      } else {
        landed = NAMES[crypto.randomInt(NAMES.length)];
      }

      if (!valid(landed)) return res.status(200).json({ status: "again", landed });

      await redis("HSET", PICKS, name, landed);
      return res.status(200).json({ status: "ok", landed });
    } finally {
      await redis("DEL", LOCK).catch(() => {});
    }
  } catch (err) {
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
};
