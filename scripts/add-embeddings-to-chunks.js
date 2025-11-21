/**
 * Firestore 청크에 로컬 임베딩 추가
 * Transformers.js를 사용하여 모든 청크에 임베딩 생성
 */

import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc,
  query,
  limit
} from 'firebase/firestore';
import { pipeline, env } from '@xenova/transformers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { db } from './firebaseNodeConfig.js';

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

// Firebase 초기화는 scripts/firebaseNodeConfig.js에서 공통 처리

// Offline 모드 활성화 (Node.js 환경)
env.allowLocalModels = true;
// env.useBrowserCache = true; // ❌ Node.js에서는 브라우저 캐시 사용 불가
env.useCustomCache = false; // Node.js에서는 파일 시스템 캐시 사용

let generateEmbedding = null;

/**
 * 모델 초기화
 */
async function initializeModel() {
  console.log('🔄 로컬 임베딩 모델 로딩 시작...');
  
  try {
    generateEmbedding = await pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      {
        quantized: true,
      }
    );
    console.log('✅ 로컬 임베딩 모델 로드 완료');
  } catch (error) {
    console.error('❌ 모델 로딩 실패:', error);
    throw error;
  }
}

/**
 * 텍스트 임베딩 생성
 */
async function embedText(text) {
  if (!generateEmbedding) {
    await initializeModel();
  }

  const output = await generateEmbedding(text, {
    pooling: 'mean',
    normalize: true,
  });

  return Array.from(output.data);
}

/**
 * 모든 청크에 임베딩 추가
 */
async function addEmbeddingsToChunks() {
  try {
    console.log('🚀 Firestore 청크 임베딩 추가 시작');
    
    // 모델 초기화
    await initializeModel();
    
    // 모든 청크 가져오기
    const chunksQuery = query(collection(db, 'pdf_chunks'));
    const chunksSnapshot = await getDocs(chunksQuery);
    
    console.log(`📦 총 청크 수: ${chunksSnapshot.size}개`);
    
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const chunkDoc of chunksSnapshot.docs) {
      const data = chunkDoc.data();
      
      // 이미 임베딩이 있으면 스킵
      if (data.embedding && data.embedding.length > 0) {
        skipped++;
        continue;
      }
      
      try {
        console.log(`\n[${processed + 1}/${chunksSnapshot.size}] 청크 처리 중: ${chunkDoc.id}`);
        console.log(`내용: ${data.content.substring(0, 100)}...`);
        
        // 임베딩 생성
        const embedding = await embedText(data.content);
        
        // Firestore 업데이트
        const chunkRef = doc(db, 'pdf_chunks', chunkDoc.id);
        await updateDoc(chunkRef, {
          embedding: embedding,
          embeddingModel: 'paraphrase-multilingual-MiniLM-L12-v2'
        });
        
        console.log(`✅ 임베딩 추가 완료 (${embedding.length}차원)`);
        processed++;
        
        // API 제한 방지 (50회/분)
        if (processed % 50 === 0 && processed < chunksSnapshot.size - skipped) {
          console.log('⏸️ API 제한 방지를 위해 1분 대기...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
        
      } catch (error) {
        console.error(`❌ 청크 처리 실패: ${chunkDoc.id}`, error);
        errors++;
      }
    }
    
    console.log('\n🎉 임베딩 추가 완료!');
    console.log(`📊 처리: ${processed}개, 스킵: ${skipped}개, 오류: ${errors}개`);
    
  } catch (error) {
    console.error('❌ 임베딩 추가 프로세스 실패:', error);
    throw error;
  }
}

// 실행
addEmbeddingsToChunks()
  .then(() => {
    console.log('✅ 스크립트 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 스크립트 실패:', error);
    process.exit(1);
  });

