// Only signed-in authors may ask for a new mood: the wall_authors table's access rule returns a row for them alone.
export async function isAuthor(token) {
  if (!token) return false;
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/wall_authors?select=email&limit=1`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

export const bearer = (req) => (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
