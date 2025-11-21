import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Node 스크립트에서 공통으로 사용하는 Firebase 설정 모듈
// 여기서 직접 .env.local / .env 를 로드하여, 어떤 스크립트에서 import해도
// process.env.FIREBASE_* 값이 보장되도록 한다.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 우선 로드
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

// 기본 .env도 로드 (있으면)
dotenv.config();

export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey) {
  console.error('❌ FIREBASE_API_KEY가 설정되지 않았습니다. .env.local 또는 환경변수를 확인하세요.');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;
