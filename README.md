# timonriemslagh.be

*Kleine tools voor het gewone leven, en wat ik ermee doe.*

Personal site: a profile with my tools (Bordje, Slenter) and an update wall that the tools post to, topped by a weekly mood summary written by Claude.

Hosted at https://timonriemslagh.be. Design: Claude Design project "timonriemslagh.be", file "Homepage v3".

## How it fits together

| Part | What it does |
|---|---|
| `index.html`, `styles.css`, `wall.js` | The page. Everyone sees public updates and the approved mood. Open the page with `#inloggen` to sign in; authors then get the post box, their private updates and the mood approval. |
| `api/config.js` | Gives the browser the Supabase address and public key. |
| `api/mood.js` | Vercel function: reads the last 28 days of updates (private ones too), asks Claude for a short mood summary and saves it as a draft. Runs every Sunday at 18:00 UTC via the cron in `vercel.json`, or on demand from the site ("Opnieuw maken"). |
| `supabase/schema.sql` | Tables, access rules and live updates. Run once in the Supabase SQL Editor. |

## Posting from a tool

Any tool signed in as an author inserts one row into `wall_updates`:

```js
await sb.from("wall_updates").insert({
  tool: "bordje",                 // bordje | slenter | site | …
  type: "cook",                   // walk | cook | idea | update | feedback
  title: "Pasta met venkel en citroen",
  body: "Twintig minuten, en de kinderen aten alles op.",
  meta: { km: 7.4, minutes: 92, image: "https://…" }, // all optional
  visibility: "public",           // private: only you see it, but it still feeds the mood
  source_ref: "bordje:cooked:<recipe id>:<date>"       // optional, stops double posts
});
```

## Settings in Vercel

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (only used by `api/mood.js`), `ANTHROPIC_API_KEY`, `CRON_SECRET` (any long random string; Vercel sends it with the cron call), and `ANTHROPIC_WORKSPACE_ID` only when the API key isn't scoped to a workspace.

## Deploying

Push to `main`; Vercel deploys it. To replace the old site, add `timonriemslagh.be` and `www.timonriemslagh.be` to this Vercel project under Settings → Domains and point the DNS there.
