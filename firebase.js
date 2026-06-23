import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAk6K2Tlw26w6u7c7BEHxGACFm-HrqcxwE",
  authDomain: "nuit-des-eclats.firebaseapp.com",
  projectId: "nuit-des-eclats",
  storageBucket: "nuit-des-eclats.firebasestorage.app",
  messagingSenderId: "860876094936",
  appId: "1:860876094936:web:4d17306bafad5617e146ad",
  measurementId: "G-0YD7XHK91D"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
