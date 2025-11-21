// Firebase configuration and initialization
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "auditchat-afba2.firebaseapp.com",
  projectId: "auditchat-afba2",
  storageBucket: "auditchat-afba2.firebasestorage.app",
  messagingSenderId: "520921831330",
  appId: "1:520921831330:web:5ae07893a4677566c344fb"
};

// 환경변수 검증
if (!firebaseConfig.apiKey) {
  throw new Error(
    "Firebase API key is missing. Please set VITE_FIREBASE_API_KEY in .env.local"
  );
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Analytics (optional)
export const analytics = getAnalytics(app);

export default app;
