import React, { useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message as MessageType } from '../types';
import { useTooltip } from './TooltipContext';
import UserIcon from './icons/UserIcon';
import BotIcon from './icons/BotIcon';
import CopyIcon from './icons/CopyIcon';

interface MessageProps {
  message: MessageType;
  allMessages?: MessageType[];
  messageIndex?: number;
  theme?: 'light' | 'dark';
}

const Message: React.FC<MessageProps> = ({ message, allMessages = [], messageIndex = -1, theme = 'dark' }) => {
  const isUser = message.role === 'user';
  const Icon = isUser ? UserIcon : BotIcon;
  const [isCopied, setIsCopied] = useState(false);
  
  // ✅ 전역 툴팁 관리자 사용
  const { showTooltip, hideTooltip } = useTooltip();
  
  // ✅ 디바운스를 위한 ref
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // ✅ 원숫자 변환 함수 (35개까지 지원)
  const getCircleNumber = (num: number): string => {
    const circleNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', 
                          '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
                          '㉑', '㉒', '㉓', '㉔', '㉕', '㉖', '㉗', '㉘', '㉙', '㉚',
                          '㉛', '㉜', '㉝', '㉞', '㉟'];
    return num >= 1 && num <= 35 ? circleNumbers[num - 1] : '';
  };

  // ✅ AI 응답 전처리: [참조 X] 형식 및 일반 텍스트 참조 번호를 **X** 형식으로 변환
  const preprocessResponse = (content: string): string => {
    if (!content || isUser) return content;
    
    let processed = content;
    
    // 1. [참조 X] 또는 [참조 X, Y, Z] 형식을 **X** 또는 **X Y Z** 형식으로 변환
    processed = processed.replace(/\[참조\s+(\d+(?:\s*,\s*\d+)*)\]/g, (match, numbers) => {
      const numList = numbers.split(/\s*,\s*/).map((n: string) => n.trim()).join(' ');
      return `**${numList}**`;
    });
    
    // 2. ✅ 개선: 일반 텍스트에서 참조 번호 패턴 찾아서 **숫자** 형식으로 변환
    // chunkReferences에 있는 숫자 범위 내에서만 변환 (오탐 방지)
    if (message.chunkReferences && message.chunkReferences.length > 0) {
      const validRefNumbers = new Set<number>();
      message.chunkReferences.forEach((ref: any, index: number) => {
        const refNum = ref.refId || (index + 1);
        if (refNum >= 1 && refNum <= 35) {
          validRefNumbers.add(refNum);
        }
      });
      
      if (validRefNumbers.size > 0) {
        // 우선순위: 더 구체적인 패턴부터 처리 (큰 숫자부터 처리하여 오버랩 방지)
        const refNumbersArray = Array.from(validRefNumbers).sort((a, b) => b - a);
        
        refNumbersArray.forEach(refNum => {
          const numStr = String(refNum);
          
          // 패턴 1: 숫자 뒤 점/쉼표 (가장 일반적) - 예: "9.", "14,", "15."
          // 단, 이미 **숫자** 형식이 아니고, 문맥상 참조 번호로 보이는 경우만
          const pattern1 = new RegExp(`(\\s|^|\\()(${refNum})([.,])(?=\\s|$|[^\\d*])`, 'g');
          // 모든 매칭을 먼저 찾고 역순으로 처리 (문자열 변경 시 인덱스 오류 방지)
          const matches1: Array<{index: number, match: RegExpMatchArray, before: string, num: string, punct: string}> = [];
          let match1;
          while ((match1 = pattern1.exec(processed)) !== null) {
            const matchIndex = match1.index;
            const beforeText = processed.substring(Math.max(0, matchIndex - 2), matchIndex);
            // 이미 **숫자** 형식이 아니면 변환 대상에 추가
            if (!beforeText.includes('**')) {
              matches1.push({
                index: matchIndex,
                match: match1,
                before: match1[1],
                num: match1[2],
                punct: match1[3]
              });
            }
          }
          // 역순으로 처리하여 인덱스 오류 방지
          matches1.reverse().forEach(({index, before, num, punct, match}) => {
            const replacement = `${before}**${num}**${punct}`;
            processed = processed.substring(0, index) + replacement + processed.substring(index + match[0].length);
          });
          
          // 패턴 2: 괄호 안의 숫자 (예: "(19)", "(제20호)")
          const pattern2 = new RegExp(`\\(제?(${refNum})(?:호|항)?\\)`, 'g');
          processed = processed.replace(pattern2, (match, num) => {
            // 이미 **숫자** 형식이면 건너뛰기
            if (match.includes('**')) {
              return match;
            }
            return `(**${num}**)`;
          });
          
          // 패턴 3: "제숫자호" 형식 (예: "제20호")
          const pattern3 = new RegExp(`제(${refNum})(?:호|항)`, 'g');
          processed = processed.replace(pattern3, (match, num) => {
            // 이미 **숫자** 형식이면 건너뛰기
            if (match.includes('**')) {
              return match;
            }
            return `제**${num}**호`;
          });
          
          // 패턴 4: 문장 내 단독 숫자 (공백으로 구분된 경우만)
          // 예: " ... 14, 15. ..." -> " ... **14**, **15.** ..."
          // 단, 이미 **숫자** 형식이 아니고, 다른 숫자와 인접하지 않은 경우만
          const pattern4 = new RegExp(`(\\s|^|\\()(${refNum})(?=\\s|$|[.,]|[^\\d*])`, 'g');
          const matches4: Array<{index: number, match: RegExpMatchArray, before: string, num: string}> = [];
          let match4;
          while ((match4 = pattern4.exec(processed)) !== null) {
            const matchIndex = match4.index;
            const beforeText = processed.substring(Math.max(0, matchIndex - 2), matchIndex);
            const matchText = match4[0];
            // 이미 **숫자** 형식이 아니고, 패턴 1로 변환되지 않았으면 변환 대상에 추가
            if (!beforeText.includes('**') && !matchText.includes('**')) {
              matches4.push({
                index: matchIndex,
                match: match4,
                before: match4[1],
                num: match4[2]
              });
            }
          }
          // 역순으로 처리하여 인덱스 오류 방지
          matches4.reverse().forEach(({index, before, num, match}) => {
            const replacement = `${before}**${num}**`;
            processed = processed.substring(0, index) + replacement + processed.substring(index + match[0].length);
          });
        });
      }
    }
    
    return processed;
  };

  // ✅ 키워드 하이라이트 함수
  const highlightKeywords = (text: string, keywords?: string[]) => {
    if (!keywords || keywords.length === 0) return text;
    
    let highlightedText = text;
    keywords.forEach(keyword => {
      // 특수문자 이스케이프
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 대소문자 무시하고 하이라이트
      const regex = new RegExp(`(${escapedKeyword})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 font-semibold">$1</mark>');
    });
    
    return highlightedText;
  };

  // ✅ AI 응답에서 참조 번호 주변 문장 추출 (툴팁용)
  const extractSentenceFromResponseForTooltip = (responseText: string, referenceNumber: number): string | null => {
    if (!responseText || referenceNumber <= 0) return null;
    
    const boldPattern = new RegExp(`\\*\\*${referenceNumber}\\*\\*`, 'g');
    const bracketPattern = new RegExp(`\\[참조\\s+${referenceNumber}\\b[^\\]]*\\]`, 'g'); // [참조 14] 또는 [참조 14, 15] 형식
    const circleNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', 
                          '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
                          '㉑', '㉒', '㉓', '㉔', '㉕', '㉖', '㉗', '㉘', '㉙', '㉚',
                          '㉛', '㉜', '㉝', '㉞', '㉟'];
    const circlePattern = circleNumbers[referenceNumber - 1] || '';
    
    let matchIndex = -1;
    let matchText = '';
    
    // 1. **숫자** 형식 찾기
    const boldMatch = responseText.match(boldPattern);
    if (boldMatch && boldMatch.length > 0) {
      matchIndex = responseText.indexOf(boldMatch[0]);
      matchText = boldMatch[0];
    } 
    // 2. [참조 X] 형식 찾기 (우선순위 2)
    else {
      const bracketMatch = responseText.match(bracketPattern);
      if (bracketMatch && bracketMatch.length > 0) {
        matchIndex = responseText.indexOf(bracketMatch[0]);
        matchText = bracketMatch[0];
      }
      // 3. 원숫자 형식 찾기 (우선순위 3)
      else if (circlePattern) {
        const circleIndex = responseText.indexOf(circlePattern);
        if (circleIndex >= 0) {
          matchIndex = circleIndex;
          matchText = circlePattern;
        }
      }
    }
    
    if (matchIndex < 0) return null;
    
    // ✅ 개선: 참조 번호 주변 문맥 추출 범위 확대 (앞 200자 ~ 뒤 200자)
    const start = Math.max(0, matchIndex - 200);
    const end = Math.min(responseText.length, matchIndex + matchText.length + 200);
    const context = responseText.substring(start, end);
    
    const sentences = context.split(/[.。!！?？\n]/).map(s => s.trim()).filter(s => s.length > 0);
    const refIndex = sentences.findIndex(s => s.includes(matchText));
    
    if (refIndex >= 0) {
      let targetSentence = '';
      // ✅ 개선: 참조 번호가 포함된 문장 찾기 로직 개선
      if (refIndex > 0 && sentences[refIndex].includes(matchText)) {
        // 참조 번호 앞 문장이 더 의미 있을 수 있음
        targetSentence = sentences[refIndex - 1] || sentences[refIndex];
      } else if (refIndex < sentences.length - 1) {
        // 참조 번호 뒤 문장도 확인
        const nextSentence = sentences[refIndex + 1];
        if (nextSentence && nextSentence.length >= 15) {
          targetSentence = nextSentence;
        } else {
          targetSentence = sentences[refIndex];
        }
      } else {
        targetSentence = sentences[refIndex];
      }
      
      // ✅ 개선: 참조 번호 제거 및 마크다운 특수 문자 제거
      const cleaned = targetSentence
        .replace(/\*\*\d+\*\*/g, '') // **2** 제거
        .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, '') // 원형 숫자 제거
        .replace(/^[>\s]*/, '') // ✅ 마크다운 인용(>) 및 선행 공백 제거
        .replace(/\*\*/g, '') // ✅ 남은 ** 제거
        .replace(/^[-•\s]*/, '') // ✅ 리스트 마커(-, •) 및 선행 공백 제거
        .trim();
      
      if (cleaned.length >= 15) {
        return cleaned.substring(0, 100);
      }
    }
    
    return null;
  };

  // ✅ 가장 유사한 문장 찾기 (간단한 텍스트 매칭)
  const findMostSimilarSentence = (chunkContent: string, targetSentence: string | null): string | null => {
    if (!targetSentence || !chunkContent) return null;
    
    // 문장 분할
    const sentences = chunkContent
      .split(/[.。!！?？\n]/)
      .map(s => s.trim())
      .filter(s => s.length >= 10);
    
    if (sentences.length === 0) return null;
    
    // 타겟 문장의 핵심 키워드 추출 (3글자 이상 단어)
    const targetWords = targetSentence
      .replace(/[^\w가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.trim().length >= 3)
      .slice(0, 5); // 최대 5개 키워드
    
    if (targetWords.length === 0) return null;
    
    // 각 문장과의 유사도 계산 (공통 키워드 개수)
    let bestSentence = sentences[0];
    let bestScore = 0;
    
    sentences.forEach(sentence => {
      const sentenceLower = sentence.toLowerCase();
      let score = 0;
      
      targetWords.forEach(word => {
        const wordLower = word.toLowerCase();
        if (sentenceLower.includes(wordLower)) {
          score += wordLower.length; // 긴 단어일수록 높은 점수
        }
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence;
      }
    });
    
    // 최소 점수 기준 (최소 1개 이상의 키워드가 일치해야 함)
    if (bestScore > 0) {
      return bestSentence;
    }
    
    return null;
  };

  // ✅ 툴팁용 하이라이트 (키워드 + 가장 유사한 문장 강조) - 개선된 버전
  const highlightForTooltip = (
    chunkContent: string, 
    keywords?: string[], 
    responseText?: string, 
    referenceNumber?: number,
    referencedSentence?: string // ✅ AI가 실제로 인용한 문장
  ): string => {
    // ✅ 1단계: 참조 문장 결정 (우선순위: referencedSentence > AI 응답에서 추출)
    let targetSentence: string | null = null;
    
    // ✅ 1순위: referencedSentence 사용 (AI가 실제로 인용한 문장)
    if (referencedSentence && referencedSentence.length >= 15) {
      targetSentence = referencedSentence;
      console.log('✅ 툴팁: referencedSentence 사용:', targetSentence.substring(0, 60));
    } else if (responseText && referenceNumber) {
      // 2순위: AI 응답에서 참조 번호 주변 문장 추출 (폴백)
      targetSentence = extractSentenceFromResponseForTooltip(responseText, referenceNumber);
      console.log('✅ 툴팁: AI 응답에서 문장 추출:', targetSentence ? targetSentence.substring(0, 60) : null);
    }
    
    // ✅ 3순위: referencedSentence가 없어도 청크 내용에서 직접 매칭 시도
    if (!targetSentence && chunkContent) {
      // 청크 내용을 문장으로 분할
      const sentences = chunkContent
        .split(/[.。!！?？\n]/)
        .map(s => s.trim())
        .filter(s => s.length >= 15);
      
      if (sentences.length > 0) {
        // AI 응답과 유사한 문장 찾기
        if (responseText && referenceNumber) {
          const refContext = extractSentenceFromResponseForTooltip(responseText, referenceNumber);
          if (refContext) {
            const normalizeText = (text: string) => 
              text.replace(/\s+/g, ' ').replace(/[\n\r\t]/g, ' ').trim().toLowerCase();
            
            const normalizedRef = normalizeText(refContext);
            const similarSentence = sentences.find(s => {
              const normalized = normalizeText(s);
              // 부분 매칭 (최소 20자 이상 일치)
              return normalized.includes(normalizedRef.substring(0, Math.min(20, normalizedRef.length))) ||
                     normalizedRef.includes(normalized.substring(0, Math.min(20, normalized.length)));
            });
            
            if (similarSentence) {
              targetSentence = similarSentence;
              console.log('✅ 툴팁: 청크에서 유사한 문장 찾음:', targetSentence.substring(0, 60));
            }
          }
        }
        
        // 여전히 없으면 가장 긴 문장 사용
        if (!targetSentence) {
          targetSentence = sentences.reduce((a, b) => a.length > b.length ? a : b);
          console.log('✅ 툴팁: 청크에서 가장 긴 문장 사용:', targetSentence.substring(0, 60));
        }
      }
    }
    
    // ✅ 2단계: 유사한 문장 찾기 및 핵심 단어 추출 (키워드 하이라이트 전에 적용)
    let highlighted = chunkContent;
    
    if (targetSentence) {
      const similarSentence = findMostSimilarSentence(chunkContent, targetSentence);
      
      if (similarSentence && similarSentence.length >= 15) {
        // ✅ 개선: 텍스트 정규화 함수
        const normalizeText = (text: string) => 
          text.replace(/\s+/g, ' ').replace(/[\n\r\t]/g, ' ').trim();
        
        const normalizedSimilar = normalizeText(similarSentence);
        
        // ✅ 핵심 단어 추출 (3자 이상, 조사 제외)
        const stopWords = ['은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '도', '만', '로', '으로', '및', '등'];
        const keyWords = normalizedSimilar
          .split(/\s+/)
          .filter(w => {
            const trimmed = w.trim();
            return trimmed.length >= 3 && !stopWords.includes(trimmed);
          })
          .slice(0, 10); // 최대 10개 단어
        
        if (keyWords.length > 0) {
          console.log('✅ 툴팁: 핵심 단어 추출:', keyWords.slice(0, 5));
          
          // ✅ 각 단어를 개별적으로 하이라이트 (원본 텍스트에서 직접 적용)
          // 순서: 긴 단어부터 적용 (긴 단어가 짧은 단어를 포함하는 경우 방지)
          const sortedWords = [...keyWords].sort((a, b) => b.length - a.length);
          
          sortedWords.forEach(word => {
            const trimmedWord = word.trim();
            if (trimmedWord.length < 3) return;
            
            // 특수문자 이스케이프
            const escapedWord = trimmedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // ✅ 단어 단위 매칭 (더 유연하게 - 단어 경계 고려)
            // 한글의 경우 단어 경계가 명확하지 않으므로 직접 포함 체크
            const regex = new RegExp(`(${escapedWord})`, 'gi');
            
            highlighted = highlighted.replace(regex, (match, wordMatch, offset) => {
              // ✅ 이미 하이라이트된 부분은 제외 (HTML 태그 체크)
              const beforeMatch = highlighted.substring(Math.max(0, offset - 20), offset);
              const afterMatch = highlighted.substring(offset, Math.min(highlighted.length, offset + match.length + 20));
              
              // 이미 하이라이트 태그 안에 있으면 제외
              if (beforeMatch.includes('<mark') || beforeMatch.includes('<span class="bg-blue')) {
                // 닫는 태그가 매칭 뒤에 있는지 확인
                const tagMatch = beforeMatch.match(/<[^>]+>([^<]*)$/);
                if (tagMatch) {
                  const remainingText = tagMatch[1];
                  if (remainingText.length < match.length) {
                    // 아직 태그 안에 있음
                    return match;
                  }
                }
              }
              
              // 이미 파란색 하이라이트가 있으면 제외 (중복 방지)
              if (beforeMatch.includes('bg-blue-100') || afterMatch.includes('bg-blue-100')) {
                return match;
              }
              
              // ✅ 유사한 문장의 단어 강조 (파란색 배경, 진하게)
              return `<span class="bg-blue-100 font-bold text-blue-900 px-1 rounded">${match}</span>`;
            });
          });
          
          console.log('✅ 툴팁: 핵심 단어 하이라이트 완료');
        } else {
          console.log('⚠️ 툴팁: 핵심 단어를 추출할 수 없습니다.');
        }
      } else {
        console.log('⚠️ 툴팁: 유사한 문장을 찾을 수 없습니다.');
      }
    }
    
    // ✅ 3단계: 키워드 하이라이트 (유사한 문장 하이라이트 후 적용)
    // 이제 highlighted에는 이미 파란색 하이라이트가 있으므로, 키워드 하이라이트는 노란색으로 적용
    highlighted = highlightKeywords(highlighted, keywords);
    
    return highlighted;
  };

  // 클립보드 복사 함수
  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // 2초 후 복사 상태 초기화
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
      // 폴백: 텍스트 영역을 사용한 복사
      const textArea = document.createElement('textarea');
      textArea.value = message.content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };
  
  // ✅ 버튼 위치 추적을 위한 ref
  const buttonRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  // ✅ 툴팁 표시 핸들러 (디바운스 추가 + 중복 방지)
  const handleReferenceHover = useCallback((referenceNumber: number, show: boolean, uniqueKey: string, event?: React.MouseEvent) => {
    if (!message.chunkReferences || message.chunkReferences.length === 0) {
      return;
    }
    
    // 이전 타이머 클리어
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    if (show) {
      hoverTimeoutRef.current = setTimeout(() => {
        const chunkIndex = referenceNumber - 1;
        if (chunkIndex >= 0 && chunkIndex < message.chunkReferences.length) {
          const chunk = message.chunkReferences[chunkIndex];
          const content = chunk.content.substring(0, 2000) + (chunk.content.length > 2000 ? '...' : '');
          
          // ✅ 개선: referencedSentence가 있으면 우선 사용, 없으면 기존 방식 사용
          const highlightedContent = highlightForTooltip(
            content, 
            chunk.keywords, 
            message.content, 
            referenceNumber,
            chunk.referencedSentence // ✅ 참조 문장 전달
          );
          
          // ✅ 위치 계산: 마우스 이벤트가 있으면 마우스 위치 사용, 없으면 버튼 위치 사용
          let position: { x: number; y: number } | undefined = undefined;
          
          if (event) {
            // 마우스 위치 사용 (마우스에서 약간 오른쪽, 아래쪽에 표시)
            position = {
              x: event.clientX + 20, // 마우스에서 20px 오른쪽
              y: event.clientY + 20  // 마우스에서 20px 아래
            };
          } else {
            // 버튼 위치 사용 (폴백)
            const button = buttonRefs.current.get(uniqueKey);
            if (button) {
              const rect = button.getBoundingClientRect();
              position = {
                x: rect.right + 20, // 버튼 오른쪽에서 20px
                y: rect.top + 20    // 버튼 위에서 20px
              };
            }
          }
          
          // ✅ 전역 툴팁 관리자 사용
          showTooltip(uniqueKey, {
            title: chunk.documentTitle || chunk.title || '참조',
            content: highlightedContent
          }, position);
        }
      }, 150); // 150ms 디바운스
    } else {
      // ✅ 딜레이 추가: 툴팁에 마우스를 올릴 수 있는 시간 (300ms)
      hideTooltip(uniqueKey, 300);
    }
  }, [message.chunkReferences, showTooltip, hideTooltip]);

  // 참조 번호 클릭 핸들러
  const handleReferenceClick = (referenceNumber: number) => {
    if (message.chunkReferences && message.chunkReferences.length > 0) {
      // 참조 번호에 해당하는 청크 찾기 (1-based index)
      const chunkIndex = referenceNumber - 1;
      
      if (chunkIndex >= 0 && chunkIndex < message.chunkReferences.length) {
        const chunk = message.chunkReferences[chunkIndex];
        
        // ✅ documentId와 chunkId 추출 (다양한 필드명 시도)
        const documentId = chunk.documentId || chunk.id || '';
        const chunkId = chunk.chunkId || chunk.chunk_id || '';
        const title = chunk.documentTitle || chunk.title || '';
        // 페이지 정보 우선순위: pageIndex > page > logicalPageNumber
        // PDF 뷰어에서는 뷰어 인덱스(pageIndex)를 사용해야 정확함
        const page = chunk.metadata?.pageIndex || chunk.page || chunk.metadata?.page || chunk.metadata?.logicalPageNumber;
        const logicalPageNumber = chunk.metadata?.logicalPageNumber || chunk.page || chunk.metadata?.page;
        const filename = chunk.filename || chunk.documentFilename || chunk.metadata?.source || '';
        
        // ✅ 해당 답변에 해당하는 질문 찾기 (현재 메시지 이전의 user 메시지)
        let questionContent = '';
        if (messageIndex > 0 && allMessages.length > 0) {
          // 현재 메시지 이전에서 가장 가까운 user 메시지를 찾음
          for (let i = messageIndex - 1; i >= 0; i--) {
            if (allMessages[i].role === 'user') {
              questionContent = allMessages[i].content;
              break;
            }
          }
        }
        
        console.log('📝 참조 클릭 정보:', {
          referenceNumber,
          documentId,
          chunkId,
          title,
          page,
          logicalPageNumber,
          filename,
          questionContent
        });
        
        // ❌ 유효성 검사 추가
        if (!documentId || !chunkId) {
          console.warn('⚠️ documentId 또는 chunkId가 없음:', { documentId, chunkId });
          return; // 이벤트를 발생시키지 않음
        }
        
        // 커스텀 이벤트 발생 (PDF 파일명 및 질문 내용, 하이라이트용 키워드 추가)
        window.dispatchEvent(new CustomEvent('referenceClick', {
          detail: {
            documentId,
            chunkId,
            title,
            page, // 뷰어 인덱스 (PDF.js 페이지 번호)
            logicalPageNumber, // 논리적 페이지 번호 (문서에 인쇄된 번호)
            filename, // ✅ PDF 파일명 추가
            questionContent, // ✅ 질문 내용 추가
            chunkContent: chunk.content || chunk.text || '', // ✅ 청크 내용 (하이라이트용)
            keywords: chunk.keywords || [], // ✅ 청크 키워드 (하이라이트용)
            responseText: message.content, // ✅ AI 응답 텍스트 추가 (하이라이트용)
            referenceNumber, // ✅ 참조 번호 추가 (하이라이트용)
            referencedSentence: chunk.referencedSentence, // ✅ AI가 실제로 인용한 문장 추가
            pageFromSentenceMap: chunk.pageFromSentenceMap // ✅ sentencePageMap에서 찾은 페이지 번호 (방법 3)
          }
        }));
      }
    }
  };

  return (
    <div className={`flex gap-2 md:gap-3 mb-3 md:mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-brand-primary' : 'bg-brand-secondary'
      }`}>
        <Icon className="w-3 h-3 md:w-5 md:h-5 text-white" />
      </div>
      <div className={`flex-1 max-w-[85%] md:max-w-[80%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div
          className={`message-container relative inline-block p-2 md:p-3 rounded-lg text-sm md:text-base ${
            isUser
              ? 'bg-brand-primary text-white'
              : theme === 'dark'
                ? 'bg-brand-surface text-brand-text-primary border border-brand-secondary'
                : 'bg-white text-gray-900 border border-gray-200'
          }`}
        >
          {/* 복사 버튼 (AI 메시지에만 표시) */}
          {!isUser && (
            <button
              onClick={handleCopyToClipboard}
              className={`copy-button absolute top-2 right-2 p-1.5 rounded-md transition-all duration-200 ${
                isCopied 
                  ? 'bg-green-600 text-white' 
                  : 'bg-brand-secondary text-brand-text-secondary hover:bg-brand-primary hover:text-white'
              }`}
              title={isCopied ? '복사됨!' : '클립보드에 복사'}
            >
              {isCopied ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <CopyIcon className="w-4 h-4" />
              )}
            </button>
          )}
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div
              className={`${
                theme === 'dark'
                  ? 'prose prose-invert'
                  : 'prose'
              } max-w-none [&_table]:border-collapse [&_table]:w-full [&_table]:my-4 [&_table]:border [&_table]:border-brand-secondary`}
            >
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                // ✅ AI 응답 전처리: [참조 X] 형식을 **X** 형식으로 변환
                children={preprocessResponse(message.content)}
                components={{
                  // ✅ 참조 번호를 클릭 가능한 버튼으로 변환
                  strong: ({ children, ...props }: any) => {
                    const text = String(children).trim();
                    
                    // **숫자** 패턴인지 확인 (ReactMarkdown이 파싱하면 **는 제거됨)
                    // 숫자와 공백만 포함하는지 체크
                    const isNumberSequence = /^(\d+\s*)+\d*$/.test(text);
                    
                    if (isNumberSequence && message.chunkReferences) {
                      const numbers = text.split(/\s+/).map(n => parseInt(n.trim()));
                      
                      return (
                        <span className="inline-flex items-center gap-1">
                          {numbers.map((num, i) => {
                            const uniqueKey = `${message.id}-${num}-${i}`;
                            return (
                              <div key={uniqueKey} className="relative inline-block">
                                <button
                                  ref={(el) => {
                                    if (el) {
                                      buttonRefs.current.set(uniqueKey, el);
                                    } else {
                                      buttonRefs.current.delete(uniqueKey);
                                    }
                                  }}
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault?.();
                                    e.stopPropagation?.();
                                    handleReferenceClick(num);
                                  }}
                                  onMouseEnter={(e) => handleReferenceHover(num, true, uniqueKey, e)}
                                  onMouseLeave={() => handleReferenceHover(num, false, uniqueKey)}
                                  className="inline-flex items-center justify-center w-5 h-5 min-w-[20px] rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
                                  title={`참조 ${num} 클릭`}
                                >
                                  {getCircleNumber(num) || num}
                                </button>
                                {/* ✅ 툴팁은 전역으로 렌더링되므로 여기서는 제거 */}
                              </div>
                            );
                          })}
                        </span>
                      );
                    }
                    
                    return <strong className="font-semibold text-brand-primary" {...props}>{children}</strong>;
                  },
                  table: ({ children, ...props }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="min-w-full border-collapse border border-brand-secondary" {...props}>
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children, ...props }) => (
                    <thead
                      className={theme === 'dark' ? 'bg-brand-secondary' : 'bg-gray-100'}
                      {...props}
                    >
                      {children}
                    </thead>
                  ),
                  tbody: ({ children, ...props }) => (
                    <tbody
                      className={theme === 'dark' ? 'bg-brand-surface' : 'bg-white'}
                      {...props}
                    >
                      {children}
                    </tbody>
                  ),
                  tr: ({ children, ...props }) => (
                    <tr className="border-b border-brand-secondary" {...props}>
                      {children}
                    </tr>
                  ),
                  th: ({ children, ...props }) => (
                    <th
                      className={`px-4 py-2 text-left font-semibold border-r border-brand-secondary ${
                        theme === 'dark' ? 'text-brand-text-primary' : 'text-gray-900'
                      }`}
                      {...props}
                    >
                      {children}
                    </th>
                  ),
                  td: ({ children, ...props }) => (
                    <td
                      className={`px-4 py-2 border-r border-brand-secondary ${
                        theme === 'dark' ? 'text-brand-text-primary' : 'text-gray-900'
                      }`}
                      {...props}
                    >
                      {children}
                    </td>
                  ),
                  p: ({ children, ...props }) => (
                    <p className={`mb-2 last:mb-0 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} {...props}>
                      {children}
                    </p>
                  ),
                  ul: ({ children, ...props }) => (
                    <ul className={`list-disc list-inside mb-2 space-y-1 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} {...props}>
                      {children}
                    </ul>
                  ),
                  ol: ({ children, ...props }) => (
                    <ol className={`list-decimal list-inside mb-2 space-y-1 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} {...props}>
                      {children}
                    </ol>
                  ),
                  li: ({ children, ...props }) => (
                    <li className={`${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} {...props}>
                      {children}
                    </li>
                  ),
                  // strong은 위에서 이미 정의됨 (107라인)
                  code: ({ children, ...props }) => (
                    <code className="bg-brand-bg px-1 py-0.5 rounded text-sm font-mono text-brand-primary" {...props}>
                      {children}
                    </code>
                  ),
                  pre: ({ children, ...props }) => (
                    <pre className="bg-brand-bg p-3 rounded-lg overflow-x-auto text-sm" {...props}>
                      {children}
                    </pre>
                  ),
                  h1: ({ children, ...props }) => (
                    <h1 className="text-2xl font-bold text-brand-primary mb-4 mt-6 first:mt-0" {...props}>
                      {children}
                    </h1>
                  ),
                  h2: ({ children, ...props }) => (
                    <h2 className="text-xl font-semibold text-brand-primary mb-3 mt-5 first:mt-0" {...props}>
                      {children}
                    </h2>
                  ),
                  h3: ({ children, ...props }) => (
                    <h3 className="text-lg font-medium text-brand-primary mb-2 mt-4 first:mt-0" {...props}>
                      {children}
                    </h3>
                  ),
                  blockquote: ({ children, ...props }) => (
                    <blockquote className={`border-l-4 border-brand-primary pl-4 py-2 my-4 bg-brand-bg/50 italic ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} {...props}>
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <div className={`text-xs text-brand-text-secondary mt-1 ${
          isUser ? 'text-right' : 'text-left'
        }`}>
          {message.timestamp.toLocaleTimeString()}
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-brand-text-secondary mb-1">참조 소스:</p>
            <div className="flex flex-wrap gap-1">
              {message.sources.map((source, index) => (
                <span
                  key={index}
                  className="text-xs bg-brand-secondary text-brand-text-secondary px-2 py-1 rounded"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Message;