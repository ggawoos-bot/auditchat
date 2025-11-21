import { AIKeywordExpansionService, KeywordExpansionResult } from './aiKeywordExpansionService';

export interface SynonymMapping {
  [key: string]: string[];
}

export interface DomainMapping {
  [domain: string]: SynonymMapping;
}

export class UnifiedSynonymService {
  private static instance: UnifiedSynonymService;
  private synonymCache: Map<string, string[]> = new Map();
  private domainMappings: DomainMapping = {};
  private aiExpansionService: AIKeywordExpansionService = AIKeywordExpansionService.getInstance();

  private constructor() {
    this.initializeComprehensiveSynonyms();
  }

  public static getInstance(): UnifiedSynonymService {
    if (!UnifiedSynonymService.instance) {
      UnifiedSynonymService.instance = new UnifiedSynonymService();
    }
    return UnifiedSynonymService.instance;
  }

  /**
   * 포괄적인 동의어 사전 초기화
   */
  private initializeComprehensiveSynonyms(): void {
    // 기본 동의어 매핑
    this.domainMappings['basic'] = this.getBasicSynonyms();
    
    // 시설 관련 동의어
    this.domainMappings['facilities'] = this.getFacilitySynonyms();
    
    // 법령 관련 동의어
    this.domainMappings['legal'] = this.getLegalSynonyms();
    
    // 행정 절차 관련 동의어
    this.domainMappings['administrative'] = this.getAdministrativeSynonyms();
    
    // 금연 관련 동의어
    this.domainMappings['smoking'] = this.getSmokingSynonyms();
    
    // 건강 관련 동의어
    this.domainMappings['health'] = this.getHealthSynonyms();
    
    // 교육 관련 동의어
    this.domainMappings['education'] = this.getEducationSynonyms();
    
    // 의료 관련 동의어
    this.domainMappings['medical'] = this.getMedicalSynonyms();
    
    // 공공시설 관련 동의어
    this.domainMappings['public'] = this.getPublicFacilitySynonyms();
    
    // 상업시설 관련 동의어
    this.domainMappings['commercial'] = this.getCommercialFacilitySynonyms();
    
    // 주거 관련 동의어
    this.domainMappings['residential'] = this.getResidentialSynonyms();
    
    // 교통 관련 동의어
    this.domainMappings['transportation'] = this.getTransportationSynonyms();
    
    // 문화시설 관련 동의어
    this.domainMappings['cultural'] = this.getCulturalFacilitySynonyms();
    
    // 종교시설 관련 동의어
    this.domainMappings['religious'] = this.getReligiousFacilitySynonyms();
    
    // 금융시설 관련 동의어
    this.domainMappings['financial'] = this.getFinancialFacilitySynonyms();
    
    // 숙박시설 관련 동의어
    this.domainMappings['accommodation'] = this.getAccommodationSynonyms();
    
    // 위반/처벌 관련 동의어
    this.domainMappings['violation'] = this.getViolationSynonyms();
    
    // 신고/신청 관련 동의어
    this.domainMappings['reporting'] = this.getReportingSynonyms();
    
    // 관리/운영 관련 동의어
    this.domainMappings['management'] = this.getManagementSynonyms();
  }

  /**
   * AI 기반 키워드 확장 (고급 기능)
   */
  async expandKeywordsWithAI(keywords: string[], context?: string): Promise<string[]> {
    const expandedKeywords: string[] = [];
    
    for (const keyword of keywords) {
      // 캐시 확인
      const cached = this.synonymCache.get(keyword);
      if (cached) {
        expandedKeywords.push(...cached);
        continue;
      }
      
      // AI 기반 확장
      const aiResult = await this.aiExpansionService.expandKeywordHybrid(keyword, context);
      const aiExpanded = aiResult.expandedKeywords;
      
      // 기본 확장과 AI 확장 통합
      const basicExpanded = this.expandKeywords([keyword]);
      const allExpanded = [...new Set([...basicExpanded, ...aiExpanded])];
      
      // 캐시 저장
      this.synonymCache.set(keyword, allExpanded);
      expandedKeywords.push(...allExpanded);
    }
    
    return [...new Set(expandedKeywords)]; // 중복 제거
  }

  /**
   * 사용자 피드백 학습
   */
  learnFromUserFeedback(
    keyword: string,
    searchResults: string[],
    userSatisfaction: number,
    context: string
  ): void {
    this.aiExpansionService.learnFromFeedback(
      keyword,
      searchResults,
      userSatisfaction,
      context
    );
  }

  /**
   * 학습 통계 조회
   */
  getLearningStats(): { totalKeywords: number; avgConfidence: number; recentLearning: number } {
    return this.aiExpansionService.getLearningStats();
  }

  /**
   * 키워드 확장 (모든 도메인에서 검색)
   */
  public expandKeywords(keywords: string[]): string[] {
    const expandedKeywords: string[] = [];
    
    keywords.forEach(keyword => {
      // 원본 키워드 추가
      expandedKeywords.push(keyword);
      
      // 모든 도메인에서 동의어 검색
      Object.values(this.domainMappings).forEach(domainMapping => {
        if (domainMapping[keyword]) {
          expandedKeywords.push(...domainMapping[keyword]);
        }
      });
      
      // 부분 매칭 검색 (키워드가 다른 키워드에 포함되는 경우)
      Object.values(this.domainMappings).forEach(domainMapping => {
        Object.entries(domainMapping).forEach(([key, synonyms]) => {
          if (key.includes(keyword) || keyword.includes(key)) {
            expandedKeywords.push(key, ...synonyms);
          }
        });
      });
    });
    
    // 중복 제거 및 정렬
    return [...new Set(expandedKeywords)].sort();
  }

  /**
   * 특정 도메인에서만 키워드 확장
   */
  public expandKeywordsByDomain(keywords: string[], domain: string): string[] {
    const expandedKeywords: string[] = [];
    const domainMapping = this.domainMappings[domain];
    
    if (!domainMapping) {
      return keywords;
    }
    
    keywords.forEach(keyword => {
      expandedKeywords.push(keyword);
      if (domainMapping[keyword]) {
        expandedKeywords.push(...domainMapping[keyword]);
      }
    });
    
    return [...new Set(expandedKeywords)];
  }

  /**
   * 키워드 관련성 점수 계산
   */
  public calculateRelevanceScore(keyword: string, targetKeywords: string[]): number {
    const expanded = this.expandKeywords([keyword]);
    const matches = targetKeywords.filter(target => 
      expanded.includes(target) || target.includes(keyword)
    );
    return matches.length / targetKeywords.length;
  }

  /**
   * 캐시된 동의어 조회
   */
  public getCachedSynonyms(keyword: string): string[] | null {
    return this.synonymCache.get(keyword) || null;
  }

  /**
   * 동의어 캐시 저장
   */
  public setCachedSynonyms(keyword: string, synonyms: string[]): void {
    this.synonymCache.set(keyword, synonyms);
  }

  /**
   * 모든 도메인 목록 조회
   */
  public getAvailableDomains(): string[] {
    return Object.keys(this.domainMappings);
  }

  /**
   * 특정 도메인의 동의어 매핑 조회
   */
  public getDomainMapping(domain: string): SynonymMapping | null {
    return this.domainMappings[domain] || null;
  }

  // 나머지 메서드들은 다음 파일에서 계속 구현...
  private getBasicSynonyms(): SynonymMapping { return {}; }
  private getFacilitySynonyms(): SynonymMapping { return {}; }
  private getLegalSynonyms(): SynonymMapping { return {}; }
  private getAdministrativeSynonyms(): SynonymMapping { return {}; }
  private getSmokingSynonyms(): SynonymMapping { return {}; }
  private getHealthSynonyms(): SynonymMapping { return {}; }
  private getEducationSynonyms(): SynonymMapping { return {}; }
  private getMedicalSynonyms(): SynonymMapping { return {}; }
  private getPublicFacilitySynonyms(): SynonymMapping { return {}; }
  private getCommercialFacilitySynonyms(): SynonymMapping { return {}; }
  private getResidentialSynonyms(): SynonymMapping { return {}; }
  private getTransportationSynonyms(): SynonymMapping { return {}; }
  private getCulturalFacilitySynonyms(): SynonymMapping { return {}; }
  private getReligiousFacilitySynonyms(): SynonymMapping { return {}; }
  private getFinancialFacilitySynonyms(): SynonymMapping { return {}; }
  private getAccommodationSynonyms(): SynonymMapping { return {}; }
  private getViolationSynonyms(): SynonymMapping { return {}; }
  private getReportingSynonyms(): SynonymMapping { return {}; }
  private getManagementSynonyms(): SynonymMapping { return {}; }
}
