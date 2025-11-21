/**
 * 특정 문장의 페이지 매핑 확인 스크립트
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit, where } from 'firebase/firestore';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 파일 로드
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

dotenv.config();

// Firebase 설정
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "chat-4c3a7.firebaseapp.com",
  projectId: "chat-4c3a7",
  storageBucket: "chat-4c3a7.firebasestorage.app",
  messagingSenderId: "995636644973",
  appId: "1:995636644973:web:1f133c19af8be180444364"
};

// 환경변수 검증
if (!firebaseConfig.apiKey) {
  console.error('❌ Firebase API key가 설정되지 않았습니다.');
  console.error('   .env.local 파일에 FIREBASE_API_KEY를 설정해주세요.');
  process.exit(1);
}

// 텍스트 정규화 함수
function normalizeText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\n\r\t]/g, ' ')
    .replace(/[^\w가-힣\s:;]/g, '')
    .toLowerCase()
    .trim();
}

async function findSentencePage(searchSentence) {
  try {
    console.log('🔍 문장 검색 시작...\n');
    console.log(`검색 문장: "${searchSentence}"\n`);
    
    // Firebase 앱 초기화
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    // 모든 청크 가져오기
    console.log('📦 pdf_chunks 컬렉션에서 청크 가져오는 중...');
    const chunksQuery = query(collection(db, 'pdf_chunks'), limit(500));
    const chunksSnapshot = await getDocs(chunksQuery);
    
    console.log(`✅ ${chunksSnapshot.size}개 청크 발견\n`);
    
    const normalizedSearch = normalizeText(searchSentence);
    const searchKeywords = normalizedSearch.split(/\s+/).filter(w => w.length >= 2);
    
    console.log(`검색 키워드: ${searchKeywords.slice(0, 10).join(', ')}...\n`);
    
    let foundChunks = [];
    
    chunksSnapshot.forEach((doc) => {
      const data = doc.data();
      const content = data.content || '';
      const normalizedContent = normalizeText(content);
      
      // 키워드 매칭 확인
      const matchedKeywords = searchKeywords.filter(kw => normalizedContent.includes(kw));
      const matchRatio = matchedKeywords.length / searchKeywords.length;
      
      if (matchRatio >= 0.5) { // 50% 이상 키워드 매칭
        const metadata = data.metadata || {};
        const sentences = metadata.sentences || [];
        const sentencePageMap = metadata.sentencePageMap || {};
        
        // 문장 배열에서 정확한 문장 찾기
        let matchedSentenceIndex = -1;
        let matchedSentence = '';
        
        for (let i = 0; i < sentences.length; i++) {
          const sentence = sentences[i];
          const normalizedSentence = normalizeText(sentence);
          
          // 문장이 검색 문장을 포함하거나, 검색 문장이 문장을 포함하는지 확인
          if (normalizedSentence.includes(normalizedSearch.substring(0, Math.min(30, normalizedSearch.length))) ||
              normalizedSearch.includes(normalizedSentence.substring(0, Math.min(30, normalizedSentence.length)))) {
            matchedSentenceIndex = i;
            matchedSentence = sentence;
            break;
          }
        }
        
        if (matchedSentenceIndex >= 0) {
          const pageFromMap = sentencePageMap[matchedSentenceIndex];
          
          foundChunks.push({
            id: doc.id,
            filename: data.filename || 'unknown',
            content: content.substring(0, 200) + '...',
            matchedSentence: matchedSentence.substring(0, 100) + '...',
            sentenceIndex: matchedSentenceIndex,
            pageFromSentenceMap: pageFromMap,
            metadataPage: metadata.page || metadata.pageIndex || 'N/A',
            logicalPageNumber: metadata.logicalPageNumber || 'N/A',
            matchRatio: matchRatio,
            allSentences: sentences,
            sentencePageMap: sentencePageMap
          });
        }
      }
    });
    
    // 매칭 비율로 정렬
    foundChunks.sort((a, b) => b.matchRatio - a.matchRatio);
    
    if (foundChunks.length === 0) {
      console.log('❌ 해당 문장을 찾을 수 없습니다.');
      return;
    }
    
    console.log(`✅ ${foundChunks.length}개 청크에서 매칭 발견\n`);
    console.log('='.repeat(80));
    
    // 상위 3개 결과 출력
    foundChunks.slice(0, 3).forEach((chunk, index) => {
      console.log(`\n[결과 ${index + 1}]`);
      console.log(`  파일명: ${chunk.filename}`);
      console.log(`  청크 ID: ${chunk.id.substring(0, 20)}...`);
      console.log(`  매칭 비율: ${(chunk.matchRatio * 100).toFixed(1)}%`);
      console.log(`  매칭된 문장 인덱스: ${chunk.sentenceIndex}`);
      console.log(`  매칭된 문장: "${chunk.matchedSentence}"`);
      console.log(`\n  📄 페이지 정보:`);
      console.log(`    - sentencePageMap에서 찾은 페이지: ${chunk.pageFromSentenceMap || 'N/A'}`);
      console.log(`    - 청크 기본 페이지 (metadata.page): ${chunk.metadataPage}`);
      console.log(`    - 논리적 페이지 번호: ${chunk.logicalPageNumber}`);
      console.log(`\n  🔍 문장-페이지 매핑 샘플 (주변 5개):`);
      const startIdx = Math.max(0, chunk.sentenceIndex - 2);
      const endIdx = Math.min(chunk.allSentences.length, chunk.sentenceIndex + 3);
      for (let i = startIdx; i < endIdx; i++) {
        const page = chunk.sentencePageMap[i] || 'N/A';
        const marker = i === chunk.sentenceIndex ? ' ← 매칭' : '';
        console.log(`    문장[${i}] → 페이지 ${page}${marker}`);
        if (i === chunk.sentenceIndex) {
          console.log(`      문장 내용: "${chunk.allSentences[i].substring(0, 80)}..."`);
        }
      }
    });
    
    console.log('\n' + '='.repeat(80));
    
    // 최종 답변
    const bestMatch = foundChunks[0];
    console.log('\n📌 최종 답변:');
    console.log('='.repeat(80));
    console.log(`파일명: ${bestMatch.filename}`);
    console.log(`\n현재 시스템이 찾는 페이지:`);
    console.log(`  → sentencePageMap 사용 시: 페이지 ${bestMatch.pageFromSentenceMap || 'N/A'}`);
    console.log(`  → 청크 기본 페이지 사용 시: 페이지 ${bestMatch.metadataPage}`);
    console.log(`  → 논리적 페이지 번호: ${bestMatch.logicalPageNumber}`);
    console.log(`\n💡 참고:`);
    console.log(`  - sentencePageMap이 있으면 페이지 ${bestMatch.pageFromSentenceMap}로 이동`);
    console.log(`  - 없으면 기존 방식으로 PDF 검색하여 페이지 찾음`);
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ 검색 실패:', error);
  }
}

// 검색 문장
const searchSentence = process.argv[2] || '베란다, 테라스, 필로티 방식 구조물 등은 원칙적으로 동일 시설 공용공간이므로 흡연실로 사용해서는 안되나, 시설의 구조 및 이용 형태, 입지 특성 등을 종합적으로 고려하여 지자체에서 설치 가능 여부 판단 가능';

findSentencePage(searchSentence)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 예상치 못한 오류:', error);
    process.exit(1);
  });

