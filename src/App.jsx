import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

const G = {
  gold: "#C9A84C", goldL: "#F0D080", goldD: "#8B6914",
  black: "#07060A", s1: "#111010", s2: "#1A1815",
  tx: "#F5EDD5", tm: "#9A8B6E", br: "rgba(201,168,76,.22)"
};

const ROIS = [
  { id: "r1", nom: "Kouame Junior",   niveau: "Master 2",  dept: "O.S", ini: "KJ", photo: "https://lh3.googleusercontent.com/d/1fyD7-6cG4eRQi94fGGKgiERL8kuKNcB4" },
  { id: "r2", nom: "Kobenan Charly",  niveau: "Licence 3", dept: "O.S", ini: "KC", photo: "https://lh3.googleusercontent.com/d/1TvgthkRY1wt9bJpRPu_NGfpIVa-s7pa9" },
  { id: "r3", nom: "Tah K. Pascal",   niveau: "Master 2",  dept: "O.S", ini: "TP", photo: "https://lh3.googleusercontent.com/d/1INdu2mUciegPxZlXKvmljFAc6Ny_-1qt" },
];
const REINES = [
  { id: "q1", nom: "Brizi Hadassa",             niveau: "Licence 3", dept: "O.S", ini: "BH", photo: "https://lh3.googleusercontent.com/d/15PwtfLdq2SNQdFudc1e5wz5HZNbYsYuP" },
  { id: "q2", nom: "Gbalenon Yasmine",          niveau: "Licence 2", dept: "O.S", ini: "GY", photo: "https://lh3.googleusercontent.com/d/1qjBwrLvzLZxKBwe4wftiUyCLwMCGhKnT" },
  { id: "q3", nom: "Monet Adounin Grâce Flora", niveau: "Licence 3", dept: "O.S", ini: "MG", photo: "https://i.ibb.co/YnYcC62/8943d6e9-a143-4e7d-b696-2972e9f37d80.jpg" },
];

/* ── STARFIELD ── */
function StarCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const cx = cv.getContext("2d");
    let W, H, raf, t = 0;
    const resize = () => { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const stars = Array.from({ length: 220 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() < 0.2 ? 1.7 : Math.random() < 0.45 ? 1.1 : 0.65,
      phase: Math.random() * Math.PI * 2,
      freq: 0.4 + Math.random() * 1.8,
      minA: 0.02 + Math.random() * 0.08,
      maxA: 0.3 + Math.random() * 0.7,
      gold: Math.random() < 0.28,
      hue: 38 + Math.random() * 16,
    }));
    let shoots = [];
    const launchShoot = () => {
      shoots.push({ x: Math.random() * 0.8, y: Math.random() * 0.4, len: 90 + Math.random() * 100, angle: 0.28 + Math.random() * 0.35, life: 1 });
      setTimeout(launchShoot, 3500 + Math.random() * 7000);
    };
    setTimeout(launchShoot, 2000);
    const draw = () => {
      cx.clearRect(0, 0, W, H);
      t += 0.008;
      stars.forEach(s => {
        const alpha = s.minA + (s.maxA - s.minA) * (0.5 + 0.5 * Math.sin(s.phase + t * s.freq * 6.28));
        cx.save();
        cx.globalAlpha = alpha;
        cx.fillStyle = s.gold ? `hsl(${s.hue},85%,72%)` : "#F0EDE5";
        cx.beginPath(); cx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); cx.fill();
        if (s.r > 1.3 && alpha > 0.55) {
          cx.globalAlpha = alpha * 0.5; cx.strokeStyle = cx.fillStyle; cx.lineWidth = 0.5;
          const arm = s.r * 4.5, sx = s.x * W, sy = s.y * H;
          cx.beginPath(); cx.moveTo(sx - arm, sy); cx.lineTo(sx + arm, sy); cx.stroke();
          cx.beginPath(); cx.moveTo(sx, sy - arm); cx.lineTo(sx, sy + arm); cx.stroke();
        }
        cx.restore();
      });
      shoots = shoots.filter(sh => sh.life > 0);
      shoots.forEach(sh => {
        const sx = sh.x * W, sy = sh.y * H;
        const ex = sx + Math.cos(sh.angle) * sh.len * (1 - sh.life);
        const ey = sy + Math.sin(sh.angle) * sh.len * (1 - sh.life);
        const gr = cx.createLinearGradient(sx, sy, ex, ey);
        gr.addColorStop(0, "rgba(240,208,128,0)");
        gr.addColorStop(1, `rgba(255,240,160,${sh.life * 0.9})`);
        cx.save(); cx.globalAlpha = sh.life; cx.strokeStyle = gr; cx.lineWidth = 1.4;
        cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(ex, ey); cx.stroke(); cx.restore();
        sh.x += Math.cos(sh.angle) * 0.003; sh.y += Math.sin(sh.angle) * 0.003; sh.life -= 0.018;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }} />;
}

/* ── RESULT CARD ── */
function ResultCard({ c, rank, pct, total, cat, animate }) {
  const medals = ["🥇", "🥈", "🥉"];
  const isLeader = rank === 0;
  return (
    <div style={{
      background: isLeader ? "linear-gradient(145deg,#1a1508,#241c06)" : G.s1,
      border: isLeader ? `1.5px solid ${G.gold}` : `1px solid ${G.br}`,
      borderRadius: 16, overflow: "hidden", position: "relative",
      boxShadow: isLeader ? `0 16px 50px rgba(201,168,76,.22), 0 0 0 1px rgba(201,168,76,.08)` : "none",
      animation: animate ? `fadeUp ${0.3 + rank * 0.15}s ease both` : "none",
    }}>
      {isLeader && (
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%,rgba(201,168,76,.08) 0%,transparent 60%)", pointerEvents: "none" }} />
      )}

      {/* RANK BADGE */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 3, background: "rgba(7,6,10,.8)", border: `1px solid ${G.br}`, borderRadius: 100, padding: "3px 10px", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: G.gold }}>
        {rank < 3 ? medals[rank] : `#${rank + 1}`}
      </div>

      {/* PHOTO */}
      <div style={{ width: "100%", aspectRatio: "3/4", background: `linear-gradient(160deg,${G.s2},#0a090c)`, position: "relative", overflow: "hidden" }}>
        {c.photo ? (
          <>
            <img src={c.photo} alt={c.nom} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", filter: isLeader ? "brightness(1.05)" : "brightness(0.8)" }} onError={e => { e.target.style.display = "none"; }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(to top,rgba(7,6,10,.95) 0%,transparent 100%)", zIndex: 1 }} />
            {isLeader && <div style={{ position: "absolute", inset: 0, zIndex: 2, boxShadow: `inset 0 0 0 2px ${G.gold}`, pointerEvents: "none" }} />}
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 70, height: 70, borderRadius: "50%", background: "rgba(201,168,76,.12)", border: `1px solid ${G.br}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond',serif", fontSize: 26, color: G.gold, fontStyle: "italic" }}>{c.ini}</div>
          </div>
        )}
      </div>

      {/* INFO */}
      <div style={{ padding: "14px 16px 18px", position: "relative", zIndex: 3 }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 19, color: isLeader ? G.goldL : G.tx, marginBottom: 3 }}>{c.nom}</div>
        <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: G.gold, marginBottom: 10 }}>{c.dept} · {c.niveau}</div>

        {/* VOTE BAR */}
        <div style={{ height: 3, background: "rgba(255,255,255,.05)", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${G.goldD},${G.gold})`, borderRadius: 2, transition: "width 1.2s ease" }} />
        </div>

        {/* SCORE: online votes 40% weight displayed */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: G.tm }}>{total} votes en ligne · 40% du score</span>
          <span style={{ fontSize: 13, fontFamily: "'Cormorant Garamond',serif", color: isLeader ? G.gold : G.tm, fontWeight: 600 }}>{pct}%</span>
        </div>
      </div>
    </div>
  );
}

/* ── MAIN APP ── */
export default function App() {
  const [counts, setCounts] = useState({ rois: {}, reines: {} });
  const [loaded, setLoaded] = useState(false);

  /* Real-time Firestore listener */
  useEffect(() => {
    const u1 = onSnapshot(doc(db, "counts", "rois"),   s => { setCounts(prev => ({ ...prev, rois:   s.data() || {} })); setLoaded(true); });
    const u2 = onSnapshot(doc(db, "counts", "reines"), s => { setCounts(prev => ({ ...prev, reines: s.data() || {} })); setLoaded(true); });
    return () => { u1(); u2(); };
  }, []);

  const totalFor = (list, cat) => list.reduce((s, c) => s + (counts[cat]?.[c.id] || 0), 0);
  const sortedRois   = [...ROIS].sort((a, b)   => (counts.rois?.[b.id]   || 0) - (counts.rois?.[a.id]   || 0));
  const sortedReines = [...REINES].sort((a, b) => (counts.reines?.[b.id] || 0) - (counts.reines?.[a.id] || 0));
  const totalRois   = totalFor(ROIS,   "rois");
  const totalReines = totalFor(REINES, "reines");

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Montserrat:wght@300;400;500;600&display=swap');
    @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.55} }
    @keyframes drift  { from{transform:translate(0,0)scale(1)} to{transform:translate(40px,50px)scale(1.15)} }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:#07060A; }
    ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(201,168,76,.3);border-radius:2px}
  `;

  return (
    <div style={{ minHeight: "100vh", background: G.black, color: G.tx, fontFamily: "'Montserrat',sans-serif", fontWeight: 300, overflowX: "hidden" }}>
      <style>{css}</style>
      <StarCanvas />

      {/* BOKEH */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none" }}>
        {[
          { w:350, h:350, c:"#C9A84C", t:"3%",  l:"4%",  o:.055, d:"25s" },
          { w:240, h:240, c:"#F0D080", t:"58%", r:"5%",  o:.045, d:"20s", dl:"-7s" },
          { w:180, h:180, c:"#8B1A1A", t:"38%", l:"52%", o:.035, d:"30s", dl:"-13s" },
        ].map((b, i) => (
          <div key={i} style={{ position:"absolute", borderRadius:"50%", filter:"blur(65px)", width:b.w, height:b.h, background:b.c, opacity:b.o, top:b.t, left:b.l, right:b.r, animation:`drift ${b.d} ease-in-out infinite alternate`, animationDelay:b.dl||"0s" }} />
        ))}
      </div>

      <div style={{ position: "relative", zIndex: 2, maxWidth: 960, margin: "0 auto", padding: "0 20px 80px" }}>

        {/* ── HEADER ── */}
        <div style={{ textAlign: "center", paddingTop: 52, paddingBottom: 32, animation: "fadeUp .9s ease" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${G.br}`, borderRadius: 100, padding: "6px 18px", fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: G.gold, marginBottom: 26, background: "rgba(201,168,76,.05)" }}>
            ♛ La CECDA Présente — Odonto-Stomatologie ♛
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, fontSize: "clamp(52px,9vw,106px)", lineHeight: .88, color: G.tx }}>
            La Nuit<span style={{ display: "block", fontStyle: "italic", color: G.gold, fontSize: ".62em" }}>des Éclats</span>
          </h1>
          <p style={{ fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", color: G.tm, marginTop: 18 }}>
            Élection du Roi &amp; de la Reine du Bal — Édition I
          </p>
          <div style={{ width: 80, height: 1, background: `linear-gradient(90deg,transparent,${G.gold},transparent)`, margin: "16px auto" }} />
        </div>

        {/* ── VOTE CLOS BANNER ── */}
        <div style={{
          background: "linear-gradient(135deg,rgba(201,168,76,.08),rgba(201,168,76,.14))",
          border: `1px solid ${G.gold}`,
          borderRadius: 16, padding: "22px 24px", textAlign: "center",
          marginBottom: 40, animation: "fadeUp .9s .1s ease both"
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
          <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: G.goldL, marginBottom: 10, fontWeight: 400 }}>
            Le vote en ligne est terminé
          </p>
          <p style={{ fontSize: 12.5, color: G.tm, lineHeight: 1.75, maxWidth: 480, margin: "0 auto 16px" }}>
            La vérification des votes se poursuit. La décision finale sera donnée par le jury lors de la cérémonie.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            {[["🗳️", "Vote en ligne", "40%"], ["👨‍⚖️", "Décision du jury", "60%"]].map(([icon, lbl, pct]) => (
              <div key={lbl} style={{ background: G.s1, border: `1px solid ${G.br}`, borderRadius: 12, padding: "10px 18px", minWidth: 130, textAlign: "center" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, color: G.gold, lineHeight: 1, fontWeight: 600 }}>{pct}</div>
                <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: G.tm, marginTop: 3 }}>{lbl}</div>
              </div>
            ))}
          </div>
          <div style={{ width: 50, height: 1, background: `linear-gradient(90deg,transparent,${G.gold},transparent)`, margin: "0 auto 14px" }} />
          <p style={{ fontSize: 13, color: G.goldL, fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic" }}>
            Rendez-vous le Samedi 11 Juillet 2026
          </p>
          <p style={{ fontSize: 11, color: G.tm, marginTop: 4, letterSpacing: ".05em" }}>
            Grand Hôtel du Plateau — La Nuit des Éclats ✨
          </p>
        </div>

        {/* ── RESULTS ROIS ── */}
        <div style={{ marginBottom: 48, animation: "fadeUp .9s .2s ease both" }}>
          <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(24px,4vw,36px)", fontWeight: 300, textAlign: "center", marginBottom: 8, color: G.tx }}>
            ♚ Résultats <span style={{ color: G.gold, fontStyle: "italic" }}>Rois</span>
          </p>
          <p style={{ fontSize: 11, color: G.tm, textAlign: "center", marginBottom: 22, letterSpacing: ".08em" }}>
            {loaded ? `${totalRois} votes en ligne` : "Chargement..."} · Ces résultats représentent 40% du score final
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 18 }}>
            {sortedRois.map((c, i) => {
              const cnt = counts.rois?.[c.id] || 0;
              const pct = totalRois ? Math.round(cnt / totalRois * 100) : 0;
              return <ResultCard key={c.id} c={c} rank={i} pct={pct} total={cnt} cat="roi" animate={loaded} />;
            })}
          </div>
        </div>

        {/* ── RESULTS REINES ── */}
        <div style={{ animation: "fadeUp .9s .3s ease both" }}>
          <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(24px,4vw,36px)", fontWeight: 300, textAlign: "center", marginBottom: 8, color: G.tx }}>
            ♛ Résultats <span style={{ color: G.gold, fontStyle: "italic" }}>Reines</span>
          </p>
          <p style={{ fontSize: 11, color: G.tm, textAlign: "center", marginBottom: 22, letterSpacing: ".08em" }}>
            {loaded ? `${totalReines} votes en ligne` : "Chargement..."} · Ces résultats représentent 40% du score final
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 18 }}>
            {sortedReines.map((c, i) => {
              const cnt = counts.reines?.[c.id] || 0;
              const pct = totalReines ? Math.round(cnt / totalReines * 100) : 0;
              return <ResultCard key={c.id} c={c} rank={i} pct={pct} total={cnt} cat="reine" animate={loaded} />;
            })}
          </div>
        </div>

      </div>

      {/* FOOTER */}
      <div style={{ textAlign: "center", padding: "28px 0 44px", borderTop: `1px solid ${G.br}`, color: G.tm, fontSize: 10, letterSpacing: ".1em", position: "relative", zIndex: 2 }}>
        <div style={{ width: 80, height: 1, background: `linear-gradient(90deg,transparent,${G.gold},transparent)`, margin: "0 auto 16px" }} />
        <span style={{ color: G.gold }}>La Nuit des Éclats</span> · CECDA · UFR Odonto-Stomatologie · UFHB<br />
        <span style={{ display: "block", marginTop: 6 }}>+225 07 79 47 57 52</span>
      </div>
    </div>
  );
}
