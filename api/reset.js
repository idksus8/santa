// GET /api/reset?key=YOUR_ADMIN_KEY  -> clears every pick so everyone can spin again.
// Set ADMIN_KEY in Vercel -> Settings -> Environment Variables first.
const { redis, configured } = require("./_redis");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return res.status(403).send("Add an ADMIN_KEY environment variable in Vercel first.");
  if (!req.query || req.query.key !== adminKey) return res.status(403).send("Wrong key.");
  if (!configured()) return res.status(500).send("Storage isn’t connected yet.");
  try {
    await redis("DEL", "santa:picks");
    await redis("DEL", "santa:lock");
    return res.status(200).send("All picks cleared. Everyone can spin again.");
  } catch (e) {
    return res.status(500).send("Couldn’t clear the picks.");
  }
};
