// Tiny Redis helper. Talks to Upstash's REST API, so no npm packages are needed.
// Vercel's Upstash integration sets KV_REST_API_URL and KV_REST_API_TOKEN for you.
const BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function configured() {
  return Boolean(BASE && TOKEN);
}

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

module.exports = { redis, configured };
