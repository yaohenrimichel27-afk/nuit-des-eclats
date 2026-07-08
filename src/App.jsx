import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

const G = {
  gold: "#C9A84C", goldL: "#F0D080", goldD: "#8B6914",
  black: "#07060A", s1: "#111010", s2: "#1A1815",
  tx: "#F5EDD5", tm: "#9A8B6E", br: "rgba(201,168,76,.22)"
};

const ROIS = [
  { id:"r1", nom:"Kouame Junior",   niveau:"Master 2",  dept:"O.S", ini:"KJ", photo:"https://lh3.googleusercontent.com/d/1fyD7-6cG4eRQi94fGGKgiERL8kuKNcB4" },
  { id:"r2", nom:"Kobenan Charly",  niveau:"Licence 3", dept:"O.S", ini:"KC", photo:"https://lh3.googleusercontent.com/d/1TvgthkRY1wt9bJpRPu_NGfpIVa-s7pa9" },
  { id:"r3", nom:"Tah K. Pascal",   niveau:"Master 2",  dept:"O.S", ini:"TP", photo:"https://lh3.googleusercontent.com/d/1INdu2mUciegPxZlXKvmljFAc6Ny_-1qt" },
];
const REINES = [
  { id:"q1", nom:"Brizi Hadassa",             niveau:"Licence 3", dept:"O.S", ini:"BH", photo:"https://lh3.googleusercontent.com/d/15PwtfLdq2SNQdFudc1e5wz5HZNbYsYuP" },
  { id:"q2", nom:"Gbalenon Yasmine",          niveau:"Licence 2", dept:"O.S", ini:"GY", photo:"https://lh3.googleusercontent.com/d/1qjBwrLvzLZxKBwe4wftiUyCLwMCGhKnT" },
  { id:"q3", nom:"Monet Adounin Grâce Flora", niveau:"Licence 3", dept:"O.S", ini:"MG", photo:"https://i.ibb.co/YnYcC62/8943d6e9-a143-4e7d-b696-2972e9f37d80.jpg" },
];

/* ── STARFIELD ── */
function StarCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const cx = cv.getContext("2d");
    let W, H, raf, t = 0;
    const resize = () => { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; };
    resize(); window.addEventListener("resize", resize);
    const stars = Array.from({length:240}, () => ({
      x:Math.random(), y:Math.random(),
      r: Math.random()<.18?1.8:Math.random()<.4?1.1:.65,
      phase:Math.random()*Math.PI*2, freq:.4+Math.random()*1.8,
      minA:.02+Math.random()*.08, maxA:.3+Math.random()*.7,
      gold:Math.random()<.28, hue:38+Math.random()*16,
    }));
    let shoots=[];
    const launch=()=>{ shoots.push({x:Math.random()*.85,y:Math.random()*.35,len:80+Math.random()*110,angle:.28+Math.random()*.38,life:1}); setTimeout(launch,3000+Math.random()*7000); };
    setTimeout(launch,1800);
    const draw=()=>{
      cx.clearRect(0,0,W,H); t+=.008;
      stars.forEach(s=>{
        const a=s.minA+(s.maxA-s.minA)*(.5+.5*Math.sin(s.phase+t*s.freq*6.28));
        cx.save(); cx.globalAlpha=a;
        cx.fillStyle=s.gold?`hsl(${s.hue},85%,72%)`:"#F0EDE5";
        cx.beginPath(); cx.arc(s.x*W,s.y*H,s.r,0,Math.PI*2); cx.fill();
        if(s.r>1.3&&a>.5){
          cx.globalAlpha=a*.5; cx.strokeStyle=cx.fillStyle; cx.lineWidth=.5;
          const arm=s.r*4.5,sx=s.x*W,sy=s.y*H;
          cx.beginPath();cx.moveTo(sx-arm,sy);cx.lineTo(sx+arm,sy);cx.stroke();
          cx.beginPath();cx.moveTo(sx,sy-arm);cx.lineTo(sx,sy+arm);cx.stroke();
        }
        cx.restore();
      });
      shoots=shoots.filter(s=>s.life>0);
      shoots.forEach(s=>{
        const sx=s.x*W,sy=s.y*H,ex=sx+Math.cos(s.angle)*s.len*(1-s.life),ey=sy+Math.sin(s.angle)*s.len*(1-s.life);
        const gr=cx.createLinearGradient(sx,sy,ex,ey);
        gr.addColorStop(0,"rgba(240,208,128,0)"); gr.addColorStop(1,`rgba(255,240,160,${s.life*.9})`);
        cx.save();cx.globalAlpha=s.life;cx.strokeStyle=gr;cx.lineWidth=1.5;
        cx.beginPath();cx.moveTo(sx,sy);cx.lineTo(ex,ey);cx.stroke();cx.restore();
        s.x+=Math.cos(s.angle)*.003;s.y+=Math.sin(s.angle)*.003;s.life-=.018;
      });
      raf=requestAnimationFrame(draw);
    };
    draw();
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener("resize",resize); };
  },[]);
  return <canvas ref={ref} style={{position:"fixed",inset:0,width:"100%",height:"100%",zIndex:0,pointerEvents:"none"}}/>;
}

/* ── RANK ROW (horizontal leaderboard card) ── */
function RankRow({ c, rank, cnt, pct, maxCnt, delay }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(()=>setVisible(true), delay); return ()=>clearTimeout(t); }, [delay]);
  const isFirst = rank===0, isSecond = rank===1, isThird = rank===2;
  const medals = ["🥇","🥈","🥉"];
  const rankColors = ["#C9A84C","#C0C0C0","#CD7F32"];
  const barPct = maxCnt ? Math.round(cnt/maxCnt*100) : 0;

  return (
    <div style={{
      opacity: visible?1:0, transform: visible?"translateY(0)":"translateY(18px)",
      transition:`opacity .55s ease, transform .55s ease`,
      background: isFirst
        ? "linear-gradient(135deg,rgba(201,168,76,.12) 0%,rgba(201,168,76,.04) 100%)"
        : G.s1,
      border: isFirst ? `1px solid rgba(201,168,76,.5)` : `1px solid ${G.br}`,
      borderRadius: 16, overflow:"hidden", position:"relative",
      boxShadow: isFirst ? "0 8px 40px rgba(201,168,76,.12)" : "none",
    }}>
      {isFirst && <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 0% 50%,rgba(201,168,76,.06) 0%,transparent 60%)",pointerEvents:"none"}}/>}

      <div style={{display:"flex",alignItems:"center",gap:0,position:"relative",zIndex:1}}>

        {/* PHOTO */}
        <div style={{
          width:90, height:90, flexShrink:0, position:"relative", overflow:"hidden",
          borderRight:`1px solid ${isFirst?"rgba(201,168,76,.3)":G.br}`,
        }}>
          {c.photo
            ? <img src={c.photo} alt={c.nom} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center top",filter:isFirst?"brightness(1.05)":"brightness(.82)"}} onError={e=>{e.target.style.display="none"}}/>
            : <div style={{width:"100%",height:"100%",background:G.s2,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cormorant Garamond',serif",fontSize:22,color:G.gold,fontStyle:"italic"}}>{c.ini}</div>
          }
          {isFirst&&<div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent 70%,rgba(201,168,76,.08))",pointerEvents:"none"}}/>}
        </div>

        {/* RANK NUMBER */}
        <div style={{
          width:44, flexShrink:0, textAlign:"center",
          fontFamily:"'Cormorant Garamond',serif",
          fontSize: isFirst?28:22,
          color: rank<3 ? rankColors[rank] : G.tm,
          fontWeight:600, padding:"0 4px",
        }}>
          {rank<3 ? medals[rank] : `#${rank+1}`}
        </div>

        {/* INFO + BAR */}
        <div style={{flex:1,padding:"12px 14px 12px 6px",minWidth:0}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isFirst?18:16,color:isFirst?G.goldL:G.tx,fontWeight:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:2}}>
            {c.nom}
          </div>
          <div style={{fontSize:10,color:G.tm,letterSpacing:".08em",textTransform:"uppercase",marginBottom:8}}>
            {c.niveau} · {c.dept}
          </div>
          {/* Progress bar */}
          <div style={{height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden",marginBottom:4}}>
            <div style={{height:"100%",width:`${barPct}%`,borderRadius:2,transition:"width 1.4s cubic-bezier(.4,0,.2,1)",
              background: isFirst?`linear-gradient(90deg,${G.goldD},${G.gold})`:isSecond?"linear-gradient(90deg,#888,#ccc)":isThird?"linear-gradient(90deg,#6B4226,#CD7F32)":"rgba(201,168,76,.3)"
            }}/>
          </div>
        </div>

        {/* SCORE */}
        <div style={{padding:"0 18px 0 8px",textAlign:"right",flexShrink:0}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isFirst?30:22,color:isFirst?G.gold:G.tm,lineHeight:1,fontWeight:600}}>{pct}<span style={{fontSize:.5*22,color:G.tm}}>%</span></div>
          <div style={{fontSize:9,color:G.tm,letterSpacing:".08em",textTransform:"uppercase",marginTop:2}}>{cnt} votes</div>
        </div>
      </div>
    </div>
  );
}

/* ── MAIN APP ── */
export default function App() {
  const [counts, setCounts] = useState({rois:{},reines:{}});
  const [loaded, setLoaded] = useState(false);

  useEffect(()=>{
    const u1=onSnapshot(doc(db,"counts","rois"),   s=>{setCounts(p=>({...p,rois:  s.data()||{}}));setLoaded(true);});
    const u2=onSnapshot(doc(db,"counts","reines"), s=>{setCounts(p=>({...p,reines:s.data()||{}}));setLoaded(true);});
    return()=>{u1();u2();};
  },[]);

  const totalFor=(list,cat)=>list.reduce((s,c)=>s+(counts[cat]?.[c.id]||0),0);
  const sortedRois   = [...ROIS].sort((a,b)=>(counts.rois?.[b.id]||0)-(counts.rois?.[a.id]||0));
  const sortedReines = [...REINES].sort((a,b)=>(counts.reines?.[b.id]||0)-(counts.reines?.[a.id]||0));
  const totalRois    = totalFor(ROIS,"rois");
  const totalReines  = totalFor(REINES,"reines");
  const maxRoi       = Math.max(...ROIS.map(c=>counts.rois?.[c.id]||0),1);
  const maxReine     = Math.max(...REINES.map(c=>counts.reines?.[c.id]||0),1);

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Montserrat:wght@300;400;500;600&display=swap');
    @keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
    @keyframes drift{from{transform:translate(0,0)scale(1)}to{transform:translate(40px,50px)scale(1.15)}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes crownFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#07060A;}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(201,168,76,.3);border-radius:2px}
  `;

  return (
    <div style={{minHeight:"100vh",background:G.black,color:G.tx,fontFamily:"'Montserrat',sans-serif",fontWeight:300,overflowX:"hidden"}}>
      <style>{css}</style>
      <StarCanvas/>

      {/* BOKEH */}
      <div style={{position:"fixed",inset:0,zIndex:1,pointerEvents:"none"}}>
        {[{w:400,h:400,c:"#C9A84C",t:"2%",l:"3%",o:.05,d:"26s"},{w:280,h:280,c:"#F0D080",t:"60%",r:"4%",o:.04,d:"21s",dl:"-8s"},{w:200,h:200,c:"#8B1A1A",t:"35%",l:"50%",o:.03,d:"32s",dl:"-14s"}]
          .map((b,i)=><div key={i} style={{position:"absolute",borderRadius:"50%",filter:"blur(70px)",width:b.w,height:b.h,background:b.c,opacity:b.o,top:b.t,left:b.l,right:b.r,animation:`drift ${b.d} ease-in-out infinite alternate`,animationDelay:b.dl||"0s"}}/>)}
      </div>

      <div style={{position:"relative",zIndex:2,maxWidth:680,margin:"0 auto",padding:"0 18px 80px"}}>

        {/* ══ HEADER ══ */}
        <div style={{textAlign:"center",paddingTop:52,paddingBottom:28,animation:"fadeUp .9s ease"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,border:`1px solid ${G.br}`,borderRadius:100,padding:"6px 18px",fontSize:10,letterSpacing:".2em",textTransform:"uppercase",color:G.gold,marginBottom:24,background:"rgba(201,168,76,.05)"}}>
            ♛ La CECDA Présente — Odonto-Stomatologie ♛
          </div>
          <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:300,fontSize:"clamp(50px,10vw,108px)",lineHeight:.87,color:G.tx}}>
            La Nuit<span style={{display:"block",fontStyle:"italic",color:G.gold,fontSize:".62em"}}>des Éclats</span>
          </h1>
          <div style={{width:70,height:1,background:`linear-gradient(90deg,transparent,${G.gold},transparent)`,margin:"18px auto"}}/>
        </div>

        {/* ══ VOTE CLOS CARD ══ */}
        <div style={{
          background:"linear-gradient(145deg,#0f0d08,#1a1508)",
          border:`1px solid rgba(201,168,76,.45)`,
          borderRadius:20,padding:"28px 24px",textAlign:"center",
          marginBottom:44,animation:"fadeUp .8s .1s ease both",
          boxShadow:"0 20px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(201,168,76,.06)",
          position:"relative",overflow:"hidden"
        }}>
          {/* top shimmer line */}
          <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${G.gold},${G.goldL},${G.gold},transparent)`,backgroundSize:"200% 100%",animation:"shimmer 3s linear infinite"}}/>

          <div style={{fontSize:38,marginBottom:10,animation:"crownFloat 3s ease-in-out infinite"}}>👑</div>

          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,color:G.goldL,marginBottom:12,fontWeight:400,letterSpacing:".01em"}}>
            Le vote en ligne est terminé
          </p>
          <p style={{fontSize:13,color:G.tm,lineHeight:1.8,maxWidth:400,margin:"0 auto 24px"}}>
            La vérification des votes se poursuit. La décision finale sera donnée par le jury lors de la cérémonie.
          </p>

          {/* SCORE BREAKDOWN */}
          <div style={{display:"flex",justifyContent:"center",gap:10,marginBottom:24,flexWrap:"wrap"}}>
            {[["🗳️","Vote en ligne","40%",G.gold],["👨‍⚖️","Décision du jury","60%","#5b9bd5"]].map(([icon,lbl,pct,col])=>(
              <div key={lbl} style={{flex:1,minWidth:130,maxWidth:170,background:G.s1,border:`1px solid ${G.br}`,borderRadius:14,padding:"14px 10px"}}>
                <div style={{fontSize:22,marginBottom:6}}>{icon}</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:38,color:col,lineHeight:1,fontWeight:600,marginBottom:4}}>{pct}</div>
                <div style={{fontSize:9,letterSpacing:".1em",textTransform:"uppercase",color:G.tm}}>{lbl}</div>
              </div>
            ))}
          </div>

          <div style={{width:40,height:1,background:`linear-gradient(90deg,transparent,${G.gold},transparent)`,margin:"0 auto 18px"}}/>

          {/* RDV */}
          <div style={{background:"rgba(201,168,76,.06)",border:`1px solid rgba(201,168,76,.2)`,borderRadius:12,padding:"14px 16px",display:"inline-block"}}>
            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,color:G.goldL,fontStyle:"italic",marginBottom:4}}>
              Samedi 11 Juillet 2026
            </p>
            <p style={{fontSize:11,color:G.tm,letterSpacing:".06em"}}>
              Grand Hôtel du Plateau · La Nuit des Éclats ✨
            </p>
          </div>
        </div>

        {/* ══ RÉSULTATS ROIS ══ */}
        <div style={{marginBottom:40,animation:"fadeUp .8s .2s ease both"}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
            <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${G.br})`}}/>
            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"clamp(22px,4vw,30px)",fontWeight:300,color:G.tx,whiteSpace:"nowrap"}}>
              ♚ <span style={{color:G.gold,fontStyle:"italic"}}>Rois</span> du Bal
            </p>
            <div style={{flex:1,height:1,background:`linear-gradient(90deg,${G.br},transparent)`}}/>
          </div>
          <p style={{fontSize:10,color:G.tm,textAlign:"center",letterSpacing:".08em",marginBottom:14}}>
            {loaded?`${totalRois} votes enregistrés`:"Chargement..."} · représente 40% du score final
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {sortedRois.map((c,i)=>{
              const cnt=counts.rois?.[c.id]||0;
              const pct=totalRois?Math.round(cnt/totalRois*100):0;
              return <RankRow key={c.id} c={c} rank={i} cnt={cnt} pct={pct} maxCnt={maxRoi} delay={i*120}/>;
            })}
          </div>
        </div>

        {/* ══ RÉSULTATS REINES ══ */}
        <div style={{animation:"fadeUp .8s .3s ease both"}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
            <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${G.br})`}}/>
            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"clamp(22px,4vw,30px)",fontWeight:300,color:G.tx,whiteSpace:"nowrap"}}>
              ♛ <span style={{color:G.gold,fontStyle:"italic"}}>Reines</span> du Bal
            </p>
            <div style={{flex:1,height:1,background:`linear-gradient(90deg,${G.br},transparent)`}}/>
          </div>
          <p style={{fontSize:10,color:G.tm,textAlign:"center",letterSpacing:".08em",marginBottom:14}}>
            {loaded?`${totalReines} votes enregistrés`:"Chargement..."} · représente 40% du score final
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {sortedReines.map((c,i)=>{
              const cnt=counts.reines?.[c.id]||0;
              const pct=totalReines?Math.round(cnt/totalReines*100):0;
              return <RankRow key={c.id} c={c} rank={i} cnt={cnt} pct={pct} maxCnt={maxReine} delay={200+i*120}/>;
            })}
          </div>
        </div>

      </div>

      {/* FOOTER */}
      <div style={{textAlign:"center",padding:"28px 0 44px",borderTop:`1px solid ${G.br}`,color:G.tm,fontSize:10,letterSpacing:".1em",position:"relative",zIndex:2}}>
        <div style={{width:70,height:1,background:`linear-gradient(90deg,transparent,${G.gold},transparent)`,margin:"0 auto 14px"}}/>
        <span style={{color:G.gold}}>La Nuit des Éclats</span> · CECDA · UFR Odonto-Stomatologie · UFHB<br/>
        <span style={{display:"block",marginTop:5}}>+225 07 79 47 57 52</span>
      </div>
    </div>
  );
}
