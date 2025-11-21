/**
 * 프롬프트 엔지니어링 시스템
 * 질문 유형별 맞춤 프롬프트 생성
 */

import { QuestionAnalysis } from '../types';

export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  complexity: string;
  template: string;
  variables: string[];
  examples: string[];
}

export interface DynamicPrompt {
  systemInstruction: string;
  userPrompt: string;
  contextInstructions: string[];
  answerFormat: string;
  qualityRequirements: string[];
}

export class PromptEngineeringSystem {
  private static readonly PROMPT_TEMPLATES: PromptTemplate[] = [
    {
      id: 'regulation_simple',
      name: '간단한 규정 질문',
      category: 'regulation',
      complexity: 'simple',
      template: `당신은 법령 및 규정 전문가입니다. 다음 질문에 대해 정확하고 간결하게 답변해주세요.

질문: {question}
컨텍스트: {context}

답변 요구사항:
1. 관련 법령 조항을 정확히 인용하세요
2. 간단명료하게 답변하세요
3. 구체적인 예시를 포함하세요

답변:`,
      variables: ['question', 'context'],
      examples: ['내부감사 결과 보고서 작성 기준은 무엇인가요?', '공공기관 회계감사 규정의 주요 내용은 무엇인가요?']
    },
    {
      id: 'regulation_complex',
      name: '복잡한 규정 질문',
      category: 'regulation',
      complexity: 'complex',
      template: `당신은 법령 및 규정 전문가입니다. 다음 복잡한 질문에 대해 종합적이고 상세하게 답변해주세요.

질문: {question}
컨텍스트: {context}

답변 요구사항:
1. 관련 법령 조항을 모두 인용하세요
2. 법령 간의 관계와 적용 범위를 설명하세요
3. 예외 사항과 특별 규정을 포함하세요
4. 실제 적용 사례를 제시하세요
5. 단계별 절차를 명확히 설명하세요

답변 형식:
- 관련 법령: [법령명 및 조항]
- 적용 범위: [적용 대상 및 조건]
- 절차: [단계별 절차]
- 예외 사항: [예외 및 특별 규정]
- 실제 사례: [구체적 사례]

답변:`,
      variables: ['question', 'context'],
      examples: ['내부감사 절차와 관련 법령 간의 관계와 적용 범위는?', '공공기관 회계감사 규정의 예외 사항은?']
    },
    {
      id: 'procedure_simple',
      name: '간단한 절차 질문',
      category: 'procedure',
      complexity: 'simple',
      template: `당신은 행정 절차 전문가입니다. 다음 절차 질문에 대해 단계별로 명확하게 답변해주세요.

질문: {question}
컨텍스트: {context}

답변 요구사항:
1. 절차를 단계별로 나열하세요
2. 필요한 서류와 조건을 명시하세요
3. 소요 기간과 비용을 포함하세요
4. 주의사항을 알려주세요

답변 형식:
1단계: [절차명]
2단계: [절차명]
...
필요 서류: [서류 목록]
소요 기간: [기간]
비용: [비용]
주의사항: [주의사항]

답변:`,
      variables: ['question', 'context'],
      examples: ['내부감사 계획 수립 절차는?', '공공기관 계약 집행에 대한 감사 착수 절차는?']
    },
    {
      id: 'procedure_complex',
      name: '복잡한 절차 질문',
      category: 'procedure',
      complexity: 'complex',
      template: `당신은 행정 절차 전문가입니다. 다음 복잡한 절차 질문에 대해 종합적이고 상세하게 답변해주세요.

질문: {question}
컨텍스트: {context}

답변 요구사항:
1. 전체 절차의 흐름도를 설명하세요
2. 각 단계별 세부 절차를 상세히 설명하세요
3. 병렬 처리 가능한 단계를 구분하세요
4. 예외 상황과 대처 방법을 포함하세요
5. 관련 기관과 연락처를 제공하세요

답변 형식:
## 전체 절차 개요
[절차 흐름 설명]

## 단계별 상세 절차
### 1단계: [단계명]
- 세부 절차: [상세 설명]
- 필요 서류: [서류 목록]
- 소요 기간: [기간]
- 담당 기관: [기관명]

### 2단계: [단계명]
...

## 병렬 처리 가능 단계
[병렬 처리 설명]

## 예외 상황 및 대처 방법
[예외 상황별 대처 방법]

## 관련 기관 연락처
[기관별 연락처]

답변:`,
      variables: ['question', 'context'],
      examples: ['내부감사 계획 수립부터 보고서 제출까지 전체 절차는?', '공공기관 회계감사 실시 및 시정조치 이행 점검 절차는?']
    },
    {
      id: 'comparison_simple',
      name: '간단한 비교 질문',
      category: 'comparison',
      complexity: 'simple',
      template: `당신은 정책 비교 전문가입니다. 다음 비교 질문에 대해 명확하고 객관적으로 답변해주세요.

질문: {question}
컨텍스트: {context}

답변 요구사항:
1. 비교 대상을 명확히 구분하세요
2. 공통점과 차이점을 체계적으로 정리하세요
3. 객관적 사실에 기반하여 답변하세요
4. 간단한 표 형식으로 정리하세요

답변 형식:
## 비교 대상
- A: [대상 A]
- B: [대상 B]

## 공통점
- [공통점 1]
- [공통점 2]
...

## 차이점
| 구분 | A | B |
|------|---|---|
| [구분1] | [A의 특징] | [B의 특징] |
| [구분2] | [A의 특징] | [B의 특징] |
...

답변:`,
      variables: ['question', 'context'],
      examples: ['내부감사와 외부감사의 주요 차이점은?', '정기감사와 수시감사 절차의 차이는?']
    },
    {
      id: 'comparison_complex',
      name: '복잡한 비교 질문',
      category: 'comparison',
      complexity: 'complex',
      template: `당신은 정책 비교 전문가입니다. 다음 복잡한 비교 질문에 대해 종합적이고 상세하게 답변해주세요.

질문: {question}
컨텍스트: {context}

답변 요구사항:
1. 비교 대상을 다각도로 분석하세요
2. 법적 근거, 시행 절차, 효과 등을 모두 비교하세요
3. 장단점을 객관적으로 평가하세요
4. 실제 사례를 통해 비교하세요
5. 향후 개선 방안을 제시하세요

답변 형식:
## 비교 대상 개요
[각 대상의 기본 정보]

## 법적 근거 비교
| 구분 | A | B |
|------|---|---|
| 근거 법령 | [법령 A] | [법령 B] |
| 적용 범위 | [범위 A] | [범위 B] |
| 강제력 | [강제력 A] | [강제력 B] |

## 시행 절차 비교
[각 대상의 시행 절차 상세 비교]

## 효과 및 성과 비교
[각 대상의 효과 분석]

## 장단점 분석
### A의 장단점
- 장점: [장점 목록]
- 단점: [단점 목록]

### B의 장단점
- 장점: [장점 목록]
- 단점: [단점 목록]

## 실제 사례 비교
[구체적 사례를 통한 비교]

## 향후 개선 방안
[개선 방안 제시]

답변:`,
      variables: ['question', 'context'],
      examples: ['내부감사와 외부감사의 역할과 책임에 대한 종합적 비교는?', '국내 공공기관 회계감사 제도와 해외 사례의 효과 비교는?']
    },
    {
      id: 'definition_simple',
      name: '간단한 정의 질문',
      category: 'definition',
      complexity: 'simple',
      template: `당신은 용어 정의 전문가입니다. 다음 정의 질문에 대해 정확하고 이해하기 쉽게 답변해주세요.

질문: {question}
컨텍스트: {context}

답변 요구사항:
1. 용어의 정확한 정의를 제공하세요
2. 간단한 설명을 포함하세요
3. 관련 용어와의 관계를 설명하세요
4. 구체적인 예시를 제시하세요

답변 형식:
## 정의
[용어의 정확한 정의]

## 설명
[용어에 대한 간단한 설명]

## 관련 용어
- [관련 용어 1]: [설명]
- [관련 용어 2]: [설명]
...

## 예시
[구체적인 예시]

답변:`,
      variables: ['question', 'context'],
      examples: ['내부감사란 무엇인가요?', '공공기관의 운영에 관한 법률상 공공기관의 정의는 무엇인가요?']
    },
    {
      id: 'definition_complex',
      name: '복잡한 정의 질문',
      category: 'definition',
      complexity: 'complex',
      template: `당신은 용어 정의 전문가입니다. 다음 복잡한 정의 질문에 대해 종합적이고 상세하게 답변해주세요.

질문: {question}
컨텍스트: {context}

답변 요구사항:
1. 용어의 다각도 정의를 제공하세요
2. 법적 정의와 일반적 정의를 구분하세요
3. 역사적 배경과 발전 과정을 설명하세요
4. 관련 개념들과의 관계를 체계적으로 설명하세요
5. 실제 적용 사례를 다각도로 제시하세요

답변 형식:
## 법적 정의
[법령상 정의]

## 일반적 정의
[일반적으로 사용되는 정의]

## 역사적 배경
[용어의 등장 배경과 발전 과정]

## 관련 개념 체계
[관련 개념들과의 관계도]

## 적용 범위
[적용되는 범위와 조건]

## 실제 사례
[다양한 적용 사례]

## 최근 동향
[최근 변화와 발전 방향]

답변:`,
      variables: ['question', 'context'],
      examples: ['내부감사 제도의 종합적 정의와 발전 과정은?', '공공기관 회계감사의 법적 정의와 실제 적용은?']
    }
  ];

  /**
   * 동적 프롬프트 생성
   */
  static generateDynamicPrompt(
    questionAnalysis: QuestionAnalysis,
    contextText: string,
    customInstructions?: string[]
  ): DynamicPrompt {
    console.log(`🔄 동적 프롬프트 생성: ${questionAnalysis.category}/${questionAnalysis.complexity}`);
    
    // 적절한 템플릿 선택
    const template = this.selectPromptTemplate(questionAnalysis);
    
    // 시스템 지시사항 생성
    const systemInstruction = this.generateSystemInstruction(template, questionAnalysis);
    
    // 사용자 프롬프트 생성
    const userPrompt = this.generateUserPrompt(template, questionAnalysis, contextText);
    
    // 컨텍스트 지시사항 생성
    const contextInstructions = this.generateContextInstructions(questionAnalysis);
    
    // 답변 형식 생성
    const answerFormat = this.generateAnswerFormat(template, questionAnalysis);
    
    // 품질 요구사항 생성
    const qualityRequirements = this.generateQualityRequirements(template, questionAnalysis);
    
    // 커스텀 지시사항 추가
    if (customInstructions) {
      contextInstructions.push(...customInstructions);
    }
    
    return {
      systemInstruction,
      userPrompt,
      contextInstructions,
      answerFormat,
      qualityRequirements
    };
  }

  /**
   * 프롬프트 템플릿 선택
   */
  private static selectPromptTemplate(questionAnalysis: QuestionAnalysis): PromptTemplate {
    const category = questionAnalysis.category;
    const complexity = questionAnalysis.complexity;
    
    // 정확한 매칭 시도
    let template = this.PROMPT_TEMPLATES.find(t => 
      t.category === category && t.complexity === complexity
    );
    
    // 정확한 매칭이 없으면 카테고리만 매칭
    if (!template) {
      template = this.PROMPT_TEMPLATES.find(t => t.category === category);
    }
    
    // 여전히 없으면 기본 템플릿 사용
    if (!template) {
      template = this.PROMPT_TEMPLATES.find(t => 
        t.category === 'regulation' && t.complexity === 'simple'
      ) || this.PROMPT_TEMPLATES[0];
    }
    
    console.log(`📋 선택된 템플릿: ${template.name}`);
    return template;
  }

  /**
   * 시스템 지시사항 생성
   */
  private static generateSystemInstruction(
    template: PromptTemplate,
    questionAnalysis: QuestionAnalysis
  ): string {
    const baseInstruction = `당신은 법령 및 규정 전문가입니다. 사용자의 질문에 대해 정확하고 신뢰할 수 있는 답변을 제공해야 합니다.

## 전문성 요구사항
- 관련 법령과 규정을 정확히 인용하세요
- 사실에 기반한 객관적인 답변을 제공하세요
- 불확실한 정보는 추측하지 말고 명시하세요
- 사용자가 이해하기 쉽게 설명하세요

## 답변 품질 기준
- 정확성: 법령과 규정을 정확히 인용
- 완성성: 질문의 모든 측면을 다룸
- 명확성: 이해하기 쉬운 언어 사용
- 관련성: 질문과 직접 관련된 정보만 포함
- 일관성: 논리적 일관성 유지`;

    const categorySpecific = this.getCategorySpecificInstructions(questionAnalysis.category);
    const complexitySpecific = this.getComplexitySpecificInstructions(questionAnalysis.complexity);
    
    return `${baseInstruction}

${categorySpecific}

${complexitySpecific}`;
  }

  /**
   * 사용자 프롬프트 생성
   */
  private static generateUserPrompt(
    template: PromptTemplate,
    questionAnalysis: QuestionAnalysis,
    contextText: string
  ): string {
    return template.template
      .replace('{question}', questionAnalysis.context)
      .replace('{context}', contextText.substring(0, 2000)); // 컨텍스트 길이 제한
  }

  /**
   * 컨텍스트 지시사항 생성
   */
  private static generateContextInstructions(questionAnalysis: QuestionAnalysis): string[] {
    const instructions: string[] = [];
    
    // 카테고리별 지시사항
    switch (questionAnalysis.category) {
      case 'regulation':
        instructions.push('관련 법령 조항을 정확히 인용하세요');
        instructions.push('법령의 적용 범위와 조건을 명시하세요');
        break;
      case 'procedure':
        instructions.push('절차를 단계별로 명확히 설명하세요');
        instructions.push('필요한 서류와 조건을 포함하세요');
        break;
      case 'comparison':
        instructions.push('비교 대상을 명확히 구분하세요');
        instructions.push('공통점과 차이점을 체계적으로 정리하세요');
        break;
      case 'definition':
        instructions.push('용어의 정확한 정의를 제공하세요');
        instructions.push('관련 용어와의 관계를 설명하세요');
        break;
    }
    
    // 복잡도별 지시사항
    if (questionAnalysis.complexity === 'complex') {
      instructions.push('다각도로 분석하여 종합적인 답변을 제공하세요');
      instructions.push('실제 사례와 예시를 포함하세요');
    }
    
    return instructions;
  }

  /**
   * 답변 형식 생성
   */
  private static generateAnswerFormat(
    template: PromptTemplate,
    questionAnalysis: QuestionAnalysis
  ): string {
    const baseFormat = '명확하고 구조화된 답변을 제공하세요';
    
    if (questionAnalysis.category === 'procedure') {
      return `${baseFormat}. 단계별로 나열하고 필요한 정보를 포함하세요`;
    } else if (questionAnalysis.category === 'comparison') {
      return `${baseFormat}. 표나 목록을 사용하여 비교 정보를 정리하세요`;
    } else if (questionAnalysis.complexity === 'complex') {
      return `${baseFormat}. 섹션별로 나누어 상세하게 설명하세요`;
    }
    
    return baseFormat;
  }

  /**
   * 품질 요구사항 생성
   */
  private static generateQualityRequirements(
    template: PromptTemplate,
    questionAnalysis: QuestionAnalysis
  ): string[] {
    const requirements: string[] = [
      '제공된 자료에 기반한 정확한 답변',
      '질문의 모든 측면을 다루는 완전한 답변',
      '이해하기 쉬운 명확한 언어 사용',
      '논리적 일관성 유지'
    ];
    
    if (questionAnalysis.category === 'regulation') {
      requirements.push('법령 조항의 정확한 인용');
    }
    
    if (questionAnalysis.complexity === 'complex') {
      requirements.push('다각도 분석과 종합적 접근');
      requirements.push('실제 사례와 구체적 예시 포함');
    }
    
    return requirements;
  }

  /**
   * 카테고리별 특화 지시사항
   */
  private static getCategorySpecificInstructions(category: string): string {
    switch (category) {
      case 'regulation':
        return `## 법령 전문가로서의 역할
- 관련 법령과 규정을 정확히 인용하세요
- 법령의 적용 범위와 조건을 명확히 설명하세요
- 예외 사항과 특별 규정을 포함하세요`;
      case 'procedure':
        return `## 절차 전문가로서의 역할
- 단계별 절차를 명확히 설명하세요
- 필요한 서류와 조건을 구체적으로 제시하세요
- 소요 기간과 비용 정보를 포함하세요`;
      case 'comparison':
        return `## 비교 분석 전문가로서의 역할
- 비교 대상을 명확히 구분하세요
- 객관적이고 균형 잡힌 관점을 유지하세요
- 공통점과 차이점을 체계적으로 정리하세요`;
      case 'definition':
        return `## 용어 정의 전문가로서의 역할
- 용어의 정확한 정의를 제공하세요
- 법적 정의와 일반적 정의를 구분하세요
- 관련 용어와의 관계를 설명하세요`;
      default:
        return `## 일반 전문가로서의 역할
- 정확하고 신뢰할 수 있는 정보를 제공하세요
- 사용자가 이해하기 쉽게 설명하세요`;
    }
  }

  /**
   * 복잡도별 특화 지시사항
   */
  private static getComplexitySpecificInstructions(complexity: string): string {
    switch (complexity) {
      case 'complex':
        return `## 복잡한 질문 처리
- 다각도로 분석하여 종합적인 답변을 제공하세요
- 관련된 모든 측면을 고려하세요
- 실제 사례와 구체적 예시를 포함하세요
- 단계별로 체계적으로 설명하세요`;
      case 'simple':
        return `## 간단한 질문 처리
- 핵심 내용을 간결하게 설명하세요
- 이해하기 쉬운 언어를 사용하세요
- 구체적인 예시를 포함하세요`;
      default:
        return `## 일반 질문 처리
- 질문의 의도를 정확히 파악하세요
- 적절한 수준의 상세함을 유지하세요`;
    }
  }

  /**
   * 프롬프트 통계 생성
   */
  static generatePromptStatistics(): {
    totalTemplates: number;
    categoryDistribution: { [key: string]: number };
    complexityDistribution: { [key: string]: number };
    templateUsage: { [key: string]: number };
  } {
    const totalTemplates = this.PROMPT_TEMPLATES.length;
    
    const categoryDistribution = this.PROMPT_TEMPLATES.reduce((dist, template) => {
      dist[template.category] = (dist[template.category] || 0) + 1;
      return dist;
    }, {} as { [key: string]: number });
    
    const complexityDistribution = this.PROMPT_TEMPLATES.reduce((dist, template) => {
      dist[template.complexity] = (dist[template.complexity] || 0) + 1;
      return dist;
    }, {} as { [key: string]: number });
    
    const templateUsage = this.PROMPT_TEMPLATES.reduce((usage, template) => {
      usage[template.id] = 0; // 실제 사용량은 런타임에 추적
      return usage;
    }, {} as { [key: string]: number });
    
    return {
      totalTemplates,
      categoryDistribution,
      complexityDistribution,
      templateUsage
    };
  }
}
