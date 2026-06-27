// reset-votes.mjs
// Run once with: node reset-votes.mjs
// This resets ALL vote counts to 0 and adds the new candidate r3

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAk6K2Tlw26w6u7c7BEHxGACFm-HrqcxwE",
  authDomain: "nuit-des-eclats.firebaseapp.com",
  projectId: "nuit-des-eclats",
  storageBucket: "nuit-des-eclats.firebasestorage.app",
  messagingSenderId: "860876094936",
  appId: "1:860876094936:web:4d17306bafad5617e146ad",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function reset() {
  await setDoc(doc(db, "counts", "rois"), {
    r1: 0,
    r2: 0,
    r3: 0,   // Tah K. Pascal — nouveau candidat
  });

  await setDoc(doc(db, "counts", "reines"), {
    q1: 0,
    q2: 0,
    q3: 0,   // Monet Adounin Grâce Flora — nouvelle candidate
  });

  console.log("✅ Votes remis à zéro avec succès !");
  process.exit(0);
}

reset().catch(console.error);
