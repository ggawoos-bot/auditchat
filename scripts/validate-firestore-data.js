/**
 * Firestore 데이터 검증 스크립트
 * - Firestore 연결 테스트
 * - 데이터 품질 검증
 * - 컬렉션 존재 확인
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 파일 로드 (우선순위 높음)
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log('✅ .env.local 파일 로드 완료');
}

// .env 파일 로드 (기본값)
dotenv.config();

// Firebase 설정
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
  console.error('❌ Firebase API key가 설정되지 않았습니다.');
  console.error('   .env.local 파일에 FIREBASE_API_KEY를 설정해주세요.');
  process.exit(1);
}

async function validateFirestoreData() {
  try {
    console.log('🔍 Firestore 데이터 검증 시작...');
    
    // Firebase 앱 초기화
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    console.log('✅ Firebase 앱 초기화 완료');
    
    // pdf_documents 컬렉션 검증
    console.log('📄 pdf_documents 컬렉션 검증 중...');
    const documentsQuery = query(collection(db, 'pdf_documents'), limit(1));
    const documentsSnapshot = await getDocs(documentsQuery);
    
    if (documentsSnapshot.empty) {
      console.log('⚠️ pdf_documents 컬렉션이 비어있습니다.');
    } else {
      console.log(`✅ pdf_documents 컬렉션 확인: ${documentsSnapshot.size}개 문서`);
    }
    
    // pdf_chunks 컬렉션 검증
    console.log('📦 pdf_chunks 컬렉션 검증 중...');
    const chunksQuery = query(collection(db, 'pdf_chunks'), limit(10));
    const chunksSnapshot = await getDocs(chunksQuery);
    
    if (chunksSnapshot.empty) {
      console.log('⚠️ pdf_chunks 컬렉션이 비어있습니다.');
    } else {
      console.log(`✅ pdf_chunks 컬렉션 확인: ${chunksSnapshot.size}개 청크`);
    }
    
    // 데이터 품질 검증
    console.log('🔍 데이터 품질 검증 중...');
    
    let totalChunks = 0;
    let validChunks = 0;
    
    chunksSnapshot.forEach((doc) => {
      const data = doc.data();
      totalChunks++;
      
      // 필수 필드 검증
      if (data.content && data.metadata && data.keywords) {
        validChunks++;
      }
    });
    
    const qualityScore = totalChunks > 0 ? (validChunks / totalChunks) * 100 : 0;
    
    console.log(`📊 데이터 품질 점수: ${qualityScore.toFixed(1)}%`);
    console.log(`  - 총 청크: ${totalChunks}개`);
    console.log(`  - 유효 청크: ${validChunks}개`);
    
    if (qualityScore < 80) {
      console.log('⚠️ 경고: 데이터 품질이 낮습니다.');
      return false;
    }
    
    console.log('✅ Firestore 데이터 검증 완료!');
    return true;
    
  } catch (error) {
    console.error('❌ Firestore 데이터 검증 실패:', error);
    return false;
  }
}

// 스크립트 실행
validateFirestoreData()
  .then((success) => {
    if (success) {
      console.log('🎉 모든 검증이 완료되었습니다!');
      process.exit(0);
    } else {
      console.log('❌ 검증에 실패했습니다.');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ 예상치 못한 오류:', error);
    process.exit(1);
  });
