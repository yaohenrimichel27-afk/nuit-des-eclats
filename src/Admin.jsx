import { useState, useEffect } from "react";
import {
  collection, getDocs, deleteDoc, doc,
  increment, updateDoc, writeBatch
} from "firebase/firestore";
import { db } from "./firebase";

const G = {
  gold: "#C9A84C", goldL: "#F0D080", goldD: "#8B6914", red: "#e74c3c",
  black: "#07060A", s1: "#111010", s2: "#1A1815",
  tx: "#F5EDD5", tm: "#9A8B6E", br: "rgba(201,168,76,.22)"
};

const ROIS = [
  { id: "r1", nom: "Kouame Junior" },
  { id: "r2", nom: "Kobenan Charly" },
  { id: "r3", nom: "Tah K. Pascal" },
];
const REINES = [
  { id: "q1", nom: "Brizi Hadassa" },
  { id: "q2", nom: "Gbalenon Yasmine" },
  { id: "q3", nom: "Monet Adounin Grâce Flora" },
];
const ALL_CANDIDATS = [...ROIS, ...REINES];
const nameOf = id => ALL_CANDIDATS.find(c => c.id === id)?.nom || id;

const ADMIN_PASSWORD = "NuitDesEclats2026";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState(false);

  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("liste"); // liste | fraude
  const [selected, setSelected] = useState(new Set());
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [penalties, setPenalties] = useState({}); // candidatId -> custom penalty value
  const [sortKey, setSortKey] = useState("date");   // nom | date | niveau | dept
  const [sortDir, setSortDir] = useState("desc");
  const [compact, setCompact] = useState(false);

  useEffect(() => { if (authed) loadVotes(); }, [authed]);

  async function loadVotes() {
    setLoading(true);
    const snap = await getDocs(collection(db, "votes"));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setVotes(list);
    setLoading(false);
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  /* ── TOGGLE SELECTION ── */
  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /* ── MARK SELECTED AS FRAUD (batch) ── */
  async function markFraudBatch() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      selected.forEach(id => {
        batch.update(doc(db, "votes", id), { fraud: true });
      });
      await batch.commit();
      setVotes(prev => prev.map(v => selected.has(v.id) ? { ...v, fraud: true } : v));
      showToast(`🚩 ${selected.size} vote(s) marqué(s) comme frauduleux`);
      setSelected(new Set());
    } catch (e) {
      console.error(e);
      showToast("❌ Erreur lors du marquage");
    }
    setBusy(false);
  }

  /* ── UNMARK FRAUD (restore) ── */
  async function unmarkFraud(id) {
    setBusy(true);
    try {
      await updateDoc(doc(db, "votes", id), { fraud: false });
      setVotes(prev => prev.map(v => v.id === id ? { ...v, fraud: false } : v));
      showToast("✅ Vote restauré comme valide");
    } catch (e) {
      console.error(e);
      showToast("❌ Erreur");
    }
    setBusy(false);
  }

  /* ── DELETE PERMANENTLY ── */
  async function deleteVote(v) {
    if (!confirm(`Supprimer définitivement le vote de "${v.prenom} ${v.nom}" ?\n\nVote pour : ${nameOf(v.roi)} & ${nameOf(v.reine)}`)) return;
    setBusy(true);
    try {
      if (!v.fraud) {
        if (v.roi)   await updateDoc(doc(db, "counts", "rois"),   { [v.roi]:   increment(-1) });
        if (v.reine) await updateDoc(doc(db, "counts", "reines"), { [v.reine]: increment(-1) });
      }
      await deleteDoc(doc(db, "votes", v.id));
      setVotes(prev => prev.filter(x => x.id !== v.id));
      showToast(`🗑️ Vote supprimé définitivement`);
    } catch (e) {
      console.error(e);
      showToast("❌ Erreur");
    }
    setBusy(false);
  }

  /* ── APPLY PENALTY for a candidate (subtract N from counts) ── */
  async function applyPenalty(candidatId, isReine) {
    const n = parseInt(penalties[candidatId]);
    if (!n || n <= 0) { showToast("Entre un nombre de points valide"); return; }
    if (!confirm(`Retirer ${n} vote(s) à "${nameOf(candidatId)}" ?\n\nCette action ajuste directement le compteur public.`)) return;
    setBusy(true);
    try {
      const col = isReine ? "reines" : "rois";
      await updateDoc(doc(db, "counts", col), { [candidatId]: increment(-n) });
      showToast(`✅ ${n} vote(s) retiré(s) à ${nameOf(candidatId)}`);
      setPenalties(prev => ({ ...prev, [candidatId]: "" }));
    } catch (e) {
      console.error(e);
      showToast("❌ Erreur lors de l'application");
    }
    setBusy(false);
  }

  function checkPwd() {
    if (pwd === ADMIN_PASSWORD) { setAuthed(true); setPwdErr(false); }
    else setPwdErr(true);
  }

  /* ── DERIVED DATA ── */
  const filtered = votes.filter(v => {
    const s = search.toLowerCase();
    return !s ||
      (v.prenom || "").toLowerCase().includes(s) ||
      (v.nom || "").toLowerCase().includes(s) ||
      (v.dept || "").toLowerCase().includes(s) ||
      nameOf(v.roi).toLowerCase().includes(s) ||
      nameOf(v.reine).toLowerCase().includes(s);
  });

  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    if (sortKey === "date") { av = a.ts?.seconds || 0; bv = b.ts?.seconds || 0; }
    else if (sortKey === "nom")    { av = `${a.nom||""} ${a.prenom||""}`.toLowerCase(); bv = `${b.nom||""} ${b.prenom||""}`.toLowerCase(); }
    else if (sortKey === "niveau") { av = (a.niveau||"").toLowerCase(); bv = (b.niveau||"").toLowerCase(); }
    else if (sortKey === "dept")   { av = (a.dept||"").toLowerCase(); bv = (b.dept||"").toLowerCase(); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); }
  }

  function selectAllVisible() {
    setSelected(prev => {
      const next = new Set(prev);
      const allIn = sorted.every(v => next.has(v.id));
      sorted.forEach(v => allIn ? next.delete(v.id) : next.add(v.id));
      return next;
    });
  }

  const fraudVotes = votes.filter(v => v.fraud);
  const fraudByCandidat = {};
  ALL_CANDIDATS.forEach(c => { fraudByCandidat[c.id] = 0; });
  fraudVotes.forEach(v => {
    if (v.roi)   fraudByCandidat[v.roi]   = (fraudByCandidat[v.roi]   || 0) + 1;
    if (v.reine) fraudByCandidat[v.reine] = (fraudByCandidat[v.reine] || 0) + 1;
  });

  const inputStyle = {
    width: "100%", background: G.s2, border: `1px solid ${G.br}`, borderRadius: 10,
    padding: "12px 16px", fontFamily: "'Montserrat',sans-serif", fontSize: 14,
    color: G.tx, outline: "none", boxSizing: "border-box"
  };

  /* ── LOGIN SCREEN ── */
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: G.black, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Montserrat',sans-serif", color: G.tx }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Montserrat:wght@300;400;500;600&display=swap');`}</style>
        <div style={{ background: G.s1, border: `1px solid ${G.br}`, borderRadius: 20, padding: "40px 28px", maxWidth: 380, width: "100%", textAlign: "center" }}>
          <span style={{ fontSize: 42, display: "block", marginBottom: 10 }}>🔐</span>
          <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, marginBottom: 6 }}>Accès Administrateur</h2>
          <p style={{ fontSize: 12, color: G.tm, marginBottom: 22 }}>La Nuit des Éclats — Gestion des votes</p>
          <input type="password" value={pwd}
            onChange={e => { setPwd(e.target.value); setPwdErr(false); }}
            onKeyDown={e => e.key === "Enter" && checkPwd()}
            placeholder="Mot de passe" inputMode="text"
            style={{ ...inputStyle, borderColor: pwdErr ? G.red : G.br, marginBottom: 14, fontSize: 16 }} />
          {pwdErr && <p style={{ color: G.red, fontSize: 12, marginBottom: 14 }}>Mot de passe incorrect</p>}
          <button onClick={checkPwd} style={{ width: "100%", padding: 13, background: `linear-gradient(135deg,${G.goldD},${G.gold})`, border: "none", borderRadius: 100, color: G.black, fontWeight: 600, fontSize: 12, letterSpacing: ".15em", textTransform: "uppercase", cursor: "pointer" }}>Entrer</button>
        </div>
      </div>
    );
  }

  /* ── DASHBOARD ── */
  return (
    <div style={{ minHeight: "100vh", background: G.black, color: G.tx, fontFamily: "'Montserrat',sans-serif", paddingBottom: 100 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Montserrat:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { opacity: 1; }
      `}</style>

      {/* HEADER */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: G.black, borderBottom: `1px solid ${G.br}`, padding: "16px 16px 0" }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, color: G.gold, textAlign: "center" }}>
          Tableau de bord
        </h1>
        <p style={{ fontSize: 11, color: G.tm, textAlign: "center", marginTop: 2, marginBottom: 14 }}>
          {votes.length} votes · {fraudVotes.length} marqué(s) frauduleux
        </p>
        <div style={{ display: "flex", background: G.s1, border: `1px solid ${G.br}`, borderRadius: 100, padding: 4, marginBottom: 14 }}>
          {[["liste", `📋 Liste (${sorted.length})`], ["fraude", `🚩 Fraudes (${fraudVotes.length})`]].map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: "10px 8px", borderRadius: 100, fontSize: 12, fontWeight: 500,
              border: "none", cursor: "pointer", transition: "all .25s",
              background: tab === k ? `linear-gradient(135deg,${G.goldD},${G.gold})` : "transparent",
              color: tab === k ? G.black : G.tm
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", top: 10, left: 16, right: 16, zIndex: 50, background: G.s1, border: `1px solid ${G.gold}`, borderRadius: 12, padding: "12px 16px", textAlign: "center", fontSize: 13, color: G.goldL, boxShadow: "0 8px 24px rgba(0,0,0,.5)" }}>
          {toast}
        </div>
      )}

      <div style={{ padding: "0 16px", maxWidth: 600, margin: "0 auto" }}>

        {/* ════ TAB: LISTE ════ */}
        {tab === "liste" && (
          <>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Rechercher un nom, candidat..."
              style={{ ...inputStyle, marginBottom: 10, fontSize: 15 }}
            />

            {/* SORT BAR */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
              {[["date","🕐 Date"], ["nom","🔤 Nom"], ["niveau","🎓 Niveau"], ["dept","🏛️ Dépt"]].map(([k, lbl]) => (
                <button key={k} onClick={() => toggleSort(k)} style={{
                  flexShrink: 0, padding: "8px 14px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                  border: `1px solid ${sortKey === k ? G.gold : G.br}`, cursor: "pointer",
                  background: sortKey === k ? "rgba(201,168,76,.15)" : G.s1,
                  color: sortKey === k ? G.goldL : G.tm, whiteSpace: "nowrap"
                }}>
                  {lbl} {sortKey === k && (sortDir === "asc" ? "↑" : "↓")}
                </button>
              ))}
              <button onClick={() => setCompact(c => !c)} style={{
                flexShrink: 0, padding: "8px 14px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                border: `1px solid ${G.br}`, cursor: "pointer", background: G.s1, color: G.tm, whiteSpace: "nowrap"
              }}>
                {compact ? "🔍 Détaillé" : "📐 Compact"}
              </button>
            </div>

            {/* SELECT ALL BAR */}
            {sorted.length > 0 && (
              <div onClick={selectAllVisible} style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                padding: "8px 4px", marginBottom: 8, fontSize: 12, color: G.tm
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6,
                  border: `2px solid ${sorted.every(v => selected.has(v.id)) ? G.gold : G.br}`,
                  background: sorted.every(v => selected.has(v.id)) ? G.gold : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: G.black
                }}>{sorted.length > 0 && sorted.every(v => selected.has(v.id)) && "✓"}</div>
                Tout sélectionner ({sorted.length} affiché{sorted.length>1?"s":""})
              </div>
            )}

            {loading ? (
              <p style={{ textAlign: "center", color: G.tm, padding: 40 }}>Chargement...</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 10 }}>
                {sorted.map(v => {
                  const isChecked = selected.has(v.id);
                  if (compact) {
                    return (
                      <div key={v.id} onClick={() => toggleSelect(v.id)} style={{
                        background: v.fraud ? "rgba(231,76,60,.06)" : G.s1,
                        border: isChecked ? `2px solid ${G.gold}` : v.fraud ? `1px solid rgba(231,76,60,.35)` : `1px solid ${G.br}`,
                        borderRadius: 10, padding: "9px 12px", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 10
                      }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                          border: `2px solid ${isChecked ? G.gold : G.br}`,
                          background: isChecked ? G.gold : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, color: G.black
                        }}>{isChecked && "✓"}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: G.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {v.prenom} {v.nom} {v.fraud && <span style={{ color: G.red }}>🚩</span>}
                          </div>
                          <div style={{ fontSize: 10.5, color: G.tm, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {v.niveau || "—"} · {v.dept || "—"} · ♚{nameOf(v.roi)} · ♛{nameOf(v.reine)}
                          </div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); deleteVote(v); }}
                          style={{ flexShrink: 0, padding: "5px 9px", background: "rgba(231,76,60,.12)", border: "1px solid rgba(231,76,60,.4)", borderRadius: 7, color: G.red, fontSize: 10 }}
                        >🗑️</button>
                      </div>
                    );
                  }
                  return (
                    <div key={v.id} onClick={() => toggleSelect(v.id)} style={{
                      background: v.fraud ? "rgba(231,76,60,.06)" : G.s1,
                      border: isChecked ? `2px solid ${G.gold}` : v.fraud ? `1px solid rgba(231,76,60,.35)` : `1px solid ${G.br}`,
                      borderRadius: 14, padding: "14px 16px", cursor: "pointer",
                      transition: "border-color .2s, background .2s", position: "relative"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 500, color: G.tx }}>
                            {v.prenom} {v.nom}
                            {v.fraud && <span style={{ marginLeft: 8, fontSize: 11, color: G.red }}>🚩 fraude</span>}
                          </div>
                          <div style={{ fontSize: 11, color: G.tm, marginTop: 2 }}>
                            {v.niveau || "—"} · {v.dept || "—"}
                          </div>
                        </div>
                        <div style={{
                          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                          border: `2px solid ${isChecked ? G.gold : G.br}`,
                          background: isChecked ? G.gold : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, color: G.black, transition: "all .2s"
                        }}>{isChecked && "✓"}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 12 }}>
                        <span style={{ background: G.s2, padding: "4px 10px", borderRadius: 8, color: G.gold }}>♚ {nameOf(v.roi)}</span>
                        <span style={{ background: G.s2, padding: "4px 10px", borderRadius: 8, color: G.gold }}>♛ {nameOf(v.reine)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: G.tm }}>
                          {v.ts?.seconds ? new Date(v.ts.seconds * 1000).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—"}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); deleteVote(v); }}
                          style={{ padding: "6px 12px", background: "rgba(231,76,60,.12)", border: "1px solid rgba(231,76,60,.4)", borderRadius: 8, color: G.red, fontSize: 11, fontWeight: 500 }}
                        >🗑️ Supprimer</button>
                      </div>
                    </div>
                  );
                })}
                {sorted.length === 0 && <p style={{ textAlign: "center", color: G.tm, padding: 30 }}>Aucun vote trouvé</p>}
              </div>
            )}
          </>
        )}

        {/* ════ TAB: FRAUDE ════ */}
        {tab === "fraude" && (
          <div>
            <div style={{ background: G.s1, border: `1px solid ${G.br}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
              <p style={{ fontSize: 13, color: G.tm, lineHeight: 1.6, marginBottom: 0 }}>
                Marque des votes comme <b style={{color:G.red}}>frauduleux</b> dans l'onglet Liste (coche-les), puis applique une pénalité ici par candidat. Le compteur public sera ajusté automatiquement.
              </p>
            </div>

            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: G.tx, marginBottom: 12 }}>♚ Rois</p>
            {ROIS.map(c => (
              <div key={c.id} style={{ background: G.s1, border: `1px solid ${G.br}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 15, color: G.tx }}>{c.nom}</span>
                  <span style={{ fontSize: 12, color: fraudByCandidat[c.id] ? G.red : G.tm }}>
                    {fraudByCandidat[c.id] || 0} vote(s) marqué(s)
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number" min="0" inputMode="numeric"
                    placeholder={`ex: ${fraudByCandidat[c.id] || 5}`}
                    value={penalties[c.id] || ""}
                    onChange={e => setPenalties(p => ({ ...p, [c.id]: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={() => applyPenalty(c.id, false)} disabled={busy} style={{
                    padding: "0 18px", background: `linear-gradient(135deg,${G.goldD},${G.gold})`,
                    border: "none", borderRadius: 10, color: G.black, fontWeight: 600, fontSize: 12,
                    cursor: "pointer", whiteSpace: "nowrap"
                  }}>Appliquer</button>
                </div>
              </div>
            ))}

            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: G.tx, marginTop: 20, marginBottom: 12 }}>♛ Reines</p>
            {REINES.map(c => (
              <div key={c.id} style={{ background: G.s1, border: `1px solid ${G.br}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 15, color: G.tx }}>{c.nom}</span>
                  <span style={{ fontSize: 12, color: fraudByCandidat[c.id] ? G.red : G.tm }}>
                    {fraudByCandidat[c.id] || 0} vote(s) marqué(s)
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number" min="0" inputMode="numeric"
                    placeholder={`ex: ${fraudByCandidat[c.id] || 5}`}
                    value={penalties[c.id] || ""}
                    onChange={e => setPenalties(p => ({ ...p, [c.id]: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={() => applyPenalty(c.id, true)} disabled={busy} style={{
                    padding: "0 18px", background: `linear-gradient(135deg,${G.goldD},${G.gold})`,
                    border: "none", borderRadius: 10, color: G.black, fontWeight: 600, fontSize: 12,
                    cursor: "pointer", whiteSpace: "nowrap"
                  }}>Appliquer</button>
                </div>
              </div>
            ))}

            {fraudVotes.length > 0 && (
              <>
                <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: G.tx, marginTop: 24, marginBottom: 12 }}>
                  📋 Détail des votes marqués
                </p>
                {fraudVotes.map(v => (
                  <div key={v.id} style={{ background: "rgba(231,76,60,.06)", border: "1px solid rgba(231,76,60,.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{v.prenom} {v.nom} — {nameOf(v.roi)} & {nameOf(v.reine)}</span>
                      <button onClick={() => unmarkFraud(v.id)} style={{ background: "none", border: "none", color: G.goldL, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                        restaurer
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* FLOATING ACTION BAR — only on liste tab when items selected */}
      {tab === "liste" && selected.size > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
          background: G.s1, borderTop: `1px solid ${G.gold}`,
          padding: "14px 16px calc(14px + env(safe-area-inset-bottom))",
          display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 -8px 30px rgba(0,0,0,.5)"
        }}>
          <span style={{ fontSize: 13, color: G.tx, flex: 1 }}>{selected.size} sélectionné(s)</span>
          <button onClick={() => setSelected(new Set())} style={{
            padding: "10px 16px", background: "transparent", border: `1px solid ${G.br}`,
            borderRadius: 10, color: G.tm, fontSize: 12, cursor: "pointer"
          }}>Annuler</button>
          <button onClick={markFraudBatch} disabled={busy} style={{
            padding: "10px 20px", background: "linear-gradient(135deg,#a02d20,#e74c3c)",
            border: "none", borderRadius: 10, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}>🚩 Marquer fraude</button>
        </div>
      )}
    </div>
  );
}
