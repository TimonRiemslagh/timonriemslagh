// The browser needs the Supabase address and its public (anon) key; both are safe to expose because access rules guard the data.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return res.status(500).json({ code: "not_configured" });
  res.status(200).json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
}
