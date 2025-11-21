/**
 * 공출현 분석 + WordNet 기반 동의어 사전 구축 시스템
 * 속도 우선: 공출현 PMI 분석 + WordNet 어휘 데이터베이스 통합
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, getDocs } from 'firebase/firestore';
import dotenv from 'dotenv';
import { pipeline, env } from '@xenova/transformers';

const require = createRequire(import.meta.url);
const Khaiii = require('khaiii');

// Transformers.js 환경 설정 (Node.js)
env.allowLocalModels = true;
env.useCustomCache = false; // Node.js에서는 파일 시스템 캐시
env.useBrowserCache = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 파일 로드
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log('✅ .env.local 파일 로드 완료');
}
dotenv.config();

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

/**
 * 임베딩 기반 동의어 추출 서비스
 */
class EmbeddingBasedSynonymExtractor {
  constructor() {
    this.generateEmbedding = null;
    this.embeddingsCache = new Map();
    this.similarityThreshold = 0.7; // 유사도 임계값
    this.maxSynonymsPerKeyword = 10; // 키워드당 최대 동의어 수
  }

  /**
   * 임베딩 모델 초기화
   */
  async initialize() {
    if (!this.generateEmbedding) {
      console.log('🔄 임베딩 모델 로딩 중...');
      try {
        this.generateEmbedding = await pipeline(
          'feature-extraction',
          'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
          {
            quantized: true,
          }
        );
        console.log('✅ 임베딩 모델 로드 완료');
      } catch (error) {
        console.error('❌ 임베딩 모델 로딩 실패:', error);
        throw error;
      }
    }
  }

  /**
   * 텍스트 임베딩 생성
   */
  async embedText(text) {
    if (!this.generateEmbedding) {
      await this.initialize();
    }

    // 캐시 확인
    if (this.embeddingsCache.has(text)) {
      return this.embeddingsCache.get(text);
    }

    const output = await this.generateEmbedding(text, {
      pooling: 'mean',
      normalize: true,
    });

    const embedding = Array.from(output.data);
    this.embeddingsCache.set(text, embedding);
    
    return embedding;
  }

  /**
   * 코사인 유사도 계산
   */
  cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) return 0;

    return dotProduct / (mag1 * mag2);
  }

  /**
   * 키워드별 임베딩 생성
   */
  async generateEmbeddings(keywords) {
    console.log(`\n🔍 ${keywords.length}개 키워드 임베딩 생성 중...`);
    const embeddings = new Map();

    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      try {
        const embedding = await this.embedText(keyword);
        embeddings.set(keyword, embedding);
        
        if ((i + 1) % 10 === 0) {
          console.log(`  진행: ${i + 1}/${keywords.length} 키워드 처리 완료`);
        }
      } catch (error) {
        console.error(`⚠️ "${keyword}" 임베딩 생성 실패:`, error.message);
      }
    }

    console.log(`✅ ${embeddings.size}개 키워드 임베딩 생성 완료`);
    return embeddings;
  }

  /**
   * 임베딩 기반 동의어 추출
   */
  async extractSynonyms(keywords) {
    console.log('\n🚀 임베딩 기반 동의어 추출 시작');
    const startTime = Date.now();

    // 1. 모든 키워드 임베딩 생성
    const embeddings = await this.generateEmbeddings(keywords);
    
    // 2. 모든 키워드 쌍 간 유사도 계산
    console.log(`\n📊 ${keywords.length}개 키워드 간 유사도 계산 중...`);
    const synonymMappings = new Map();
    const totalPairs = (keywords.length * (keywords.length - 1)) / 2;
    let processedPairs = 0;

    for (let i = 0; i < keywords.length; i++) {
      const keyword1 = keywords[i];
      const embedding1 = embeddings.get(keyword1);
      
      if (!embedding1) continue;

      const synonyms = [];

      for (let j = i + 1; j < keywords.length; j++) {
        const keyword2 = keywords[j];
        const embedding2 = embeddings.get(keyword2);
        
        if (!embedding2) continue;

        // 코사인 유사도 계산
        const similarity = this.cosineSimilarity(embedding1, embedding2);

        // 임계값 이상이면 동의어로 추가
        if (similarity >= this.similarityThreshold) {
          synonyms.push({
            keyword: keyword2,
            similarity: similarity
          });
        }

        processedPairs++;
        if (processedPairs % 100 === 0) {
          const progress = ((processedPairs / totalPairs) * 100).toFixed(1);
          console.log(`  진행: ${processedPairs}/${totalPairs} 쌍 처리 완료 (${progress}%)`);
        }
      }

      // 유사도 순으로 정렬하고 상위 N개만 선택
      synonyms.sort((a, b) => b.similarity - a.similarity);
      const topSynonyms = synonyms
        .slice(0, this.maxSynonymsPerKeyword)
        .map(item => ({
          keyword: item.keyword,
          score: item.similarity
        }));

      if (topSynonyms.length > 0) {
        synonymMappings.set(keyword1, topSynonyms);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n✅ 임베딩 기반 동의어 추출 완료! (소요 시간: ${totalTime}분)`);
    console.log(`📊 통계:`);
    console.log(`   - 총 키워드: ${keywords.length}개`);
    console.log(`   - 동의어가 있는 키워드: ${synonymMappings.size}개`);
    console.log(`   - 평균 동의어/키워드: ${(Array.from(synonymMappings.values()).reduce((sum, syns) => sum + syns.length, 0) / synonymMappings.size || 0).toFixed(2)}개`);

    return synonymMappings;
  }
}

/**
 * WordNet 기반 동의어 추출 서비스
 */
class WordNetBasedSynonymExtractor {
  constructor() {
    this.wordnetData = new Map();
    this.wordnetPath = path.join(__dirname, '../data/wordnet-korean.json');
    this.fallbackSynonyms = this.getFallbackWordNet(); // 기본 동의어 매핑
  }

  /**
   * 기본 WordNet 데이터 (한국어 전문 용어 포함)
   * 실제 WordNet 데이터가 없을 경우 사용
   */
  getFallbackWordNet() {
    // 확장된 기본 WordNet 데이터 (도메인 특화 용어 포함)
    return {
      // 금연 관련
      '금연': ['흡연금지', '담배금지', '니코틴금지', '흡연제한', '금연구역', '금연장소', '금연존', '금연지역', '금연공간', '금연시설'],
      '금연구역': ['금연지역', '금연장소', '금연존', '금연공간', '금연시설', '흡연금지구역', '흡연금지지역'],
      '금연지역': ['금연구역', '금연장소', '금연존', '금연공간', '흡연금지지역'],
      '흡연': ['담배', '니코틴', '흡연행위', '담배피우기'],
      '담배': ['흡연', '니코틴', '담뱃갑', '담배제품'],
      
      // 주거 관련
      '공동주택': ['아파트', '연립주택', '다세대주택', '주택단지', '아파트단지', '공동주거', '집합주택'],
      '아파트': ['공동주택', '아파트단지', '주택단지', '공동주거'],
      '주택': ['집', '주거', '거주지', '주거지', '주거공간'],
      '단지': ['주택단지', '아파트단지', '단지내', '단지안'],
      
      // 교육 관련
      '학교': ['교육시설', '학원', '교실', '강의실', '교육기관', '학교시설', '초등학교', '중학교', '고등학교', '대학교'],
      '교육시설': ['학교', '학원', '교육기관', '학교시설'],
      '학원': ['교육시설', '교육기관', '학습장', '학습시설'],
      '교실': ['학습공간', '교육공간', '수업공간'],
      
      // 의료 관련
      '병원': ['의료시설', '클리닉', '의원', '보건소', '의료기관', '종합병원', '요양병원', '한방병원'],
      '의료시설': ['병원', '의료기관', '의료원'],
      '의료기관': ['병원', '의료시설', '보건소', '보건기관'],
      '보건소': ['보건기관', '의료기관', '건강증진센터', '보건시설'],
      '보건기관': ['보건소', '의료기관', '건강증진센터'],
      
      // 법률 관련
      '법령': ['법규', '규정', '조항', '법률', '시행령', '시행규칙', '조례', '고시', '공고', '행정규칙'],
      '법률': ['법령', '법규', '규정', '조항'],
      '법규': ['법령', '법률', '규정', '조항'],
      '규정': ['법령', '법규', '조항', '법률', '시행규칙', '행정규칙'],
      '조항': ['법령', '법규', '규정', '법률'],
      '시행령': ['법령', '시행규칙', '조례'],
      '시행규칙': ['시행령', '법령', '행정규칙'],
      '조례': ['시행령', '지방법규', '지방규칙'],
      
      // 행정/처리 관련
      '위반': ['위배', '위법', '불법', '금지행위', '규정위반', '법규위반', '위반행위'],
      '위배': ['위반', '위법', '규정위반'],
      '위법': ['위반', '위배', '불법'],
      '벌금': ['과태료', '처벌', '제재', '벌칙', '과징금', '징벌금', '벌과금'],
      '과태료': ['벌금', '처벌', '제재', '과징금'],
      '처벌': ['벌금', '과태료', '제재', '징계'],
      '신고': ['제보', '고발', '신청', '접수', '제출', '보고', '통보'],
      '신청': ['신고', '접수', '제출', '요청'],
      '접수': ['신고', '신청', '제출', '수령'],
      '제출': ['신고', '신청', '접수', '제출물'],
      
      // 관리/운영 관련
      '관리': ['운영', '관할', '담당', '처리', '시행', '유지', '보수', '감독'],
      '운영': ['관리', '관할', '처리', '시행'],
      '관할': ['관리', '운영', '담당', '책임'],
      '담당': ['관리', '운영', '책임', '처리'],
      '처리': ['관리', '운영', '처리', '수행'],
      '시행': ['집행', '실시', '적용', '수행', '운영'],
      '집행': ['시행', '실시', '수행'],
      '실시': ['시행', '집행', '적용'],
      '적용': ['시행', '실시', '수행'],
      
      // 시설 관련
      '시설': ['장소', '공간', '건물', '시설물', '설비', '기관', '센터', '관', '소', '원', '실', '홀'],
      '장소': ['시설', '공간', '건물', '위치', '곳'],
      '공간': ['시설', '장소', '건물', '곳'],
      '건물': ['시설', '장소', '공간', '건축물', '시설물'],
      '건축물': ['건물', '시설물', '건물물'],
      '시설물': ['시설', '건물', '건축물'],
      
      // 보육 관련
      '어린이집': ['보육시설', '유치원', '어린이보호시설', '보육원', '어린이시설', '아동시설'],
      '유치원': ['어린이집', '보육시설', '교육시설', '교육기관'],
      '보육시설': ['어린이집', '유치원', '어린이보호시설', '보육원'],
      '보육원': ['어린이집', '유치원', '보육시설'],
      
      // 공공장소 관련
      '공공장소': ['공공시설', '공공공간', '공공장소', '공공기관'],
      '공공시설': ['공공장소', '공공기관', '공공건물'],
      '공원': ['녹지', '공원시설', '휴양지'],
      '도서관': ['도서관시설', '도서관건물', '도서관공간'],
      
      // 일반 행정 용어
      '관청': ['관공서', '행정기관', '공공기관', '행정시설'],
      '관공서': ['관청', '행정기관', '공공기관'],
      '행정기관': ['관청', '관공서', '공공기관'],
      '공공기관': ['관청', '관공서', '행정기관'],
      
      // 조치/조치사항
      '조치': ['대응', '처리', '조치사항', '대책'],
      '대응': ['조치', '처리', '대책'],
      '대책': ['조치', '대응', '처리방안'],
      
      // 안전 관련
      '안전': ['보안', '안전성', '안전관리', '안전조치'],
      '보안': ['안전', '보호', '안전관리'],
      '안전관리': ['안전', '보안', '안전조치'],
      
      // 금지 관련
      '금지': ['금지행위', '제한', '금지사항', '금지구역'],
      '제한': ['금지', '제한사항', '제한구역'],
      '금지행위': ['금지', '위법행위', '불법행위'],
      
      // 업무/업체 관련
      '업체': ['회사', '기업', '사업체', '업소'],
      '회사': ['업체', '기업', '사업체'],
      '기업': ['업체', '회사', '사업체'],
      '사업체': ['업체', '회사', '기업'],
      '업소': ['업체', '사업체', '영업소']
    };
  }

  /**
   * WordNet 데이터 다운로드 및 변환 (외부 소스에서)
   * 참고: 실제 WordNet 데이터가 있으면 이 메서드를 사용하여 로드
   */
  async downloadAndConvertWordNet() {
    // 실제 WordNet 데이터 다운로드 URL (예시)
    const wordnetUrls = [
      'https://raw.githubusercontent.com/dongjo/wordnet/master/data/korlex.json',
      // 다른 WordNet 소스 URL 추가 가능
    ];

    console.log('  📥 WordNet 데이터 다운로드 시도...');
    
    // fetch는 Node.js 18+에서 사용 가능, 또는 node-fetch 패키지 필요
    try {
      const https = require('https');
      const http = require('http');
      
      for (const url of wordnetUrls) {
        try {
          console.log(`  🔄 ${url}에서 다운로드 시도...`);
          
          // URL 파싱
          const urlObj = new URL(url);
          const client = urlObj.protocol === 'https:' ? https : http;
          
          await new Promise((resolve, reject) => {
            client.get(url, (res) => {
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
              }
              
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                try {
                  const wordnetData = JSON.parse(data);
                  this.saveWordNetToFile(wordnetData);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              });
            }).on('error', reject);
          });
          
          console.log(`  ✅ WordNet 데이터 다운로드 성공`);
          return true;
        } catch (error) {
          console.warn(`  ⚠️ ${url} 다운로드 실패: ${error.message}`);
          continue;
        }
      }
      
      console.log('  ⚠️ 모든 WordNet 소스 다운로드 실패, 기본 데이터 사용');
      return false;
    } catch (error) {
      console.warn(`  ⚠️ WordNet 다운로드 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * WordNet 데이터를 파일로 저장
   */
  saveWordNetToFile(wordnetData) {
    try {
      const dataDir = path.dirname(this.wordnetPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // WordNet 데이터 형식에 따라 변환
      const synonymMappings = {};
      
      // 다양한 WordNet 형식 지원
      if (Array.isArray(wordnetData)) {
        wordnetData.forEach(item => {
          if (item.word && item.synonyms) {
            synonymMappings[item.word] = item.synonyms;
          }
        });
      } else if (wordnetData.synonymMappings) {
        Object.assign(synonymMappings, wordnetData.synonymMappings);
      } else if (typeof wordnetData === 'object') {
        Object.assign(synonymMappings, wordnetData);
      }

      const output = {
        metadata: {
          source: 'WordNet',
          version: '1.0',
          createdAt: new Date().toISOString()
        },
        synonymMappings
      };

      fs.writeFileSync(this.wordnetPath, JSON.stringify(output, null, 2), 'utf8');
      console.log(`  💾 WordNet 데이터 저장: ${this.wordnetPath}`);
    } catch (error) {
      console.error(`  ❌ WordNet 데이터 저장 실패: ${error.message}`);
    }
  }

  /**
   * WordNet 데이터 로드
   */
  async loadWordNet() {
    // 1. 파일에서 로드 시도
    if (fs.existsSync(this.wordnetPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.wordnetPath, 'utf8'));
        if (data.synonymMappings) {
          Object.entries(data.synonymMappings).forEach(([keyword, synonyms]) => {
            this.wordnetData.set(keyword, synonyms);
          });
          console.log(`  ✅ WordNet 파일 로드: ${this.wordnetData.size}개 키워드`);
          return;
        }
      } catch (error) {
        console.warn(`  ⚠️ WordNet 파일 로드 실패: ${error.message}`);
      }
    }

    // 2. 다운로드 시도 (선택적)
    const downloadSuccess = await this.downloadAndConvertWordNet();
    if (downloadSuccess && fs.existsSync(this.wordnetPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.wordnetPath, 'utf8'));
        if (data.synonymMappings) {
          Object.entries(data.synonymMappings).forEach(([keyword, synonyms]) => {
            this.wordnetData.set(keyword, synonyms);
          });
          console.log(`  ✅ 다운로드된 WordNet 로드: ${this.wordnetData.size}개 키워드`);
          return;
        }
      } catch (error) {
        console.warn(`  ⚠️ 다운로드된 WordNet 로드 실패: ${error.message}`);
      }
    }

    // 3. 기본 폴백 데이터 사용
    console.log('  📚 기본 WordNet 데이터 사용');
    Object.entries(this.fallbackSynonyms).forEach(([keyword, synonyms]) => {
      this.wordnetData.set(keyword, synonyms);
    });
    console.log(`  ✅ 기본 WordNet 데이터: ${this.wordnetData.size}개 키워드`);
  }

  /**
   * 키워드의 동의어 조회
   */
  getSynonyms(keyword) {
    return this.wordnetData.get(keyword) || [];
  }

  /**
   * 모든 키워드에 대한 WordNet 기반 동의어 추출
   */
  async extractWordNetSynonyms(keywords) {
    console.log(`\n📚 WordNet 기반 동의어 추출 시작: ${keywords.size}개 키워드`);
    
    await this.loadWordNet();

    const synonymMappings = new Map();
    let foundCount = 0;

    keywords.forEach((keyword) => {
      const synonyms = this.getSynonyms(keyword);
      if (synonyms.length > 0) {
        synonymMappings.set(keyword, synonyms);
        foundCount++;
      }
    });

    console.log(`  ✅ ${foundCount}개 키워드의 WordNet 동의어 발견`);
    console.log(`  ⚠️ ${keywords.size - foundCount}개 키워드는 WordNet에 없음 (공출현 분석에 의존)`);

    return synonymMappings;
  }
}

/**
 * 공출현 분석 기반 동의어 추출 서비스
 */
class CooccurrenceBasedSynonymExtractor {
  constructor() {
    this.minCooccurrence = 3; // 최소 공출현 횟수
    this.minPMI = 1.0; // 최소 PMI 점수
    this.windowSize = 50; // 공출현 윈도우 크기 (단어 수)
    this.batchSize = 100; // PMI 계산 배치 크기 (키워드 단위)
    this.progressPath = path.join(__dirname, '../data/cooccurrence-progress.json');
    this.statisticsPath = path.join(__dirname, '../data/cooccurrence-statistics.json');
    this.resultPath = path.join(__dirname, '../data/cooccurrence-synonyms.json');
  }

  /**
   * 진행 상태 로드
   */
  loadProgress() {
    try {
      if (fs.existsSync(this.progressPath)) {
        const data = JSON.parse(fs.readFileSync(this.progressPath, 'utf8'));
        console.log(`  📂 진행 상태 로드: ${data.processedKeywords || 0}개 키워드 처리 완료`);
        return data;
      }
    } catch (error) {
      console.warn(`  ⚠️ 진행 상태 로드 실패: ${error.message}`);
    }
    return { processedKeywords: 0, processedKeywordSet: new Set() };
  }

  /**
   * 진행 상태 저장
   */
  saveProgress(processedKeywords, processedKeywordSet) {
    try {
      const data = {
        processedKeywords,
        processedKeywordSet: Array.from(processedKeywordSet),
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.progressPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.warn(`  ⚠️ 진행 상태 저장 실패: ${error.message}`);
    }
  }

  /**
   * 통계 저장
   */
  saveStatistics(wordCounts, cooccurrenceCounts, totalWordTokens) {
    try {
      const data = {
        wordCounts: Object.fromEntries(wordCounts),
        cooccurrenceCounts: Object.fromEntries(cooccurrenceCounts),
        totalWordTokens,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.statisticsPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`  💾 통계 저장 완료: ${this.statisticsPath}`);
    } catch (error) {
      console.warn(`  ⚠️ 통계 저장 실패: ${error.message}`);
    }
  }

  /**
   * 통계 로드
   */
  loadStatistics() {
    try {
      if (fs.existsSync(this.statisticsPath)) {
        const data = JSON.parse(fs.readFileSync(this.statisticsPath, 'utf8'));
        console.log(`  📂 통계 로드 완료: ${data.totalWordTokens || 0}개 토큰`);
        return {
          wordCounts: new Map(Object.entries(data.wordCounts || {})),
          cooccurrenceCounts: new Map(Object.entries(data.cooccurrenceCounts || {})),
          totalWordTokens: data.totalWordTokens || 0
        };
      }
    } catch (error) {
      console.warn(`  ⚠️ 통계 로드 실패: ${error.message}`);
    }
    return null;
  }

  /**
   * 중간 결과 저장
   */
  saveIntermediateResults(synonymMappings) {
    try {
      const data = {
        synonymMappings: Object.fromEntries(synonymMappings),
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.resultPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`  💾 중간 결과 저장: ${synonymMappings.size}개 키워드`);
    } catch (error) {
      console.warn(`  ⚠️ 중간 결과 저장 실패: ${error.message}`);
    }
  }

  /**
   * 중간 결과 로드
   */
  loadIntermediateResults() {
    try {
      if (fs.existsSync(this.resultPath)) {
        const data = JSON.parse(fs.readFileSync(this.resultPath, 'utf8'));
        const mappings = new Map(Object.entries(data.synonymMappings || {}));
        console.log(`  📂 중간 결과 로드: ${mappings.size}개 키워드`);
        return mappings;
      }
    } catch (error) {
      console.warn(`  ⚠️ 중간 결과 로드 실패: ${error.message}`);
    }
    return new Map();
  }

  /**
   * PMI (Pointwise Mutual Information) 계산
   */
  calculatePMI(word1Count, word2Count, cooccurrenceCount, totalWords) {
    if (cooccurrenceCount < this.minCooccurrence) {
      return 0;
    }

    const pWord1 = word1Count / totalWords;
    const pWord2 = word2Count / totalWords;
    const pCooccurrence = cooccurrenceCount / totalWords;

    if (pWord1 === 0 || pWord2 === 0 || pCooccurrence === 0) {
      return 0;
    }

    const pmi = Math.log2(pCooccurrence / (pWord1 * pWord2));
    return pmi > 0 ? pmi : 0;
  }

  /**
   * 청크들에서 공출현 통계 계산 (1단계)
   */
  async collectStatistics(chunks, keywords) {
    console.log(`\n📊 공출현 통계 수집 시작: ${chunks.length}개 청크, ${keywords.size}개 키워드`);
    
    // 기존 통계가 있으면 로드
    const existingStats = this.loadStatistics();
    if (existingStats) {
      console.log('  ✅ 기존 통계 사용 (스킵)');
      return existingStats;
    }
    
    const keywordSet = new Set(keywords);
    const wordCounts = new Map();
    const cooccurrenceCounts = new Map();
    let totalWordTokens = 0;

    // 청크별로 단어 쌍 추출
    chunks.forEach((chunk, chunkIdx) => {
      const words = chunk.content.match(/[가-힣]{2,10}/g) || [];
      const keywordIndices = [];

      // 키워드 위치 인덱스 찾기
      words.forEach((word, idx) => {
        if (keywordSet.has(word)) {
          keywordIndices.push({ word, idx });
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
          totalWordTokens++;
        }
      });

      // 윈도우 내 공출현 계산
      keywordIndices.forEach((item1) => {
        const start = Math.max(0, item1.idx - this.windowSize);
        const end = Math.min(words.length, item1.idx + this.windowSize);

        keywordIndices.forEach((item2) => {
          if (item1.word !== item2.word && item2.idx >= start && item2.idx <= end) {
            const pair = item1.word < item2.word 
              ? `${item1.word}::${item2.word}`
              : `${item2.word}::${item1.word}`;
            
            cooccurrenceCounts.set(pair, (cooccurrenceCounts.get(pair) || 0) + 1);
          }
        });
      });

      if ((chunkIdx + 1) % 100 === 0) {
        console.log(`  진행: ${chunkIdx + 1}/${chunks.length} 청크 처리`);
      }
    });

    console.log(`  ✅ 통계 수집 완료: ${wordCounts.size}개 키워드, ${cooccurrenceCounts.size}개 쌍`);
    
    // 통계 저장
    this.saveStatistics(wordCounts, cooccurrenceCounts, totalWordTokens);
    
    return { wordCounts, cooccurrenceCounts, totalWordTokens };
  }

  /**
   * PMI 계산 및 동의어 매핑 생성 (2단계) - 배치 처리
   */
  async calculatePMIAndSynonyms(wordCounts, cooccurrenceCounts, totalWordTokens) {
    console.log(`\n📊 PMI 계산 시작: ${wordCounts.size}개 키워드`);
    
    // 진행 상태 로드
    const progress = this.loadProgress();
    const processedKeywordSet = new Set(progress.processedKeywordSet || []);
    
    // 중간 결과 로드
    const synonymMappings = this.loadIntermediateResults();
    
    // 처리할 키워드 목록
    const allKeywords = Array.from(wordCounts.keys());
    const remainingKeywords = allKeywords.filter(k => !processedKeywordSet.has(k));
    
    console.log(`  📂 진행 상황: ${processedKeywordSet.size}/${allKeywords.length} 처리 완료`);
    console.log(`  🔄 남은 키워드: ${remainingKeywords.length}개`);
    
    if (remainingKeywords.length === 0) {
      console.log('  ✅ 모든 키워드 처리 완료');
      return synonymMappings;
    }
    
    // 배치로 처리
    let processedCount = processedKeywordSet.size;
    
    for (let i = 0; i < remainingKeywords.length; i += this.batchSize) {
      const batch = remainingKeywords.slice(i, i + this.batchSize);
      const batchStartTime = Date.now();
      
      console.log(`\n  🔄 배치 처리: ${i + 1}-${Math.min(i + this.batchSize, remainingKeywords.length)}/${remainingKeywords.length}`);
      
      batch.forEach((keyword1) => {
        const synonyms = [];

        // 공출현이 있는 키워드만 확인 (최적화)
        for (const [keyword2] of wordCounts) {
          if (keyword1 !== keyword2) {
            const pair = keyword1 < keyword2 
              ? `${keyword1}::${keyword2}`
              : `${keyword2}::${keyword1}`;

            const cooccurrence = cooccurrenceCounts.get(pair) || 0;
            
            // 공출현이 있는 경우만 PMI 계산
            if (cooccurrence >= this.minCooccurrence) {
              const word1Count = wordCounts.get(keyword1) || 0;
              const word2Count = wordCounts.get(keyword2) || 0;

              const pmi = this.calculatePMI(word1Count, word2Count, cooccurrence, totalWordTokens);

              if (pmi >= this.minPMI) {
                synonyms.push({ keyword: keyword2, pmi, cooccurrence });
              }
            }
          }
        }

        // PMI 기준으로 정렬하고 상위 선택 (성능 최적화: 15개 → 10개)
        synonyms.sort((a, b) => b.pmi - a.pmi);
        const topSynonyms = synonyms.slice(0, 10).map(item => item.keyword);

        if (topSynonyms.length > 0) {
          synonymMappings.set(keyword1, topSynonyms);
        }
        
        processedKeywordSet.add(keyword1);
        processedCount++;
      });
      
      const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      console.log(`  ✅ 배치 완료 (${batchTime}초): ${processedCount}/${allKeywords.length} 처리`);
      
      // 진행 상태 및 중간 결과 저장
      this.saveProgress(processedCount, processedKeywordSet);
      this.saveIntermediateResults(synonymMappings);
      
      // 예상 시간 계산
      const elapsed = (Date.now() - batchStartTime) / 1000;
      const avgTimePerBatch = elapsed / batch.length;
      const remaining = remainingKeywords.length - (i + batch.length);
      const estimatedSeconds = avgTimePerBatch * remaining;
      const estimatedMinutes = (estimatedSeconds / 60).toFixed(1);
      console.log(`  ⏱️  예상 남은 시간: 약 ${estimatedMinutes}분`);
    }

    // 완료 후 진행 상태 파일 삭제
    if (fs.existsSync(this.progressPath)) {
      fs.unlinkSync(this.progressPath);
      console.log('  🗑️  진행 상태 파일 삭제 완료');
    }

    console.log(`\n  ✅ ${synonymMappings.size}개 키워드의 공출현 기반 동의어 추출 완료`);
    return synonymMappings;
  }

  /**
   * 청크들에서 공출현 통계 계산 및 PMI 계산 (통합 메서드)
   */
  async analyzeCooccurrence(chunks, keywords) {
    // 1. 통계 수집
    const stats = await this.collectStatistics(chunks, keywords);
    
    // 2. PMI 계산 및 동의어 매핑 생성
    const synonymMappings = await this.calculatePMIAndSynonyms(
      stats.wordCounts,
      stats.cooccurrenceCounts,
      stats.totalWordTokens
    );
    
    return synonymMappings;
  }
}

/**
 * 공출현 + WordNet 분석 기반 동의어 사전 구축 클래스
 */
class CooccurrenceWordNetSynonymDictionaryBuilder {
  constructor() {
    this.allKeywords = new Set();
    this.synonymMappings = new Map();
    this.cooccurrenceExtractor = new CooccurrenceBasedSynonymExtractor();
    this.wordnetExtractor = new WordNetBasedSynonymExtractor();
    this.dictionaryPath = path.join(__dirname, '../data/comprehensive-synonym-dictionary.json');
    this.publicDictionaryPath = path.join(__dirname, '../public/data/comprehensive-synonym-dictionary.json');
    this.topNounsCount = 800; // 상위 800개 명사
    this.minFrequency = 5; // 최소 출현 빈도
    this.khaiii = null; // 형태소 분석기 (나중에 초기화)
  }

  /**
   * 형태소 분석기 초기화
   * 현재 khaiii 리소스 로드 문제로 인해 폴백 모드만 사용
   */
  async initializeMorphologicalAnalyzer() {
    if (!this.khaiii) {
      // khaiii는 현재 리소스 로드 문제로 사용하지 않음
      console.log('🔤 형태소 분석: 규칙 기반 명사 추출 모드로 진행');
      console.log('   (khaiii는 리소스 로드 문제로 건너뜀)');
      this.khaiii = null;
    }
    return false; // 항상 폴백 모드 사용
  }

  /**
   * 형태소 분석하여 명사만 추출
   */
  async extractNouns(text) {
    const nouns = new Set();
    
    if (this.khaiii) {
      try {
        const result = this.khaiii.analyze(text);
        result.forEach(word => {
          word.morphs.forEach(morph => {
            // 명사 태그: NNP (고유명사), NNG (일반명사), NNB (의존명사)
            if (morph.tag.startsWith('NN')) {
              const noun = morph.lex.trim();
              if (noun.length >= 2 && noun.length <= 10 && !this.isCommonWord(noun)) {
                nouns.add(noun);
              }
            }
          });
        });
      } catch (error) {
        console.warn(`⚠️ 형태소 분석 오류: ${error.message}`);
        // 폴백: 간단한 규칙 기반 추출
        return this.extractNounsFallback(text);
      }
    } else {
      // 형태소 분석기 없을 때 폴백
      return this.extractNounsFallback(text);
    }
    
    return Array.from(nouns);
  }

  /**
   * 폴백 명사 추출 (간단한 규칙 기반)
   */
  extractNounsFallback(text) {
    const words = text.match(/[가-힣]{2,10}/g) || [];
    const nouns = new Set();
    
    words.forEach(word => {
      // 간단한 명사 추정: 동사 어미 제외
      if (!word.endsWith('하다') && 
          !word.endsWith('되다') && 
          !word.endsWith('이다') &&
          !word.endsWith('있다') &&
          !word.endsWith('없다') &&
          !this.isCommonWord(word)) {
        nouns.add(word);
      }
    });
    
    return Array.from(nouns);
  }

  /**
   * Firestore에서 모든 청크와 키워드 추출 (명사 + 빈도 기반 필터링)
   * @param {string} targetFilename - 특정 파일명만 필터링 (선택사항)
   */
  async extractKeywordsAndChunks(targetFilename = null) {
    console.log('📚 Firestore에서 PDF 청크 가져오기 시작...');
    
    if (targetFilename) {
      console.log(`📄 필터링 대상 문서: ${targetFilename}`);
    }

    // 형태소 분석기 초기화 (실패해도 계속 진행)
    try {
      await this.initializeMorphologicalAnalyzer();
    } catch (error) {
      console.warn('⚠️ 형태소 분석기 초기화 중 예상치 못한 오류:', error.message);
      console.log('   → 규칙 기반 명사 추출로 진행합니다.');
      this.khaiii = null;
    }

    try {
      const chunksQuery = query(collection(db, 'pdf_chunks'));
      const chunksSnapshot = await getDocs(chunksQuery);

      const chunks = [];
      const processedDocuments = new Set();
      const wordFrequency = new Map(); // 단어별 전체 빈도
      const documentFrequency = new Map(); // 단어별 문서 수 (어느 문서에 나오는지)
      const wordsByDocument = new Map(); // 문서별 단어 집합

      console.log(`📦 총 ${chunksSnapshot.size}개 청크 발견`);

      // 1단계: 모든 청크 수집 및 단어 빈도 계산
      let processedChunks = 0;
      let filteredChunks = 0;
      for (const doc of chunksSnapshot.docs) {
        const chunkData = doc.data();
        const filename = chunkData.filename || 'unknown';

        // 특정 파일명 필터링
        if (targetFilename && !filename.includes(targetFilename)) {
          continue; // 필터링된 청크는 건너뜀
        }

        if (!processedDocuments.has(filename)) {
          processedDocuments.add(filename);
          console.log(`📄 문서 발견: ${filename}`);
        }

        if (chunkData.content) {
          filteredChunks++;
          chunks.push({ content: chunkData.content, filename });

          // 형태소 분석하여 명사만 추출
          const nouns = await this.extractNouns(chunkData.content);
          
          // 문서별 단어 집합 생성 (중복 제거)
          if (!wordsByDocument.has(filename)) {
            wordsByDocument.set(filename, new Set());
          }
          
          nouns.forEach(noun => {
            // 전체 빈도 업데이트
            wordFrequency.set(noun, (wordFrequency.get(noun) || 0) + 1);
            
            // 문서별 단어 집합에 추가 (중복 제거)
            wordsByDocument.get(filename).add(noun);
          });

          processedChunks++;
          if (processedChunks % 100 === 0) {
            console.log(`  진행: ${processedChunks}/${filteredChunks} 청크 처리 (${wordFrequency.size}개 고유 단어)`);
          }
        }
      }
      
      console.log(`\n📊 필터링 결과: ${filteredChunks}개 청크 (전체 ${chunksSnapshot.size}개 중)`);

      // 2단계: 문서별 단어 집합을 기반으로 문서 빈도 계산
      console.log(`\n📊 문서별 단어 분산도 계산 중...`);
      wordsByDocument.forEach((words, filename) => {
        words.forEach(word => {
          documentFrequency.set(word, (documentFrequency.get(word) || 0) + 1);
        });
      });

      const totalDocuments = processedDocuments.size;
      console.log(`   - 총 문서 수: ${totalDocuments}개`);

      // 3단계: TF-IDF 점수 계산 및 필터링
      console.log(`\n📊 TF-IDF 점수 계산 중...`);
      const wordScores = new Map();
      
      wordFrequency.forEach((freq, word) => {
        // 불용어 필터링
        if (this.isCommonWord(word)) return;
        
        // 최소 빈도 필터
        if (freq < this.minFrequency) return;
        
        // 주제별 전문 용어 필터링 (금연/건강증진/법률 관련)
        if (!this.isDomainTerm(word)) return;
        
        // TF-IDF 점수 계산
        const tfidfScore = this.calculateTFIDF(word, wordFrequency, documentFrequency, totalDocuments);
        wordScores.set(word, {
          frequency: freq,
          documentFrequency: documentFrequency.get(word) || 1,
          tfidf: tfidfScore,
          idf: Math.log(totalDocuments / (documentFrequency.get(word) || 1))
        });
      });

      // 4단계: TF-IDF 점수로 정렬하여 상위 1000개 선택
      const sortedWords = Array.from(wordScores.entries())
        .sort((a, b) => {
          // TF-IDF 점수 우선, 동점시 빈도순
          if (Math.abs(a[1].tfidf - b[1].tfidf) > 0.01) {
            return b[1].tfidf - a[1].tfidf;
          }
          return b[1].frequency - a[1].frequency;
        })
        .slice(0, this.topNounsCount);

      const topNouns = sortedWords.map(([word]) => word);
      this.allKeywords = new Set(topNouns);

      console.log(`✅ ${chunks.length}개 청크 처리 완료`);
      console.log(`📊 단어 통계:`);
      console.log(`   - 총 고유 단어: ${wordFrequency.size}개`);
      console.log(`   - 필터링 후: ${wordScores.size}개`);
      console.log(`   - 선택된 상위 ${topNouns.length}개 단어 (TF-IDF 기반):`);
      
      // 상위 20개 출력 (확인용)
      sortedWords.slice(0, 20).forEach(([word, data], idx) => {
        console.log(`     ${idx + 1}. ${word}: 빈도=${data.frequency}, 문서수=${data.documentFrequency}, TF-IDF=${data.tfidf.toFixed(2)}`);
      });

      // 선택된 명사 목록 파일 저장 (확인용)
      const topNounsPath = path.join(__dirname, '../data/top-1000-nouns.json');
      const topNounsData = {
        metadata: {
          totalWords: wordFrequency.size,
          filteredWords: wordScores.size,
          selectedWords: topNouns.length,
          totalDocuments: totalDocuments,
          minFrequency: this.minFrequency,
          scoringMethod: 'TF-IDF',
          createdAt: new Date().toISOString()
        },
        topNouns: topNouns,
        frequencyData: sortedWords.map(([word, data]) => ({
          word,
          frequency: data.frequency,
          documentFrequency: data.documentFrequency,
          tfidf: data.tfidf,
          idf: data.idf
        }))
      };
      
      const dataDir = path.dirname(topNounsPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(topNounsPath, JSON.stringify(topNounsData, null, 2), 'utf8');
      console.log(`\n💾 상위 ${topNouns.length}개 명사 목록 저장: ${topNounsPath}`);

      return chunks;
    } catch (error) {
      console.error('❌ Firestore에서 데이터 가져오기 실패:', error);
      throw error;
    }
  }

  /**
   * 강화된 불용어 필터 (조사, 부사, 연결어 등 모든 의미 없는 단어 제거)
   */
  isCommonWord(word) {
    // 기본 불용어 (대폭 확대)
    const commonWords = [
      // 대명사/지시사
      '것이', '것을', '것은', '것의', '것과', '것으로', '것이다', '것을',
      '그것', '이것', '저것', '어떤', '무엇', '언제', '어디', '왜', '어떻게',
      '그리고', '또한', '또는', '그러나', '하지만', '따라서',
      '위의', '아래의', '앞의', '뒤의', '중앙', '양쪽',
      
      // 부사 (전체 제거)
      '반드시', '절대', '항상', '매우', '아주', '너무', '완전히', '정말',
      '이미', '아직', '계속', '가끔', '보통', '자주', '드물게', '거의',
      '바로', '즉시', '곧', '빠르게', '천천히', '느리게', '천천히',
      '여기서', '거기서', '저기서', '어디서', '어디로', '어디서나',
      '지금', '현재', '당장', '나중', '이전', '이후', '최근',
      
      // 연결어 (전체 제거)
      '그래서', '그런데', '그러나', '그리고', '또한', '또는',
      '따라서', '그러므로', '그런즉', '그렇지만', '그럼에도',
      '만약', '만일', '만약에',
      '왜냐하면', '때문에',
      '한편', '다른', '또', '또한', '또는',
      
      // 조사 단어
      '대해서', '대하여', '의하면', '인하여', '있으면', '있다는',
      '관하여', '관련하여', '관하여는', '관해서',
      '선택한', '적용되는', '인정되지', '클릭하여',
      '하여야', '해야', '되어야', '된다고', '된다는', '됩니다',
      '의하여', '인하여야', '의하여야', '의하여는',
      '인정되어야', '적용되어야', '처리되어야', '확인되어야',
      
      // 의문/부정어
      '아니', '아니다', '아니라', '아니한', '아니면', '아닌',
      '없다', '없는', '없이', '없어', '없어서', '없도록', '없게',
      '모르다', '모른다', '모르는', '모르게',
      '가능한지', '있는지', '없는지', '되는지',
      
      // 일반적인 동사 어미
      '한다', '한다고', '한다면', '한다는', '하는', '하도록', '하게',
      '된다', '된다고', '된다면', '된다는', '되는', '되도록', '되게',
      '있다', '있다고', '있다는', '있다면', '있는', '있도록', '있게',
      '받다', '받는다', '받는', '받도록', '받게',
      '정하는', '규정하고', '포함한다', '말한다',
      '보아야', '따르면', '부과할', '부과된', '부과가', '부과하도록',
      '고려하여', '있으며', '있어야', '있어서', '있도록',
      '하여', '되어', '되어야', '되어서', '되도록',
      '하면서', '하면서도', '하며', '하므로', '하지만',
      
      // 형용사 어미
      '있는', '없는', '다른', '같은', '특별한', '필요한', '가능한', '불가능한',
      '적용되는', '선택한', '인정되지', '클릭하여', '관련하여',
      
      // 일반적인 표현
      '한다면', '한다고', '한다는', '하는', '하도록',
      '된다면', '된다고', '된다는', '되는', '되도록',
      '있으면', '있다면', '있다고', '있다는',
      '없으면', '없다면', '없다고', '없다는',
      '할수', '할수있', '할수있도록',
      '될수', '될수있', '될수있도록',
      '있을수', '있을수있', '있을수있도록',
      '없을수', '없을수있', '없을수있도록',
      
      // 기타 일반적인 단어
      '예를', '들어', '들어서', '말하면', '말하자면',
      '바꿔', '바꿔서', '바꾸면', '바꾸도록',
      '보면', '보도록', '보게',
      '하면', '하도록', '하게',
      '되는', '되도록', '되게',
      '있는', '있도록', '있게',
      '없는', '없도록', '없게',
      
      // 불필요한 접두사/접미사
      '대한', '위한', '따른', '관한', '의한',
      '항은', '조는', '조제', '항제', '규정이',
      '사정이', '문제된다', '날부터'
    ];
    
    if (commonWords.includes(word)) return true;
    if (word.length < 2 || word.length > 15) return true;
    
    // 조사로 끝나는 패턴 제거 (대폭 확대)
    const josaPatterns = [
      // 기본 조사
      /에$/, /의$/, /을$/, /를$/, /와$/, /과$/, /로$/, /으로$/,
      /에서$/, /에게$/, /에겐$/, /에게는$/, /에는$/, /에만$/,
      /에서도$/, /에서는$/, /으로는$/, /으로만$/, /로는$/,
      /인가$/, /인지$/, /이다$/, /입니다$/,
      
      // 확대된 조사 패턴
      /인하여$/, /의하여$/, /대해서$/, /대하여$/, /관하여$/, /관하여는$/,
      /관련하여$/, /있어서는$/, /있으면$/, /있다면$/, /있다는$/, /있다고$/,
      /인정되지$/, /클릭하여$/, /선택한$/, /적용되는$/, /처리하여$/,
      /하여야$/, /해야$/, /되어야$/, /된다고$/, /된다는$/, /됩니다$/,
      /의하여야$/, /인하여야$/, /의하여는$/, /인정되어야$/,
      /적용되어야$/, /처리되어야$/, /확인되어야$/,
      
      // 기타 조사 패턴
      /만큼$/, /마저$/, /조차$/, /까지$/, /부터$/, /도$/, /만$/,
      /은$/, /는$/, /이$/, /가$/, /께서$/, /에게서$/, /한테서$/,
      /하고$/, /이랑$/, /랑$/, /처럼$/, /같이$/, /보다$/,
      
      // 연결어 패턴
      /그래서$/, /그런데$/, /하지만$/, /그러나$/, /그리고$/,
      /따라서$/, /그러므로$/, /그런즉$/, /그렇지만$/,
      /만약$/, /만일$/, /만약에$/, /때문에$/,
      /아니라$/, /아니한$/, /아니면$/, /아닌$/,
      /없이$/, /없어$/, /없어서$/, /없도록$/, /없게$/,
      /하도록$/, /하게$/, /되도록$/, /되게$/,
      /있도록$/, /있게$/, /없도록$/, /없게$/,
      /할수$/, /할수있$/, /할수있도록$/,
      /될수$/, /될수있$/, /될수있도록$/,
      /있을수$/, /있을수있$/, /있을수있도록$/,
      /없을수$/, /없을수있$/, /없을수있도록$/
    ];
    
    // 동사/형용사 어미 패턴 제거 (대폭 확대)
    const verbEndings = [
      // 기본 동사 어미
      /^하는$/, /^받은$/, /^있는$/, /^없는$/, /^다른$/, /^특별한$/, /^필요한$/,
      /^관련$/, /^당사자가$/, /^행정청이$/, /^행정청은$/,
      /^규정하고$/, /^포함한다$/, /^말한다$/, /^한다$/, /^있습니다$/, /^것입니다$/,
      
      // 확대된 동사 어미 패턴
      /^한다고$/, /^한다면$/, /^한다는$/, /^하는$/, /^하도록$/, /^하게$/,
      /^된다고$/, /^된다면$/, /^된다는$/, /^되는$/, /^되도록$/, /^되게$/,
      /^있다고$/, /^있다는$/, /^있다면$/, /^있는$/, /^있도록$/, /^있게$/,
      /^없다고$/, /^없다는$/, /^없다면$/, /^없는$/, /^없도록$/, /^없게$/,
      /^받는다$/, /^받는$/, /^받도록$/, /^받게$/,
      /^정하는$/, /^보아야$/, /^따르면$/, /^부과할$/, /^부과된$/, /^부과가$/, /^부과하도록$/,
      /^고려하여$/, /^있으며$/, /^있어야$/, /^있어서$/, /^있도록$/,
      /^하여$/, /^되어$/, /^되어야$/, /^되어서$/, /^되도록$/,
      /^하면서$/, /^하면서도$/, /^하며$/, /^하므로$/, /^하지만$/,
      
      // 형용사 어미 패턴
      /^적용되는$/, /^선택한$/, /^인정되지$/, /^클릭하여$/, /^관련하여$/,
      /^가능한$/, /^불가능한$/, /^필요한$/, /^불필요한$/,
      
      // 조사 포함 동사 어미
      /^대해서$/, /^대하여$/, /^의하면$/, /^인하여$/, /^있으면$/, /^있다는$/,
      /^관하여$/, /^관련하여$/, /^관하여는$/,
      /^되어야$/, /^해야$/, /^하여야$/,
      /^의하여야$/, /^인하여야$/, /^의하여는$/,
      /^인정되어야$/, /^적용되어야$/, /^처리되어야$/,
      
      // 중간에도 있는 패턴
      /한다고$/, /한다면$/, /한다는$/, /하는$/, /하도록$/, /하게$/,
      /된다고$/, /된다면$/, /된다는$/, /되는$/, /되도록$/, /되게$/,
      /있다고$/, /있다는$/, /있다면$/, /있는$/, /있도록$/, /있게$/,
      /없다고$/, /없다는$/, /없다면$/, /없는$/, /없도록$/, /없게$/,
      /대해서$/, /대하여$/, /의하면$/, /인하여$/, /있으면$/, /있다는$/,
      /관하여$/, /관련하여$/, /관하여는$/,
      /적용되는$/, /선택한$/, /인정되지$/, /클릭하여$/,
      /되어야$/, /해야$/, /하여야$/,
      /의하여야$/, /인하여야$/, /의하여는$/,
      /인정되어야$/, /적용되어야$/, /처리되어야$/,
      /정하는$/, /보아야$/, /따르면$/, /부과할$/, /부과된$/, /부과가$/, /부과하도록$/,
      /고려하여$/, /있으며$/, /있어야$/, /있어서$/, /있도록$/,
      /하여$/, /되어$/, /되어야$/, /되어서$/, /되도록$/,
      /하면서$/, /하면서도$/, /하며$/, /하므로$/, /하지만$/
    ];
    
    // 조사 포함 확인
    const hasJosa = josaPatterns.some(pattern => pattern.test(word));
    const hasVerbEnding = verbEndings.some(pattern => pattern.test(word));
    
    // 의미 없는 패턴들 (전체 단어에 적용)
    const meaninglessPatterns = [
      // 조사 패턴
      /.*대해서$/, /.*대하여$/, /.*의하면$/, /.*인하여$/,
      /.*있으면$/, /.*있다는$/, /.*한다고$/, /.*선택한$/,
      /.*적용되는$/, /.*인정되지$/, /.*클릭하여$/, /.*관련하여$/,
      /.*관하여는$/, /.*있어서는$/, /.*있다면$/, /.*있다고$/,
      
      // 동사 어미 패턴
      /.*하여야$/, /.*해야$/, /.*되어야$/, /.*된다고$/,
      /.*된다는$/, /.*됩니다$/, /.*의하여야$/, /.*인하여야$/,
      /.*의하여는$/, /.*인정되어야$/, /.*적용되어야$/, /.*처리되어야$/,
      
      // 일반적인 어미 패턴
      /.*한다고$/, /.*한다는$/, /.*한다면$/, /.*하는$/, /.*하도록$/, /.*하게$/,
      /.*된다고$/, /.*된다는$/, /.*된다면$/, /.*되는$/, /.*되도록$/, /.*되게$/,
      /.*있다고$/, /.*있다는$/, /.*있다면$/, /.*있는$/, /.*있도록$/, /.*있게$/,
      /.*없다고$/, /.*없다는$/, /.*없다면$/, /.*없는$/, /.*없도록$/, /.*없게$/,
      /.*정하는$/, /.*보아야$/, /.*따르면$/, /.*부과할$/, /.*부과된$/, /.*부과가$/, /.*부과하도록$/,
      /.*고려하여$/, /.*있으며$/, /.*있어야$/, /.*있어서$/, /.*있도록$/,
      /.*하여$/, /.*되어$/, /.*되어야$/, /.*되어서$/, /.*되도록$/,
      /.*하면서$/, /.*하면서도$/, /.*하며$/, /.*하므로$/, /.*하지만$/,
      
      // 기타 의미 없는 패턴
      /.*할수/, /.*될수/, /.*있을수/, /.*없을수/,
      /.*할수있/, /.*될수있/, /.*있을수있/, /.*없을수있/,
      /.*할수있도록$/, /.*될수있도록$/, /.*있을수있도록$/, /.*없을수있도록$/,
      
      // 부사/연결어 패턴
      /^.*반드시/, /^.*절대/, /^.*매우/, /^.*아주/, /^.*너무/,
      /^.*그래서/, /^.*그런데/, /^.*하지만/, /^.*그러나/, /^.*그리고/,
      /^.*따라서/, /^.*그러므로/, /^.*만약/, /^.*때문에/
    ];
    
    if (meaninglessPatterns.some(pattern => pattern.test(word))) return true;
    
    return hasJosa || hasVerbEnding;
  }

  /**
   * 주제별 전문 용어인지 확인 (금연/건강증진/법률 관련)
   */
  isDomainTerm(word) {
    // 금연/건강증진 관련 키워드
    const healthKeywords = [
      '금연', '건강', '증진', '보건', '의료', '치료', '상담',
      '지역사회', '통합', '사업', '정책', '지원', '서비스',
      '니코틴', '흡연', '담배', '금연구역', '금지', '제한',
      '보건소', '보건복지', '보건기관', '의료기관', '병원',
      '국가금연', '지역사회중심', '건강증진사업', '통합건강증진',
      '금연지원', '금연서비스', '금연프로그램', '금연교육',
      '건강증진법', '보건소담당', '협력기관', '시도담당'
    ];
    
    // 법률/행정 관련 키워드
    const legalKeywords = [
      '법', '법률', '법령', '규정', '규칙', '지침', '안내',
      '시행령', '시행규칙', '조문', '조항', '항목', '항',
      '질서위반', '위반행위', '과태료', '과태', '부과',
      '징수', '체납', '압류', '행정청', '당사자', '신청',
      '처리', '심사', '승인', '허가', '등록', '변경',
      '취소', '정지', '폐지', '질서위반행위규제법',
      '국민건강증진법', '대법원', '판결', '선고',
      '규정이', '정하는', '관련', '적용', '범위', '대상'
    ];
    
    // 모든 키워드 확인
    const allKeywords = [...healthKeywords, ...legalKeywords];
    
    // 직접 매칭 확인
    if (allKeywords.includes(word)) return true;
    
    // 부분 매칭 확인 (복합명사 포함)
    for (const keyword of allKeywords) {
      if (word.includes(keyword) || keyword.includes(word)) {
        return true;
      }
    }
    
    // 복합명사 패턴 확인 (예: "국가금연정책", "지역사회중심")
    const compoundPatterns = [
      /금연.*/, /건강.*/, /보건.*/, /의료.*/,
      /지역.*/, /통합.*/, /사업.*/, /정책.*/,
      /법률.*/, /규정.*/, /행정.*/, /과태.*/
    ];
    
    if (compoundPatterns.some(pattern => pattern.test(word))) {
      return true;
    }
    
    // 너무 짧거나 일반적인 단어는 제외
    if (word.length < 3) return false;
    
    // 특수 패턴 제외 (예: "하는", "받은" 등 동사 어미)
    const excludePatterns = [/하는$/, /받은$/, /있는$/, /없는$/, /한다$/, /됩니다$/];
    if (excludePatterns.some(pattern => pattern.test(word))) {
      return false;
    }
    
    // 나머지는 포함 (일반 명사도 일단 포함)
    return true;
  }

  /**
   * TF-IDF 점수 계산
   */
  calculateTFIDF(word, wordFrequency, documentFrequency, totalDocuments) {
    // TF (Term Frequency): 단어가 전체에서 얼마나 자주 나오는지
    const tf = wordFrequency.get(word) || 0;
    
    // IDF (Inverse Document Frequency): 단어가 몇 개 문서에 나오는지
    const df = documentFrequency.get(word) || 1;
    const idf = Math.log(totalDocuments / df);
    
    // TF-IDF 점수
    return tf * idf;
  }

  /**
   * 공출현 분석 기반 동의어 추출
   */
  async extractCooccurrenceSynonyms(chunks, keywords) {
    try {
      return await this.cooccurrenceExtractor.analyzeCooccurrence(chunks, keywords);
    } catch (error) {
      console.error('❌ 공출현 분석 실패:', error);
      return new Map();
    }
  }

  /**
   * WordNet 기반 동의어 추출
   */
  async extractWordNetSynonyms(keywords) {
    try {
      return await this.wordnetExtractor.extractWordNetSynonyms(keywords);
    } catch (error) {
      console.error('❌ WordNet 동의어 추출 실패:', error);
      return new Map();
    }
  }

  /**
   * 임베딩 기반 동의어 추출
   */
  async extractEmbeddingSynonyms(keywords) {
    try {
      const keywordArray = Array.from(keywords);
      const embeddingSynonyms = await this.embeddingExtractor.extractSynonyms(keywordArray);
      
      // 임베딩 결과를 공출현/WordNet과 동일한 형식으로 변환
      const convertedMap = new Map();
      embeddingSynonyms.forEach((synonymsWithScore, keyword) => {
        // synonymsWithScore는 [{keyword, score}, ...] 형식
        const synonymWords = synonymsWithScore.map(item => item.keyword);
        convertedMap.set(keyword, synonymWords);
      });
      
      return convertedMap;
    } catch (error) {
      console.error('❌ 임베딩 기반 동의어 추출 실패:', error);
      return new Map();
    }
  }

  /**
   * 세 결과를 결합하여 최종 동의어 매핑 생성 (하이브리드 방식)
   */
  combineResults(cooccurrenceSynonyms, wordnetSynonyms, embeddingSynonyms = new Map()) {
    console.log('\n🔗 임베딩 + 공출현 + WordNet 결과 결합 중...');

    const finalMappings = new Map();
    const allKeywords = new Set([
      ...cooccurrenceSynonyms.keys(),
      ...wordnetSynonyms.keys(),
      ...embeddingSynonyms.keys()
    ]);

    // 가중치 설정 (하이브리드 방식)
    const embeddingWeight = 0.5; // 임베딩 50% (의미적 유사도)
    const cooccurrenceWeight = 0.3; // 공출현 30% (도메인 특화 용어, 실제 문서 공출현)
    const wordnetWeight = 0.2; // WordNet 20% (일반 어휘)

    allKeywords.forEach((keyword) => {
      const cooccurrenceSynonymsList = cooccurrenceSynonyms.get(keyword) || [];
      const wordnetSynonymsList = wordnetSynonyms.get(keyword) || [];
      const embeddingSynonymsList = embeddingSynonyms.get(keyword) || [];

      // 세 리스트 결합 (중복 제거)
      const combinedSet = new Set([
        ...cooccurrenceSynonymsList,
        ...wordnetSynonymsList,
        ...embeddingSynonymsList
      ]);

      // 신뢰도 점수 계산
      const synonymsWithScore = Array.from(combinedSet).map(synonym => {
        const inCooccurrence = cooccurrenceSynonymsList.includes(synonym);
        const inWordNet = wordnetSynonymsList.includes(synonym);
        const inEmbedding = embeddingSynonymsList.includes(synonym);
        
        let score = 0;
        if (inEmbedding) score += embeddingWeight;
        if (inCooccurrence) score += cooccurrenceWeight;
        if (inWordNet) score += wordnetWeight;

        return { word: synonym, confidence: score };
      });

      // 신뢰도 기준으로 정렬 (최소 0.3 이상만 선택)
      synonymsWithScore.sort((a, b) => b.confidence - a.confidence);
      const finalSynonyms = synonymsWithScore
        .filter(item => item.confidence >= 0.3)
        .slice(0, 10)
        .map(item => item.word);

      if (finalSynonyms.length > 0) {
        finalMappings.set(keyword, finalSynonyms);
      }
    });

    console.log(`✅ 최종 ${finalMappings.size}개 키워드의 동의어 매핑 생성 완료`);
    
    // 통계 출력
    const embeddingOnly = Array.from(finalMappings.entries()).filter(
      ([k, v]) => embeddingSynonyms.has(k) && !cooccurrenceSynonyms.has(k) && !wordnetSynonyms.has(k)
    ).length;
    const cooccurrenceOnly = Array.from(finalMappings.entries()).filter(
      ([k, v]) => cooccurrenceSynonyms.has(k) && !embeddingSynonyms.has(k) && !wordnetSynonyms.has(k)
    ).length;
    const wordnetOnly = Array.from(finalMappings.entries()).filter(
      ([k, v]) => wordnetSynonyms.has(k) && !embeddingSynonyms.has(k) && !cooccurrenceSynonyms.has(k)
    ).length;
    const embeddingCooccurrence = Array.from(finalMappings.entries()).filter(
      ([k, v]) => embeddingSynonyms.has(k) && cooccurrenceSynonyms.has(k) && !wordnetSynonyms.has(k)
    ).length;
    const embeddingWordNet = Array.from(finalMappings.entries()).filter(
      ([k, v]) => embeddingSynonyms.has(k) && wordnetSynonyms.has(k) && !cooccurrenceSynonyms.has(k)
    ).length;
    const cooccurrenceWordNet = Array.from(finalMappings.entries()).filter(
      ([k, v]) => cooccurrenceSynonyms.has(k) && wordnetSynonyms.has(k) && !embeddingSynonyms.has(k)
    ).length;
    const allThree = Array.from(finalMappings.entries()).filter(
      ([k, v]) => embeddingSynonyms.has(k) && cooccurrenceSynonyms.has(k) && wordnetSynonyms.has(k)
    ).length;
    
    console.log(`  📊 통계:`);
    console.log(`     - 임베딩만: ${embeddingOnly}개`);
    console.log(`     - 공출현만: ${cooccurrenceOnly}개`);
    console.log(`     - WordNet만: ${wordnetOnly}개`);
    console.log(`     - 임베딩+공출현: ${embeddingCooccurrence}개`);
    console.log(`     - 임베딩+WordNet: ${embeddingWordNet}개`);
    console.log(`     - 공출현+WordNet: ${cooccurrenceWordNet}개`);
    console.log(`     - 세 방법 모두: ${allThree}개`);

    return finalMappings;
  }

  /**
   * 한글 초성 추출
   */
  getChosung(char) {
    const code = char.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const cho = Math.floor((code - 0xAC00) / 0x24C);
      return ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'][cho];
    }
    // 한글이 아닌 경우 첫 글자로 그룹핑 (영문, 숫자 등)
    if (char.match(/[a-zA-Z]/)) return 'A-Z';
    if (char.match(/[0-9]/)) return '0-9';
    return 'ETC';
  }

  /**
   * 키워드의 초성 그룹 결정
   */
  getChosungGroup(keyword) {
    if (!keyword || keyword.length === 0) return 'ETC';
    const firstChar = keyword[0];
    const chosung = this.getChosung(firstChar);
    
    // 초성을 5개 그룹으로 분할
    if (['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ'].includes(chosung)) return 'group1'; // ㄱ~ㄷ
    if (['ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ'].includes(chosung)) return 'group2'; // ㄹ~ㅅ
    if (['ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ'].includes(chosung)) return 'group3'; // ㅆ~ㅊ
    if (['ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'].includes(chosung)) return 'group4'; // ㅋ~ㅎ
    return chosung; // A-Z, 0-9, ETC
  }

  /**
   * 동의어 사전 저장 (전체 + 청크 분할)
   */
  saveSynonymDictionary() {
    try {
      const totalSynonyms = Array.from(this.synonymMappings.values()).reduce(
        (sum, synonyms) => sum + synonyms.length, 0
      );

      const metadata = {
        totalKeywords: this.allKeywords.size,
        totalSynonyms: totalSynonyms,
        createdAt: new Date().toISOString(),
        version: '2.2',
        method: 'embedding-cooccurrence-wordnet',
        embeddingWeight: 0.5,
        cooccurrenceWeight: 0.3,
        wordnetWeight: 0.2,
        chunked: true,
        maxSynonymsPerKeyword: 10
      };

      // data 디렉토리 생성
      const dataDir = path.join(__dirname, '../data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const synonymsDir = path.join(dataDir, 'synonyms');
      if (!fs.existsSync(synonymsDir)) {
        fs.mkdirSync(synonymsDir, { recursive: true });
      }

      // 1. 전체 사전 저장 (호환성을 위해)
      const fullDictionary = {
        metadata,
        keywords: Array.from(this.allKeywords),
        synonymMappings: Object.fromEntries(this.synonymMappings)
      };

      const tempPath = `${this.dictionaryPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(fullDictionary, null, 2), 'utf8');
      fs.renameSync(tempPath, this.dictionaryPath);

      // 2. 청크 분할 저장 (초성 그룹별)
      const chunkGroups = new Map();
      
      this.synonymMappings.forEach((synonyms, keyword) => {
        const group = this.getChosungGroup(keyword);
        if (!chunkGroups.has(group)) {
          chunkGroups.set(group, { synonymMappings: {} });
        }
        chunkGroups.get(group).synonymMappings[keyword] = synonyms;
      });

      console.log(`\n📦 청크 분할 저장 중...`);
      let totalChunkSize = 0;
      
      chunkGroups.forEach((chunkData, group) => {
        const chunkFile = path.join(synonymsDir, `synonyms-${group}.json`);
        const chunkDict = {
          metadata: {
            ...metadata,
            group: group,
            keywordsCount: Object.keys(chunkData.synonymMappings).length
          },
          synonymMappings: chunkData.synonymMappings
        };
        
        fs.writeFileSync(chunkFile, JSON.stringify(chunkDict, null, 2), 'utf8');
        const chunkSize = fs.statSync(chunkFile).size;
        totalChunkSize += chunkSize;
        console.log(`   ✅ ${group}: ${Object.keys(chunkData.synonymMappings).length}개 키워드 (${(chunkSize / 1024).toFixed(1)}KB)`);
      });

      // 3. 인덱스 파일 생성 (어떤 키워드가 어떤 그룹에 있는지)
      const index = {
        metadata: {
          ...metadata,
          groups: Array.from(chunkGroups.keys()),
          groupCount: chunkGroups.size
        },
        keywordToGroup: {}
      };

      this.synonymMappings.forEach((synonyms, keyword) => {
        index.keywordToGroup[keyword] = this.getChosungGroup(keyword);
      });

      const indexPath = path.join(synonymsDir, 'synonyms-index.json');
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');

      // 4. public/data에도 복사
      const publicDataDir = path.join(__dirname, '../public/data');
      if (!fs.existsSync(publicDataDir)) {
        fs.mkdirSync(publicDataDir, { recursive: true });
      }
      
      const publicSynonymsDir = path.join(publicDataDir, 'synonyms');
      if (!fs.existsSync(publicSynonymsDir)) {
        fs.mkdirSync(publicSynonymsDir, { recursive: true });
      }

      // 전체 사전 복사
      fs.copyFileSync(this.dictionaryPath, this.publicDictionaryPath);
      
      // 청크 파일들 복사
      chunkGroups.forEach((chunkData, group) => {
        const sourceFile = path.join(synonymsDir, `synonyms-${group}.json`);
        const destFile = path.join(publicSynonymsDir, `synonyms-${group}.json`);
        fs.copyFileSync(sourceFile, destFile);
      });
      
      // 인덱스 파일 복사
      const publicIndexPath = path.join(publicSynonymsDir, 'synonyms-index.json');
      fs.copyFileSync(indexPath, publicIndexPath);

      console.log(`\n💾 동의어 사전 저장 완료:`);
      console.log(`   - 총 키워드: ${metadata.totalKeywords}개`);
      console.log(`   - 총 동의어: ${metadata.totalSynonyms}개`);
      console.log(`   - 평균 동의어/키워드: ${(metadata.totalSynonyms / metadata.totalKeywords).toFixed(2)}개`);
      console.log(`   - 전체 파일: ${(fs.statSync(this.dictionaryPath).size / 1024 / 1024).toFixed(1)}MB`);
      console.log(`   - 청크 파일 총합: ${(totalChunkSize / 1024 / 1024).toFixed(1)}MB`);
      console.log(`   - 청크 그룹 수: ${chunkGroups.size}개`);
      console.log(`   - 파일 위치: ${this.dictionaryPath}`);
      console.log(`   - 청크 위치: ${synonymsDir}`);
      console.log(`   - 공개 파일 위치: ${this.publicDictionaryPath}`);
      console.log(`   - 공개 청크 위치: ${publicSynonymsDir}`);
    } catch (error) {
      console.error('❌ 동의어 사전 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 1단계: 상위 800개 명사 추출 및 파일 저장
   * @param {string} targetFilename - 특정 파일명만 필터링 (선택사항)
   */
  async extractTopNouns(targetFilename = null) {
    const startTime = Date.now();

    try {
      console.log(`🚀 1단계: Firestore에서 상위 ${this.topNounsCount}개 명사 추출 시작\n`);
      
      // 기본값으로 금연구역 지정 관리 업무지침만 필터링
      if (!targetFilename) {
        targetFilename = '금연구역 지정 관리 업무지침';
      }
      
      if (targetFilename) {
        console.log(`📌 특정 문서만 필터링: ${targetFilename}\n`);
      }

      // 키워드 및 청크 추출 (파일 저장 포함)
      await this.extractKeywordsAndChunks(targetFilename);

      if (this.allKeywords.size === 0) {
        console.error('❌ 추출된 명사가 없습니다.');
        return;
      }

      const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`\n✅ 1단계 완료! 상위 ${this.allKeywords.size}개 명사 추출 및 파일 저장 완료 (소요 시간: ${totalTime}분)`);
      console.log(`📁 저장 위치: ${path.join(__dirname, '../data/top-1000-nouns.json')}`);

    } catch (error) {
      console.error('❌ 명사 추출 실패:', error);
      throw error;
    }
  }

  /**
   * 전체 프로세스 실행
   */
  async build() {
    const startTime = Date.now();

    try {
      console.log('🚀 공출현 + WordNet 분석 기반 동의어 사전 구축 시작\n');

      // 1. 키워드 및 청크 추출
      const chunks = await this.extractKeywordsAndChunks();

      if (this.allKeywords.size === 0) {
        console.error('❌ 추출된 키워드가 없습니다.');
        return;
      }

      // 2. 임베딩 기반 동의어 추출
      const embeddingSynonyms = await this.extractEmbeddingSynonyms(this.allKeywords);

      // 3. 공출현 분석 기반 동의어 추출
      const cooccurrenceSynonyms = await this.extractCooccurrenceSynonyms(chunks, this.allKeywords);

      // 4. WordNet 기반 동의어 추출
      const wordnetSynonyms = await this.extractWordNetSynonyms(this.allKeywords);

      // 5. 결과 결합 (하이브리드 방식)
      this.synonymMappings = this.combineResults(cooccurrenceSynonyms, wordnetSynonyms, embeddingSynonyms);

      // 5. 저장
      this.saveSynonymDictionary();

      const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`\n✅ 동의어 사전 구축 완료! (총 소요 시간: ${totalTime}분)`);

    } catch (error) {
      console.error('❌ 동의어 사전 구축 실패:', error);
      throw error;
    }
  }
}

// Unhandled Promise Rejection 처리 (khaiii 초기화 실패 대응)
process.on('unhandledRejection', (reason, promise) => {
  console.warn('⚠️ 처리되지 않은 Promise Rejection 감지 (khaiii 초기화 실패로 추정)');
  console.warn('   → 규칙 기반 명사 추출로 진행합니다.');
  // 에러를 무시하고 계속 진행
});

// 메인 실행
const builder = new CooccurrenceWordNetSynonymDictionaryBuilder();

// 명령줄 인자로 단계 선택 (기본값: '1' = 1단계만)
const step = process.argv[2] || '1';

if (step === '1') {
  // 1단계만: 상위 800개 명사 추출 및 파일 저장
  // 명령줄 인자로 파일명 필터링 (예: node script.js 1 금연구역)
  const targetFilename = process.argv[3] || null;
  builder.extractTopNouns(targetFilename).catch(error => {
    console.error('❌ 실행 실패:', error);
    process.exit(1);
  });
} else if (step === '2' || step === 'all') {
  // 2단계 또는 전체: 동의어 사전 구축
  builder.build().catch(error => {
    console.error('❌ 실행 실패:', error);
    process.exit(1);
  });
} else {
  console.log('사용법:');
  console.log('  1단계만 실행: node scripts/build-embedding-cooccurrence-synonym-dictionary.js 1');
  console.log('  2단계만 실행: node scripts/build-embedding-cooccurrence-synonym-dictionary.js 2');
  console.log('  전체 실행:   node scripts/build-embedding-cooccurrence-synonym-dictionary.js all');
  process.exit(1);
}

