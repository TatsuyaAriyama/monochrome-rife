import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase project settings for MONOCHROME RIFF.
// The app uses Authentication for login and Firestore for per-player save data.
const firebaseConfig = {
  apiKey: "AIzaSyD0PBDd1fkknAkEDrbIKYqGFODIjDUQyns",
  authDomain: "monochrome-riff.firebaseapp.com",
  projectId: "monochrome-riff",
  storageBucket: "monochrome-riff.firebasestorage.app",
  messagingSenderId: "371448839541",
  appId: "1:371448839541:web:52da3c52941ed72594e73c",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
