/**
 * 의미적 검색 엔진
 * 벡터 임베딩 기반 검색 및 의미적 유사도 계산
 */

import { Chunk, QuestionAnalysis } from '../types';
import { FirestoreService, PDFChunk } from './firestoreService';
import { UnifiedSynonymService } from './unifiedSynonymService';
import { ComprehensiveSynonymExpansion } from './comprehensiveSynonymExpansion';
import { LocalEmbeddingService } from './localEmbeddingService';

export interface SemanticSearchResult {
  chunks: Chunk[];
  similarities: number[];
  searchMetrics: {
    totalProcessed: number;
    averageSimilarity: number;
    maxSimilarity: number;
    minSimilarity: number;
    executionTime: number;
  };
}

export interface VectorEmbedding {
  text: string;
  vector: number[];
  magnitude: number;
}

export class SemanticSearchEngine {
  private firestoreService: FirestoreService;
  private unifiedSynonymService: UnifiedSynonymService = UnifiedSynonymService.getInstance();
  private comprehensiveSynonymExpansion: ComprehensiveSynonymExpansion = ComprehensiveSynonymExpansion.getInstance();
  private localEmbeddingService: LocalEmbeddingService = LocalEmbeddingService.getInstance();
  private static readonly MIN_SIMILARITY_THRESHOLD = 0.3;
  private static readonly MAX_RESULTS = 20;
  private useLocalEmbedding: boolean = true; // ✅ 로컬 임베딩 사용 여부

  constructor() {
    this.firestoreService = FirestoreService.getInstance();
  }

  /**
   * 의미적 검색 실행
   */
  async executeSemanticSearch(
    questionAnalysis: QuestionAnalysis,
    maxResults: number = 10
  ): Promise<SemanticSearchResult> {
    const startTime = Date.now();
    console.log(`🔍 의미적 검색 시작: "${questionAnalysis.context}"`);
    
    try {
      // 1. 질문 벡터 생성 (로컬 임베딩 또는 TF-IDF)
      let questionVector: VectorEmbedding;
      
      if (this.useLocalEmbedding) {
        // ✅ 로컬 임베딩 사용
        console.log('🔍 로컬 임베딩으로 질문 벡터 생성 시작...');
        
        try {
          // 모델 초기화 확인
          await this.localEmbeddingService.initialize();
          
          // 임베딩 생성 시도
          const embedding = await this.localEmbeddingService.embedText(questionAnalysis.context);
          questionVector = {
            text: questionAnalysis.context,
            vector: embedding,
            magnitude: Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
          };
          console.log(`✅ 질문 임베딩 생성 완료: ${embedding.length}차원`);
        } catch (error) {
          console.warn('⚠️ 로컬 임베딩 사용 실패, TF-IDF로 대체:', error);
          this.useLocalEmbedding = false;
          questionVector = await this.generateTextEmbedding(questionAnalysis.context);
        }
      } else {
        // 🔄 TF-IDF 사용 (기존 방식)
        questionVector = await this.generateTextEmbedding(questionAnalysis.context);
      }
      
      // 2. Firestore에서 벡터 유사도 검색 (임베딩이 있는 경우)
      let chunks: Chunk[] = [];
      
      if (this.useLocalEmbedding && questionVector.vector) {
        console.log('🔍 Firestore 벡터 검색 시도');
        try {
          const pdfChunks = await this.firestoreService.similaritySearch(
            questionVector.vector,
            undefined,
            maxResults
          );
          chunks = await this.convertPDFChunksToChunks(pdfChunks);
          console.log(`✅ Firestore 벡터 검색 결과: ${chunks.length}개`);
        } catch (error) {
          console.warn('⚠️ Firestore 벡터 검색 실패, 대체 방법 사용:', error);
        }
      }
      
      // 3. 벡터 검색 결과가 부족하면 기존 방식 사용
      if (chunks.length < maxResults) {
        console.log(`📊 백업 검색: Firestore 결과 ${chunks.length}개 < ${maxResults}개`);
        
        const allChunks = await this.getAllChunks();
        console.log(`📊 처리할 청크 수: ${allChunks.length}개`);
        
        // 4. 청크별 의미적 유사도 계산
        const similarities = await this.calculateSemanticSimilarities(
          questionVector,
          allChunks
        );
        
        // 5. 유사도 기준 필터링 및 정렬
        const additionalResults = this.filterAndSortBySimilarity(
          allChunks,
          similarities,
          maxResults - chunks.length
        );
        
        // 중복 제거
        const existingIds = new Set(chunks.map(c => c.id));
        const uniqueAdditional = additionalResults.filter(c => !existingIds.has(c.id));
        chunks = [...chunks, ...uniqueAdditional];
      }
      
      const executionTime = Date.now() - startTime;
      
      // 유사도 점수 추출 (simplified)
      const similarities = chunks.map((_, index) => 1 - (index / chunks.length) * 0.3);
      
      const result: SemanticSearchResult = {
        chunks,
        similarities,
        searchMetrics: {
          totalProcessed: chunks.length,
          averageSimilarity: this.calculateAverageSimilarity(similarities),
          maxSimilarity: Math.max(...similarities),
          minSimilarity: Math.min(...similarities),
          executionTime
        }
      };
      
      console.log(`✅ 의미적 검색 완료: ${result.chunks.length}개 결과, ${executionTime}ms`);
      console.log(`📊 평균 유사도: ${result.searchMetrics.averageSimilarity.toFixed(3)}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ 의미적 검색 오류:', error);
      throw error;
    }
  }

  /**
   * 텍스트 임베딩 생성 (간단한 TF-IDF 기반)
   */
  private async generateTextEmbedding(text: string): Promise<VectorEmbedding> {
    console.log(`🔄 텍스트 임베딩 생성: "${text.substring(0, 50)}..."`);
    
    // 텍스트 전처리
    const processedText = this.preprocessText(text);
    
    // 단어 빈도 계산
    const wordFrequencies = this.calculateWordFrequencies(processedText);
    
    // TF-IDF 벡터 생성
    const vector = this.generateTFIDFVector(wordFrequencies);
    
    // 벡터 크기 계산
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    return {
      text: processedText,
      vector,
      magnitude
    };
  }

  /**
   * 텍스트 전처리
   */
  private preprocessText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ') // 특수문자 제거
      .replace(/\s+/g, ' ') // 공백 정규화
      .trim();
  }

  /**
   * 단어 빈도 계산
   */
  private calculateWordFrequencies(text: string): Map<string, number> {
    const words = text.split(' ').filter(word => word.length > 1);
    const frequencies = new Map<string, number>();
    
    words.forEach(word => {
      frequencies.set(word, (frequencies.get(word) || 0) + 1);
    });
    
    return frequencies;
  }

  /**
   * TF-IDF 벡터 생성
   */
  private generateTFIDFVector(wordFrequencies: Map<string, number>): number[] {
    // 간단한 TF-IDF 구현 (실제로는 더 복잡한 구현 필요)
    const vector: number[] = [];
    const totalWords = Array.from(wordFrequencies.values()).reduce((sum, freq) => sum + freq, 0);
    
    wordFrequencies.forEach(frequency => {
      const tf = frequency / totalWords;
      const idf = Math.log(1 + 1 / frequency); // 간단한 IDF 계산
      vector.push(tf * idf);
    });
    
    return vector;
  }

  /**
   * 모든 청크 가져오기
   */
  private async getAllChunks(): Promise<Chunk[]> {
    try {
      // Firestore에서 모든 청크 가져오기 (캐싱 활용)
      const documents = await this.firestoreService.getAllDocuments();
      const allChunks: Chunk[] = [];
      
      for (const doc of documents) {
        const chunks = await this.firestoreService.getChunksByDocument(doc.id);
        const convertedChunks = this.convertPDFChunksToChunks(chunks);
        allChunks.push(...convertedChunks);
      }
      
      console.log(`📦 총 청크 수: ${allChunks.length}개`);
      return allChunks;
      
    } catch (error) {
      console.error('❌ 청크 로드 오류:', error);
      return [];
    }
  }

  /**
   * 의미적 유사도 계산
   */
  private async calculateSemanticSimilarities(
    questionVector: VectorEmbedding,
    chunks: Chunk[]
  ): Promise<number[]> {
    console.log(`🔄 의미적 유사도 계산 중...`);
    
    const similarities: number[] = [];
    
    for (const chunk of chunks) {
      try {
        // 청크 텍스트 임베딩 생성
        const chunkVector = await this.generateTextEmbedding(chunk.content);
        
        // 코사인 유사도 계산
        const similarity = this.calculateCosineSimilarity(questionVector, chunkVector);
        similarities.push(similarity);
        
      } catch (error) {
        console.warn(`⚠️ 청크 처리 오류: ${chunk.id}`, error);
        similarities.push(0);
      }
    }
    
    return similarities;
  }

  /**
   * 코사인 유사도 계산
   */
  private calculateCosineSimilarity(
    vector1: VectorEmbedding,
    vector2: VectorEmbedding
  ): number {
    // 벡터 길이 맞추기
    const maxLength = Math.max(vector1.vector.length, vector2.vector.length);
    const v1 = this.padVector(vector1.vector, maxLength);
    const v2 = this.padVector(vector2.vector, maxLength);
    
    // 내적 계산
    let dotProduct = 0;
    for (let i = 0; i < maxLength; i++) {
      dotProduct += v1[i] * v2[i];
    }
    
    // 코사인 유사도 계산
    const magnitude1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }
    
    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * 벡터 패딩
   */
  private padVector(vector: number[], targetLength: number): number[] {
    const padded = [...vector];
    while (padded.length < targetLength) {
      padded.push(0);
    }
    return padded;
  }

  /**
   * 유사도 기준 필터링 및 정렬
   */
  private filterAndSortBySimilarity(
    chunks: Chunk[],
    similarities: number[],
    maxResults: number
  ): { chunks: Chunk[]; similarities: number[] } {
    // 유사도와 청크를 함께 정렬
    const indexedResults = chunks.map((chunk, index) => ({
      chunk,
      similarity: similarities[index],
      index
    }));
    
    // 유사도 기준으로 정렬 (높은 순)
    indexedResults.sort((a, b) => b.similarity - a.similarity);
    
    // 임계값 이상만 필터링
    const filteredResults = indexedResults.filter(
      result => result.similarity >= this.MIN_SIMILARITY_THRESHOLD
    );
    
    // 최대 결과 수 제한
    const limitedResults = filteredResults.slice(0, Math.min(maxResults, this.MAX_RESULTS));
    
    return {
      chunks: limitedResults.map(result => result.chunk),
      similarities: limitedResults.map(result => result.similarity)
    };
  }

  /**
   * 평균 유사도 계산
   */
  private calculateAverageSimilarity(similarities: number[]): number {
    if (similarities.length === 0) return 0;
    
    const sum = similarities.reduce((total, sim) => total + sim, 0);
    return sum / similarities.length;
  }

  /**
   * PDFChunk를 Chunk로 변환 (document 정보 조회 포함)
   */
  private async convertPDFChunksToChunks(pdfChunks: PDFChunk[]): Promise<Chunk[]> {
    // documentId별로 그룹화하여 중복 조회 방지
    const documentIds = [...new Set(pdfChunks.map(p => p.documentId))];
    
    // 모든 문서 정보 조회
    const documents = await Promise.all(
      documentIds.map(id => this.firestoreService.getDocumentById(id))
    );
    
    // documentId -> PDFDocument 맵 생성
    const docMap = new Map(documents.filter(d => d !== null).map(d => [d.id, d]));
    
    return pdfChunks.map(pdfChunk => {
      const doc = docMap.get(pdfChunk.documentId);
      
      return {
        id: pdfChunk.id || '',
        documentId: pdfChunk.documentId,  // ✅ 추가
        content: pdfChunk.content,
        metadata: {
          source: doc?.filename || 'Firestore',
          title: pdfChunk.metadata.title || doc?.title || 'Unknown',
          page: pdfChunk.metadata.page || 0,
          section: pdfChunk.metadata.section || 'general',
          position: pdfChunk.metadata.position || 0,
          startPosition: pdfChunk.metadata.startPos || 0,
          endPosition: pdfChunk.metadata.endPos || 0,
          originalSize: pdfChunk.metadata.originalSize || 0,
          documentType: pdfChunk.metadata.documentType
        },
        keywords: pdfChunk.keywords || [],
        location: {
          document: pdfChunk.location?.document || doc?.title || pdfChunk.documentId || 'Unknown',
          section: pdfChunk.location?.section || pdfChunk.metadata.section || 'general',
          page: pdfChunk.location?.page || pdfChunk.metadata.page || 0
        }
      };
    });
  }

  /**
   * 의미적 키워드 확장
   */
  static generateSemanticKeywords(questionAnalysis: QuestionAnalysis): string[] {
    const semanticKeywords: string[] = [];
    const keywords = questionAnalysis.keywords;
    
    // 도메인별 의미적 키워드 매핑 확장
    const domainMappings: { [key: string]: string[] } = {
      '체육시설': [
        '운동시설', '스포츠시설', '체육관', '운동장', '경기장', 
        '헬스장', '수영장', '골프장', '테니스장', '배드민턴장',
        '실내체육관', '실외체육관', '체육센터', '운동센터'
      ],
      '어린이집': [
        '보육시설', '유치원', '어린이보호시설', '보육원', 
        '어린이시설', '아동시설', '보육소', '어린이집'
      ],
      '내부감사': [
        '감사', '내부감사', '감사업무', '감사활동', '정기감사', '수시감사', '특별감사',
        '감사계획', '감사범위', '감사대상', '감사절차', '감사보고서', '감사의견',
        '지적사항', '시정조치', '개선조치', '내부통제', '리스크관리', '통제활동', '통제환경'
      ],
      '법령': [
        '규정', '지침', '안내', '법규', '조례', '시행령',
        '법률', '규칙', '고시', '공고', '행정규칙'
      ],
      '절차': [
        '방법', '과정', '단계', '절차', '순서', '방안',
        '절차서', '매뉴얼', '가이드', '지침서', '안내서'
      ],
      '시설': [
        '장소', '공간', '건물', '시설물', '설비', '기관',
        '센터', '관', '소', '원', '실', '홀'
      ]
    };
    
    // 키워드별 의미적 확장
    keywords.forEach(keyword => {
      if (domainMappings[keyword]) {
        semanticKeywords.push(...domainMappings[keyword]);
      }
      
      // 부분 매칭으로 추가 키워드 찾기
      Object.keys(domainMappings).forEach(domainKey => {
        if (domainKey.includes(keyword) || keyword.includes(domainKey)) {
          semanticKeywords.push(...domainMappings[domainKey]);
        }
      });
    });
    
    // 중복 제거 및 반환
    return [...new Set(semanticKeywords)];
  }

  /**
   * 검색 성능 통계 생성
   */
  static generateSearchStatistics(result: SemanticSearchResult): {
    totalProcessed: number;
    resultsFound: number;
    averageSimilarity: number;
    maxSimilarity: number;
    minSimilarity: number;
    executionTime: number;
    efficiency: number;
  } {
    const efficiency = result.chunks.length / result.searchMetrics.totalProcessed;
    
    return {
      totalProcessed: result.searchMetrics.totalProcessed,
      resultsFound: result.chunks.length,
      averageSimilarity: result.searchMetrics.averageSimilarity,
      maxSimilarity: result.searchMetrics.maxSimilarity,
      minSimilarity: result.searchMetrics.minSimilarity,
      executionTime: result.searchMetrics.executionTime,
      efficiency: Number(efficiency.toFixed(4))
    };
  }
}
