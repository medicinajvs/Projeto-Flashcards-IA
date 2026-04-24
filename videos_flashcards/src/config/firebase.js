import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCZO36isf5dQQ5cf-NyIR7thq37X2goML4",
  authDomain: "cabinet-seujet.firebaseapp.com",
  projectId: "cabinet-seujet",
  storageBucket: "cabinet-seujet.firebasestorage.app",
  messagingSenderId: "1063154582452",
  appId: "1:1063154582452:web:25f1616aa778acbb6ca8e1",
  measurementId: "G-ETKGNPVR4W"
};

const app = initializeApp(firebaseConfig);

if (typeof window !== 'undefined') {
  getAnalytics(app);
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// A CORREÇÃO ESTÁ AQUI EMBAIXO:
// Certifique-se de que está escrito 'appId' e não 'APP_ID'
export const appId = typeof window !== 'undefined' && window.__app_id ? window.__app_id : 'default-app-id';

export default app;