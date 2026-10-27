// POST /api/spin  { name, tries }
// Picks a random name for `name`. Answers:
//   { status: "ok",    landed }  -> that's your match (saved, can't change)
//   { status: "again", landed }  -> not available for you, spin again
//   { status: "busy" }           -> someone else was spinning, page retries
const crypto = require("crypto");
const config = require("../config.json");
const { redis, configured } = require("./_redis");

const NAMES = config.names;
const BANNED = config.banned || [];
const PICKS = "santa:picks";
const LOCK = "santa:lock";

const isBanned = (a, b) => BANNED.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const allowed = (giver, getter) => giver !== getter && !isBanned(giver, getter);

// Can everyone who still needs a match still get one? (small bipartite matching)
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
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!configured()) return res.status(500).json({ error: "Storage isn’t connected yet. Add the Upstash Redis integration in Vercel." });

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
