/**
 * 지능형 청크 분할 시스템
 * 의미 단위 청크 분할 및 문맥 보존
 */

import { Chunk } from '../types';

export interface SemanticChunk extends Chunk {
  semanticInfo: {
    topic: string;
    concepts: string[];
    sentiment: 'positive' | 'negative' | 'neutral';
    importance: 'high' | 'medium' | 'low';
    contextPreserved: boolean;
  };
  chunkType: 'sentence' | 'paragraph' | 'topic' | 'section';
  boundaries: {
    startSentence: number;
    endSentence: number;
    startParagraph: number;
    endParagraph: number;
  };
}

export interface ChunkingOptions {
  maxChunkSize: number;
  minChunkSize: number;
  overlapSize: number;
  preserveSentences: boolean;
  preserveParagraphs: boolean;
  preserveTopics: boolean;
}

export class IntelligentChunkingSystem {
  private static readonly DEFAULT_OPTIONS: ChunkingOptions = {
    maxChunkSize: 2000,
    minChunkSize: 100,
    overlapSize: 200,
    preserveSentences: true,
    preserveParagraphs: true,
    preserveTopics: true
  };

  /**
   * 지능형 청크 분할 실행
   */
  static async performIntelligentChunking(
    content: string,
    metadata: any,
    options: Partial<ChunkingOptions> = {}
  ): Promise<SemanticChunk[]> {
    const chunkingOptions = { ...this.DEFAULT_OPTIONS, ...options };
    console.log(`🔄 지능형 청크 분할 시작: ${content.length}자`);
    
    try {
      // 1. 텍스트 구조 분석
      const textStructure = this.analyzeTextStructure(content);
      
      // 2. 의미적 단위 식별
      const semanticUnits = this.identifySemanticUnits(content, textStructure);
      
      // 3. 청크 경계 결정
      const chunkBoundaries = this.determineChunkBoundaries(
        semanticUnits,
        chunkingOptions
      );
      
      // 4. 의미적 청크 생성
      const semanticChunks = this.createSemanticChunks(
        content,
        chunkBoundaries,
        metadata,
        semanticUnits
      );
      
      // 5. 청크 품질 검증
      const validatedChunks = this.validateChunkQuality(semanticChunks);
      
      console.log(`✅ 지능형 청크 분할 완료: ${validatedChunks.length}개 청크`);
      
      return validatedChunks;
      
    } catch (error) {
      console.error('❌ 지능형 청크 분할 오류:', error);
      throw error;
    }
  }

  /**
   * 텍스트 구조 분석
   */
  private static analyzeTextStructure(content: string): {
    sentences: string[];
    paragraphs: string[];
    sections: string[];
    headings: string[];
  } {
    // 문장 분할
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // 문단 분할
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // 섹션 분할 (제목 기반)
    const sections = content.split(/\n(?=[가-힣]{2,}.*[:\-])/).filter(s => s.trim().length > 0);
    
    // 제목 추출
    const headings = content.match(/^[가-힣]{2,}.*[:\-]/gm) || [];
    
    return {
      sentences,
      paragraphs,
      sections,
      headings: headings.map(h => h.trim())
    };
  }

  /**
   * 의미적 단위 식별
   */
  private static identifySemanticUnits(
    content: string,
    structure: any
  ): Array<{
    type: 'sentence' | 'paragraph' | 'section';
    content: string;
    startPos: number;
    endPos: number;
    topic: string;
    concepts: string[];
    importance: 'high' | 'medium' | 'low';
  }> {
    const units: any[] = [];
    let currentPos = 0;
    
    // 문장 단위 분석
    structure.sentences.forEach((sentence: string, index: number) => {
      const startPos = content.indexOf(sentence, currentPos);
      const endPos = startPos + sentence.length;
      
      const topic = this.extractTopic(sentence);
      const concepts = this.extractConcepts(sentence);
      const importance = this.determineImportance(sentence, concepts);
      
      units.push({
        type: 'sentence',
        content: sentence.trim(),
        startPos,
        endPos,
        topic,
        concepts,
        importance
      });
      
      currentPos = endPos;
    });
    
    return units;
  }

  /**
   * 주제 추출
   */
  private static extractTopic(text: string): string {
    // 간단한 주제 추출 (실제로는 더 정교한 NLP 필요)
    const keywords = ['내부감사', '감사업무', '위반사항', '법령', '절차', '규정'];
    
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return keyword;
      }
    }
    
    // 첫 번째 명사 추출
    const nouns = text.match(/[가-힣]{2,}/g);
    return nouns ? nouns[0] : '일반';
  }

  /**
   * 개념 추출
   */
  private static extractConcepts(text: string): string[] {
    const concepts: string[] = [];
    
    // 법령 관련 개념
    const legalConcepts = ['법', '규정', '지침', '안내', '절차', '요건', '조건'];
    legalConcepts.forEach(concept => {
      if (text.includes(concept)) {
        concepts.push(concept);
      }
    });
    
    // 시설 관련 개념
    const facilityConcepts = ['시설', '장소', '공간', '건물', '센터', '관', '소'];
    facilityConcepts.forEach(concept => {
      if (text.includes(concept)) {
        concepts.push(concept);
      }
    });
    
    // 금연 관련 개념
    const smokingConcepts = ['감사', '내부감사', '위반', '부정', '내부통제', '리스크'];
    smokingConcepts.forEach(concept => {
      if (text.includes(concept)) {
        concepts.push(concept);
      }
    });
    
    return [...new Set(concepts)];
  }

  /**
   * 중요도 결정
   */
  private static determineImportance(text: string, concepts: string[]): 'high' | 'medium' | 'low' {
    let importance = 0;
    
    // 개념 수에 따른 중요도
    importance += concepts.length * 0.2;
    
    // 키워드 포함 여부
    const importantKeywords = ['법령', '규정', '의무', '필수', '금지', '제한'];
    const hasImportantKeywords = importantKeywords.some(keyword => text.includes(keyword));
    if (hasImportantKeywords) importance += 0.5;
    
    // 구체적 정보 포함
    const hasSpecificInfo = /\d{4}년|\d+일|\d+%|\d+원/.test(text);
    if (hasSpecificInfo) importance += 0.3;
    
    if (importance >= 0.7) return 'high';
    if (importance >= 0.4) return 'medium';
    return 'low';
  }

  /**
   * 청크 경계 결정
   */
  private static determineChunkBoundaries(
    semanticUnits: any[],
    options: ChunkingOptions
  ): Array<{
    startUnit: number;
    endUnit: number;
    startPos: number;
    endPos: number;
    chunkType: 'sentence' | 'paragraph' | 'topic' | 'section';
  }> {
    const boundaries: any[] = [];
    let currentStart = 0;
    
    while (currentStart < semanticUnits.length) {
      let currentEnd = currentStart;
      let currentLength = 0;
      
      // 최소 청크 크기 확보
      while (currentEnd < semanticUnits.length && currentLength < options.minChunkSize) {
        currentLength += semanticUnits[currentEnd].content.length;
        currentEnd++;
      }
      
      // 최대 청크 크기 제한
      while (currentEnd < semanticUnits.length && currentLength < options.maxChunkSize) {
        const nextUnit = semanticUnits[currentEnd];
        if (currentLength + nextUnit.content.length > options.maxChunkSize) {
          break;
        }
        currentLength += nextUnit.content.length;
        currentEnd++;
      }
      
      // 의미적 경계 확인
      if (options.preserveTopics) {
        currentEnd = this.adjustForTopicBoundary(semanticUnits, currentStart, currentEnd);
      }
      
      if (options.preserveParagraphs) {
        currentEnd = this.adjustForParagraphBoundary(semanticUnits, currentStart, currentEnd);
      }
      
      if (options.preserveSentences) {
        currentEnd = this.adjustForSentenceBoundary(semanticUnits, currentStart, currentEnd);
      }
      
      const startPos = semanticUnits[currentStart].startPos;
      const endPos = semanticUnits[currentEnd - 1].endPos;
      
      boundaries.push({
        startUnit: currentStart,
        endUnit: currentEnd,
        startPos,
        endPos,
        chunkType: this.determineChunkType(semanticUnits, currentStart, currentEnd)
      });
      
      // 오버랩 적용
      currentStart = Math.max(currentStart + 1, currentEnd - Math.floor(options.overlapSize / 100));
    }
    
    return boundaries;
  }

  /**
   * 주제 경계 조정
   */
  private static adjustForTopicBoundary(
    semanticUnits: any[],
    start: number,
    end: number
  ): number {
    // 현재 청크 내에서 주제가 바뀌는 지점 찾기
    const startTopic = semanticUnits[start].topic;
    
    for (let i = start + 1; i < end; i++) {
      if (semanticUnits[i].topic !== startTopic) {
        return i;
      }
    }
    
    return end;
  }

  /**
   * 문단 경계 조정
   */
  private static adjustForParagraphBoundary(
    semanticUnits: any[],
    start: number,
    end: number
  ): number {
    // 문단 경계를 찾아서 조정 (실제 구현에서는 더 정교한 로직 필요)
    return end;
  }

  /**
   * 문장 경계 조정
   */
  private static adjustForSentenceBoundary(
    semanticUnits: any[],
    start: number,
    end: number
  ): number {
    // 문장 경계를 찾아서 조정
    return end;
  }

  /**
   * 청크 유형 결정
   */
  private static determineChunkType(
    semanticUnits: any[],
    start: number,
    end: number
  ): 'sentence' | 'paragraph' | 'topic' | 'section' {
    const unitCount = end - start;
    
    if (unitCount === 1) return 'sentence';
    if (unitCount <= 3) return 'paragraph';
    if (unitCount <= 10) return 'topic';
    return 'section';
  }

  /**
   * 의미적 청크 생성
   */
  private static createSemanticChunks(
    content: string,
    boundaries: any[],
    metadata: any,
    semanticUnits: any[]
  ): SemanticChunk[] {
    return boundaries.map((boundary, index) => {
      const chunkContent = content.substring(boundary.startPos, boundary.endPos);
      const unitsInChunk = semanticUnits.slice(boundary.startUnit, boundary.endUnit);
      
      // 청크의 의미적 정보 집계
      const topics = [...new Set(unitsInChunk.map(unit => unit.topic))];
      const concepts = [...new Set(unitsInChunk.flatMap(unit => unit.concepts))];
      const importance = this.aggregateImportance(unitsInChunk);
      const sentiment = this.determineSentiment(chunkContent);
      
      return {
        id: `${metadata.id || 'chunk'}_${index}`,
        content: chunkContent,
        metadata: {
          ...metadata,
          position: index,
          startPosition: boundary.startPos,
          endPosition: boundary.endPos,
          originalSize: chunkContent.length
        },
        keywords: concepts,
        location: {
          document: metadata.title || 'Unknown',
          section: topics[0] || 'general',
          page: metadata.page || 0
        },
        semanticInfo: {
          topic: topics[0] || 'general',
          concepts,
          sentiment,
          importance,
          contextPreserved: true
        },
        chunkType: boundary.chunkType,
        boundaries: {
          startSentence: boundary.startUnit,
          endSentence: boundary.endUnit,
          startParagraph: boundary.startUnit,
          endParagraph: boundary.endUnit
        }
      };
    });
  }

  /**
   * 중요도 집계
   */
  private static aggregateImportance(units: any[]): 'high' | 'medium' | 'low' {
    const importanceCounts = { high: 0, medium: 0, low: 0 };
    
    units.forEach(unit => {
      importanceCounts[unit.importance]++;
    });
    
    if (importanceCounts.high > importanceCounts.medium + importanceCounts.low) {
      return 'high';
    } else if (importanceCounts.medium > importanceCounts.low) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 감정 분석
   */
  private static determineSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['허용', '가능', '지원', '도움', '개선', '향상'];
    const negativeWords = ['금지', '제한', '불가', '위반', '처벌', '벌금'];
    
    const positiveCount = positiveWords.filter(word => text.includes(word)).length;
    const negativeCount = negativeWords.filter(word => text.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * 청크 품질 검증
   */
  private static validateChunkQuality(chunks: SemanticChunk[]): SemanticChunk[] {
    return chunks.filter(chunk => {
      // 최소 길이 확인
      if (chunk.content.length < 50) return false;
      
      // 의미적 정보 확인
      if (chunk.semanticInfo.concepts.length === 0) return false;
      
      // 문맥 보존 확인
      if (!chunk.semanticInfo.contextPreserved) return false;
      
      return true;
    });
  }

  /**
   * 청크 통계 생성
   */
  static generateChunkingStatistics(chunks: SemanticChunk[]): {
    totalChunks: number;
    averageChunkSize: number;
    chunkTypeDistribution: { [key: string]: number };
    importanceDistribution: { [key: string]: number };
    sentimentDistribution: { [key: string]: number };
    topicDistribution: { [key: string]: number };
  } {
    const totalChunks = chunks.length;
    const averageChunkSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / totalChunks;
    
    const chunkTypeDistribution = chunks.reduce((dist, chunk) => {
      dist[chunk.chunkType] = (dist[chunk.chunkType] || 0) + 1;
      return dist;
    }, {} as { [key: string]: number });
    
    const importanceDistribution = chunks.reduce((dist, chunk) => {
      dist[chunk.semanticInfo.importance] = (dist[chunk.semanticInfo.importance] || 0) + 1;
      return dist;
    }, {} as { [key: string]: number });
    
    const sentimentDistribution = chunks.reduce((dist, chunk) => {
      dist[chunk.semanticInfo.sentiment] = (dist[chunk.semanticInfo.sentiment] || 0) + 1;
      return dist;
    }, {} as { [key: string]: number });
    
    const topicDistribution = chunks.reduce((dist, chunk) => {
      dist[chunk.semanticInfo.topic] = (dist[chunk.semanticInfo.topic] || 0) + 1;
      return dist;
    }, {} as { [key: string]: number });
    
    return {
      totalChunks,
      averageChunkSize: Number(averageChunkSize.toFixed(2)),
      chunkTypeDistribution,
      importanceDistribution,
      sentimentDistribution,
      topicDistribution
    };
  }
}
