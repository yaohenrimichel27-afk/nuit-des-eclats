import { useState, useEffect, useRef } from "react";
import {
  doc, getDoc, setDoc, updateDoc, increment,
  onSnapshot, collection, serverTimestamp
} from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { db, auth } from "./firebase";
import { getDeviceFingerprint } from "./fingerprint";

/* ── PALETTE ── */
const G = {
  gold: "#C9A84C", goldL: "#F0D080", goldD: "#8B6914",
  black: "#07060A", s1: "#111010", s2: "#1A1815",
  tx: "#F5EDD5", tm: "#9A8B6E", br: "rgba(201,168,76,.22)"
};

/* ── CANDIDATS (source de vérité) ── */
// Converts a Drive file ID to a direct thumbnail URL (no CORS issues)
function driveImg(id) {
  return `https://lh3.googleusercontent.com/d/${id}`;
}

const ROIS = [
  { id: "r1", nom: "Kouame Junior",    niveau: "Master 2",  dept: "Odonto-Stomatologie", ini: "KJ", photo: driveImg("1fyD7-6cG4eRQi94fGGKgiERL8kuKNcB4") },
  { id: "r2", nom: "Kobenan Charly",   niveau: "Licence 3", dept: "Odonto-Stomatologie", ini: "KC", photo: driveImg("1TvgthkRY1wt9bJpRPu_NGfpIVa-s7pa9") },
  { id: "r3", nom: "Tah K. Pascal",    niveau: "Master 2",  dept: "Odonto-Stomatologie", ini: "TP", photo: driveImg("1INdu2mUciegPxZlXKvmljFAc6Ny_-1qt") },
];
const REINES = [
  { id: "q1", nom: "Brizi Hadassa",             niveau: "Licence 3", dept: "Odonto-Stomatologie", ini: "BH", photo: driveImg("15PwtfLdq2SNQdFudc1e5wz5HZNbYsYuP") },
  { id: "q2", nom: "Gbalenon Yasmine",          niveau: "Licence 2", dept: "Odonto-Stomatologie", ini: "GY", photo: driveImg("1qjBwrLvzLZxKBwe4wftiUyCLwMCGhKnT") },
  { id: "q3", nom: "Monet Adounin Grâce Flora", niveau: "Licence 3", dept: "Odonto-Stomatologie", ini: "MG", photo: "https://i.ibb.co/YnYcC62/8943d6e9-a143-4e7d-b696-2972e9f37d80.jpg" },
];
const NIVEAUX = ["L1","L2","L3","M1","M2","Doctorat","Docteur"];
const MEDALS = ["🥇","🥈","🥉"];

/* ════════════════════════════════
   STARFIELD CANVAS
════════════════════════════════ */
function StarCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const cx = cv.getContext("2d");
    let W, H, raf, t = 0;

    const resize = () => {
      W = cv.width = window.innerWidth;
      H = cv.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    /* 240 stars, each with fully independent parameters */
    const stars = Array.from({ length: 240 }, () => {
      const layer = Math.random() < 0.2 ? 3 : Math.random() < 0.45 ? 2 : 1;
      return {
        x: Math.random(), y: Math.random(),        // stored as 0-1 so resize is free
        r: layer === 3 ? 1.7 : layer === 2 ? 1.1 : 0.65,
        phase: Math.random() * Math.PI * 2,
        freq: 0.4 + Math.random() * 1.8,           // twinkle speed — very spread out
        minA: 0.02 + Math.random() * 0.08,
        maxA: 0.3  + Math.random() * 0.7,
        gold: Math.random() < 0.28,
        hue: 38 + Math.random() * 16,
        sat: 70 + Math.random() * 20,
        lit: 65 + Math.random() * 18,
      };
    });

    /* shooting stars pool */
    let shoots = [];
    const launchShoot = () => {
      shoots.push({
        x: Math.random() * 0.8,
        y: Math.random() * 0.4,
        len: 90 + Math.random() * 100,
        angle: 0.28 + Math.random() * 0.35,
        life: 1,
      });
      setTimeout(launchShoot, 3500 + Math.random() * 7000);
    };
    setTimeout(launchShoot, 2000);

    const draw = () => {
      cx.clearRect(0, 0, W, H);
      t += 0.008;

      stars.forEach(s => {
        const alpha = s.minA + (s.maxA - s.minA) * (0.5 + 0.5 * Math.sin(s.phase + t * s.freq * 6.28));
        const color = s.gold
          ? `hsl(${s.hue},${s.sat}%,${s.lit}%)`
          : `hsl(220,${10 + Math.random() * 5}%,${88 + Math.random() * 8}%)`;
        cx.save();
        cx.globalAlpha = alpha;
        cx.fillStyle = color;
        cx.beginPath();
        cx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        cx.fill();

        /* 4-point sparkle on big bright stars */
        if (s.r > 1.3 && alpha > 0.55) {
          cx.globalAlpha = alpha * 0.55;
          cx.strokeStyle = color;
          cx.lineWidth = 0.5;
          const arm = s.r * 4.5;
          const sx = s.x * W, sy = s.y * H;
          cx.beginPath(); cx.moveTo(sx - arm, sy); cx.lineTo(sx + arm, sy); cx.stroke();
          cx.beginPath(); cx.moveTo(sx, sy - arm); cx.lineTo(sx, sy + arm); cx.stroke();
        }
        cx.restore();
      });

      /* shooting stars */
      shoots = shoots.filter(sh => sh.life > 0);
      shoots.forEach(sh => {
        const sx = sh.x * W, sy = sh.y * H;
        const ex = sx + Math.cos(sh.angle) * sh.len * (1 - sh.life);
        const ey = sy + Math.sin(sh.angle) * sh.len * (1 - sh.life);
        const gr = cx.createLinearGradient(sx, sy, ex, ey);
        gr.addColorStop(0, "rgba(240,208,128,0)");
        gr.addColorStop(0.5, `rgba(240,208,128,${sh.life * 0.5})`);
        gr.addColorStop(1, `rgba(255,240,160,${sh.life * 0.9})`);
        cx.save();
        cx.globalAlpha = sh.life;
        cx.strokeStyle = gr;
        cx.lineWidth = 1.4;
        cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(ex, ey); cx.stroke();
        cx.restore();
        sh.x += Math.cos(sh.angle) * 0.003;
        sh.y += Math.sin(sh.angle) * 0.003;
        sh.life -= 0.018;
      });

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas ref={ref} style={{
      position: "fixed", inset: 0, width: "100%", height: "100%",
      zIndex: 0, pointerEvents: "none"
    }} />
  );
}

/* ════════════════════════════════
   VOTE BAR
════════════════════════════════ */
function VBar({ pct }) {
  return (
    <div style={{ marginTop: 11, height: 3, background: "rgba(255,255,255,.05)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${G.goldD},${G.gold})`, borderRadius: 2, transition: "width 1s ease" }} />
    </div>
  );
}

/* ════════════════════════════════
   CANDIDATE CARD
════════════════════════════════ */
function CCard({ c, cat, rank, cnt, total, maxCnt, selected, dimmed, voted, onPick }) {
  const pct   = total ? Math.round(cnt / total * 100) : 0;
  const barPct = Math.round(cnt / (maxCnt || 1) * 100);
  const isSel = selected || voted;
  const crown = cat === "roi" ? "♚" : "♛";

  return (
    <div onClick={onPick} style={{
      background: G.s1, border: isSel ? `1.5px solid ${G.gold}` : `1px solid ${G.br}`,
      borderRadius: 16, overflow: "hidden", cursor: "pointer", position: "relative",
      transition: "transform .3s cubic-bezier(.34,1.56,.64,1), border-color .3s, box-shadow .3s, opacity .3s",
      transform: isSel ? "translateY(-7px)" : "none",
      boxShadow: isSel ? `0 18px 50px rgba(201,168,76,.2), 0 0 0 1px rgba(201,168,76,.07)` : "none",
      opacity: dimmed ? 0.4 : 1,
      userSelect: "none",
    }}>
      {isSel && (
        <div style={{
          position: "absolute", top: 10, left: 10, zIndex: 3,
          width: 34, height: 34, borderRadius: "50%", background: G.gold,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17, color: G.black,
          animation: "popIn .35s cubic-bezier(.34,1.56,.64,1)"
        }}>{crown}</div>
      )}
      <div style={{
        position: "absolute", top: 10, right: 10, zIndex: 3,
        background: "rgba(7,6,10,.82)", border: `1px solid ${G.br}`,
        borderRadius: 100, padding: "3px 10px",
        fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: G.gold
      }}>
        {rank < 3 ? MEDALS[rank] : `#${rank + 1}`}
      </div>

      {/* Photo area */}
      <div style={{
        width: "100%", aspectRatio: "3/4",
        background: `linear-gradient(160deg,${G.s2} 0%,#0a090c 100%)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
        position: "relative", overflow: "hidden"
      }}>
        {c.photo ? (
          <>
            <img
              src={c.photo}
              alt={c.nom}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", objectPosition: "center top",
                transition: "filter .4s ease",
                filter: isSel ? "brightness(1.08)" : "brightness(0.85)",
              }}
              onError={e => { e.target.style.display = "none"; }}
            />
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: "38%",
              background: "linear-gradient(to top, rgba(7,6,10,.9) 0%, transparent 100%)",
              zIndex: 1, pointerEvents: "none"
            }} />
            {isSel && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
                boxShadow: `inset 0 0 0 2px #C9A84C`
              }} />
            )}
          </>
        ) : (
          <>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 80%,rgba(201,168,76,.09) 0%,transparent 70%)" }} />
            <div style={{
              width: 78, height: 78, borderRadius: "50%",
              background: `rgba(201,168,76,${isSel ? .22 : .1})`,
              border: `1px solid rgba(201,168,76,${isSel ? .45 : .25})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Cormorant Garamond',serif", fontSize: 28, color: G.gold, fontStyle: "italic",
              zIndex: 1, transition: "background .3s"
            }}>{c.ini}</div>
            <span style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: G.tm, zIndex: 1 }}>Photo à venir</span>
          </>
        )}
      </div>

      <div style={{ padding: "15px 16px 18px" }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 19, color: G.tx, marginBottom: 3 }}>{c.nom}</div>
        <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: G.gold, marginBottom: 8 }}>{c.dept}</div>
        <div style={{
          display: "inline-flex", gap: 4, alignItems: "center",
          background: G.s2, border: `1px solid rgba(201,168,76,.1)`,
          borderRadius: 6, padding: "3px 9px", fontSize: 11, color: G.tm
        }}>📚 {c.niveau}</div>
        <VBar pct={barPct} />
        <div style={{ fontSize: 10, color: G.tm, textAlign: "right", marginTop: 3 }}>
          {cnt} votes · {pct}%
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════
   LEADERBOARD ROW
════════════════════════════════ */
function LBRow({ c, rank, cnt, total }) {
  const pct = total ? Math.round(cnt / total * 100) : 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", borderBottom: `.5px solid rgba(201,168,76,.08)`,
      background: rank === 0 ? "rgba(201,168,76,.06)" : "transparent"
    }}>
      <span style={{ fontSize: 17, minWidth: 26 }}>{rank < 3 ? MEDALS[rank] : `#${rank + 1}`}</span>
      <div style={{
        width: 34, height: 34, borderRadius: "50%",
        background: `rgba(201,168,76,${rank === 0 ? .2 : .08})`,
        border: `1px solid rgba(201,168,76,${rank === 0 ? .4 : .15})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Cormorant Garamond',serif", fontSize: 13, color: G.gold, fontStyle: "italic", flexShrink: 0
      }}>{c.ini}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: rank === 0 ? G.goldL : G.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nom}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: rank === 0 ? G.gold : G.tm, lineHeight: 1, transition: "all .5s" }}>{cnt}</div>
        <div style={{ fontSize: 9, color: G.tm }}>{pct}%</div>
      </div>
      <div style={{ width: 48, flexShrink: 0 }}>
        <div style={{ height: 4, background: "rgba(255,255,255,.05)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, transition: "width 1s ease", background: rank === 0 ? `linear-gradient(90deg,${G.goldD},${G.gold})` : "rgba(201,168,76,.25)" }} />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════
   MODAL
════════════════════════════════ */
function Modal({ selRoi, selReine, onClose, onSuccess, uid }) {
  const [form, setForm] = useState({ prenom: "", nom: "", niveau: "", dept: "" });
  const [errs, setErrs] = useState({});
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const roi   = ROIS.find(c => c.id === selRoi);
  const reine = REINES.find(c => c.id === selReine);

  const inp = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    const e = {};
    if (!form.prenom.trim()) e.prenom = 1;
    if (!form.nom.trim())    e.nom    = 1;
    if (!form.niveau)        e.niveau = 1;
    if (!form.dept.trim())   e.dept   = 1;
    setErrs(e);
    if (Object.keys(e).length) { setErrMsg("Veuillez remplir tous les champs."); return; }
    setErrMsg(""); setLoading(true);

    try {
      /* 1. Generate device fingerprint — survives private/incognito mode,
            unlike localStorage or the anonymous auth uid */
      const fingerprint = await getDeviceFingerprint();

      /* 2. Check already voted — by uid AND by fingerprint */
      const vRef = doc(db, "votes", uid);
      const vSnap = await getDoc(vRef);
      if (vSnap.exists()) { setErrMsg("Vous avez déjà voté."); setLoading(false); return; }

      if (fingerprint) {
        const fpRef = doc(db, "deviceVotes", fingerprint);
        const fpSnap = await getDoc(fpRef);
        if (fpSnap.exists()) {
          /* Log this rejected attempt — reveals if someone tries to
             re-vote from the same device under a different identity */
          try {
            await setDoc(doc(collection(db, "rejectedAttempts")), {
              fingerprint,
              attemptedRoi: selRoi, attemptedReine: selReine,
              prenom: form.prenom.trim(), nom: form.nom.trim(),
              niveau: form.niveau, dept: form.dept.trim(),
              originalUid: fpSnap.data().uid,
              ts: serverTimestamp()
            });
          } catch (logErr) { console.error("Log failed:", logErr); }

          setErrMsg("Un vote a déjà été enregistré depuis cet appareil.");
          setLoading(false);
          return;
        }
      }

      /* 3. Increment counters atomically */
      await updateDoc(doc(db, "counts", "rois"),   { [selRoi]:   increment(1) });
      await updateDoc(doc(db, "counts", "reines"), { [selReine]: increment(1) });

      /* 4. Record vote (prevents double vote by uid) */
      await setDoc(vRef, {
        uid, roi: selRoi, reine: selReine,
        prenom: form.prenom.trim(), nom: form.nom.trim(),
        niveau: form.niveau, dept: form.dept.trim(),
        fingerprint: fingerprint || null,
        ts: serverTimestamp()
      });

      /* 5. Record device fingerprint lock (prevents double vote by device) */
      if (fingerprint) {
        await setDoc(doc(db, "deviceVotes", fingerprint), {
          uid, votedAt: serverTimestamp()
        });
      }

      onSuccess(selRoi, selReine);
    } catch (err) {
      console.error(err);
      setErrMsg("Erreur réseau. Réessayez.");
    }
    setLoading(false);
  }

  const S = { /* input style */
    width: "100%", background: G.s2, border: `1px solid ${G.br}`, borderRadius: 9,
    padding: "11px 14px", fontFamily: "'Montserrat',sans-serif", fontSize: 13,
    fontWeight: 300, color: G.tx, outline: "none", appearance: "none", boxSizing: "border-box"
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,.92)", backdropFilter: "blur(14px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}>
      <div style={{
        background: G.s1, border: `1px solid ${G.br}`, borderRadius: 20,
        padding: "36px 30px", maxWidth: 420, width: "100%",
        position: "relative", animation: "fadeUp .38s cubic-bezier(.34,1.56,.64,1)"
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 13, right: 13, width: 28, height: 28, borderRadius: "50%",
          background: G.s2, border: `1px solid ${G.br}`, color: G.tm, cursor: "pointer", fontSize: 12,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>✕</button>

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 42, display: "block", marginBottom: 8 }}>♛</span>
          <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 400, color: G.tx, marginBottom: 4 }}>Confirmer mon vote</h3>
          <div style={{ fontSize: 11, color: G.gold, letterSpacing: ".1em", textTransform: "uppercase" }}>
            {roi?.nom} &amp; {reine?.nom}
          </div>
          <div style={{ width: 40, height: 1, background: `linear-gradient(90deg,transparent,${G.gold},transparent)`, margin: "14px auto" }} />
        </div>

        {[
          { k: "prenom", lbl: "Votre prénom", ph: "ex : Kouamé", type: "text" },
          { k: "nom",    lbl: "Votre nom",    ph: "ex : Yao",    type: "text" },
        ].map(({ k, lbl, ph, type }) => (
          <div key={k} style={{ marginBottom: 11 }}>
            <label style={{ display: "block", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: G.tm, marginBottom: 5 }}>{lbl}</label>
            <input type={type} value={form[k]} onChange={e => inp(k, e.target.value)} placeholder={ph}
              style={{ ...S, borderColor: errs[k] ? "#c0392b" : G.br }} />
          </div>
        ))}

        <div style={{ marginBottom: 11 }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: G.tm, marginBottom: 5 }}>Votre niveau</label>
          <select value={form.niveau} onChange={e => inp("niveau", e.target.value)}
            style={{ ...S, borderColor: errs.niveau ? "#c0392b" : G.br }}>
            <option value="">— Choisir —</option>
            {NIVEAUX.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: G.tm, marginBottom: 5 }}>Votre département / UFR</label>
          <select value={form.dept} onChange={e => inp("dept", e.target.value)}
            style={{ ...S, borderColor: errs.dept ? "#c0392b" : G.br }}>
            <option value="">— Choisir —</option>
            <option>Odonto-Stomatologie</option>
            <option>EFAD</option>
            <option>Prothésiste</option>
          </select>
        </div>

        {errMsg && (
          <div style={{ fontSize: 11, color: "#e74c3c", background: "rgba(231,76,60,.08)", border: "1px solid rgba(231,76,60,.2)", borderRadius: 7, padding: "7px 11px", marginBottom: 8 }}>
            {errMsg}
          </div>
        )}

        <button onClick={submit} disabled={loading} style={{
          width: "100%", marginTop: 14, padding: "14px",
          background: `linear-gradient(135deg,${G.goldD},${G.gold})`,
          border: "none", borderRadius: 100,
          fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 600,
          letterSpacing: ".22em", textTransform: "uppercase", color: G.black,
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .6 : 1
        }}>
          {loading ? "⏳ Enregistrement..." : "Valider mon vote"}
        </button>
        <p style={{ fontSize: 9, color: G.tm, textAlign: "center", marginTop: 9, letterSpacing: ".05em" }}>
          Un seul vote · Données privées
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════
   SUCCESS OVERLAY
════════════════════════════════ */
function Success({ roiId, reineId, onBoard }) {
  const roi   = ROIS.find(c => c.id === roiId);
  const reine = REINES.find(c => c.id === reineId);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,.92)", backdropFilter: "blur(14px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}>
      <div style={{
        background: G.s1, border: `1px solid ${G.br}`, borderRadius: 20,
        padding: "44px 34px", maxWidth: 400, width: "100%", textAlign: "center",
        animation: "fadeUp .4s cubic-bezier(.34,1.56,.64,1)"
      }}>
        <span style={{ fontSize: 64, display: "block", marginBottom: 14, animation: "popIn .5s cubic-bezier(.34,1.56,.64,1)" }}>✨</span>
        <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, color: G.gold, marginBottom: 10 }}>Vote enregistré !</h3>
        <p style={{ fontSize: 13, color: G.tm, lineHeight: 1.7 }}>
          Merci d'avoir voté pour<br />
          <span style={{ color: G.goldL }}>{roi?.nom}</span> &amp; <span style={{ color: G.goldL }}>{reine?.nom}</span>.<br />
          Que la plus belle nuit commence !
        </p>
        <div style={{ width: 50, height: 1, background: `linear-gradient(90deg,transparent,${G.gold},transparent)`, margin: "22px auto" }} />
        <button onClick={onBoard} style={{
          padding: "12px 28px", background: "transparent",
          border: `1px solid ${G.br}`, borderRadius: 100, cursor: "pointer",
          fontFamily: "'Montserrat',sans-serif", fontSize: 10,
          letterSpacing: ".15em", textTransform: "uppercase", color: G.gold
        }}>Voir le classement en direct →</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════
   APP
════════════════════════════════ */
export default function App() {
  const [uid, setUid]           = useState(null);
  const [counts, setCounts]     = useState({ rois: {}, reines: {} });
  const [voted, setVoted]       = useState(null);     // { roi, reine } or null
  const [selRoi, setSelRoi]     = useState(null);
  const [selReine, setSelReine] = useState(null);
  const [tab, setTab]           = useState("vote");   // vote | board
  const [modal, setModal]       = useState(false);
  const [success, setSuccess]   = useState(false);
  const [loading, setLoading]   = useState(true);

  /* ── AUTH anonyme + vérification empreinte appareil ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (user) {
        setUid(user.uid);

        /* check already voted by uid */
        const vSnap = await getDoc(doc(db, "votes", user.uid));
        if (vSnap.exists()) {
          setVoted({ roi: vSnap.data().roi, reine: vSnap.data().reine });
          return;
        }

        /* check already voted by device fingerprint (catches incognito mode) */
        const fingerprint = await getDeviceFingerprint();
        if (fingerprint) {
          const fpSnap = await getDoc(doc(db, "deviceVotes", fingerprint));
          if (fpSnap.exists()) {
            /* device already voted under a different uid — block here too */
            const otherUid = fpSnap.data().uid;
            const otherVoteSnap = await getDoc(doc(db, "votes", otherUid));
            if (otherVoteSnap.exists()) {
              setVoted({ roi: otherVoteSnap.data().roi, reine: otherVoteSnap.data().reine });
            } else {
              setVoted({ roi: null, reine: null }); // locked, details unknown
            }
          }
        }
      } else {
        await signInAnonymously(auth);
      }
    });
    return unsub;
  }, []);

  /* ── REALTIME COUNTS ── */
  useEffect(() => {
    const initAndListen = async (col, key) => {
      const ref = doc(db, "counts", col);
      /* always sync keys — adds new candidates, never removes old */
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : {};
      const init = {};
      (key === "rois" ? ROIS : REINES).forEach(c => {
        init[c.id] = existing[c.id] ?? 0;
      });
      await setDoc(ref, init, { merge: false });
      return onSnapshot(ref, snap => {
        setCounts(prev => ({ ...prev, [key]: snap.data() || {} }));
        setLoading(false);
      });
    };
    let u1, u2;
    initAndListen("rois",   "rois"  ).then(u => { u1 = u; });
    initAndListen("reines", "reines").then(u => { u2 = u; });
    return () => { u1?.(); u2?.(); };
  }, []);

  /* helpers */
  const totalFor = (list, cat) => list.reduce((s, c) => s + (counts[cat]?.[c.id] || 0), 0);
  const maxFor   = (list, cat) => Math.max(...list.map(c => counts[cat]?.[c.id] || 0), 1);
  const sortedRois   = [...ROIS].sort((a,b)   => (counts.rois?.[b.id]||0)   - (counts.rois?.[a.id]||0));
  const sortedReines = [...REINES].sort((a,b) => (counts.reines?.[b.id]||0) - (counts.reines?.[a.id]||0));
  const totalRois   = totalFor(ROIS,   "rois");
  const totalReines = totalFor(REINES, "reines");
  const hasVoted = !!voted;

  function handleSuccess(roi, reine) {
    setVoted({ roi, reine });
    setModal(false);
    setSuccess(true);
  }

  /* ── INSTRUCTION TEXT ── */
  function instrText() {
    if (!selRoi && !selReine) return <span>Sélectionnez <b style={{ color: G.gold }}>1 Roi</b> et <b style={{ color: G.gold }}>1 Reine</b> pour valider votre vote</span>;
    if (selRoi  && !selReine) return <span style={{ color: G.goldL }}>✓ Roi sélectionné — choisissez maintenant une <b>Reine ↓</b></span>;
    if (!selRoi && selReine)  return <span style={{ color: G.goldL }}>✓ Reine sélectionnée — choisissez maintenant un <b>Roi ↑</b></span>;
    return <span style={{ color: G.goldL }}>✨ Parfait — <b>confirmez votre vote !</b></span>;
  }

  const ready = selRoi && selReine;

  /* ── CSS KEYFRAMES via style tag ── */
  const css = `
    @keyframes popIn  { from{transform:scale(0) rotate(-20deg)} to{transform:scale(1) rotate(0)} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
    @keyframes glow   { 0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0)} 50%{box-shadow:0 0 24px 8px rgba(201,168,76,.24)} }
    @keyframes numPop { 0%{transform:scale(1)} 50%{transform:scale(1.18)} 100%{transform:scale(1)} }
    select option { background:#1A1815; color:#F5EDD5; }
    ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(201,168,76,.3);border-radius:2px}
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:#07060A; }
  `;

  return (
    <div style={{ minHeight: "100vh", background: G.black, color: G.tx, fontFamily: "'Montserrat',sans-serif", fontWeight: 300, overflowX: "hidden" }}>
      <style>{css}</style>
      <StarCanvas />

      {/* BOKEH */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none" }}>
        {[
          { w:350, h:350, bg:"#C9A84C", t:"3%",  l:"4%",  o:.055, d:"25s" },
          { w:240, h:240, bg:"#F0D080", t:"58%", r:"5%",  o:.045, d:"20s", dl:"-7s" },
          { w:180, h:180, bg:"#C0392B", t:"38%", l:"52%", o:.035, d:"30s", dl:"-13s" },
        ].map((b, i) => (
          <div key={i} style={{
            position: "absolute", borderRadius: "50%", filter: "blur(65px)",
            width: b.w, height: b.h, background: b.bg, opacity: b.o,
            top: b.t, left: b.l, right: b.r,
            animation: `drift ${b.d} ease-in-out infinite alternate`,
            animationDelay: b.dl || "0s"
          }} />
        ))}
        <style>{`@keyframes drift{from{transform:translate(0,0)scale(1)}to{transform:translate(40px,50px)scale(1.15)}}`}</style>
      </div>

      {/* PAGE */}
      <div style={{ position: "relative", zIndex: 2, maxWidth: 980, margin: "0 auto", padding: "0 20px 60px" }}>

        {/* HEADER */}
        <div style={{ textAlign: "center", paddingTop: 54, paddingBottom: 30, animation: "fadeUp .9s ease" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            border: `1px solid ${G.br}`, borderRadius: 100, padding: "6px 18px",
            fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase",
            color: G.gold, marginBottom: 26, background: "rgba(201,168,76,.05)"
          }}>♛ La CECDA Présente — Odonto-Stomatologie ♛</div>

          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, fontSize: "clamp(52px,9vw,106px)", lineHeight: .88, color: G.tx }}>
            La Nuit
            <span style={{ display: "block", fontStyle: "italic", color: G.gold, fontSize: ".62em" }}>des Éclats</span>
          </h1>
          <p style={{ fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", color: G.tm, marginTop: 18 }}>
            Élection du Roi &amp; de la Reine du Bal — Édition I
          </p>
          <div style={{ width: 80, height: 1, background: `linear-gradient(90deg,transparent,${G.gold},transparent)`, margin: "16px auto" }} />
          <div style={{ display: "flex", justifyContent: "center", gap: 24, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: G.tm, flexWrap: "wrap" }}>
            <span>✦ 11 Juillet 2026</span><span>✦ 16h30</span><span>✦ UFHB</span>
          </div>
        </div>

        {/* COUNTERS */}
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 34, flexWrap: "wrap" }}>
          {[
            { lbl: "Votes total",  val: totalRois + totalReines },
            { lbl: "Votes Rois",   val: totalRois },
            { lbl: "Votes Reines", val: totalReines },
          ].map(({ lbl, val }) => (
            <div key={lbl} style={{ background: G.s1, border: `1px solid ${G.br}`, borderRadius: 12, padding: "14px 26px", textAlign: "center", minWidth: 110 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 38, color: G.gold, lineHeight: 1, fontWeight: 600, transition: "all .5s" }}>
                {loading ? "—" : val}
              </div>
              <div style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: G.tm, marginTop: 3 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
          <div style={{ display: "flex", background: G.s1, border: `1px solid ${G.br}`, borderRadius: 100, padding: 4, gap: 2 }}>
            {[["vote", "♚  Voter"], ["board", "🏆  Classement"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                padding: "10px 26px", borderRadius: 100, fontSize: 11, letterSpacing: ".15em",
                textTransform: "uppercase", cursor: "pointer", border: "none",
                fontFamily: "'Montserrat',sans-serif", fontWeight: 500, transition: "all .3s",
                background: tab === k ? `linear-gradient(135deg,${G.goldD},${G.gold})` : "transparent",
                color: tab === k ? G.black : G.tm
              }}>{lbl}</button>
            ))}
          </div>
        </div>

        {/* ── VOTE TAB ── */}
        {tab === "vote" && (
          <div style={{ animation: "fadeUp .4s ease" }}>
            {hasVoted
              ? <div style={{ background:"rgba(201,168,76,.07)", border:`1px solid rgba(201,168,76,.35)`, borderRadius:12, padding:"13px 18px", textAlign:"center", fontSize:13, color:G.gold, marginBottom:28 }}>
                  ✨ Vous avez déjà voté — merci pour votre participation !
                </div>
              : <div style={{ background:G.s1, border:`1px solid ${G.br}`, borderRadius:12, padding:"13px 20px", textAlign:"center", fontSize:13, color:G.tm, marginBottom:28 }}>
                  {instrText()}
                </div>
            }

            {/* ROIS */}
            <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(24px,4vw,36px)", fontWeight:300, textAlign:"center", marginBottom:20, color:G.tx }}>
              ♚ Candidats <span style={{ color:G.gold, fontStyle:"italic" }}>Rois</span>
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:18, marginBottom:42 }}>
              {ROIS.map(c => {
                const rank = sortedRois.findIndex(x => x.id === c.id);
                return <CCard key={c.id} c={c} cat="roi" rank={rank}
                  cnt={counts.rois?.[c.id] || 0} total={totalRois} maxCnt={maxFor(ROIS,"rois")}
                  selected={selRoi === c.id} dimmed={selRoi && selRoi !== c.id}
                  voted={voted?.roi === c.id}
                  onPick={() => { if (!hasVoted) setSelRoi(v => v === c.id ? null : c.id); }}
                />;
              })}
            </div>

            {/* REINES */}
            <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"clamp(24px,4vw,36px)", fontWeight:300, textAlign:"center", marginBottom:20, color:G.tx }}>
              ♛ Candidates <span style={{ color:G.gold, fontStyle:"italic" }}>Reines</span>
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:18, marginBottom:42 }}>
              {REINES.map(c => {
                const rank = sortedReines.findIndex(x => x.id === c.id);
                return <CCard key={c.id} c={c} cat="reine" rank={rank}
                  cnt={counts.reines?.[c.id] || 0} total={totalReines} maxCnt={maxFor(REINES,"reines")}
                  selected={selReine === c.id} dimmed={selReine && selReine !== c.id}
                  voted={voted?.reine === c.id}
                  onPick={() => { if (!hasVoted) setSelReine(v => v === c.id ? null : c.id); }}
                />;
              })}
            </div>

            {/* CTA */}
            {!hasVoted && (
              <div style={{ textAlign: "center", marginBottom: 56 }}>
                <button onClick={() => ready && setModal(true)} style={{
                  padding: "16px 52px", borderRadius: 100,
                  fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 600,
                  letterSpacing: ".22em", textTransform: "uppercase", cursor: ready ? "pointer" : "not-allowed",
                  border: `1px solid ${ready ? G.gold : G.br}`, transition: "all .35s",
                  background: ready ? `linear-gradient(135deg,${G.goldD},${G.gold})` : "rgba(201,168,76,.08)",
                  color: ready ? G.black : G.tm,
                  animation: ready ? "glow 2.5s ease infinite" : "none"
                }}>
                  {!selRoi && !selReine ? "Sélectionnez vos candidats"
                    : !selRoi   ? "Choisissez un Roi"
                    : !selReine ? "Choisissez une Reine"
                    : "✨ Confirmer mon vote"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── BOARD TAB ── */}
        {tab === "board" && (
          <div style={{ animation: "fadeUp .4s ease", marginBottom: 52 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20 }}>
              {[
                { title: "♚ Classement", span: "Rois",   list: sortedRois,   cat: "rois",   total: totalRois },
                { title: "♛ Classement", span: "Reines", list: sortedReines, cat: "reines", total: totalReines },
              ].map(({ title, span, list, cat, total }) => (
                <div key={cat} style={{ background: G.s1, border: `1px solid ${G.br}`, borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${G.br}` }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: G.tx }}>
                      {title} <span style={{ color: G.gold, fontStyle: "italic" }}>{span}</span>
                    </div>
                    <div style={{ fontSize: 9, color: G.tm, letterSpacing: ".1em", textTransform: "uppercase", marginTop: 2 }}>
                      {total} votes au total · temps réel 🔴
                    </div>
                  </div>
                  {list.map((c, i) => (
                    <LBRow key={c.id} c={c} rank={i} cnt={counts[cat]?.[c.id] || 0} total={total} />
                  ))}
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: G.tm, letterSpacing: ".08em" }}>
              🔴 Classement mis à jour en direct sur tous les appareils
            </p>
          </div>
        )}

      </div>

      {/* FOOTER */}
      <div style={{ textAlign: "center", padding: "28px 0 44px", borderTop: `1px solid ${G.br}`, color: G.tm, fontSize: 10, letterSpacing: ".1em", position: "relative", zIndex: 2 }}>
        <div style={{ width: 80, height: 1, background: `linear-gradient(90deg,transparent,${G.gold},transparent)`, margin: "0 auto 16px" }} />
        <span style={{ color: G.gold }}>La Nuit des Éclats</span> · CECDA · UFR Odonto-Stomatologie · UFHB<br />
        <span style={{ display: "block", marginTop: 5 }}>+225 07 79 47 57 52</span>
      </div>

      {/* MODALS */}
      {modal && uid && (
        <Modal selRoi={selRoi} selReine={selReine} uid={uid}
          onClose={() => setModal(false)}
          onSuccess={handleSuccess}
        />
      )}
      {success && (
        <Success roiId={voted?.roi} reineId={voted?.reine}
          onBoard={() => { setSuccess(false); setTab("board"); }}
        />
      )}
    </div>
  );
}
