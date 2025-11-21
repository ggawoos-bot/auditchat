/**
 * Firestore에서 PDF 내용을 가져와 키워드를 추출하는 스크립트
 * PDF 파싱 없이 Firestore에 이미 저장된 청크를 활용
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, getDocs } from 'firebase/firestore';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

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

// 디버깅: 환경변수 확인
if (process.env.VITE_GEMINI_API_KEY) {
  console.log('✅ VITE_GEMINI_API_KEY 환경변수 확인됨');
} else if (process.env.GEMINI_API_KEY) {
  console.log('✅ GEMINI_API_KEY 환경변수 확인됨');
} else {
  console.warn('⚠️ GEMINI_API_KEY 또는 VITE_GEMINI_API_KEY를 찾을 수 없습니다.');
}

const require = createRequire(import.meta.url);
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Firebase 초기화
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

class FirestoreKeywordExtractor {
  constructor() {
    // GEMINI_API_KEY 또는 VITE_GEMINI_API_KEY 둘 다 확인
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY 또는 VITE_GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    this.ai = new GoogleGenerativeAI(apiKey);
    this.allKeywords = new Set();
    this.synonymMappings = new Map();
  }

  /**
   * 한글 단어 추출 (간단한 버전)
   */
  extractKoreanWords(text) {
    const words = new Set();
    
    // 한글 2-10글자 단어 추출
    const koreanPattern = /[가-힣]{2,10}/g;
    const matches = text.match(koreanPattern) || [];
    
    // 불용어 필터링
    const stopWords = ['그것', '이것', '저것', '어떤', '무엇', '언제', '어디', '왜', '어떻게',
      '그리고', '또한', '또는', '그러나', '하지만', '따라서', '그러므로'];
    
    matches.forEach(word => {
      if (!stopWords.includes(word) && word.length >= 2) {
        words.add(word);
      }
    });
    
    return Array.from(words);
  }

  /**
   * 전문용어 추출
   */
  extractTechnicalTerms(text) {
    const terms = new Set();
    
    // 법령 관련 패턴
    const legalPatterns = [
      /[가-힣]+법(률)?/g,
      /[가-힣]+시행령/g,
      /[가-힣]+시행규칙/g,
      /[가-힣]+지침/g,
      /[가-힣]+가이드라인/g,
      /[가-힣]+매뉴얼/g
    ];
    
    // 시설 관련 패턴
    const facilityPatterns = [
      /[가-힣]+시설/g,
      /[가-힣]+센터/g,
      /[가-힣]+관/g,
      /[가-힣]+장/g,
      /[가-힣]+원/g,
      /[가-힣]+소/g
    ];
    
    [...legalPatterns, ...facilityPatterns].forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => terms.add(match));
    });
    
    return Array.from(terms);
  }

  /**
   * AI 기반 키워드 추출
   */
  async extractKeywordsWithAI(text) {
    try {
      const shortText = text.substring(0, 5000); // 처음 5000자만
      
      const prompt = `
다음 텍스트에서 의미있는 키워드들을 추출해주세요:

${shortText}

다음 기준으로 키워드를 추출해주세요:
1. 법령, 규정, 지침 관련 용어
2. 시설, 장소, 기관 관련 용어  
3. 행정, 절차, 관리 관련 용어
4. 건강, 금연, 보건 관련 용어
5. 교육, 보육 관련 용어
6. 기타 전문용어

JSON 형식으로 응답해주세요:
{
  "keywords": ["키워드1", "키워드2", "키워드3", ...]
}
`;

      const model = this.ai.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();
      
      // JSON 파싱 (마크다운 코드 블록 제거)
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      
      const parsed = JSON.parse(cleanedText);
      return parsed.keywords || [];
    } catch (error) {
      console.error('AI 키워드 추출 실패:', error);
      return [];
    }
  }

  /**
   * Firestore에서 모든 청크 가져와서 키워드 추출
   */
  async extractKeywordsFromFirestore() {
    console.log('📚 Firestore에서 PDF 청크 가져오기 시작...');
    
    try {
      const chunksQuery = query(collection(db, 'pdf_chunks'));
      const chunksSnapshot = await getDocs(chunksQuery);
      
      const allText = [];
      let processedDocuments = new Set();
      
      console.log(`📦 총 ${chunksSnapshot.size}개 청크 발견`);
      
      chunksSnapshot.forEach((doc) => {
        const chunkData = doc.data();
        
        if (!processedDocuments.has(chunkData.filename)) {
          processedDocuments.add(chunkData.filename);
          console.log(`📄 문서 발견: ${chunkData.filename}`);
        }
        
        if (chunkData.content) {
          allText.push(chunkData.content);
        }
      });
      
      const fullText = allText.join('\n');
      console.log(`📝 전체 텍스트 길이: ${fullText.length}자`);
      
      // 1. 한글 단어 추출
      const koreanWords = this.extractKoreanWords(fullText);
      koreanWords.forEach(word => this.allKeywords.add(word));
      console.log(`✅ 한글 단어 추출: ${koreanWords.length}개`);
      
      // 2. 전문용어 추출
      const technicalTerms = this.extractTechnicalTerms(fullText);
      technicalTerms.forEach(term => this.allKeywords.add(term));
      console.log(`✅ 전문용어 추출: ${technicalTerms.length}개`);
      
      // 3. AI 기반 키워드 추출 (샘플링)
      const sampleSize = Math.min(10, Math.floor(fullText.length / 10000)); // 약 10000자당 1개
      for (let i = 0; i < sampleSize; i++) {
        const start = Math.floor(Math.random() * (fullText.length - 5000));
        const sample = fullText.substring(start, start + 5000);
        const aiKeywords = await this.extractKeywordsWithAI(sample);
        aiKeywords.forEach(keyword => this.allKeywords.add(keyword));
      }
      console.log(`✅ AI 키워드 추출: ${this.allKeywords.size}개`);
      
    } catch (error) {
      console.error('❌ Firestore에서 데이터 가져오기 실패:', error);
      throw error;
    }
  }

  /**
   * AI 기반 동의어 생성 - 대용량 배치 방식
   */
  async generateSynonymsBatchWithAI(keywords) {
    try {
      const keywordList = keywords.map((k, idx) => `${idx + 1}. ${k}`).join('\n');
      
      const prompt = `
다음 ${keywords.length}개의 키워드들에 대한 동의어와 유사어를 생성해주세요:

${keywordList}

각 키워드에 대해 다음 기준으로 동의어를 생성해주세요:
1. 완전한 동의어 (같은 의미)
2. 유사한 의미의 단어
3. 관련된 전문용어
4. 줄임말이나 약어
5. 다른 표현 방식

각 키워드마다 최소 3개 이상의 동의어를 생성해주세요.

JSON 형식으로 응답해주세요 (각 키워드가 key, 동의어 배열이 value):
{
  "금연서비스": ["금연지원서비스", "금연프로그램", "금연상담"],
  "금연구역": ["금연구역", "금연지역", "담배금지구역"],
  ...
}

중요: JSON 형식만 출력하고 다른 텍스트는 포함하지 마세요.
`;

      const model = this.ai.getGenerativeModel({ 
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          maxOutputTokens: 8192,  // 충분한 출력 토큰
        }
      });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();
      
      // JSON 파싱 (마크다운 코드 블록 제거 및 정제)
      let cleanedText = responseText.trim();
      
      // 1. 마크다운 코드 블록 제거
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```\s*$/, '');
      }
      
      // 2. JSON 객체만 추출 (앞뒤 불필요한 텍스트 제거)
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }
      
      // 3. JSON 파싱 시도
      try {
        const parsed = JSON.parse(cleanedText);
        return parsed;  // { "키워드1": ["동의어1", ...], "키워드2": [...] }
      } catch (parseError) {
        // 4. JSON 파싱 실패 시 부분 복구 시도
        console.warn('JSON 파싱 실패, 부분 복구 시도...');
        
        // 불완전한 문자열이나 특수문자로 인한 오류인 경우 복구 시도
        try {
          // 따옴표 이스케이프 누락 복구
          cleanedText = cleanedText.replace(/([{,]\s*"[^"]*):([^"]*")/g, '$1\\:$2');
          // 줄바꿈 제거 시도
          cleanedText = cleanedText.replace(/\n/g, '\\n').replace(/\r/g, '');
          
          const parsed = JSON.parse(cleanedText);
          return parsed;
        } catch (recoveryError) {
          // 복구 실패 시 첫 번째 JSON 객체만 추출 시도
          const firstJsonMatch = cleanedText.match(/\{[^}]*\{[\s\S]*?\}[^}]*\}/);
          if (firstJsonMatch) {
            try {
              const parsed = JSON.parse(firstJsonMatch[0]);
              return parsed;
            } catch {
              // 최종 실패
            }
          }
          
          console.error('JSON 파싱 오류 상세:', parseError.message);
          console.error('응답 텍스트 (처음 500자):', responseText.substring(0, 500));
          throw parseError;
        }
      }
    } catch (error) {
      console.error(`배치 동의어 생성 실패:`, error);
      return {};
    }
  }

  /**
   * 동의어 생성 (500개씩 배치 처리)
   */
  async generateSynonyms() {
    const keywords = Array.from(this.allKeywords);
    console.log(`🔄 ${keywords.length}개 키워드의 동의어 생성 시작...`);
    
    // 중요 키워드 필터링
    const importantKeywords = keywords.filter(keyword => {
      if (keyword.length < 2 || keyword.length > 15) return false;
      const excludeWords = ['을', '를', '의', '은', '는', '이', '가', '의한'];
      if (excludeWords.some(ex => keyword.includes(ex))) return false;
      if (/^[0-9]+$/.test(keyword)) return false;
      return true;
    });
    
    console.log(`✅ 중요 키워드 선별: ${importantKeywords.length}개 (전체: ${keywords.length}개)`);
    
    // 대용량 배치 크기: 한 번에 500개 키워드 처리 (API 1회 호출)
    const keywordBatchSize = 500;
    const waitTime = 6500;  // 6.5초 대기 (분당 10회 제한)
    
    for (let i = 0; i < importantKeywords.length; i += keywordBatchSize) {
      const batch = importantKeywords.slice(i, i + keywordBatchSize);
      
      const currentBatch = Math.floor(i/keywordBatchSize) + 1;
      const totalBatches = Math.ceil(importantKeywords.length/keywordBatchSize);
      const estimatedTime = Math.floor((totalBatches - currentBatch) * waitTime / 1000 / 60);
      
      console.log(`📦 배치 ${currentBatch}/${totalBatches} 처리 중... (예상 시간: ${estimatedTime}분)`);
      console.log(`   처리 키워드: ${batch.length}개`);
      console.log(`   샘플: ${batch.slice(0, 10).join(', ')}...`);
      
      try {
        const batchResults = await this.generateSynonymsBatchWithAI(batch);
        
        // 결과 저장
        let successCount = 0;
        let totalSynonyms = 0;
        Object.entries(batchResults).forEach(([keyword, synonyms]) => {
          if (synonyms && Array.isArray(synonyms) && synonyms.length > 0) {
            this.synonymMappings.set(keyword, synonyms);
            successCount++;
            totalSynonyms += synonyms.length;
          }
        });
        console.log(`   ✅ ${successCount}/${batch.length}개 키워드 동의어 생성 성공`);
        console.log(`   ✅ 총 ${totalSynonyms}개 동의어 생성`);
        
      } catch (error) {
        console.error(`   ❌ 배치 처리 실패:`, error.message);
        if (error.status === 429) {
          console.error(`   ⚠️ API 할당량 초과, 15초 대기 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, 15000));
          // 재시도
          try {
            const batchResults = await this.generateSynonymsBatchWithAI(batch);
            Object.entries(batchResults).forEach(([keyword, synonyms]) => {
              if (synonyms && Array.isArray(synonyms)) {
                this.synonymMappings.set(keyword, synonyms);
              }
            });
            console.log(`   ✅ 재시도 성공`);
          } catch (retryError) {
            console.error(`   ❌ 재시도 실패:`, retryError.message);
          }
        }
      }
      
      // API 제한 고려한 대기
      if (i + keywordBatchSize < importantKeywords.length) {
        console.log(`⏳ ${waitTime/1000}초 대기 중... (API 할당량 회복)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    console.log(`✅ ${this.synonymMappings.size}개 키워드의 동의어 생성 완료`);
  }

  /**
   * 동의어 사전 저장
   */
  async saveSynonymDictionary() {
    const dictionary = {
      metadata: {
        totalKeywords: this.allKeywords.size,
        totalSynonyms: Array.from(this.synonymMappings.values()).reduce((sum, synonyms) => sum + synonyms.length, 0),
        createdAt: new Date().toISOString(),
        version: '1.0'
      },
      keywords: Array.from(this.allKeywords),
      synonymMappings: Object.fromEntries(this.synonymMappings)
    };
    
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const outputPath = path.join(dataDir, 'comprehensive-synonym-dictionary.json');
    fs.writeFileSync(outputPath, JSON.stringify(dictionary, null, 2), 'utf8');
    
    console.log(`💾 동의어 사전 저장 완료: ${outputPath}`);
    console.log(`📊 통계:`);
    console.log(`   - 총 키워드: ${dictionary.metadata.totalKeywords}개`);
    console.log(`   - 총 동의어: ${dictionary.metadata.totalSynonyms}개`);
    console.log(`   - 평균 동의어/키워드: ${dictionary.metadata.totalKeywords > 0 ? (dictionary.metadata.totalSynonyms / dictionary.metadata.totalKeywords).toFixed(2) : 0}개`);
  }

  /**
   * 메인 실행 함수
   */
  async build() {
    try {
      console.log('🚀 포괄적 동의어 사전 구축 시작...');
      
      // 1. Firestore에서 키워드 추출
      await this.extractKeywordsFromFirestore();
      
      // 2. 동의어/유사어 생성 (상위 100개만)
      await this.generateSynonyms();
      
      // 3. 동의어 사전 저장
      await this.saveSynonymDictionary();
      
      console.log('🎉 포괄적 동의어 사전 구축 완료!');
    } catch (error) {
      console.error('❌ 동의어 사전 구축 실패:', error);
      throw error;
    }
  }
}

// 실행
const extractor = new FirestoreKeywordExtractor();
extractor.build().catch(console.error);

export default FirestoreKeywordExtractor;
