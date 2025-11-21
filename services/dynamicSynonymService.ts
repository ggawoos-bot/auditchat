/**
 * 동적 동의어 서비스
 * PDF 기반 포괄적 동의어 사전을 활용한 동적 키워드 확장
 */

export interface DynamicSynonymMapping {
  [key: string]: string[];
}

export interface SynonymDictionaryMetadata {
  totalKeywords: number;
  totalSynonyms: number;
  createdAt: string;
  version: string;
}

export interface ComprehensiveSynonymDictionary {
  metadata: SynonymDictionaryMetadata;
  keywords: string[];
  synonymMappings: DynamicSynonymMapping;
}

export class DynamicSynonymService {
  private static instance: DynamicSynonymService;
  private synonymMappings: Map<string, string[]> = new Map();
  private keywordIndex: Set<string> = new Set();
  private isLoaded: boolean = false;

  private constructor() {
    this.loadComprehensiveDictionary();
  }

  public static getInstance(): DynamicSynonymService {
    if (!DynamicSynonymService.instance) {
      DynamicSynonymService.instance = new DynamicSynonymService();
    }
    return DynamicSynonymService.instance;
  }

  /**
   * 포괄적 동의어 사전 로드
   */
  private async loadComprehensiveDictionary(): Promise<void> {
    try {
      console.log('📚 포괄적 동의어 사전 로드 중...');
      
      // fetch를 사용하여 JSON 파일 로드
      const response = await fetch('/data/comprehensive-synonym-dictionary.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const dictionary: ComprehensiveSynonymDictionary = await response.json();
      
      // 키워드 인덱스 구축
      dictionary.keywords.forEach(keyword => {
        this.keywordIndex.add(keyword);
      });
      
      // 동의어 매핑 로드
      Object.entries(dictionary.synonymMappings).forEach(([keyword, synonyms]) => {
        this.synonymMappings.set(keyword, synonyms);
      });
      
      this.isLoaded = true;
      console.log(`✅ 동의어 사전 로드 완료: ${this.keywordIndex.size}개 키워드, ${this.synonymMappings.size}개 매핑`);
    } catch (error) {
      console.warn('⚠️ 포괄적 동의어 사전 로드 실패, 기본 동의어 사용:', error);
      this.loadFallbackSynonyms();
    }
  }

  /**
   * 폴백 동의어 로드 (사전이 없을 때)
   */
  private loadFallbackSynonyms(): void {
    console.log('🔄 기본 동의어 사전 로드 중...');
    
    const fallbackSynonyms: DynamicSynonymMapping = {
      '내부감사': ['감사', '내부감사', '감사업무', '감사활동', '정기감사', '수시감사', '특별감사', '감사계획', '감사범위', '감사대상', '감사절차', '감사보고서', '감사의견', '지적사항', '시정조치'],
      '재무제표': ['회계자료', '재무자료', '결산자료', '장부', '계정과목', '재무상태표', '손익계산서', '현금흐름표'],
      '법령': ['법규', '규정', '조항', '법률', '시행령', '시행규칙', '조례', '고시', '공고', '행정규칙'],
      '위반': ['위배', '위법', '불법', '금지행위', '규정위반', '법규위반', '위반행위'],
      '벌금': ['과태료', '처벌', '제재', '벌칙', '과징금', '징벌금', '벌과금'],
      '신고': ['제보', '고발', '신청', '접수', '제출', '보고', '통보'],
      '관리': ['운영', '관할', '담당', '처리', '시행', '유지', '보수', '감독'],
      '시설': ['장소', '공간', '건물', '시설물', '설비', '기관', '센터', '관', '소', '원', '실', '홀']
    };

    Object.entries(fallbackSynonyms).forEach(([keyword, synonyms]) => {
      this.keywordIndex.add(keyword);
      this.synonymMappings.set(keyword, synonyms);
    });

    this.isLoaded = true;
    console.log(`✅ 기본 동의어 사전 로드 완료: ${this.keywordIndex.size}개 키워드`);
  }

  /**
   * 키워드 확장 (동의어 포함)
   */
  public expandKeywords(keywords: string[]): string[] {
    if (!this.isLoaded) {
      console.warn('⚠️ 동의어 사전이 로드되지 않았습니다.');
      return keywords;
    }

    const expandedKeywords = new Set<string>();
    
    keywords.forEach(keyword => {
      // 원본 키워드 추가
      expandedKeywords.add(keyword);
      
      // 직접 동의어 추가
      const directSynonyms = this.synonymMappings.get(keyword);
      if (directSynonyms) {
        directSynonyms.forEach(synonym => expandedKeywords.add(synonym));
      }
      
      // 부분 매칭 검색
      this.findPartialMatches(keyword).forEach(match => {
        expandedKeywords.add(match);
        const synonyms = this.synonymMappings.get(match);
        if (synonyms) {
          synonyms.forEach(synonym => expandedKeywords.add(synonym));
        }
      });
    });
    
    return Array.from(expandedKeywords);
  }

  /**
   * 부분 매칭 검색
   */
  private findPartialMatches(keyword: string): string[] {
    const matches = new Set<string>();
    
    this.keywordIndex.forEach(indexedKeyword => {
      if (indexedKeyword.includes(keyword) || keyword.includes(indexedKeyword)) {
        matches.add(indexedKeyword);
      }
    });
    
    return Array.from(matches);
  }

  /**
   * 관련성 점수 계산
   */
  public calculateRelevanceScore(keyword: string, targetKeywords: string[]): number {
    if (!this.isLoaded) {
      return 0;
    }

    const expandedTargetKeywords = this.expandKeywords(targetKeywords);
    const expandedKeyword = this.expandKeywords([keyword]);
    
    const intersection = new Set(
      expandedTargetKeywords.filter(k => expandedKeyword.includes(k))
    );
    const union = new Set([...expandedTargetKeywords, ...expandedKeyword]);
    
    return intersection.size / union.size;
  }

  /**
   * 키워드 존재 여부 확인
   */
  public hasKeyword(keyword: string): boolean {
    return this.keywordIndex.has(keyword);
  }

  /**
   * 키워드의 동의어 조회
   */
  public getSynonyms(keyword: string): string[] {
    return this.synonymMappings.get(keyword) || [];
  }

  /**
   * 통계 정보 조회
   */
  public getStatistics(): {
    totalKeywords: number;
    totalMappings: number;
    averageSynonymsPerKeyword: number;
    isLoaded: boolean;
  } {
    const totalSynonyms = Array.from(this.synonymMappings.values())
      .reduce((sum, synonyms) => sum + synonyms.length, 0);
    
    return {
      totalKeywords: this.keywordIndex.size,
      totalMappings: this.synonymMappings.size,
      averageSynonymsPerKeyword: this.synonymMappings.size > 0 ? totalSynonyms / this.synonymMappings.size : 0,
      isLoaded: this.isLoaded
    };
  }

  /**
   * 특정 도메인의 키워드만 확장
   */
  public expandKeywordsByDomain(keywords: string[], domain: string): string[] {
    if (!this.isLoaded) {
      return keywords;
    }

    const domainKeywords = this.getDomainKeywords(domain);
    const expandedKeywords = new Set<string>();
    
    keywords.forEach(keyword => {
      expandedKeywords.add(keyword);
      
      // 도메인 내에서만 동의어 검색
      if (domainKeywords.includes(keyword)) {
        const synonyms = this.synonymMappings.get(keyword);
        if (synonyms) {
          synonyms.forEach(synonym => expandedKeywords.add(synonym));
        }
      }
    });
    
    return Array.from(expandedKeywords);
  }

  /**
   * 도메인별 키워드 조회
   */
  private getDomainKeywords(domain: string): string[] {
    const domainMappings: { [key: string]: string[] } = {
      'legal': ['법령', '법규', '규정', '조항', '법률', '시행령', '시행규칙', '조례', '고시', '공고'],
      'facilities': ['시설', '센터', '관', '장', '원', '소', '실', '홀', '건물', '공간'],
      'health': ['건강', '보건', '위생', '질병', '예방', '건강관리', '의료', '치료'],
      'education': ['교육', '훈련', '연수', '학습', '지도', '계몽', '교육프로그램', '학교', '학원'],
      'administration': ['행정', '관리', '운영', '처리', '시행', '집행', '수행', '운영방안'],
      'audit': ['내부감사', '감사', '감사업무', '감사활동', '감사계획', '감사범위', '감사대상', '감사절차', '감사보고서', '감사의견']
    };

    return domainMappings[domain] || [];
  }

  /**
   * 키워드 검색 (부분 매칭)
   */
  public searchKeywords(query: string): string[] {
    if (!this.isLoaded) {
      return [];
    }

    const results = new Set<string>();
    
    this.keywordIndex.forEach(keyword => {
      if (keyword.includes(query) || query.includes(keyword)) {
        results.add(keyword);
      }
    });
    
    return Array.from(results);
  }

  /**
   * 동의어 사전 새로고침
   */
  public async refreshDictionary(): Promise<void> {
    console.log('🔄 동의어 사전 새로고침 중...');
    this.synonymMappings.clear();
    this.keywordIndex.clear();
    this.isLoaded = false;
    await this.loadComprehensiveDictionary();
  }
}
