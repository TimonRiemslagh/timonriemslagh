// The update wall: reads public updates and the approved mood for everyone; signed-in authors can also post,
// see their private updates and approve Claude's weekly mood draft.
(() => {
  const $ = (id) => document.getElementById(id);
  const PAGE = 30;
  const TYPES = { walk: "Wandeling", cook: "Gekookt", idea: "Idee", update: "Update", feedback: "Feedback" };
  const FILTERS = [["all", "Alles"], ["walk", "Wandelingen"], ["cook", "Koken"], ["idea", "Ideeën"], ["update", "Updates"]];
  const TOOLS = { bordje: "Bordje", slenter: "Slenter", site: "de site" };
  let sb = null, author = false, filter = "all", limit = PAGE, postType = "idea", mood = null;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------- Dates and numbers, in Dutch ----------
  const time = new Intl.DateTimeFormat("nl-BE", { hour: "2-digit", minute: "2-digit" });
  const day = new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" });
  function when(iso) {
    const d = new Date(iso), today = new Date();
    const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 864e5);
    if (days === 0) return "Vandaag " + time.format(d);
    if (days === 1) return "Gisteren";
    return day.format(d).replace(".", "");
  }
  const km = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
  const duration = (min) => (min >= 60 ? `${Math.floor(min / 60)} u ${String(min % 60).padStart(2, "0")}` : `${min} min`);

  // ---------- Wall ----------
  function card(u) {
    const quote = u.type === "idea" || u.type === "feedback";
    const c = el("article", "card" + (quote ? " quote " + u.type : ""));
    const meta = el("div", "cmeta");
    meta.append(el("span", "badge b-" + u.type, TYPES[u.type] || u.type), el("span", "", when(u.created_at)));
    c.append(meta);
    if (u.meta?.image && /^https:\/\//.test(u.meta.image)) {
      const img = el("img", "media");
      img.src = u.meta.image; img.alt = ""; img.loading = "lazy";
      c.append(img);
    }
    c.append(el("h3", "ctitle", u.title));
    if (u.body) c.append(el("p", "ctext", u.body));
    const foot = el("div", "cfoot");
    foot.append(el("span", "tooltag", "via " + (TOOLS[u.tool] || u.tool)));
    if (u.visibility === "private") foot.append(el("span", "lock", "Privé"));
    c.append(foot);
    if (typeof u.meta?.km === "number" || typeof u.meta?.minutes === "number") {
      const s = el("div", "stats");
      if (typeof u.meta.km === "number") { const k = el("span"); k.append(el("b", "", km(u.meta.km)), " km"); s.append(k); }
      if (typeof u.meta.minutes === "number") s.append(el("b", "", duration(u.meta.minutes)));
      c.append(s);
    }
    return c;
  }

  async function loadWall() {
    let q = sb.from("wall_updates").select("id,created_at,tool,type,title,body,meta,visibility").order("created_at", { ascending: false }).limit(limit + 1);
    if (filter === "idea") q = q.in("type", ["idea", "feedback"]);
    else if (filter !== "all") q = q.eq("type", filter);
    const { data, error } = await q;
    if (error) { console.error(error); return; }
    $("wall").replaceChildren(...data.slice(0, limit).map(card));
    $("empty").hidden = data.length > 0;
    $("more-wrap").hidden = data.length <= limit;
  }

  function renderFilters() {
    $("filters").replaceChildren(...FILTERS.map(([key, label]) => {
      const b = el("button", "chip", label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(key === filter));
      b.onclick = () => { filter = key; limit = PAGE; renderFilters(); loadWall(); };
      return b;
    }));
  }

  // ---------- Mood ----------
  async function loadMood() {
    const { data } = await sb.from("wall_moods").select("*").order("created_at", { ascending: false }).limit(1);
    mood = data?.[0] || null;
    $("mood").hidden = !mood;
    if (!mood) return;
    const draft = !mood.approved_at;
    $("mood").classList.toggle("draft", draft);
    $("mood-label").textContent = draft ? "Concept, nog niet zichtbaar" : "Zo gaat het";
    $("mood-text").textContent = mood.mood;
    $("mood-note").textContent = `Samengevat door Claude uit mijn updates, ideeën en feedback. Bijgewerkt ${day.format(new Date(mood.created_at)).replace(".", "")}.`;
    $("mood-actions").hidden = !author;
    $("mood-approve").hidden = !draft;
    const pills = (id, items, neg) => {
      $(id).replaceChildren(...items.map((t) => el("span", "like" + (neg ? " neg" : ""), t)));
      $(id + "-group").hidden = !items.length;
    };
    pills("likes", mood.likes || []);
    pills("dislikes", mood.dislikes || [], true);
    const weeks = mood.weeks || [];
    $("weeks").replaceChildren(...weeks.map((w) => {
      const b = el("div", "week");
      b.append(el("span", "mono soft", w.label), el("span", "w", w.word));
      return b;
    }));
    $("weeks-group").hidden = !weeks.length;
  }

  async function approveMood() {
    const { error } = await sb.from("wall_moods").update({ approved_at: new Date().toISOString() }).eq("id", mood.id);
    if (error) { $("mood-note").textContent = "Goedkeuren lukte niet."; return; }
    loadMood();
  }

  async function redoMood() {
    const { data } = await sb.auth.getSession();
    $("mood-redo").disabled = true;
    $("mood-note").textContent = "Claude schrijft een nieuw concept…";
    const r = await fetch("/api/mood", { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token}` } }).catch(() => null);
    $("mood-redo").disabled = false;
    const body = await r?.json().catch(() => ({}));
    if (!r?.ok) $("mood-note").textContent = "Dat lukte niet. Probeer het later opnieuw.";
    else if (body?.skipped) $("mood-note").textContent = "Er zijn nog geen updates om samen te vatten.";
    else loadMood();
  }

  // ---------- Posting ----------
  function renderTypes() {
    $("c-types").replaceChildren(...["walk", "cook", "idea", "update", "feedback"].map((t) => {
      const b = el("button", "chip", TYPES[t]);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(t === postType));
      b.onclick = () => { postType = t; if (t === "feedback") $("c-private").checked = true; renderTypes(); };
      return b;
    }));
  }

  async function post(e) {
    e.preventDefault();
    const title = $("c-title").value.trim(), body = $("c-body").value.trim();
    if (!title) return;
    $("c-go").disabled = true; $("c-msg").textContent = "";
    const { error } = await sb.from("wall_updates").insert({
      tool: "site", type: postType, title, body: body || null, visibility: $("c-private").checked ? "private" : "public"
    });
    $("c-go").disabled = false;
    if (error) { $("c-msg").textContent = "Plaatsen lukte niet."; return; }
    $("composer").reset(); postType = "idea"; renderTypes();
    loadWall();
  }

  // ---------- Sign-in (open the page with #inloggen) ----------
  async function checkAuthor(session) {
    author = false;
    if (session) {
      const { data } = await sb.from("wall_authors").select("email").limit(1);
      author = !!data?.length;
    }
    $("composer").hidden = !author;
    loadWall(); loadMood();
  }

  async function signIn(e) {
    e.preventDefault();
    const email = $("login-email").value.trim().toLowerCase(), password = $("login-password").value;
    $("login-go").disabled = true; $("login-msg").textContent = "Inloggen…";
    const { error } = await sb.auth.signInWithPassword({ email, password });
    $("login-go").disabled = false;
    if (error) { $("login-msg").textContent = "E-mailadres of wachtwoord klopt niet."; return; }
    $("login-msg").textContent = "";
    $("login").close();
    history.replaceState(null, "", location.pathname);
  }

  function openLogin() { if (location.hash === "#inloggen" && !$("login").open) $("login").showModal(); }

  // ---------- Start ----------
  async function init() {
    renderFilters(); renderTypes();
    let cfg;
    try { cfg = await (await fetch("/api/config")).json(); } catch { cfg = null; }
    if (!cfg?.supabaseUrl) { $("empty").hidden = false; $("empty").textContent = "De wall is nog niet ingesteld (Supabase-gegevens ontbreken in Vercel)."; return; }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });

    $("login-form").onsubmit = signIn;
    $("login-close").onclick = () => { $("login").close(); history.replaceState(null, "", location.pathname); };
    $("composer").onsubmit = post;
    $("sign-out").onclick = () => sb.auth.signOut();
    $("mood-approve").onclick = approveMood;
    $("mood-redo").onclick = redoMood;
    $("more").onclick = () => { limit += PAGE; loadWall(); };
    window.addEventListener("hashchange", openLogin);
    openLogin();

    // Sign-in, sign-out and token refreshes all pass through here; only a change of user needs a reload.
    let userId;
    sb.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || null;
      if (id === userId) return;
      userId = id;
      checkAuthor(session);
    });

    // New updates and moods from any tool show up without a reload.
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { loadWall(); loadMood(); }, 150); };
    sb.channel("wall")
      .on("postgres_changes", { event: "*", schema: "public", table: "wall_updates" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "wall_moods" }, refresh)
      .subscribe();
  }
  init();
})();
