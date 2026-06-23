import { useState, useEffect } from "react";
import {
  collection, getDocs, deleteDoc, doc,
  increment, updateDoc, query, orderBy
} from "firebase/firestore";
import { db } from "./firebase";

const G = {
  gold: "#C9A84C", goldL: "#F0D080", goldD: "#8B6914",
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

const ADMIN_PASSWORD = "NuitDesEclats2026"; // change-le si tu veux

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState(false);

  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("ts");
  const [sortDir, setSortDir] = useState("desc");
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (authed) loadVotes();
  }, [authed]);

  async function loadVotes() {
    setLoading(true);
    const snap = await getDocs(collection(db, "votes"));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setVotes(list);
    setLoading(false);
  }

  async function deleteVote(v) {
    if (!confirm(`Supprimer le vote de "${v.prenom} ${v.nom}" ?\n\nVote pour : ${nameOf(v.roi)} & ${nameOf(v.reine)}\n\nCette action retirera aussi 1 point à chacun des deux candidats.`)) return;
    setDeleting(v.id);
    try {
      // decrement counts
      if (v.roi)   await updateDoc(doc(db, "counts", "rois"),   { [v.roi]:   increment(-1) });
      if (v.reine) await updateDoc(doc(db, "counts", "reines"), { [v.reine]: increment(-1) });
      // delete vote doc
      await deleteDoc(doc(db, "votes", v.id));
      setVotes(prev => prev.filter(x => x.id !== v.id));
      setToast(`✅ Vote de ${v.prenom} ${v.nom} supprimé et compteurs ajustés`);
      setTimeout(() => setToast(""), 3500);
    } catch (e) {
      console.error(e);
      setToast("❌ Erreur lors de la suppression");
      setTimeout(() => setToast(""), 3500);
    }
    setDeleting(null);
  }

  function checkPwd() {
    if (pwd === ADMIN_PASSWORD) { setAuthed(true); setPwdErr(false); }
    else setPwdErr(true);
  }

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
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === "ts") {
      av = a.ts?.seconds || 0; bv = b.ts?.seconds || 0;
    } else {
      av = (av || "").toString().toLowerCase();
      bv = (bv || "").toString().toLowerCase();
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const inputStyle = {
    width: "100%", background: G.s2, border: `1px solid ${G.br}`, borderRadius: 10,
    padding: "12px 16px", fontFamily: "'Montserrat',sans-serif", fontSize: 14,
    color: G.tx, outline: "none", boxSizing: "border-box"
  };

  /* ── LOGIN SCREEN ── */
  if (!authed) {
    return (
      <div style={{
        minHeight: "100vh", background: G.black, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
        fontFamily: "'Montserrat',sans-serif", color: G.tx
      }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Montserrat:wght@300;400;500;600&display=swap');`}</style>
        <div style={{
          background: G.s1, border: `1px solid ${G.br}`, borderRadius: 20,
          padding: "40px 32px", maxWidth: 380, width: "100%", textAlign: "center"
        }}>
          <span style={{ fontSize: 42, display: "block", marginBottom: 10 }}>🔐</span>
          <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, marginBottom: 6 }}>Accès Administrateur</h2>
          <p style={{ fontSize: 12, color: G.tm, marginBottom: 22 }}>La Nuit des Éclats — Gestion des votes</p>
          <input
            type="password"
            value={pwd}
            onChange={e => { setPwd(e.target.value); setPwdErr(false); }}
            onKeyDown={e => e.key === "Enter" && checkPwd()}
            placeholder="Mot de passe"
            style={{ ...inputStyle, borderColor: pwdErr ? "#e74c3c" : G.br, marginBottom: 14 }}
          />
          {pwdErr && <p style={{ color: "#e74c3c", fontSize: 12, marginBottom: 14 }}>Mot de passe incorrect</p>}
          <button onClick={checkPwd} style={{
            width: "100%", padding: 13, background: `linear-gradient(135deg,${G.goldD},${G.gold})`,
            border: "none", borderRadius: 100, color: G.black, fontWeight: 600,
            fontSize: 12, letterSpacing: ".15em", textTransform: "uppercase", cursor: "pointer"
          }}>Entrer</button>
        </div>
      </div>
    );
  }

  /* ── DASHBOARD ── */
  return (
    <div style={{ minHeight: "100vh", background: G.black, color: G.tx, fontFamily: "'Montserrat',sans-serif", padding: "30px 16px 60px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Montserrat:wght@300;400;500;600&display=swap');
        table { border-collapse: collapse; width: 100%; }
        th, td { text-align: left; padding: 10px 12px; font-size: 13px; white-space: nowrap; }
        th { cursor: pointer; user-select: none; color: ${G.tm}; font-weight: 500; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; border-bottom: 1px solid ${G.br}; position: sticky; top: 0; background: ${G.s1}; }
        tr:hover td { background: rgba(201,168,76,.04); }
        td { border-bottom: .5px solid rgba(201,168,76,.08); color: ${G.tx}; }
      `}</style>

      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, color: G.gold }}>
            Tableau de bord — Votes
          </h1>
          <p style={{ fontSize: 12, color: G.tm, marginTop: 4 }}>
            {votes.length} votes enregistrés au total
          </p>
        </div>

        {toast && (
          <div style={{
            background: "rgba(201,168,76,.1)", border: `1px solid ${G.gold}`,
            borderRadius: 10, padding: "10px 16px", textAlign: "center",
            fontSize: 13, marginBottom: 16, color: G.goldL
          }}>{toast}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher par nom, prénom, département, candidat..."
            style={{ ...inputStyle, flex: 1, minWidth: 240 }}
          />
          <button onClick={loadVotes} style={{
            padding: "12px 20px", background: G.s2, border: `1px solid ${G.br}`,
            borderRadius: 10, color: G.gold, cursor: "pointer", fontSize: 13, fontWeight: 500
          }}>🔄 Actualiser</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: G.tm, padding: 40 }}>Chargement des votes...</p>
        ) : (
          <div style={{ background: G.s1, border: `1px solid ${G.br}`, borderRadius: 14, overflow: "auto", maxHeight: "70vh" }}>
            <table>
              <thead>
                <tr>
                  <th onClick={() => toggleSort("prenom")}>Prénom {sortKey === "prenom" && (sortDir === "asc" ? "↑" : "↓")}</th>
                  <th onClick={() => toggleSort("nom")}>Nom {sortKey === "nom" && (sortDir === "asc" ? "↑" : "↓")}</th>
                  <th onClick={() => toggleSort("niveau")}>Niveau {sortKey === "niveau" && (sortDir === "asc" ? "↑" : "↓")}</th>
                  <th onClick={() => toggleSort("dept")}>Département {sortKey === "dept" && (sortDir === "asc" ? "↑" : "↓")}</th>
                  <th>Vote Roi</th>
                  <th>Vote Reine</th>
                  <th onClick={() => toggleSort("ts")}>Date/Heure {sortKey === "ts" && (sortDir === "asc" ? "↑" : "↓")}</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(v => (
                  <tr key={v.id}>
                    <td>{v.prenom || "—"}</td>
                    <td>{v.nom || "—"}</td>
                    <td>{v.niveau || "—"}</td>
                    <td>{v.dept || "—"}</td>
                    <td style={{ color: G.gold }}>{nameOf(v.roi)}</td>
                    <td style={{ color: G.gold }}>{nameOf(v.reine)}</td>
                    <td style={{ color: G.tm, fontSize: 12 }}>
                      {v.ts?.seconds ? new Date(v.ts.seconds * 1000).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td>
                      <button
                        onClick={() => deleteVote(v)}
                        disabled={deleting === v.id}
                        style={{
                          padding: "6px 14px", background: "rgba(231,76,60,.12)",
                          border: "1px solid rgba(231,76,60,.4)", borderRadius: 8,
                          color: "#e74c3c", cursor: deleting === v.id ? "wait" : "pointer",
                          fontSize: 11, fontWeight: 500
                        }}
                      >{deleting === v.id ? "..." : "🗑️ Supprimer"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <p style={{ textAlign: "center", color: G.tm, padding: 30 }}>Aucun vote trouvé</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
