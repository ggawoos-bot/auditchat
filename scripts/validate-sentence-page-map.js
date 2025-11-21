/**
 * Firestore sentencePageMap 검증 스크립트
 * - sentencePageMap과 sentences 필드 검증
 * - 문장-페이지 매핑 정확도 확인
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 파일 로드 (우선순위 높음, 먼저 로드)
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log('✅ .env.local 파일 로드 완료');
}

// .env 파일 로드 (기본값, .env.local이 없을 때 사용)
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

async function validateSentencePageMap() {
  try {
    console.log('🔍 sentencePageMap 검증 시작...\n');
    
    // Firebase 앱 초기화
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    console.log('✅ Firebase 앱 초기화 완료\n');
    
    // 모든 청크 가져오기 (샘플링: 최대 200개)
    console.log('📦 pdf_chunks 컬렉션에서 청크 가져오는 중...');
    const chunksQuery = query(collection(db, 'pdf_chunks'), limit(200));
    const chunksSnapshot = await getDocs(chunksQuery);
    
    if (chunksSnapshot.empty) {
      console.log('⚠️ pdf_chunks 컬렉션이 비어있습니다.');
      return false;
    }
    
    console.log(`✅ ${chunksSnapshot.size}개 청크 발견\n`);
    
    // 검증 통계
    let totalChunks = 0;
    let chunksWithSentences = 0;
    let chunksWithSentencePageMap = 0;
    let chunksWithBoth = 0;
    let totalSentences = 0;
    let totalMappedSentences = 0;
    let sampleChunks = [];
    let documentStats = new Map(); // 문서별 통계
    
    chunksSnapshot.forEach((doc) => {
      const data = doc.data();
      totalChunks++;
      
      const filename = data.filename || 'unknown';
      const metadata = data.metadata || {};
      const sentences = metadata.sentences || [];
      const sentencePageMap = metadata.sentencePageMap || {};
      
      // 문서별 통계
      if (!documentStats.has(filename)) {
        documentStats.set(filename, {
          total: 0,
          withSentences: 0,
          withSentencePageMap: 0,
          withBoth: 0
        });
      }
      const docStat = documentStats.get(filename);
      docStat.total++;
      
      // sentences 필드 검증
      if (Array.isArray(sentences) && sentences.length > 0) {
        chunksWithSentences++;
        totalSentences += sentences.length;
        docStat.withSentences++;
      }
      
      // sentencePageMap 필드 검증
      if (sentencePageMap && typeof sentencePageMap === 'object' && Object.keys(sentencePageMap).length > 0) {
        chunksWithSentencePageMap++;
        
        // 매핑된 문장 수 계산
        const mappedCount = Object.keys(sentencePageMap).length;
        totalMappedSentences += mappedCount;
        docStat.withSentencePageMap++;
      }
      
      // 둘 다 있는 경우
      if (sentences.length > 0 && Object.keys(sentencePageMap).length > 0) {
        chunksWithBoth++;
        docStat.withBoth++;
        
        // 샘플 데이터 수집 (최대 5개)
        if (sampleChunks.length < 5) {
          sampleChunks.push({
            id: doc.id,
            filename: filename,
            contentLength: data.content?.length || 0,
            sentencesCount: sentences.length,
            sentencePageMapSize: Object.keys(sentencePageMap).length,
            firstSentence: sentences[0]?.substring(0, 50) || '',
            firstSentencePage: sentencePageMap[0] || null,
            sampleMap: Object.fromEntries(
              Object.entries(sentencePageMap).slice(0, 5)
            ),
            metadataPage: metadata.page || metadata.pageIndex || 'N/A'
          });
        }
      }
    });
    
    // 통계 출력
    console.log('📊 전체 검증 결과:');
    console.log('='.repeat(70));
    console.log(`총 청크 수: ${totalChunks}개`);
    console.log(`  - sentences 필드 있는 청크: ${chunksWithSentences}개 (${((chunksWithSentences/totalChunks)*100).toFixed(1)}%)`);
    console.log(`  - sentencePageMap 필드 있는 청크: ${chunksWithSentencePageMap}개 (${((chunksWithSentencePageMap/totalChunks)*100).toFixed(1)}%)`);
    console.log(`  - 둘 다 있는 청크: ${chunksWithBoth}개 (${((chunksWithBoth/totalChunks)*100).toFixed(1)}%)`);
    console.log(`총 문장 수: ${totalSentences}개`);
    console.log(`매핑된 문장 수: ${totalMappedSentences}개`);
    console.log(`문장 매핑 비율: ${totalSentences > 0 ? ((totalMappedSentences/totalSentences)*100).toFixed(1) : 0}%`);
    console.log('='.repeat(70));
    
    // 문서별 통계 출력
    if (documentStats.size > 0) {
      console.log('\n📄 문서별 통계:');
      console.log('='.repeat(70));
      documentStats.forEach((stat, filename) => {
        const coverage = (stat.withBoth / stat.total) * 100;
        console.log(`\n📄 ${filename}`);
        console.log(`  총 청크: ${stat.total}개`);
        console.log(`  - sentences 있는 청크: ${stat.withSentences}개`);
        console.log(`  - sentencePageMap 있는 청크: ${stat.withSentencePageMap}개`);
        console.log(`  - 둘 다 있는 청크: ${stat.withBoth}개 (${coverage.toFixed(1)}%)`);
      });
      console.log('\n' + '='.repeat(70));
    }
    
    // 샘플 데이터 출력
    if (sampleChunks.length > 0) {
      console.log('\n📋 샘플 청크 데이터:');
      console.log('='.repeat(70));
      sampleChunks.forEach((sample, index) => {
        console.log(`\n[샘플 ${index + 1}]`);
        console.log(`  파일명: ${sample.filename}`);
        console.log(`  청크 ID: ${sample.id.substring(0, 20)}...`);
        console.log(`  내용 길이: ${sample.contentLength}자`);
        console.log(`  문장 수: ${sample.sentencesCount}개`);
        console.log(`  매핑된 문장 수: ${sample.sentencePageMapSize}개`);
        console.log(`  청크 기본 페이지: ${sample.metadataPage}`);
        console.log(`  첫 번째 문장: "${sample.firstSentence}..."`);
        console.log(`  첫 번째 문장 페이지: ${sample.firstSentencePage || 'N/A'}`);
        console.log(`  샘플 매핑 (처음 5개):`);
        Object.entries(sample.sampleMap).forEach(([index, page]) => {
          console.log(`    문장[${index}] → 페이지 ${page}`);
        });
      });
      console.log('\n' + '='.repeat(70));
    }
    
    // 검증 결과 판정
    const coverageRate = (chunksWithBoth / totalChunks) * 100;
    const mappingRate = totalSentences > 0 ? (totalMappedSentences / totalSentences) * 100 : 0;
    
    console.log('\n✅ 검증 완료!');
    console.log(`\n📈 종합 평가:`);
    console.log(`  - 청크 커버리지: ${coverageRate.toFixed(1)}%`);
    console.log(`  - 문장 매핑률: ${mappingRate.toFixed(1)}%`);
    
    if (coverageRate >= 90 && mappingRate >= 80) {
      console.log('\n🎉 우수: sentencePageMap이 대부분의 청크에 잘 저장되어 있습니다!');
      return true;
    } else if (coverageRate >= 50 && mappingRate >= 50) {
      console.log('\n⚠️ 보통: sentencePageMap이 일부 청크에만 저장되어 있습니다.');
      return true;
    } else {
      console.log('\n❌ 부족: sentencePageMap이 충분히 저장되지 않았습니다.');
      console.log('   → migrate-to-firestore.js를 다시 실행하세요.');
      return false;
    }
    
  } catch (error) {
    console.error('❌ 검증 실패:', error);
    return false;
  }
}

// 스크립트 실행
validateSentencePageMap()
  .then((success) => {
    if (success) {
      console.log('\n✅ 검증이 완료되었습니다!');
      process.exit(0);
    } else {
      console.log('\n❌ 검증에 실패했습니다.');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ 예상치 못한 오류:', error);
    process.exit(1);
  });

