import { useState, useEffect, useRef, useCallback } from "react";

const SUPABASE_URL = "https://uyylbagipmuvvimlkxgs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5eWxiYWdpcG11dnZpbWxreGdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MDUyMzEsImV4cCI6MjA5NTQ4MTIzMX0.GSzpPDVlvP5OPOT9j1ORrO8A892lx17EsbDyVSxcTtY";

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const headers = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Prefer": "return=representation" };

const sb = {
  async select(table, params = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?`;
    if (params.eq) Object.entries(params.eq).forEach(([k,v]) => { url += `${k}=eq.${encodeURIComponent(v)}&`; });
    if (params.neq) Object.entries(params.neq).forEach(([k,v]) => { url += `${k}=neq.${encodeURIComponent(v)}&`; });
    if (params.order) url += `order=${params.order.col}.${params.order.asc?"asc":"desc"}&`;
    if (params.limit) url += `limit=${params.limit}&`;
    if (params.select) url += `select=${params.select}&`;
    const r = await fetch(url, { headers });
    if (!r.ok) { const e = await r.text(); console.error("SB select error", table, e); return []; }
    return r.json();
  },
  async selectOne(table, params = {}) {
    const rows = await this.select(table, { ...params, limit: 1 });
    return rows[0] || null;
  },
  async insert(table, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!r.ok) { const e = await r.text(); console.error("SB insert error", table, e); return null; }
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : rows;
  },
  async update(table, eq, body) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?`;
    Object.entries(eq).forEach(([k,v]) => { url += `${k}=eq.${encodeURIComponent(v)}&`; });
    const r = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
    if (!r.ok) { const e = await r.text(); console.error("SB update error", table, e); return null; }
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : rows;
  },
  async upsert(table, body, onConflict) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    if (onConflict) url += `?on_conflict=${onConflict}`;
    const r = await fetch(url, { method: "POST", headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(body) });
    if (!r.ok) { const e = await r.text(); console.error("SB upsert error", table, e); return null; }
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : rows;
  },
  async delete(table, eq) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?`;
    Object.entries(eq).forEach(([k,v]) => { url += `${k}=eq.${encodeURIComponent(v)}&`; });
    const r = await fetch(url, { method: "DELETE", headers });
    if (!r.ok) { const e = await r.text(); console.error("SB delete error", table, e); }
  },
  // Realtime via WebSocket
  realtime(table, filter, callback) {
    const wsUrl = SUPABASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/realtime/v1/websocket?apikey=" + SUPABASE_KEY + "&vsn=1.0.0";
    let ws, pingInterval, reconnectTimeout;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ topic: "realtime:*", event: "phx_join", payload: {}, ref: "1" }));
        const topic = filter ? `realtime:public:${table}:${filter}` : `realtime:public:${table}`;
        ws.send(JSON.stringify({ topic, event: "phx_join", payload: { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [{ event: "*", schema: "public", table, ...(filter ? { filter } : {}) }] } }, ref: "2" }));
        pingInterval = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "hb" })); }, 20000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === "postgres_changes" && msg.payload?.data) callback(msg.payload.data);
        } catch {}
      };
      ws.onclose = () => {
        clearInterval(pingInterval);
        if (!closed) reconnectTimeout = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { closed = true; clearInterval(pingInterval); clearTimeout(reconnectTimeout); try { ws?.close(); } catch {} };
  }
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const timeAgo = (iso) => {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "agora"; if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};
const hashPw = async pw => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
};
const IMG = {
  castle: "https://images.unsplash.com/photo-1520637836862-4d197d17c27a?w=600&q=80",
  village: "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=600&q=80",
  forest: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&q=80",
  profileCover: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=800&q=80",
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  return <div style={{ position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)", background:"#22c55e", color:"#fff", padding:"10px 22px", borderRadius:30, fontWeight:700, fontSize:14, zIndex:9999, boxShadow:"0 4px 20px rgba(0,0,0,0.3)", whiteSpace:"nowrap" }}>{msg}</div>;
}

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 20, color = "currentColor" }) => {
  const s = { width: size, height: size, flexShrink: 0 };
  const paths = {
    home: <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></>,
    star: <><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></>,
    chat: <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></>,
    book: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    coffee: <><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    back: <><polyline points="15,18 9,12 15,6"/></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></>,
    dice: <><rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="8" cy="8" r="1.2" fill={color}/><circle cx="16" cy="8" r="1.2" fill={color}/><circle cx="8" cy="16" r="1.2" fill={color}/><circle cx="16" cy="16" r="1.2" fill={color}/><circle cx="12" cy="12" r="1.2" fill={color}/></>,
    moreH: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  };
  return (
    <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("login");
  const [currentUser, setCurrentUser] = useState(null);
  const [activeCommunity, setActiveCommunity] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [innerTab, setInnerTab] = useState("home");
  const [viewProfile, setViewProfile] = useState(null);
  const [toast, setToast] = useState("");
  const showToast = (m) => setToast(m);

  if (screen === "login") return <LoginScreen onLogin={u => { setCurrentUser(u); setScreen("explore"); }} showToast={showToast} toast={toast} setToast={setToast} />;
  if (screen === "explore") return <ExploreScreen currentUser={currentUser} onEnter={c => { setActiveCommunity(c); setScreen("community"); setInnerTab("home"); }} onLogout={() => { setCurrentUser(null); setScreen("login"); }} showToast={showToast} toast={toast} setToast={setToast} />;
  if (screen === "community") return <CommunityScreen currentUser={currentUser} community={activeCommunity} innerTab={innerTab} setInnerTab={setInnerTab} activeChat={activeChat} setActiveChat={setActiveChat} onViewProfile={(uid, cid) => { setViewProfile({ userId: uid, communityId: cid || activeCommunity.id }); setScreen("profile"); }} onBack={() => { setScreen("explore"); setActiveCommunity(null); }} onLogout={() => { setCurrentUser(null); setScreen("login"); }} showToast={showToast} toast={toast} setToast={setToast} />;
  if (screen === "profile") return <ProfileScreen currentUser={currentUser} viewProfile={viewProfile} onBack={() => setScreen("community")} showToast={showToast} toast={toast} setToast={setToast} />;
  return null;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, showToast, toast, setToast }) {
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!username || !password) { setError("Preencha todos os campos"); return; }
    setLoading(true); setError("");
    const hash = await hashPw(password);
    const user = await sb.selectOne("users", { eq: { username: username.toLowerCase(), password_hash: hash } });
    setLoading(false);
    if (!user) { setError("Usuário ou senha inválidos"); return; }
    onLogin(user);
  };

  const handleRegister = async () => {
    if (!username || !password || !displayName) { setError("Preencha todos os campos"); return; }
    setLoading(true); setError("");
    const ex = await sb.selectOne("users", { eq: { username: username.toLowerCase() } });
    if (ex) { setError("Usuário já existe"); setLoading(false); return; }
    const hash = await hashPw(password);
    const user = await sb.insert("users", { username: username.toLowerCase(), password_hash: hash, display_name: displayName });
    setLoading(false);
    if (!user) { setError("Erro ao criar conta"); return; }
    onLogin(user);
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#1a0533,#0d1b2a)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI',sans-serif", padding:"0 20px" }}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <div style={{ width:"100%", maxWidth:400 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:52, marginBottom:8 }}>⚔️</div>
          <h1 style={{ color:"#fff", fontSize:28, fontWeight:800, margin:0 }}>RPG World</h1>
          <p style={{ color:"#9b72cf", margin:"8px 0 0", fontSize:14 }}>Entre no mundo de aventuras</p>
        </div>
        <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:20, padding:28, border:"1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display:"flex", gap:6, marginBottom:22, background:"rgba(0,0,0,0.3)", borderRadius:12, padding:4 }}>
            {["login","register"].map(t => (
              <button key={t} onClick={() => { setTab(t); setError(""); }} style={{ flex:1, padding:10, borderRadius:10, border:"none", background:tab===t?"#7c3aed":"transparent", color:tab===t?"#fff":"#9b72cf", cursor:"pointer", fontWeight:600, fontSize:14 }}>
                {t==="login"?"Entrar":"Cadastrar"}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <input placeholder="Usuário" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key==="Enter" && (tab==="login"?handleLogin():handleRegister())}
              style={{ padding:"14px 16px", borderRadius:12, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:15, outline:"none" }} />
            {tab==="register" && <input placeholder="Nome do personagem" value={displayName} onChange={e => setDisplayName(e.target.value)}
              style={{ padding:"14px 16px", borderRadius:12, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:15, outline:"none" }} />}
            <input placeholder="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==="Enter" && (tab==="login"?handleLogin():handleRegister())}
              style={{ padding:"14px 16px", borderRadius:12, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:15, outline:"none" }} />
            {error && <p style={{ color:"#f87171", fontSize:13, margin:0 }}>{error}</p>}
            <button onClick={tab==="login"?handleLogin:handleRegister} disabled={loading}
              style={{ padding:14, borderRadius:14, border:"none", background:loading?"#4a3070":"linear-gradient(135deg,#7c3aed,#9333ea)", color:"#fff", fontSize:16, fontWeight:700, cursor:loading?"not-allowed":"pointer" }}>
              {loading?"Aguarde...":tab==="login"?"Entrar":"Criar Conta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EXPLORE ─────────────────────────────────────────────────────────────────
function ExploreScreen({ currentUser, onEnter, onLogout, showToast, toast, setToast }) {
  const [communities, setCommunities] = useState([]);
  const [memberships, setMemberships] = useState({});
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("minhas");
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [comms, mems] = await Promise.all([
      sb.select("communities", { order: { col:"created_at", asc:false } }),
      sb.select("profiles", { eq: { user_id: currentUser.id } })
    ]);
    setCommunities(comms || []);
    const map = {};
    (mems || []).forEach(m => { map[m.community_id] = true; });
    setMemberships(map);
    setLoading(false);
  }, [currentUser.id]);

  useEffect(() => { load(); }, [load]);

  // realtime: refresh when new community created
  useEffect(() => {
    return sb.realtime("communities", null, () => load());
  }, [load]);

  const displayed = tab==="minhas" ? communities.filter(c => memberships[c.id]) : communities;
  const filtered = displayed.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const createCommunity = async (data) => {
    const comm = await sb.insert("communities", { ...data, creator_id: currentUser.id, member_count: 1 });
    if (comm) await sb.insert("profiles", { user_id: currentUser.id, community_id: comm.id, char_name: currentUser.display_name });
    setModal(null); showToast("Comunidade criada! ✨"); load();
  };

  const joinCommunity = async (community, profileData) => {
    await sb.insert("profiles", { user_id: currentUser.id, community_id: community.id, ...profileData });
    await sb.update("communities", { id: community.id }, { member_count: (community.member_count||0)+1 });
    setModal(null); showToast("Entrou! ⚔️"); onEnter(community);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#1a0e2e", fontFamily:"'Segoe UI',sans-serif" }}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <div style={{ background:"#1a0e2e", padding:"12px 16px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:100 }}>
        <div style={{ flex:1, display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.08)", borderRadius:50, padding:"10px 16px" }}>
          <span style={{ color:"#9b72cf" }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar comunidades..."
            style={{ flex:1, background:"none", border:"none", color:"#fff", fontSize:15, outline:"none" }} />
        </div>
        <div onClick={() => setModal("userMenu")} style={{ width:38, height:38, borderRadius:"50%", background:"#7c3aed", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:16, flexShrink:0 }}>
          {currentUser.display_name[0].toUpperCase()}
        </div>
      </div>
      <div style={{ padding:"0 16px 100px" }}>
        <div style={{ background:"linear-gradient(135deg,#f97316,#f59e0b)", borderRadius:20, padding:"20px", marginBottom:24, marginTop:8 }}>
          <h2 style={{ color:"#fff", fontWeight:900, fontSize:20, margin:"0 0 8px" }}>🌟 Bem-vindo, {currentUser.display_name}!</h2>
          <p style={{ color:"rgba(255,255,255,0.85)", fontSize:13, margin:"0 0 14px" }}>Crie ou entre em comunidades de RPG</p>
          <button onClick={() => setModal("createCommunity")} style={{ background:"#fff", color:"#f97316", border:"none", borderRadius:50, padding:"10px 24px", fontWeight:700, cursor:"pointer", fontSize:14 }}>+ Criar Comunidade</button>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          {[["minhas","Minhas"],["explorar","Todas"]].map(([v,l]) => (
            <button key={v} onClick={() => setTab(v)} style={{ flex:1, padding:"9px 4px", borderRadius:20, border:"none", background:tab===v?"#7c3aed":"rgba(255,255,255,0.08)", color:tab===v?"#fff":"#9b72cf", cursor:"pointer", fontSize:13, fontWeight:600 }}>{l}</button>
          ))}
        </div>
        {loading ? (
          <div style={{ textAlign:"center", padding:40, color:"#9b72cf" }}><div style={{ fontSize:36, marginBottom:12 }}>⚡</div><p>Carregando...</p></div>
        ) : filtered.length===0 ? (
          <div style={{ textAlign:"center", padding:40, color:"#6b7280" }}><div style={{ fontSize:48, marginBottom:12 }}>🏰</div><p>{tab==="minhas"?"Você ainda não entrou em nenhuma comunidade":"Nenhuma comunidade ainda"}</p></div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {filtered.map(c => (
              <div key={c.id} style={{ borderRadius:20, overflow:"hidden", position:"relative", boxShadow:"0 4px 20px rgba(0,0,0,0.3)" }}>
                <div style={{ height:180, backgroundImage:`url(${c.cover_image||IMG.castle})`, backgroundSize:"cover", backgroundPosition:"center", position:"relative" }}>
                  <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,rgba(0,0,0,0.1),rgba(0,0,0,0.7))" }} />
                  <div style={{ position:"absolute", bottom:16, left:16 }}>
                    <h3 style={{ color:"#fff", fontWeight:700, fontSize:20, margin:"0 0 4px" }}>{c.name}</h3>
                    <p style={{ color:"rgba(255,255,255,0.8)", fontSize:13, margin:0 }}>👥 {c.member_count||1} membros</p>
                  </div>
                  {memberships[c.id] && <div style={{ position:"absolute", top:12, right:12, background:"#22c55e", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:700, color:"#fff" }}>✓ Membro</div>}
                </div>
                <button onClick={() => memberships[c.id]?onEnter(c):setModal({ type:"createProfile", community:c })}
                  style={{ width:"100%", padding:14, background:memberships[c.id]?"#16a34a":"#7c3aed", border:"none", color:"#fff", fontWeight:700, fontSize:16, cursor:"pointer" }}>
                  {memberships[c.id]?"Entrar →":"Participar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button onClick={() => setModal("createCommunity")} style={{ position:"fixed", bottom:28, right:22, width:56, height:56, borderRadius:"50%", background:"#16a34a", border:"none", color:"#fff", fontSize:28, cursor:"pointer", boxShadow:"0 4px 20px rgba(22,163,74,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>+</button>
      {modal==="userMenu" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300 }} onClick={() => setModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, left:0, right:0, background:"#1e1e2e", borderRadius:"20px 20px 0 0", padding:24 }}>
            <p style={{ color:"#9b72cf", margin:"0 0 4px", fontSize:13 }}>Logado como</p>
            <p style={{ color:"#fff", fontWeight:700, fontSize:18, margin:"0 0 20px" }}>{currentUser.display_name}</p>
            <button onClick={onLogout} style={{ width:"100%", padding:14, background:"#ef4444", border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:16, cursor:"pointer" }}>Sair da Conta</button>
          </div>
        </div>
      )}
      {modal==="createCommunity" && <CreateCommunityModal onClose={() => setModal(null)} onCreate={createCommunity} />}
      {modal?.type==="createProfile" && <CreateProfileModal community={modal.community} onJoin={joinCommunity} onClose={() => setModal(null)} />}
    </div>
  );
}

// ─── COMMUNITY ────────────────────────────────────────────────────────────────
function CommunityScreen({ currentUser, community, innerTab, setInnerTab, activeChat, setActiveChat, onViewProfile, onBack, onLogout, showToast, toast, setToast }) {
  const [profile, setProfile] = useState(null);
  const [chats, setChats] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [activeChatsMsgs, setActiveChatsMsgs] = useState([]);
  const isCreator = community.creator_id === currentUser.id;
  const MENU_ACCENT = "#8B7355";

  const loadAll = useCallback(async () => {
    const [prof, cs, mems] = await Promise.all([
      sb.selectOne("profiles", { eq: { user_id: currentUser.id, community_id: community.id } }),
      sb.select("chats", { eq: { community_id: community.id }, order: { col:"created_at", asc:true } }),
      sb.select("profiles", { eq: { community_id: community.id } })
    ]);
    setProfile(prof);
    setChats(cs || []);
    setMembers(mems || []);

    // active chats: last message per chat
    const withLatest = await Promise.all((cs||[]).map(async chat => {
      const msgs = await sb.select("messages", { eq: { chat_id: chat.id }, order: { col:"created_at", asc:false }, limit: 1 });
      const last = msgs[0];
      return { chat, lastMsg: last, lastMsgTime: last ? new Date(last.created_at).getTime() : 0 };
    }));
    setActiveChatsMsgs(withLatest.filter(x => x.lastMsgTime > 0).sort((a,b) => b.lastMsgTime - a.lastMsgTime).slice(0,5));
  }, [currentUser.id, community.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const createChat = async (data) => {
    await sb.insert("chats", { ...data, community_id: community.id, creator_id: currentUser.id });
    setModal(null); showToast("Chat criado! 💬"); loadAll();
  };

  const publicChats = chats.filter(c => c.type==="public");
  const creatorProfile = members.find(m => m.user_id === community.creator_id);

  const menuItems = [
    { icon:"home", label:"Início", tab:"home" },
    { icon:"star", label:"Posts Recentes", tab:"posts" },
    { icon:"chat", label:"Meus Chats", tab:"myChats" },
    { icon:"book", label:"Wiki", tab:"wiki" },
    { icon:"shield", label:"Sistemas / Regras", tab:"rules" },
    { icon:"coffee", label:"Chat Off", tab:"chatOff" },
    ...(isCreator?[{ icon:"settings", label:"Configurações", tab:"settings" }]:[]),
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#0d1b2a", fontFamily:"'Segoe UI',sans-serif", position:"relative" }}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      {menuOpen && <div style={{ position:"fixed", inset:0, zIndex:500 }} onClick={() => setMenuOpen(false)} />}

      <div style={{ position:"fixed", top:0, left:menuOpen?0:"-90%", width:"80%", maxWidth:310, height:"100%", background:"rgba(235,232,225,0.82)", backdropFilter:"blur(28px) saturate(1.4)", WebkitBackdropFilter:"blur(28px) saturate(1.4)", borderRadius:"0 28px 28px 0", zIndex:600, transition:"left 0.28s cubic-bezier(.4,0,.2,1)", padding:"0 0 24px", boxSizing:"border-box", overflowY:"auto", display:"flex", flexDirection:"column" }}>
        <button onClick={() => setMenuOpen(false)} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", cursor:"pointer", color:"#888", padding:4 }}><Icon name="x" size={20} color="#888" /></button>
        <div onClick={() => { onViewProfile(currentUser.id, community.id); setMenuOpen(false); }} style={{ display:"flex", alignItems:"center", gap:14, padding:"28px 24px 20px", cursor:"pointer" }}>
          <div style={{ width:58, height:58, borderRadius:"50%", background:profile?.avatar?`url(${profile.avatar}) center/cover`:"#7c3aed", backgroundSize:"cover", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:22, border:"2.5px solid rgba(255,255,255,0.7)", flexShrink:0 }}>
            {!profile?.avatar && (profile?.char_name||currentUser.display_name)[0].toUpperCase()}
          </div>
          <div>
            <p style={{ margin:"0 0 1px", fontSize:11, color:MENU_ACCENT, fontWeight:600, letterSpacing:1 }}>Hey!</p>
            <p style={{ margin:0, fontWeight:800, fontSize:17, color:"#1e2236" }}>{profile?.char_name||currentUser.display_name}</p>
          </div>
        </div>
        <div style={{ height:1, background:"rgba(0,0,0,0.08)", margin:"0 24px 8px" }} />
        <div style={{ flex:1, padding:"4px 0" }}>
          {menuItems.map(({ icon, label, tab }) => (
            <button key={tab} onClick={() => { setInnerTab(tab); setMenuOpen(false); }}
              style={{ display:"flex", alignItems:"center", gap:16, width:"100%", padding:"13px 24px", background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
              <Icon name={icon} size={20} color={innerTab===tab?MENU_ACCENT:"#7a7a8a"} />
              <span style={{ color:innerTab===tab?MENU_ACCENT:"#5a5f72", fontSize:16, fontWeight:innerTab===tab?700:500 }}>{label}</span>
            </button>
          ))}
        </div>
        <div style={{ height:1, background:"rgba(0,0,0,0.08)", margin:"8px 24px" }} />
        <button onClick={() => { onBack(); setMenuOpen(false); }} style={{ display:"flex", alignItems:"center", gap:16, width:"100%", padding:"12px 24px", background:"none", border:"none", cursor:"pointer" }}>
          <Icon name="back" size={20} color="#7a7a8a" />
          <span style={{ color:"#5a5f72", fontSize:15 }}>Voltar às Comunidades</span>
        </button>
        <button onClick={onLogout} style={{ display:"flex", alignItems:"center", gap:16, width:"100%", padding:"12px 24px", background:"none", border:"none", cursor:"pointer" }}>
          <Icon name="logout" size={20} color="#ef4444" />
          <span style={{ color:"#ef4444", fontSize:15 }}>Sair</span>
        </button>
      </div>

      {innerTab==="home" && (
        <div>
          <div style={{ position:"relative", height:220, backgroundImage:`url(${community.cover_image||IMG.castle})`, backgroundSize:"cover", backgroundPosition:"center" }}>
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,rgba(13,27,42,0.2),rgba(13,27,42,0.85))" }} />
            <button onClick={() => setMenuOpen(true)} style={{ position:"absolute", top:16, left:16, background:"none", border:"none", color:"#fff", fontSize:26, cursor:"pointer", zIndex:10 }}>☰</button>
            <div style={{ position:"absolute", bottom:16, left:16 }}>
              <h1 style={{ color:"#fff", fontSize:26, fontWeight:900, margin:"0 0 4px" }}>{community.name}</h1>
              <p style={{ color:"rgba(255,255,255,0.8)", fontSize:14, margin:0 }}>👥 {community.member_count||members.length} membros</p>
            </div>
          </div>
          <div style={{ padding:"16px 16px 120px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {publicChats.map(chat => (
                <div key={chat.id} onClick={() => { setActiveChat(chat); setInnerTab("chat"); }} style={{ borderRadius:18, overflow:"hidden", background:"#1a2a3a", cursor:"pointer", boxShadow:"0 2px 12px rgba(0,0,0,0.3)" }}>
                  <div style={{ height:140, backgroundImage:`url(${chat.cover||IMG.village})`, backgroundSize:"cover", backgroundPosition:"center", position:"relative" }}>
                    <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,transparent 40%,rgba(0,0,0,0.7))" }} />
                    <div style={{ position:"absolute", bottom:10, left:10, right:10 }}>
                      <p style={{ color:"#fff", fontWeight:700, fontSize:14, margin:0 }}>{chat.name}</p>
                    </div>
                  </div>
                </div>
              ))}
              {isCreator && (
                <div onClick={() => setModal("createChat")} style={{ borderRadius:18, border:"2px dashed #7c3aed", height:140, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#7c3aed", flexDirection:"column", gap:8 }}>
                  <span style={{ fontSize:32 }}>+</span>
                  <span style={{ fontSize:13, fontWeight:600 }}>Novo Chat</span>
                </div>
              )}
            </div>
          </div>
          <div onClick={() => setActivityOpen(true)} style={{ position:"fixed", bottom:20, left:16, background:"rgba(10,15,25,0.9)", backdropFilter:"blur(10px)", borderRadius:50, padding:"8px 14px", display:"flex", alignItems:"center", gap:10, cursor:"pointer", boxShadow:"0 4px 20px rgba(0,0,0,0.5)", zIndex:100 }}>
            <div style={{ position:"relative", width:34, height:34 }}>
              <div style={{ width:34, height:34, borderRadius:"50%", background:profile?.avatar?`url(${profile.avatar}) center/cover`:"#7c3aed", backgroundSize:"cover", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:14, border:"2px solid rgba(255,255,255,0.2)" }}>
                {!profile?.avatar && (profile?.char_name||currentUser.display_name)[0].toUpperCase()}
              </div>
              <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:"50%", background:"#22c55e", border:"2px solid #0d1b2a" }} />
            </div>
            <span style={{ color:"#fff", fontSize:12, fontWeight:600 }}>🟢 {members.length} membros</span>
          </div>
        </div>
      )}

      {innerTab==="chat" && activeChat && (
        <ChatView chat={activeChat} currentUser={currentUser} communityId={community.id}
          onBack={() => { setInnerTab("home"); setActiveChat(null); }}
          onViewProfile={uid => onViewProfile(uid, community.id)}
          showToast={showToast}
          isCreatorOfChat={activeChat.creator_id===currentUser.id}
          onUpdateChat={async patch => { await sb.update("chats", { id: activeChat.id }, patch); setActiveChat(prev => ({...prev,...patch})); loadAll(); }}
        />
      )}
      {innerTab==="posts" && <PostsScreen community={community} currentUser={currentUser} onBack={() => setInnerTab("home")} onViewProfile={uid => onViewProfile(uid, community.id)} showToast={showToast} />}
      {innerTab==="myChats" && <MyChatsScreen chats={chats} onBack={() => setInnerTab("home")} onEnterChat={c => { setActiveChat(c); setInnerTab("chat"); }} />}
      {innerTab==="wiki" && <WikiScreen community={community} currentUser={currentUser} isCreator={isCreator} onBack={() => setInnerTab("home")} showToast={showToast} />}
      {["rules","chatOff","events"].includes(innerTab) && <SimplePostsScreen tab={innerTab} community={community} currentUser={currentUser} isCreator={isCreator} onBack={() => setInnerTab("home")} showToast={showToast} />}

      {modal==="createChat" && <CreateChatModal onClose={() => setModal(null)} onCreate={createChat} />}

      {activityOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:400 }} onClick={() => setActivityOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, left:0, right:0, background:"#0a0a1a", borderRadius:"20px 20px 0 0", padding:"24px 20px 40px", maxHeight:"80vh", overflowY:"auto" }}>
            <div style={{ width:40, height:4, background:"#333", borderRadius:2, margin:"0 auto 20px" }} />
            {creatorProfile && (
              <div style={{ marginBottom:20 }}>
                <p style={{ color:"#f59e0b", fontWeight:700, fontSize:13, margin:"0 0 10px", letterSpacing:1 }}>👑 PROPRIETÁRIO</p>
                <div style={{ display:"flex", alignItems:"center", gap:12, background:"rgba(245,158,11,0.1)", borderRadius:14, padding:"10px 14px" }}>
                  <div style={{ width:44, height:44, borderRadius:"50%", background:creatorProfile.avatar?`url(${creatorProfile.avatar}) center/cover`:"#f59e0b", backgroundSize:"cover", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:18, border:"2px solid #f59e0b", flexShrink:0 }}>
                    {!creatorProfile.avatar && creatorProfile.char_name[0].toUpperCase()}
                  </div>
                  <div>
                    <p style={{ color:"#fff", fontWeight:700, fontSize:15, margin:0 }}>{creatorProfile.char_name}</p>
                    <p style={{ color:"#f59e0b", fontSize:12, margin:0 }}>Fundador</p>
                  </div>
                </div>
              </div>
            )}
            <div style={{ marginBottom:20 }}>
              <p style={{ color:"#22c55e", fontWeight:700, fontSize:13, margin:"0 0 10px", letterSpacing:1 }}>👥 MEMBROS — {members.length}</p>
              <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                {members.map(m => (
                  <div key={m.id} style={{ textAlign:"center", cursor:"pointer" }} onClick={() => { onViewProfile(m.user_id, community.id); setActivityOpen(false); }}>
                    <div style={{ width:52, height:52, borderRadius:"50%", background:m.avatar?`url(${m.avatar}) center/cover`:"#7c3aed", backgroundSize:"cover", border:"2.5px solid #22c55e", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:18, margin:"0 auto 5px" }}>
                      {!m.avatar && m.char_name[0].toUpperCase()}
                    </div>
                    <p style={{ color:"#fff", fontSize:11, margin:0, maxWidth:52, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.char_name.split(" ")[0]}</p>
                  </div>
                ))}
              </div>
            </div>
            {activeChatsMsgs.length > 0 && (
              <div>
                <p style={{ color:"#9b72cf", fontWeight:700, fontSize:13, margin:"0 0 10px", letterSpacing:1 }}>🔥 CHATS ATIVOS</p>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {activeChatsMsgs.map(({ chat, lastMsg }) => (
                    <div key={chat.id} onClick={() => { setActiveChat(chat); setInnerTab("chat"); setActivityOpen(false); }} style={{ display:"flex", alignItems:"center", gap:12, background:"rgba(255,255,255,0.05)", borderRadius:14, padding:"10px 14px", cursor:"pointer" }}>
                      <div style={{ width:40, height:40, borderRadius:10, backgroundImage:`url(${chat.cover||IMG.village})`, backgroundSize:"cover", backgroundColor:"#7c3aed", flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ color:"#fff", fontWeight:700, fontSize:14, margin:"0 0 2px" }}>{chat.name}</p>
                        {lastMsg && <p style={{ color:"#9ca3af", fontSize:12, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{lastMsg.text||"📷 Imagem"}</p>}
                      </div>
                      <span style={{ color:"#9ca3af", fontSize:11, flexShrink:0 }}>{timeAgo(lastMsg?.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CHAT VIEW ────────────────────────────────────────────────────────────────
function ChatView({ chat, currentUser, communityId, onBack, onViewProfile, showToast, isCreatorOfChat, onUpdateChat }) {
  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [showPlus, setShowPlus] = useState(false);
  const [showDice, setShowDice] = useState(false);
  const [diceMax, setDiceMax] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [chatMembers, setChatMembers] = useState([]);
  const [editInfo, setEditInfo] = useState(null);
  const bottomRef = useRef();
  const imgRef = useRef();
  const coverEditRef = useRef();
  const profilesRef = useRef({});

  const loadMessages = useCallback(async () => {
    const msgs = await sb.select("messages", { eq: { chat_id: chat.id }, order: { col:"created_at", asc:true }, limit: 100 });
    setMessages(msgs || []);
    // load missing profiles
    const ids = [...new Set((msgs||[]).map(m => m.user_id))].filter(id => !profilesRef.current[id]);
    if (ids.length) {
      const results = await Promise.all(ids.map(uid => sb.selectOne("profiles", { eq: { user_id: uid, community_id: communityId } })));
      const newMap = {};
      results.forEach(p => { if (p) newMap[p.user_id] = p; });
      profilesRef.current = { ...profilesRef.current, ...newMap };
      setProfiles({ ...profilesRef.current });
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:"smooth" }), 60);
  }, [chat.id, communityId]);

  const loadMembers = useCallback(async () => {
    const mems = await sb.select("profiles", { eq: { community_id: communityId } });
    setChatMembers(mems || []);
  }, [communityId]);

  useEffect(() => { loadMessages(); loadMembers(); }, [loadMessages, loadMembers]);

  // ⚡ REALTIME — mensagens ao vivo
  useEffect(() => {
    return sb.realtime("messages", `chat_id=eq.${chat.id}`, () => loadMessages());
  }, [chat.id, loadMessages]);

  const send = async () => {
    if (!text.trim() && !image) return;
    setSending(true);
    const t = text.trim(); setText(""); setImage(null);
    await sb.insert("messages", { chat_id: chat.id, user_id: currentUser.id, text: t||null, image: image||null });
    setSending(false);
  };

  const rollDice = async () => {
    const max = parseInt(diceMax, 10);
    if (!max || max < 2) return;
    const result = Math.floor(Math.random() * max) + 1;
    setShowDice(false); setDiceMax("");
    await sb.insert("messages", { chat_id: chat.id, user_id: currentUser.id, text: `🎲 Dado d${max}: **${result}**` });
  };

  const handleImg = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setImage(ev.target.result); setShowPlus(false); };
    reader.readAsDataURL(file); e.target.value = "";
  };

  const saveEditInfo = async () => {
    await onUpdateChat({ name: editInfo.name, description: editInfo.description, cover: editInfo.cover });
    setShowInfo(false); showToast("Chat atualizado!");
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:`url(${chat.cover||IMG.village})`, backgroundSize:"cover", backgroundPosition:"center", zIndex:0 }} />
      <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.45)", zIndex:1 }} />
      <div style={{ position:"relative", zIndex:2, display:"flex", flexDirection:"column", height:"100%" }}>
        <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", gap:12, background:"rgba(0,0,0,0.3)", backdropFilter:"blur(10px)" }}>
          <button onClick={onBack} style={{ background:"none", border:"none", color:"#fff", cursor:"pointer", padding:4 }}><Icon name="back" size={22} color="#fff" /></button>
          <div style={{ width:36, height:36, borderRadius:10, backgroundImage:chat.cover?`url(${chat.cover})`:"none", backgroundSize:"cover", backgroundColor:"#7c3aed", flexShrink:0 }} />
          <div style={{ flex:1 }}>
            <p style={{ color:"#fff", margin:0, fontWeight:700, fontSize:15 }}>{chat.name}</p>
            <p style={{ color:"rgba(255,255,255,0.6)", margin:0, fontSize:12 }}>⚡ ao vivo</p>
          </div>
          <button onClick={() => { setShowInfo(true); setEditInfo({ name:chat.name, description:chat.description||"", cover:chat.cover }); }} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.8)", cursor:"pointer", padding:4 }}><Icon name="moreH" size={22} color="rgba(255,255,255,0.8)" /></button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
          {messages.map(msg => {
            const isMe = msg.user_id === currentUser.id;
            const prof = profiles[msg.user_id];
            const name = prof?.char_name || "...";
            const isDice = msg.text?.startsWith("🎲");
            return (
              <div key={msg.id} style={{ display:"flex", gap:8, flexDirection:isMe?"row-reverse":"row", alignItems:"flex-end" }}>
                {!isMe && (
                  <div onClick={() => onViewProfile(msg.user_id)} style={{ width:30, height:30, borderRadius:"50%", background:prof?.avatar?`url(${prof.avatar}) center/cover`:"#7c3aed", backgroundSize:"cover", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:12, flexShrink:0, cursor:"pointer", border:"2px solid rgba(255,255,255,0.2)" }}>
                    {!prof?.avatar && name[0].toUpperCase()}
                  </div>
                )}
                <div style={{ maxWidth:"72%", display:"flex", flexDirection:"column", gap:3, alignItems:isMe?"flex-end":"flex-start" }}>
                  {!isMe && <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontWeight:600 }}>{name}</span>}
                  {msg.image && <img src={msg.image} alt="" style={{ maxWidth:"100%", borderRadius:14, maxHeight:220, objectFit:"cover" }} />}
                  {msg.text && (
                    <div style={{ background:isDice?"rgba(124,58,237,0.85)":isMe?"rgba(37,99,235,0.85)":"rgba(20,20,30,0.75)", padding:"10px 14px", borderRadius:isMe?"18px 18px 4px 18px":"18px 18px 18px 4px", color:"#fff", fontSize:15, lineHeight:1.5, backdropFilter:"blur(4px)" }}>
                      {msg.text.replace(/\*\*(.*?)\*\*/g, (_, v) => v)}
                    </div>
                  )}
                  <span style={{ color:"rgba(255,255,255,0.3)", fontSize:10 }}>{timeAgo(msg.created_at)}</span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {image && (
          <div style={{ padding:"8px 16px", background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", gap:10, position:"relative", zIndex:3 }}>
            <img src={image} alt="" style={{ height:50, borderRadius:10, objectFit:"cover" }} />
            <button onClick={() => setImage(null)} style={{ background:"rgba(239,68,68,0.3)", border:"1px solid #ef4444", color:"#ef4444", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontSize:13 }}>✕</button>
          </div>
        )}

        <div style={{ padding:"10px 12px 20px", display:"flex", alignItems:"center", gap:10, background:"transparent", position:"relative", zIndex:3 }}>
          <button onClick={() => setShowPlus(p => !p)} style={{ width:42, height:42, borderRadius:"50%", background:"rgba(255,255,255,0.1)", border:"1.5px solid rgba(255,255,255,0.25)", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Icon name="plus" size={20} color="#fff" />
          </button>
          <input ref={imgRef} type="file" accept="image/*" onChange={handleImg} style={{ display:"none" }} />
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key==="Enter" && !sending && send()} placeholder="Escreva uma mensagem..."
            style={{ flex:1, background:"rgba(20,20,30,0.6)", backdropFilter:"blur(8px)", border:"1.5px solid rgba(255,255,255,0.15)", borderRadius:24, padding:"11px 16px", color:"#fff", fontSize:15, outline:"none" }} />
          <button onClick={send} disabled={sending} style={{ width:44, height:44, borderRadius:"50%", background:"#2563eb", border:"none", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Icon name="send" size={18} color="#fff" />
          </button>
        </div>
      </div>

      {showPlus && (
        <div style={{ position:"absolute", bottom:90, left:16, zIndex:50, display:"flex", flexDirection:"column", gap:10 }}>
          <button onClick={() => imgRef.current.click()} style={{ background:"rgba(15,15,25,0.9)", backdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:14, padding:"12px 20px", color:"#fff", cursor:"pointer", fontWeight:600, fontSize:14, display:"flex", alignItems:"center", gap:10 }}>
            <Icon name="image" size={18} color="#fff" /> Enviar Foto
          </button>
          <button onClick={() => { setShowDice(true); setShowPlus(false); }} style={{ background:"rgba(15,15,25,0.9)", backdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:14, padding:"12px 20px", color:"#fff", cursor:"pointer", fontWeight:600, fontSize:14, display:"flex", alignItems:"center", gap:10 }}>
            <Icon name="dice" size={18} color="#fff" /> Rolar Dados
          </button>
          <button onClick={() => setShowPlus(false)} style={{ background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:12, padding:"10px 20px", color:"#ef4444", cursor:"pointer", fontWeight:600, fontSize:13 }}>Cancelar</button>
        </div>
      )}

      {showDice && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:500, display:"flex", alignItems:"flex-end" }} onClick={() => setShowDice(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width:"100%", background:"#1a1a2e", borderRadius:"20px 20px 0 0", padding:"24px 20px 36px" }}>
            <div style={{ textAlign:"center", fontSize:48, marginBottom:8 }}>🎲</div>
            <h3 style={{ color:"#fff", margin:"0 0 6px", textAlign:"center" }}>Rolar Dados</h3>
            <p style={{ color:"#9b72cf", textAlign:"center", fontSize:13, margin:"0 0 16px" }}>Resultado enviado automaticamente</p>
            <input autoFocus value={diceMax} onChange={e => setDiceMax(e.target.value.replace(/\D/g,""))} onKeyDown={e => e.key==="Enter" && rollDice()} placeholder="Máximo (ex: 20)" type="number"
              style={{ width:"100%", padding:14, borderRadius:12, border:"2px solid #7c3aed", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:20, textAlign:"center", outline:"none", fontWeight:700, boxSizing:"border-box", marginBottom:16 }} />
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShowDice(false)} style={{ flex:1, padding:13, borderRadius:12, border:"1px solid rgba(255,255,255,0.2)", background:"none", color:"#9b72cf", cursor:"pointer" }}>Cancelar</button>
              <button onClick={rollDice} style={{ flex:2, padding:13, borderRadius:12, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, cursor:"pointer" }}>🎲 Rolar d{diceMax||"?"}</button>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:500 }} onClick={() => setShowInfo(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position:"absolute", top:0, right:0, bottom:0, width:"88%", maxWidth:340, background:"#0d1b2a", overflowY:"auto" }}>
            <div style={{ height:160, backgroundImage:`url(${chat.cover||IMG.village})`, backgroundSize:"cover", backgroundPosition:"center", position:"relative" }}>
              <button onClick={() => setShowInfo(false)} style={{ position:"absolute", top:14, left:14, background:"rgba(0,0,0,0.4)", border:"none", borderRadius:10, padding:8, cursor:"pointer", color:"#fff" }}><Icon name="back" size={18} color="#fff" /></button>
              {isCreatorOfChat && <button onClick={() => coverEditRef.current.click()} style={{ position:"absolute", bottom:10, right:10, background:"rgba(0,0,0,0.5)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:10, padding:"6px 12px", cursor:"pointer", color:"#fff", fontSize:12 }}>Trocar Capa</button>}
              <input ref={coverEditRef} type="file" accept="image/*" onChange={e => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setEditInfo(p=>({...p,cover:ev.target.result})); r.readAsDataURL(f); e.target.value=""; }} style={{ display:"none" }} />
            </div>
            <div style={{ padding:20 }}>
              {isCreatorOfChat ? (
                <>
                  <input value={editInfo?.name||""} onChange={e => setEditInfo(p=>({...p,name:e.target.value}))} style={{ width:"100%", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:10, padding:"10px 14px", color:"#fff", fontSize:16, fontWeight:700, outline:"none", boxSizing:"border-box", marginBottom:10 }} />
                  <textarea value={editInfo?.description||""} onChange={e => setEditInfo(p=>({...p,description:e.target.value}))} placeholder="Descrição..." rows={3} style={{ width:"100%", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:10, padding:"10px 14px", color:"#fff", fontSize:14, outline:"none", resize:"none", boxSizing:"border-box", marginBottom:14 }} />
                  <button onClick={saveEditInfo} style={{ width:"100%", padding:12, borderRadius:12, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, cursor:"pointer", marginBottom:20 }}>Salvar</button>
                </>
              ) : (
                <>
                  <h2 style={{ color:"#fff", fontWeight:800, margin:"0 0 6px" }}>{chat.name}</h2>
                  {chat.description && <p style={{ color:"#9ca3af", fontSize:14, margin:"0 0 20px" }}>{chat.description}</p>}
                </>
              )}
              <p style={{ color:"#9b72cf", fontWeight:700, fontSize:13, margin:"0 0 12px", letterSpacing:1 }}>MEMBROS ({chatMembers.length})</p>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {chatMembers.map(m => (
                  <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:m.avatar?`url(${m.avatar}) center/cover`:"#7c3aed", backgroundSize:"cover", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:14, flexShrink:0 }}>
                      {!m.avatar && m.char_name[0].toUpperCase()}
                    </div>
                    <p style={{ color:"#fff", margin:0, fontSize:14, fontWeight:600 }}>{m.char_name}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── POSTS ────────────────────────────────────────────────────────────────────
function PostsScreen({ community, currentUser, onBack, onViewProfile, showToast }) {
  const [posts, setPosts] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [likes, setLikes] = useState({});
  const [comments, setComments] = useState({});
  const [expandedPost, setExpandedPost] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newText, setNewText] = useState("");
  const [newImage, setNewImage] = useState(null);
  const imgRef = useRef();

  const loadPosts = useCallback(async () => {
    const all = await sb.select("posts", { eq: { community_id: community.id }, order: { col:"created_at", asc:false }, limit: 50 });
    const ps = (all||[]).filter(p => !p.tab || p.tab==="posts");
    setPosts(ps);
    const ids = [...new Set(ps.map(p => p.user_id))];
    const pm = {};
    await Promise.all(ids.map(async uid => {
      const p = await sb.selectOne("profiles", { eq: { user_id: uid, community_id: community.id } });
      if (p) pm[uid] = p;
    }));
    setProfiles(pm);
    const lm = {}, cm = {};
    await Promise.all(ps.map(async post => {
      const [lk, c] = await Promise.all([
        sb.select("likes", { eq: { post_id: post.id } }),
        sb.select("comments", { eq: { post_id: post.id }, order: { col:"created_at", asc:true } })
      ]);
      lm[post.id] = (lk||[]).map(l => l.user_id);
      cm[post.id] = c||[];
    }));
    setLikes(lm); setComments(cm);
  }, [community.id]);

  useEffect(() => { loadPosts(); }, [loadPosts]);
  useEffect(() => sb.realtime("posts", `community_id=eq.${community.id}`, () => loadPosts()), [community.id, loadPosts]);

  const createPost = async () => {
    if (!newText.trim() && !newImage) return;
    await sb.insert("posts", { community_id: community.id, user_id: currentUser.id, text: newText, image: newImage, tab:"posts" });
    setNewText(""); setNewImage(null); setShowCreate(false); showToast("Post publicado! ✨");
  };

  const toggleLike = async (postId) => {
    const postLikes = likes[postId]||[];
    if (postLikes.includes(currentUser.id)) {
      await sb.delete("likes", { post_id: postId, user_id: currentUser.id });
      setLikes(prev => ({ ...prev, [postId]: prev[postId].filter(id => id!==currentUser.id) }));
    } else {
      await sb.insert("likes", { post_id: postId, user_id: currentUser.id });
      setLikes(prev => ({ ...prev, [postId]: [...(prev[postId]||[]), currentUser.id] }));
    }
  };

  const addComment = async (postId) => {
    if (!commentText.trim()) return;
    const cm = await sb.insert("comments", { post_id: postId, user_id: currentUser.id, text: commentText });
    setComments(prev => ({ ...prev, [postId]: [...(prev[postId]||[]), cm] }));
    setCommentText("");
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f3f4f6", fontFamily:"'Segoe UI',sans-serif" }}>
      <div style={{ background:"#fff", padding:"16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #e5e7eb", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer" }}><Icon name="back" size={22} color="#374151" /></button>
          <h2 style={{ margin:0, fontWeight:700, fontSize:20 }}>Posts</h2>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ background:"#7c3aed", border:"none", borderRadius:20, padding:"8px 18px", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }}>+ Criar</button>
      </div>
      <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:16, paddingBottom:40 }}>
        {posts.map(post => {
          const prof = profiles[post.user_id];
          const name = prof?.char_name||"...";
          const liked = (likes[post.id]||[]).includes(currentUser.id);
          return (
            <div key={post.id} style={{ background:"#fff", borderRadius:16, overflow:"hidden", boxShadow:"0 1px 8px rgba(0,0,0,0.08)" }}>
              <div style={{ padding:"14px 16px 0", display:"flex", alignItems:"center", gap:10 }}>
                <div onClick={() => onViewProfile(post.user_id)} style={{ width:42, height:42, borderRadius:"50%", background:prof?.avatar?`url(${prof.avatar}) center/cover`:"#7c3aed", backgroundSize:"cover", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, flexShrink:0 }}>
                  {!prof?.avatar && name[0].toUpperCase()}
                </div>
                <div>
                  <p onClick={() => onViewProfile(post.user_id)} style={{ margin:0, fontWeight:700, fontSize:15, cursor:"pointer" }}>{name}</p>
                  <p style={{ margin:0, color:"#9ca3af", fontSize:12 }}>{timeAgo(post.created_at)}</p>
                </div>
              </div>
              {post.text && <p style={{ margin:"12px 16px 8px", fontSize:15, color:"#374151" }}>{post.text}</p>}
              {post.image && <img src={post.image} alt="" style={{ width:"100%", maxHeight:350, objectFit:"cover", display:"block" }} />}
              <div style={{ padding:"10px 16px", display:"flex", alignItems:"center", gap:20 }}>
                <button onClick={() => toggleLike(post.id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5, color:liked?"#ef4444":"#6b7280", fontSize:15 }}>
                  {liked?"❤️":"🤍"} {(likes[post.id]||[]).length}
                </button>
                <button onClick={() => setExpandedPost(expandedPost===post.id?null:post.id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5, color:"#6b7280", fontSize:15 }}>
                  💬 {(comments[post.id]||[]).length}
                </button>
              </div>
              {expandedPost===post.id && (
                <div style={{ borderTop:"1px solid #f3f4f6", padding:"0 16px 16px" }}>
                  {(comments[post.id]||[]).map(c => (
                    <div key={c.id} style={{ padding:"10px 0", borderBottom:"1px solid #f9fafb" }}>
                      <p style={{ margin:"0 0 2px", fontWeight:700, fontSize:13 }}>{profiles[c.user_id]?.char_name||"..."}</p>
                      <p style={{ margin:0, fontSize:14, color:"#374151" }}>{c.text}</p>
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:8, marginTop:10 }}>
                    <input value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key==="Enter" && addComment(post.id)} placeholder="Comentar..."
                      style={{ flex:1, background:"#f3f4f6", border:"none", borderRadius:20, padding:"10px 14px", fontSize:14, outline:"none" }} />
                    <button onClick={() => addComment(post.id)} style={{ background:"#7c3aed", border:"none", borderRadius:"50%", width:36, height:36, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><Icon name="send" size={14} color="#fff" /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showCreate && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:500, display:"flex", alignItems:"flex-end" }}>
          <div style={{ width:"100%", background:"#fff", borderRadius:"20px 20px 0 0", padding:24 }}>
            <h3 style={{ margin:"0 0 16px", fontWeight:700 }}>Criar Post</h3>
            <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Compartilhe algo..." rows={4} style={{ width:"100%", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:12, padding:14, fontSize:15, outline:"none", resize:"none", boxSizing:"border-box" }} />
            {newImage && <img src={newImage} alt="" style={{ width:"100%", borderRadius:12, maxHeight:180, objectFit:"cover", marginTop:10 }} />}
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button onClick={() => imgRef.current.click()} style={{ padding:"11px 18px", borderRadius:12, border:"1px solid #e5e7eb", background:"#f9fafb", cursor:"pointer" }}><Icon name="image" size={18} color="#374151" /></button>
              <input ref={imgRef} type="file" accept="image/*" onChange={e => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setNewImage(ev.target.result); r.readAsDataURL(f); }} style={{ display:"none" }} />
              <button onClick={() => setShowCreate(false)} style={{ flex:1, padding:11, borderRadius:12, border:"1px solid #e5e7eb", background:"none", cursor:"pointer" }}>Cancelar</button>
              <button onClick={createPost} style={{ flex:1, padding:11, borderRadius:12, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, cursor:"pointer" }}>Publicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MY CHATS ─────────────────────────────────────────────────────────────────
function MyChatsScreen({ chats, onBack, onEnterChat }) {
  return (
    <div style={{ minHeight:"100vh", background:"#f3f4f6" }}>
      <div style={{ background:"#fff", padding:"16px", display:"flex", alignItems:"center", gap:12, borderBottom:"1px solid #e5e7eb", position:"sticky", top:0, zIndex:50 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer" }}><Icon name="back" size={22} color="#374151" /></button>
        <h2 style={{ margin:0, fontWeight:700, fontSize:20 }}>💬 Chats</h2>
      </div>
      <div style={{ padding:16, display:"flex", flexDirection:"column", gap:12, paddingBottom:40 }}>
        {chats.map(chat => (
          <div key={chat.id} onClick={() => onEnterChat(chat)} style={{ background:"#fff", borderRadius:16, padding:"14px 16px", display:"flex", alignItems:"center", gap:14, cursor:"pointer", boxShadow:"0 1px 6px rgba(0,0,0,0.07)" }}>
            <div style={{ width:52, height:52, borderRadius:"50%", backgroundImage:chat.cover?`url(${chat.cover})`:"none", backgroundSize:"cover", backgroundColor:"#7c3aed", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:22, flexShrink:0 }}>
              {!chat.cover && "💬"}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ margin:"0 0 2px", fontWeight:700, fontSize:15 }}>{chat.name}</p>
              <p style={{ margin:0, color:"#9ca3af", fontSize:13 }}>{chat.description||"Chat de RPG"}</p>
            </div>
          </div>
        ))}
        {chats.length===0 && <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}><p>Nenhum chat ainda</p></div>}
      </div>
    </div>
  );
}

// ─── WIKI ─────────────────────────────────────────────────────────────────────
function WikiScreen({ community, currentUser, isCreator, onBack, showToast }) {
  const [categories, setCategories] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const imgRef = useRef();

  const load = useCallback(async () => {
    const cats = await sb.select("wiki_categories", { eq: { community_id: community.id }, order: { col:"created_at", asc:true } });
    const enriched = await Promise.all((cats||[]).map(async cat => {
      const subs = await sb.select("wiki_subcategories", { eq: { category_id: cat.id }, order: { col:"created_at", asc:true } });
      const enrichedSubs = await Promise.all((subs||[]).map(async sub => {
        const items = await sb.select("wiki_items", { eq: { subcategory_id: sub.id }, order: { col:"created_at", asc:true } });
        return { ...sub, items: items||[] };
      }));
      return { ...cat, subcategories: enrichedSubs };
    }));
    setCategories(enriched);
  }, [community.id]);

  useEffect(() => { load(); }, [load]);

  const handleImg = (field, e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = ev => setForm(prev => ({ ...prev, [field]: ev.target.result })); reader.readAsDataURL(file);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f3f4f6" }}>
      <div style={{ background:"#fff", padding:"16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #e5e7eb", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer" }}><Icon name="back" size={22} color="#374151" /></button>
          <h2 style={{ margin:0, fontWeight:700, fontSize:20 }}>📖 Wiki</h2>
        </div>
        {isCreator && <button onClick={() => { setModal("addCat"); setForm({}); }} style={{ background:"#7c3aed", border:"none", borderRadius:20, padding:"8px 18px", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }}>+ Cat</button>}
      </div>
      <div style={{ padding:16, paddingBottom:40 }}>
        {categories.map(cat => (
          <div key={cat.id} style={{ marginBottom:12 }}>
            <div onClick={() => setExpanded(prev => ({ ...prev, [cat.id]:!prev[cat.id] }))} style={{ background:"#fff", borderRadius:16, padding:"14px 16px", display:"flex", alignItems:"center", gap:14, cursor:"pointer", boxShadow:"0 1px 6px rgba(0,0,0,0.07)" }}>
              {cat.image && <img src={cat.image} alt="" style={{ width:64, height:64, borderRadius:12, objectFit:"cover", flexShrink:0 }} />}
              <div style={{ flex:1 }}>
                <p style={{ margin:"0 0 3px", fontWeight:700, fontSize:17 }}>{cat.title}</p>
                <p style={{ margin:0, color:"#9ca3af", fontSize:13 }}>{cat.subcategories?.length||0} subcategorias</p>
              </div>
              <span style={{ color:"#9ca3af" }}>{expanded[cat.id]?"∨":"›"}</span>
            </div>
            {expanded[cat.id] && (
              <div style={{ background:"rgba(124,58,237,0.05)", borderRadius:"0 0 14px 14px", padding:"12px 16px", border:"1px solid #e9d5ff", borderTop:"none" }}>
                {isCreator && <button onClick={() => { setModal({ type:"addSub", catId:cat.id }); setForm({}); }} style={{ background:"#7c3aed", border:"none", borderRadius:12, padding:"7px 14px", color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer", marginBottom:12 }}>+ Subcategoria</button>}
                {cat.subcategories?.map(sub => (
                  <div key={sub.id} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                      <p style={{ margin:0, fontWeight:700, color:"#6b21a8", fontSize:14 }}>{sub.title}</p>
                      {isCreator && <button onClick={() => { setModal({ type:"addItem", subId:sub.id }); setForm({}); }} style={{ background:"none", border:"none", color:"#7c3aed", cursor:"pointer", fontWeight:700, fontSize:20 }}>+</button>}
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                      {sub.items?.map(item => (
                        <div key={item.id} style={{ background:"#fff", borderRadius:14, padding:12, width:120, textAlign:"center", boxShadow:"0 1px 6px rgba(0,0,0,0.1)" }}>
                          {item.image && <img src={item.image} alt="" style={{ width:"100%", height:80, objectFit:"cover", borderRadius:10, marginBottom:6 }} />}
                          <p style={{ margin:0, fontWeight:700, fontSize:12 }}>{item.title}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {categories.length===0 && <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}><div style={{ fontSize:48, marginBottom:12 }}>📖</div><p>{isCreator?"Crie a primeira categoria da Wiki!":"Nenhum conteúdo ainda."}</p></div>}
      </div>
      {(modal==="addCat"||modal?.type==="addSub"||modal?.type==="addItem") && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:500, display:"flex", alignItems:"flex-end" }}>
          <div style={{ width:"100%", background:"#fff", borderRadius:"20px 20px 0 0", padding:24, maxHeight:"80vh", overflowY:"auto" }}>
            <h3 style={{ margin:"0 0 16px", fontWeight:700 }}>{modal==="addCat"?"Nova Categoria":modal?.type==="addSub"?"Nova Subcategoria":"Novo Item"}</h3>
            {(modal==="addCat"||modal?.type==="addItem") && (
              <>
                <div onClick={() => imgRef.current.click()} style={{ height:70, borderRadius:12, background:form.image?`url(${form.image}) center/cover`:"#f3f4f6", border:"2px dashed #7c3aed", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#9b72cf", marginBottom:12 }}>{form.image?null:"📷 Imagem"}</div>
                <input ref={imgRef} type="file" accept="image/*" onChange={e => handleImg("image",e)} style={{ display:"none" }} />
              </>
            )}
            <input value={form.title||""} onChange={e => setForm(p=>({...p,title:e.target.value}))} placeholder="Título *" style={{ width:"100%", padding:"11px 14px", borderRadius:12, border:"1px solid #e5e7eb", fontSize:15, outline:"none", marginBottom:10, boxSizing:"border-box" }} />
            {modal?.type==="addItem" && <textarea value={form.content||""} onChange={e => setForm(p=>({...p,content:e.target.value}))} placeholder="Conteúdo..." rows={3} style={{ width:"100%", padding:"11px 14px", borderRadius:12, border:"1px solid #e5e7eb", fontSize:15, outline:"none", resize:"none", marginBottom:14, boxSizing:"border-box" }} />}
            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              <button onClick={() => setModal(null)} style={{ flex:1, padding:12, borderRadius:12, border:"1px solid #e5e7eb", background:"none", cursor:"pointer" }}>Cancelar</button>
              <button onClick={async () => {
                if (!form.title) return;
                if (modal==="addCat") await sb.insert("wiki_categories", { community_id: community.id, title: form.title, image: form.image||null });
                else if (modal?.type==="addSub") await sb.insert("wiki_subcategories", { category_id: modal.catId, title: form.title });
                else await sb.insert("wiki_items", { subcategory_id: modal.subId, title: form.title, content: form.content||null, image: form.image||null, author_id: currentUser.id });
                setModal(null); setForm({}); load(); showToast("Criado!");
              }} style={{ flex:1, padding:12, borderRadius:12, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, cursor:"pointer" }}>Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SIMPLE POSTS ─────────────────────────────────────────────────────────────
function SimplePostsScreen({ tab, community, currentUser, isCreator, onBack, showToast }) {
  const labels = { rules:"🛡️ Sistemas / Regras", events:"📅 Eventos", chatOff:"☕ Chat Off" };
  const [posts, setPosts] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newText, setNewText] = useState("");
  const [newImage, setNewImage] = useState(null);
  const imgRef = useRef();

  const load = useCallback(async () => {
    const data = await sb.select("posts", { eq: { community_id: community.id, tab }, order: { col:"created_at", asc:false } });
    setPosts(data||[]);
  }, [community.id, tab]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ minHeight:"100vh", background:"#f3f4f6" }}>
      <div style={{ background:"#fff", padding:"16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #e5e7eb", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer" }}><Icon name="back" size={22} color="#374151" /></button>
          <h2 style={{ margin:0, fontWeight:700, fontSize:20 }}>{labels[tab]}</h2>
        </div>
        {isCreator && <button onClick={() => setShowCreate(true)} style={{ background:"#7c3aed", border:"none", borderRadius:20, padding:"8px 18px", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }}>+ Publicar</button>}
      </div>
      <div style={{ padding:16, paddingBottom:40 }}>
        {posts.length===0 && <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}><p>Nenhuma publicação ainda.</p></div>}
        {posts.map(p => (
          <div key={p.id} style={{ background:"#fff", borderRadius:16, overflow:"hidden", marginBottom:14, boxShadow:"0 1px 6px rgba(0,0,0,0.07)" }}>
            {p.text && <p style={{ margin:"16px 16px 8px", fontSize:15, color:"#374151" }}>{p.text}</p>}
            {p.image && <img src={p.image} alt="" style={{ width:"100%", maxHeight:300, objectFit:"cover", display:"block" }} />}
            <p style={{ margin:"8px 16px 12px", color:"#9ca3af", fontSize:12 }}>{timeAgo(p.created_at)}</p>
          </div>
        ))}
      </div>
      {showCreate && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:500, display:"flex", alignItems:"flex-end" }}>
          <div style={{ width:"100%", background:"#fff", borderRadius:"20px 20px 0 0", padding:24 }}>
            <h3 style={{ margin:"0 0 16px", fontWeight:700 }}>Nova publicação</h3>
            <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder={`Comunicado para ${labels[tab]}...`} rows={4} style={{ width:"100%", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:12, padding:14, fontSize:15, outline:"none", resize:"none", boxSizing:"border-box" }} />
            {newImage && <img src={newImage} alt="" style={{ width:"100%", borderRadius:12, maxHeight:180, objectFit:"cover", marginTop:10 }} />}
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button onClick={() => imgRef.current.click()} style={{ padding:"11px 18px", borderRadius:12, border:"1px solid #e5e7eb", background:"#f9fafb", cursor:"pointer" }}><Icon name="image" size={18} color="#374151" /></button>
              <input ref={imgRef} type="file" accept="image/*" onChange={e => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setNewImage(ev.target.result); r.readAsDataURL(f); }} style={{ display:"none" }} />
              <button onClick={() => setShowCreate(false)} style={{ flex:1, padding:11, borderRadius:12, border:"1px solid #e5e7eb", background:"none", cursor:"pointer" }}>Cancelar</button>
              <button onClick={async () => {
                if (!newText.trim() && !newImage) return;
                await sb.insert("posts", { community_id: community.id, user_id: currentUser.id, text: newText, image: newImage, tab });
                setNewText(""); setNewImage(null); setShowCreate(false); load(); showToast("Publicado!");
              }} style={{ flex:1, padding:11, borderRadius:12, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, cursor:"pointer" }}>Publicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
function ProfileScreen({ currentUser, viewProfile, onBack, showToast, toast, setToast }) {
  const { userId, communityId } = viewProfile;
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [profileTab, setProfileTab] = useState("posts");
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [newText, setNewText] = useState("");
  const [newImage, setNewImage] = useState(null);
  const isOwn = userId===currentUser.id;
  const avatarRef = useRef(); const coverRef = useRef(); const postImgRef = useRef();

  const load = useCallback(async () => {
    const [prof, ps, flrs, flng] = await Promise.all([
      sb.selectOne("profiles", { eq: { user_id: userId, community_id: communityId } }),
      sb.select("posts", { eq: { user_id: userId, community_id: communityId }, order: { col:"created_at", asc:false } }),
      sb.select("follows", { eq: { following_id: userId, community_id: communityId } }),
      sb.select("follows", { eq: { follower_id: userId, community_id: communityId } })
    ]);
    setProfile(prof);
    if (prof) setEditForm({ char_name: prof.char_name||"", bio: prof.bio||"", avatar: prof.avatar||null, cover: prof.cover||null });
    setPosts((ps||[]).filter(p => !p.tab || p.tab==="posts"));
    setFollowerCount((flrs||[]).length);
    setFollowingCount((flng||[]).length);
    if (!isOwn) {
      const chk = await sb.select("follows", { eq: { follower_id: currentUser.id, following_id: userId, community_id: communityId } });
      setIsFollowing((chk||[]).length>0);
    }
  }, [userId, communityId, isOwn, currentUser.id]);

  useEffect(() => { load(); }, [load]);

  const toggleFollow = async () => {
    if (isFollowing) {
      await sb.delete("follows", { follower_id: currentUser.id, following_id: userId, community_id: communityId });
      setIsFollowing(false); setFollowerCount(p => p-1);
    } else {
      await sb.insert("follows", { follower_id: currentUser.id, following_id: userId, community_id: communityId });
      setIsFollowing(true); setFollowerCount(p => p+1);
    }
  };

  const saveProfile = async () => {
    await sb.update("profiles", { user_id: userId, community_id: communityId }, editForm);
    setShowEdit(false); load(); showToast("Perfil atualizado! ✨");
  };

  const handleImg = (field, e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = ev => setEditForm(p => ({ ...p, [field]: ev.target.result })); reader.readAsDataURL(file);
  };

  if (!profile) return (
    <div style={{ minHeight:"100vh", background:"#f3f4f6", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI',sans-serif" }}>
      <div style={{ textAlign:"center", color:"#9ca3af" }}>
        <div style={{ fontSize:36, marginBottom:12 }}>⏳</div><p>Carregando...</p>
        <button onClick={onBack} style={{ marginTop:16, padding:"10px 24px", background:"#7c3aed", border:"none", borderRadius:12, color:"#fff", cursor:"pointer" }}>Voltar</button>
      </div>
    </div>
  );

  const coverUrl = profile.cover || IMG.profileCover;
  const charName = profile.char_name || "Personagem";

  return (
    <div style={{ minHeight:"100vh", background:"#f3f4f6", fontFamily:"'Segoe UI',sans-serif" }}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <div style={{ position:"relative" }}>
        <button onClick={onBack} style={{ position:"absolute", top:14, left:14, width:36, height:36, borderRadius:10, background:"rgba(255,255,255,0.85)", border:"none", cursor:"pointer", zIndex:20, display:"flex", alignItems:"center", justifyContent:"center" }}><Icon name="back" size={18} color="#374151" /></button>
        <div style={{ height:260, backgroundImage:`url(${coverUrl})`, backgroundSize:"cover", backgroundPosition:"center top", position:"relative" }}>
          <div style={{ position:"absolute", bottom:0, left:0, right:0, height:120, background:"linear-gradient(to bottom, transparent, #f3f4f6)" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"center", marginTop:-64, position:"relative", zIndex:5 }}>
          <div style={{ width:120, height:120, borderRadius:"50%", background:profile.avatar?`url(${profile.avatar}) center/cover`:"#7c3aed", backgroundSize:"cover", border:"5px solid #f3f4f6", boxShadow:"0 4px 20px rgba(0,0,0,0.2)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:38 }}>
            {!profile.avatar && charName[0].toUpperCase()}
          </div>
        </div>
      </div>
      <div style={{ background:"#f3f4f6", padding:"10px 20px 0" }}>
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <h2 style={{ margin:"0 0 4px", fontWeight:900, fontSize:22 }}>{charName}</h2>
          {profile.bio && <p style={{ margin:"0 0 14px", color:"#6b7280", fontSize:14 }}>{profile.bio}</p>}
        </div>
        <div style={{ background:"#fff", borderRadius:16, padding:"14px 0", display:"flex", textAlign:"center", marginBottom:12, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
          {[{ v:posts.length, l:"posts" },{ v:followerCount, l:"seguidores" },{ v:followingCount, l:"seguindo" }].map(({ v, l }) => (
            <div key={l} style={{ flex:1, borderRight: l!=="seguindo"?"1px solid #f3f4f6":"none" }}>
              <p style={{ margin:"0 0 2px", fontWeight:900, fontSize:22 }}>{v}</p>
              <p style={{ margin:0, color:"#9ca3af", fontSize:12 }}>{l}</p>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:10, marginBottom:16 }}>
          {isOwn ? (
            <>
              <button onClick={() => setShowEdit(true)} style={{ flex:1, padding:12, borderRadius:12, border:"1px solid #e5e7eb", background:"#fff", fontWeight:600, cursor:"pointer", fontSize:14 }}>Editar Perfil</button>
              <button onClick={() => setShowCreate(true)} style={{ width:44, height:44, borderRadius:12, border:"none", background:"#7c3aed", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><Icon name="plus" size={20} color="#fff" /></button>
            </>
          ) : (
            <>
              <button onClick={toggleFollow} style={{ flex:1, padding:12, borderRadius:12, border:"none", background:isFollowing?"#e5e7eb":"#7c3aed", color:isFollowing?"#374151":"#fff", fontWeight:700, cursor:"pointer" }}>
                {isFollowing?"Seguindo ✓":"+ Seguir"}
              </button>
              <button style={{ flex:1, padding:12, borderRadius:12, border:"1px solid #e5e7eb", background:"#fff", fontWeight:600, cursor:"pointer", fontSize:14 }}>💬 Mensagem</button>
            </>
          )}
        </div>
      </div>
      <div style={{ background:"#fff", display:"flex", borderBottom:"1px solid #f3f4f6" }}>
        {[["posts","⊞ POSTS"],["inventory","⬡ INVENTÁRIO"]].map(([v,l]) => (
          <button key={v} onClick={() => setProfileTab(v)} style={{ flex:1, padding:14, border:"none", background:"none", cursor:"pointer", fontWeight:700, fontSize:14, color:profileTab===v?"#111827":"#9ca3af", borderBottom:profileTab===v?"2px solid #111827":"2px solid transparent" }}>{l}</button>
        ))}
      </div>
      {profileTab==="posts" && (
        posts.length===0
          ? <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}><div style={{ fontSize:40, marginBottom:10 }}>📷</div><p>Sem posts ainda</p></div>
          : <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:2, padding:2 }}>
              {posts.filter(p => p.image).map(post => (
                <div key={post.id} style={{ aspectRatio:"1", backgroundImage:`url(${post.image})`, backgroundSize:"cover", backgroundPosition:"center" }} />
              ))}
            </div>
      )}
      {profileTab==="inventory" && (
        <div style={{ background:"#f3f4f6", padding:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            {[["⚔️","Espada"],["🛡️","Escudo"],["🧪","Poção"],["💎","Gema"],["🗝️","Chave"],["📜","Pergaminho"]].map(([icon,name]) => (
              <div key={name} style={{ background:"#fff", borderRadius:12, padding:14, textAlign:"center", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize:30, marginBottom:4 }}>{icon}</div>
                <p style={{ margin:0, fontSize:12, fontWeight:600 }}>{name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showEdit && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:500, display:"flex", alignItems:"flex-end" }}>
          <div style={{ width:"100%", background:"#fff", borderRadius:"20px 20px 0 0", padding:24, maxHeight:"85vh", overflowY:"auto" }}>
            <h3 style={{ margin:"0 0 16px", fontWeight:700 }}>Editar Perfil</h3>
            <label style={{ color:"#374151", fontSize:13, fontWeight:600 }}>Capa</label>
            <div onClick={() => coverRef.current.click()} style={{ height:70, borderRadius:12, background:editForm.cover?`url(${editForm.cover}) center/cover`:"#f3f4f6", backgroundSize:"cover", border:"2px dashed #7c3aed", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#9b72cf", margin:"6px 0 14px" }}>{editForm.cover?null:"📷"}</div>
            <input ref={coverRef} type="file" accept="image/*" onChange={e => handleImg("cover",e)} style={{ display:"none" }} />
            <label style={{ color:"#374151", fontSize:13, fontWeight:600 }}>Avatar</label>
            <div onClick={() => avatarRef.current.click()} style={{ width:64, height:64, borderRadius:"50%", background:editForm.avatar?`url(${editForm.avatar}) center/cover`:"#f3f4f6", backgroundSize:"cover", border:"2px dashed #7c3aed", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#9b72cf", margin:"6px 0 14px" }}>{editForm.avatar?null:"📷"}</div>
            <input ref={avatarRef} type="file" accept="image/*" onChange={e => handleImg("avatar",e)} style={{ display:"none" }} />
            <input value={editForm.char_name||""} onChange={e => setEditForm(p=>({...p,char_name:e.target.value}))} placeholder="Nome do personagem" style={{ width:"100%", padding:"11px 14px", borderRadius:12, border:"1px solid #e5e7eb", fontSize:15, outline:"none", marginBottom:10, boxSizing:"border-box" }} />
            <textarea value={editForm.bio||""} onChange={e => setEditForm(p=>({...p,bio:e.target.value}))} placeholder="Biografia" rows={3} style={{ width:"100%", padding:"11px 14px", borderRadius:12, border:"1px solid #e5e7eb", fontSize:15, outline:"none", resize:"none", marginBottom:14, boxSizing:"border-box" }} />
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShowEdit(false)} style={{ flex:1, padding:12, borderRadius:12, border:"1px solid #e5e7eb", background:"none", cursor:"pointer" }}>Cancelar</button>
              <button onClick={saveProfile} style={{ flex:1, padding:12, borderRadius:12, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, cursor:"pointer" }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
      {showCreate && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:500, display:"flex", alignItems:"flex-end" }}>
          <div style={{ width:"100%", background:"#fff", borderRadius:"20px 20px 0 0", padding:24 }}>
            <h3 style={{ margin:"0 0 16px", fontWeight:700 }}>Criar Post</h3>
            <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Compartilhe algo..." rows={4} style={{ width:"100%", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:12, padding:14, fontSize:15, outline:"none", resize:"none", boxSizing:"border-box" }} />
            {newImage && <img src={newImage} alt="" style={{ width:"100%", borderRadius:12, maxHeight:180, objectFit:"cover", marginTop:10 }} />}
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button onClick={() => postImgRef.current.click()} style={{ padding:"11px 18px", borderRadius:12, border:"1px solid #e5e7eb", background:"#f9fafb", cursor:"pointer" }}><Icon name="image" size={18} color="#374151" /></button>
              <input ref={postImgRef} type="file" accept="image/*" onChange={e => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setNewImage(ev.target.result); r.readAsDataURL(f); }} style={{ display:"none" }} />
              <button onClick={() => setShowCreate(false)} style={{ flex:1, padding:11, borderRadius:12, border:"1px solid #e5e7eb", background:"none", cursor:"pointer" }}>Cancelar</button>
              <button onClick={async () => {
                if (!newText.trim() && !newImage) return;
                await sb.insert("posts", { community_id: communityId, user_id: currentUser.id, text: newText, image: newImage, tab:"posts" });
                setNewText(""); setNewImage(null); setShowCreate(false); load(); showToast("Post publicado! ✨");
              }} style={{ flex:1, padding:11, borderRadius:12, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, cursor:"pointer" }}>Publicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function CreateCommunityModal({ onClose, onCreate }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [cover, setCover] = useState(null); const imgRef = useRef();
  const handleImg = (e) => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setCover(ev.target.result); r.readAsDataURL(f); };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#1e1e2e", borderRadius:20, padding:24, width:"100%", maxWidth:380 }}>
        <h2 style={{ color:"#fff", fontWeight:800, marginTop:0 }}>Nova Comunidade</h2>
        <div onClick={() => imgRef.current.click()} style={{ height:110, borderRadius:12, background:cover?`url(${cover}) center/cover`:"#2d2d3e", border:"2px dashed #7c3aed", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#9b72cf", marginBottom:14 }}>{cover?null:"📷 Capa"}</div>
        <input ref={imgRef} type="file" accept="image/*" onChange={handleImg} style={{ display:"none" }} />
        <input placeholder="Nome *" value={name} onChange={e => setName(e.target.value)} style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:15, outline:"none", marginBottom:10, boxSizing:"border-box" }} />
        <textarea placeholder="Descrição" value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:15, outline:"none", resize:"none", marginBottom:16, boxSizing:"border-box" }} />
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:13, borderRadius:12, border:"1px solid rgba(255,255,255,0.2)", background:"none", color:"#9b72cf", cursor:"pointer" }}>Cancelar</button>
          <button onClick={() => name&&onCreate({ name, description, cover_image: cover||IMG.castle })} style={{ flex:2, padding:13, borderRadius:12, border:"none", background:name?"#7c3aed":"#4a4a5a", color:"#fff", fontWeight:700, cursor:name?"pointer":"not-allowed" }}>Criar</button>
        </div>
      </div>
    </div>
  );
}

function CreateProfileModal({ community, onJoin, onClose }) {
  const [charName, setCharName] = useState(""); const [bio, setBio] = useState(""); const [avatar, setAvatar] = useState(null); const [cover, setCover] = useState(null);
  const avatarRef = useRef(); const coverRef = useRef();
  const handleImg = (setter, e) => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setter(ev.target.result); r.readAsDataURL(f); };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#1e1e2e", borderRadius:20, padding:24, width:"100%", maxWidth:380, maxHeight:"90vh", overflowY:"auto" }}>
        <h2 style={{ color:"#fff", fontWeight:800, marginTop:0 }}>Perfil em<br /><span style={{ color:"#7c3aed" }}>{community.name}</span></h2>
        <div onClick={() => coverRef.current.click()} style={{ height:90, borderRadius:12, background:cover?`url(${cover}) center/cover`:"#2d2d3e", border:"2px dashed #7c3aed", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#9b72cf", marginBottom:12 }}>{cover?null:"📷 Capa"}</div>
        <input ref={coverRef} type="file" accept="image/*" onChange={e => handleImg(setCover,e)} style={{ display:"none" }} />
        <div onClick={() => avatarRef.current.click()} style={{ width:72, height:72, borderRadius:"50%", background:avatar?`url(${avatar}) center/cover`:"#2d2d3e", backgroundSize:"cover", border:"2px dashed #7c3aed", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#9b72cf", margin:"0 auto 14px" }}>{avatar?null:"📷"}</div>
        <input ref={avatarRef} type="file" accept="image/*" onChange={e => handleImg(setAvatar,e)} style={{ display:"none" }} />
        <input placeholder="Nome do Personagem *" value={charName} onChange={e => setCharName(e.target.value)} style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:15, outline:"none", marginBottom:10, boxSizing:"border-box" }} />
        <textarea placeholder="Biografia" value={bio} onChange={e => setBio(e.target.value)} rows={3} style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:15, outline:"none", resize:"none", marginBottom:16, boxSizing:"border-box" }} />
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:13, borderRadius:12, border:"1px solid rgba(255,255,255,0.2)", background:"none", color:"#9b72cf", cursor:"pointer" }}>Cancelar</button>
          <button onClick={() => charName&&onJoin(community, { char_name:charName, bio, avatar, cover })} disabled={!charName} style={{ flex:2, padding:13, borderRadius:12, border:"none", background:charName?"#7c3aed":"#4a4a5a", color:"#fff", fontWeight:700, cursor:charName?"pointer":"not-allowed" }}>Criar & Entrar</button>
        </div>
      </div>
    </div>
  );
}

function CreateChatModal({ onClose, onCreate }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [cover, setCover] = useState(null); const imgRef = useRef();
  const handleImg = (e) => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setCover(ev.target.result); r.readAsDataURL(f); };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:600, display:"flex", alignItems:"flex-end" }}>
      <div style={{ width:"100%", background:"#1e1e2e", borderRadius:"20px 20px 0 0", padding:24 }}>
        <h3 style={{ color:"#fff", margin:"0 0 16px", fontWeight:700 }}>Novo Chat</h3>
        <div onClick={() => imgRef.current.click()} style={{ height:70, borderRadius:12, background:cover?`url(${cover}) center/cover`:"#2d2d3e", border:"2px dashed #7c3aed", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#9b72cf", marginBottom:12 }}>{cover?null:"📷 Capa"}</div>
        <input ref={imgRef} type="file" accept="image/*" onChange={handleImg} style={{ display:"none" }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do Chat *" style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:15, outline:"none", marginBottom:10, boxSizing:"border-box" }} />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição" style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:15, outline:"none", marginBottom:14, boxSizing:"border-box" }} />
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:12, borderRadius:12, border:"1px solid rgba(255,255,255,0.2)", background:"none", color:"#9b72cf", cursor:"pointer" }}>Cancelar</button>
          <button onClick={() => name&&onCreate({ name, description, cover: cover||IMG.village, type:"public" })} style={{ flex:1, padding:12, borderRadius:12, border:"none", background:name?"#7c3aed":"#4a4a5a", color:"#fff", fontWeight:700, cursor:name?"pointer":"not-allowed" }}>Criar</button>
        </div>
      </div>
    </div>
  );
}
