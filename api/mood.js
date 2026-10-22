import Anthropic from "@anthropic-ai/sdk";
import { isAuthor, bearer } from "./_author.js";

// Keys that aren't tied to one workspace need the workspace named on every request.
const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
const DAYS = 28;

// The service role key reads private updates too and writes the draft; it never leaves the server.
const rest = (path, init = {}) =>
  fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...init.headers }
  });

const PROMPT = (lines) => `Dit zijn de updates, ideeën en feedback die Timon de afgelopen ${DAYS} dagen op zijn persoonlijke website zette, van oud naar nieuw:

${lines}

Schrijf een korte, warme samenvatting van hoe het met hem gaat, voor bovenaan zijn website.
Regels:
- In het Nederlands, kort en zonder onderwerp, zoals "Rustig en nieuwsgierig."
- Gebruik alleen wat in de updates staat. Verzin niets.
- Noem geen andere mensen bij naam en geen gezondheidsdetails.
- Kritiek gaat over tools of gewoontes, nooit over mensen.

Antwoord met dit JSON-object:
{"mood": "één of twee zinnen, max 120 tekens", "likes": ["max 4 korte dingen waar hij blij van wordt"], "dislikes": ["max 3 korte dingen waar hij minder blij van wordt"], "weeks": [{"label": "Wk 43", "word": "één woord voor die week"}]}
Geef "weeks" voor elke ISO-week met updates, oudste eerst, maximaal 4.`;

function parseJson(text) {
  const t = String(text || "").trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

const strings = (v, max) => (Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim()).slice(0, max).map((s) => s.trim().slice(0, 60)) : []);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  // Vercel's weekly cron sends CRON_SECRET; you can also ask for a new draft from the site while signed in.
  const token = bearer(req);
  const fromCron = req.method === "GET" && process.env.CRON_SECRET && token === process.env.CRON_SECRET;
  if (!fromCron && !(req.method === "POST" && (await isAuthor(token)))) return res.status(401).json({ code: "not_allowed" });

  const since = new Date(Date.now() - DAYS * 864e5).toISOString();
  const r = await rest(`wall_updates?select=created_at,tool,type,title,body&created_at=gte.${since}&order=created_at.asc&limit=200`);
  if (!r.ok) return res.status(502).json({ code: "db_error" });
  const updates = await r.json();
  if (!updates.length) return res.status(200).json({ skipped: "no_updates" });

  const lines = updates
    .map((u) => `- ${u.created_at.slice(0, 10)} · ${u.type} · ${u.tool}: ${u.title}${u.body ? ` — ${u.body}` : ""}`)
    .join("\n");

  let text;
  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: "Your reply is parsed by a program. Reply with only the JSON value the user asks for: no prose, no code fences.",
      messages: [{ role: "user", content: PROMPT(lines) }]
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") return res.status(422).json({ code: "refused" });
    text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  } catch (e) {
    console.error("Claude call failed:", e);
    return res.status(502).json({ code: "upstream_error" });
  }

  const out = parseJson(text);
  if (!out || typeof out.mood !== "string" || !out.mood.trim()) return res.status(502).json({ code: "invalid_json" });
  const draft = {
    mood: out.mood.trim().slice(0, 200),
    likes: strings(out.likes, 4),
    dislikes: strings(out.dislikes, 3),
    weeks: (Array.isArray(out.weeks) ? out.weeks : [])
      .filter((w) => typeof w?.label === "string" && typeof w?.word === "string")
      .slice(-4)
      .map((w) => ({ label: w.label.slice(0, 10), word: w.word.slice(0, 20) }))
  };

  const w = await rest("wall_moods", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(draft) });
  if (!w.ok) return res.status(502).json({ code: "db_error" });
  return res.status(200).json({ drafted: true });
}
