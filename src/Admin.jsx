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

/* ── NAME SIMILARITY HELPERS ──
   Detects: reversed first/last name, typos (Levenshtein distance), spacing differences */
function normalizeName(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/* Compares two voters' (prenom, nom). Returns a reason string if suspicious, else null. */
function compareIdentities(vA, vB) {
  const aFirst = normalizeName(vA.prenom), aLast = normalizeName(vA.nom);
  const bFirst = normalizeName(vB.prenom), bLast = normalizeName(vB.nom);
  if (!aFirst || !aLast || !bFirst || !bLast) return null;

  const aFull = `${aFirst} ${aLast}`;
  const bFull = `${bFirst} ${bLast}`;
  if (aFull === bFull) return null; // exact same identity is handled by the timing-cluster detector

  // 1. Reversed name order: "Brou Thomas" vs "Thomas Brou"
  if (aFirst === bLast && aLast === bFirst) {
    return "Noms inversés (prénom/nom échangés)";
  }

  // 2. Near-identical full name (typo), e.g. "Sory Affane" vs "Sorry Afane"
  const dist = levenshtein(aFull, bFull);
  const maxLen = Math.max(aFull.length, bFull.length);
  if (dist > 0 && dist <= 2 && maxLen >= 6) {
    return "Orthographe quasi-identique (faute de frappe probable)";
  }

  // 3. Reversed + typo combined: compare reversed-B against A
  const bReversed = `${bLast} ${bFirst}`;
  const distRev = levenshtein(aFull, bReversed);
  if (distRev > 0 && distRev <= 2 && maxLen >= 6) {
    return "Noms inversés avec légère variation d'orthographe";
  }

  return null;
}


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

  /* ── CONFIRM a suspect group as fraud (batch) ── */
  async function confirmSuspectGroup(group) {
    if (!confirm(`Marquer ces ${group.votes.length} votes comme frauduleux ?`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      group.votes.forEach(v => batch.update(doc(db, "votes", v.id), { fraud: true }));
      await batch.commit();
      const ids = new Set(group.votes.map(v => v.id));
      setVotes(prev => prev.map(v => ids.has(v.id) ? { ...v, fraud: true } : v));
      showToast(`🚩 ${group.votes.length} vote(s) confirmé(s) comme fraude`);
    } catch (e) {
      console.error(e);
      showToast("❌ Erreur lors de la confirmation");
    }
    setBusy(false);
  }

  /* ── IGNORE a suspect group (mark as legit, stop flagging) ── */
  async function ignoreSuspectGroup(group) {
    setBusy(true);
    try {
      const batch = writeBatch(db);
      group.votes.forEach(v => batch.update(doc(db, "votes", v.id), { ignoredSuspect: true }));
      await batch.commit();
      const ids = new Set(group.votes.map(v => v.id));
      setVotes(prev => prev.map(v => ids.has(v.id) ? { ...v, ignoredSuspect: true } : v));
      showToast(`✅ Groupe ignoré — considéré comme légitime`);
    } catch (e) {
      console.error(e);
      showToast("❌ Erreur");
    }
    setBusy(false);
  }

  /* ── CONFIRM a name-similarity pair as fraud (marks BOTH votes) ── */
  async function confirmNamePair(pair) {
    if (!confirm(`Marquer ces 2 votes comme frauduleux ?\n\n"${pair.a.prenom} ${pair.a.nom}" et "${pair.b.prenom} ${pair.b.nom}"`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "votes", pair.a.id), { fraud: true });
      batch.update(doc(db, "votes", pair.b.id), { fraud: true });
      await batch.commit();
      const ids = new Set([pair.a.id, pair.b.id]);
      setVotes(prev => prev.map(v => ids.has(v.id) ? { ...v, fraud: true } : v));
      showToast(`🚩 2 votes confirmés comme fraude`);
    } catch (e) {
      console.error(e);
      showToast("❌ Erreur");
    }
    setBusy(false);
  }

  /* ── IGNORE a name-similarity pair (mark both as legit) ── */
  async function ignoreNamePair(pair) {
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "votes", pair.a.id), { ignoredSuspect: true });
      batch.update(doc(db, "votes", pair.b.id), { ignoredSuspect: true });
      await batch.commit();
      const ids = new Set([pair.a.id, pair.b.id]);
      setVotes(prev => prev.map(v => ids.has(v.id) ? { ...v, ignoredSuspect: true } : v));
      showToast(`✅ Paire ignorée — considérée comme légitime`);
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

  /* ── SUSPECT DETECTION ──
     Groups non-fraud, non-ignored votes by identical (roi, reine) pair,
     then finds clusters where consecutive votes are < 2 min apart.
     A cluster of 2+ such votes = suspect group. */
  const SUSPECT_WINDOW = 120; // seconds
  const suspectGroups = (() => {
    const candidates = votes.filter(v => !v.fraud && !v.ignoredSuspect && v.ts?.seconds);
    const byPair = {};
    candidates.forEach(v => {
      const key = `${v.roi}|${v.reine}`;
      (byPair[key] = byPair[key] || []).push(v);
    });
    const groups = [];
    Object.entries(byPair).forEach(([key, list]) => {
      const sortedList = [...list].sort((a, b) => a.ts.seconds - b.ts.seconds);
      let cluster = [sortedList[0]];
      for (let i = 1; i < sortedList.length; i++) {
        const gap = sortedList[i].ts.seconds - sortedList[i - 1].ts.seconds;
        if (gap <= SUSPECT_WINDOW) {
          cluster.push(sortedList[i]);
        } else {
          if (cluster.length >= 2) groups.push({ key, votes: cluster });
          cluster = [sortedList[i]];
        }
      }
      if (cluster.length >= 2) groups.push({ key, votes: cluster });
    });
    return groups.sort((a, b) => b.votes.length - a.votes.length);
  })();
  const suspectVoteIds = new Set(suspectGroups.flatMap(g => g.votes.map(v => v.id)));
  const suspectCount = suspectVoteIds.size;

  /* ── NAME-SIMILARITY SUSPECT GROUPS ──
     Pairs up voters whose identity looks like a duplicate (reversed, typo'd). */
  const nameSuspectGroups = (() => {
    const candidates = votes.filter(v => !v.fraud && !v.ignoredSuspect && v.prenom && v.nom);
    const pairs = [];
    const usedPairKeys = new Set();
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const reason = compareIdentities(candidates[i], candidates[j]);
        if (reason) {
          const pairKey = [candidates[i].id, candidates[j].id].sort().join("|");
          if (!usedPairKeys.has(pairKey)) {
            usedPairKeys.add(pairKey);
            pairs.push({ a: candidates[i], b: candidates[j], reason });
          }
        }
      }
    }
    return pairs;
  })();
  const nameSuspectVoteIds = new Set(nameSuspectGroups.flatMap(p => [p.a.id, p.b.id]));
  const nameSuspectCount = nameSuspectGroups.length;
  const totalSuspectCount = suspectCount + nameSuspectVoteIds.size;

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
          {votes.length} votes · {totalSuspectCount} suspect(s) · {fraudVotes.length} fraude(s)
        </p>
        <div style={{ display: "flex", background: G.s1, border: `1px solid ${G.br}`, borderRadius: 100, padding: 4, marginBottom: 14 }}>
          {[["liste", `📋 Liste (${sorted.length})`], ["suspects", `⚠️ Suspects (${totalSuspectCount})`], ["fraude", `🚩 Fraudes (${fraudVotes.length})`]].map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: "10px 6px", borderRadius: 100, fontSize: 11, fontWeight: 500,
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
                            {v.prenom} {v.nom} {v.fraud && <span style={{ color: G.red }}>🚩</span>} {!v.fraud && (suspectVoteIds.has(v.id) || nameSuspectVoteIds.has(v.id)) && <span style={{ color: "#f0a020" }}>⚠️</span>}
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
                            {!v.fraud && (suspectVoteIds.has(v.id) || nameSuspectVoteIds.has(v.id)) && <span style={{ marginLeft: 8, fontSize: 11, color: "#f0a020" }}>⚠️ suspect</span>}
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

        {/* ════ TAB: SUSPECTS ════ */}
        {tab === "suspects" && (
          <div>
            <div style={{ background: G.s1, border: `1px solid ${G.br}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 12.5, color: G.tm, lineHeight: 1.6 }}>
                Détection automatique sur deux critères : <b style={{color:"#f0a020"}}>votes identiques rapprochés</b> (même Roi+Reine, &lt;2 min) et <b style={{color:"#f0a020"}}>identités similaires</b> (noms inversés, fautes de frappe). Chaque cas indique sa raison. Confirme la fraude ou ignore si c'est légitime.
              </p>
            </div>

            {suspectGroups.length === 0 && nameSuspectGroups.length === 0 ? (
              <p style={{ textAlign: "center", color: G.tm, padding: 40 }}>✅ Aucun groupe suspect détecté</p>
            ) : (
              <>
                {suspectGroups.length > 0 && (
                  <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: G.tx, marginBottom: 10 }}>
                    🕐 Rafales de votes identiques
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: nameSuspectGroups.length > 0 ? 22 : 0 }}>
                  {suspectGroups.map((g, gi) => {
                    const [roiId, reineId] = g.key.split("|");
                    const first = g.votes[0].ts.seconds;
                    const last = g.votes[g.votes.length - 1].ts.seconds;
                    const spanSec = last - first;
                    return (
                      <div key={gi} style={{ background: "rgba(240,160,32,.06)", border: "1px solid rgba(240,160,32,.35)", borderRadius: 14, padding: "16px 16px" }}>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 15, color: "#f0a020", fontWeight: 600 }}>
                            ⚠️ {g.votes.length} votes identiques
                          </div>
                          <div style={{ fontSize: 11.5, color: G.tx, marginTop: 4, fontStyle: "italic" }}>
                            Pourquoi : même choix (♚ {nameOf(roiId)} · ♛ {nameOf(reineId)}) voté {g.votes.length} fois en seulement {spanSec < 60 ? `${spanSec} secondes` : `${Math.round(spanSec/60)} minutes`} — trop rapide pour des votes indépendants.
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, maxHeight: 160, overflowY: "auto" }}>
                          {g.votes.map(v => (
                            <div key={v.id} style={{ fontSize: 11.5, color: G.tx, background: G.s2, borderRadius: 8, padding: "6px 10px", display: "flex", justifyContent: "space-between" }}>
                              <span>{v.prenom} {v.nom} <span style={{color:G.tm}}>· {v.niveau || "—"}</span></span>
                              <span style={{ color: G.tm }}>{new Date(v.ts.seconds * 1000).toLocaleTimeString("fr-FR")}</span>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => ignoreSuspectGroup(g)} disabled={busy} style={{
                            flex: 1, padding: "10px", background: "transparent", border: `1px solid ${G.br}`,
                            borderRadius: 10, color: G.tm, fontSize: 12, fontWeight: 500, cursor: "pointer"
                          }}>✅ Légitime, ignorer</button>
                          <button onClick={() => confirmSuspectGroup(g)} disabled={busy} style={{
                            flex: 1, padding: "10px", background: "linear-gradient(135deg,#a02d20,#e74c3c)",
                            border: "none", borderRadius: 10, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer"
                          }}>🚩 Confirmer fraude</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {nameSuspectGroups.length > 0 && (
                  <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: G.tx, marginBottom: 10 }}>
                    🔤 Identités similaires (doublons probables)
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {nameSuspectGroups.map((pair, pi) => (
                    <div key={pi} style={{ background: "rgba(240,160,32,.06)", border: "1px solid rgba(240,160,32,.35)", borderRadius: 14, padding: "16px 16px" }}>
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 15, color: "#f0a020", fontWeight: 600 }}>
                          ⚠️ Deux identités très proches
                        </div>
                        <div style={{ fontSize: 11.5, color: G.tx, marginTop: 4, fontStyle: "italic" }}>
                          Pourquoi : {pair.reason}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                        {[pair.a, pair.b].map(v => (
                          <div key={v.id} style={{ fontSize: 12, color: G.tx, background: G.s2, borderRadius: 8, padding: "8px 10px", display: "flex", justifyContent: "space-between" }}>
                            <span><b>{v.prenom} {v.nom}</b> <span style={{color:G.tm}}>· {v.niveau || "—"} · {v.dept || "—"}</span></span>
                            <span style={{ color: G.gold, fontSize: 11 }}>♚{nameOf(v.roi)} ♛{nameOf(v.reine)}</span>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => ignoreNamePair(pair)} disabled={busy} style={{
                          flex: 1, padding: "10px", background: "transparent", border: `1px solid ${G.br}`,
                          borderRadius: 10, color: G.tm, fontSize: 12, fontWeight: 500, cursor: "pointer"
                        }}>✅ Légitime, ignorer</button>
                        <button onClick={() => confirmNamePair(pair)} disabled={busy} style={{
                          flex: 1, padding: "10px", background: "linear-gradient(135deg,#a02d20,#e74c3c)",
                          border: "none", borderRadius: 10, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer"
                        }}>🚩 Confirmer fraude</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
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
