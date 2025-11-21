// PDF 하이라이트 모듈 - 참조 클릭용 (원숫자 클릭)
// 이 모듈은 window.viewerWrapper 변수에 의존합니다.

/**
 * 참조 클릭용 하이라이트 적용 함수
 * URL 파라미터의 키워드와 검색 텍스트를 사용
 * @param {HTMLElement} textLayer - 텍스트 레이어 요소
 * @param {string[]} keywords - 하이라이트할 키워드 배열
 * @param {string} searchText - 검색 텍스트
 */
function applyHighlightForReference(textLayer, keywords, searchText) {
  if (!textLayer || (!keywords.length && !searchText)) {
    console.log('⚠️ [참조] 하이라이트할 키워드나 텍스트가 없습니다.');
    return;
  }
  
  // ✅ 기존 하이라이트 제거
  textLayer.querySelectorAll('.highlight, .highlight-strong').forEach(el => {
    el.classList.remove('highlight', 'highlight-strong');
  });
  
  const textSpans = textLayer.querySelectorAll('span');
  let highlightCount = 0;
  
  // ✅ 참조용: 키워드 우선 하이라이트 (URL 파라미터에서 온 키워드)
  if (keywords.length > 0) {
    const shortKeywords = keywords.filter(k => k && k.trim().length >= 3 && k.trim().length <= 20);
    
    textSpans.forEach((span) => {
      const text = span.textContent || '';
      if (!text.trim()) return;
      
      let shouldHighlight = false;
      
      for (const keyword of shortKeywords) {
        const trimmedKeyword = keyword.trim();
        const keywordRegex = new RegExp(`\\b${trimmedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        
        if (keywordRegex.test(text) || (trimmedKeyword.length >= 4 && text.includes(trimmedKeyword))) {
          shouldHighlight = true;
          break;
        }
      }
      
      if (shouldHighlight) {
        span.classList.add('highlight');
        highlightCount++;
      }
    });
  }
  
  // ✅ 참조용: 검색 텍스트 하이라이트 (개선된 버전)
  if (searchText && searchText.trim().length > 0) {
    // ✅ 따옴표 제거 및 정규화
    let trimmedSearchText = searchText.trim();
    if (trimmedSearchText.startsWith('"') && trimmedSearchText.endsWith('"')) {
      trimmedSearchText = trimmedSearchText.slice(1, -1);
    }
    
    // ✅ 특수문자 정규화 (공백, • 등)
    const normalizeText = (text) => {
      return text
        .replace(/[•·]/g, ' ') // 특수문자를 공백으로
        .replace(/\s+/g, ' ') // 연속 공백을 하나로
        .trim()
        .toLowerCase();
    };
    
    const normalizedSearch = normalizeText(trimmedSearchText);
    const textLength = normalizedSearch.length;
    
    console.log(`🔍 [참조] 검색 텍스트 길이: ${textLength}자`);
    console.log(`🔍 [참조] 정규화된 검색 텍스트: ${normalizedSearch.substring(0, 50)}...`);
    
    if (textLength >= 30) {
      // ✅ 개선: 핵심 키워드 추출 (더 긴 부분 사용)
      // 첫 50자를 사용하되, 공백이나 구두점에서 끊기
      let coreText = normalizedSearch.substring(0, 50);
      const lastSpaceIndex = coreText.lastIndexOf(' ');
      if (lastSpaceIndex > 30) {
        coreText = coreText.substring(0, lastSpaceIndex);
      }
      
      console.log(`🔍 [참조] 핵심 텍스트: ${coreText}`);
      
      // ✅ 개선: 전체 텍스트 레이어에서 텍스트 수집
      let fullText = '';
      const allSpans = [];
      textSpans.forEach((span) => {
        const text = span.textContent || '';
        if (text.trim()) {
          fullText += text + ' ';
          allSpans.push(span);
        }
      });
      
      const normalizedFullText = normalizeText(fullText);
      
      // ✅ 핵심 텍스트가 전체 텍스트에 포함되어 있는지 확인
      const coreIndex = normalizedFullText.indexOf(coreText);
      if (coreIndex !== -1) {
        // ✅ 핵심 텍스트의 위치를 찾아서 해당 span들을 하이라이트
        let charCount = 0;
        let startSpanIndex = -1;
        let endSpanIndex = -1;
        
        // 시작 위치 찾기
        for (let i = 0; i < allSpans.length; i++) {
          const spanText = normalizeText(allSpans[i].textContent || '');
          if (charCount + spanText.length >= coreIndex) {
            startSpanIndex = i;
            break;
          }
          charCount += spanText.length + 1; // +1 for space
        }
        
        // 끝 위치 찾기 (coreText 길이만큼)
        if (startSpanIndex !== -1) {
          charCount = 0;
          for (let i = 0; i < allSpans.length; i++) {
            const spanText = normalizeText(allSpans[i].textContent || '');
            charCount += spanText.length + 1;
            if (charCount >= coreIndex + coreText.length) {
              endSpanIndex = i;
              break;
            }
          }
          
          // ✅ 하이라이트 적용
          const endIndex = endSpanIndex !== -1 ? endSpanIndex + 1 : allSpans.length;
          for (let i = startSpanIndex; i < endIndex && i < allSpans.length; i++) {
            allSpans[i].classList.add('highlight-strong');
            highlightCount++;
          }
          
          console.log(`✅ [참조] 핵심 텍스트 찾음: ${startSpanIndex}~${endIndex} span 하이라이트`);
        } else {
          // ✅ 대안: 단어 단위로 매칭 시도
          const searchWords = coreText.split(' ').filter(w => w.length >= 3);
          console.log(`🔍 [참조] 단어 단위 매칭 시도: ${searchWords.length}개 단어`);
          
          textSpans.forEach((span) => {
            const spanText = normalizeText(span.textContent || '');
            for (const word of searchWords) {
              if (spanText.includes(word)) {
                span.classList.add('highlight-strong');
                highlightCount++;
                break;
              }
            }
          });
        }
      } else {
        // ✅ 핵심 텍스트를 찾지 못한 경우: 핵심 단어들로 하이라이트
        const importantWords = coreText.split(' ')
          .filter(w => w.length >= 4) // 4자 이상 단어만
          .slice(0, 5); // 최대 5개 단어
        
        console.log(`🔍 [참조] 핵심 텍스트를 찾지 못함, 핵심 단어로 하이라이트: ${importantWords.join(', ')}`);
        
        textSpans.forEach((span) => {
          const spanText = normalizeText(span.textContent || '');
          for (const word of importantWords) {
            if (spanText.includes(word)) {
              span.classList.add('highlight-strong');
              highlightCount++;
              break;
            }
          }
        });
      }
    } else {
      // 짧은 텍스트: 정확한 매칭
      textSpans.forEach((span) => {
        const spanText = normalizeText(span.textContent || '');
        if (spanText.includes(normalizedSearch)) {
          span.classList.add('highlight-strong');
          highlightCount++;
        }
      });
    }
  }
  
  console.log(`✅ [참조] 하이라이트 적용 완료: ${highlightCount}개 요소`);
}

/**
 * 참조용 하이라이트된 요소로 스크롤
 * @param {HTMLElement} textLayer - 텍스트 레이어 요소
 */
function scrollToHighlightForReference(textLayer) {
  const highlighted = textLayer.querySelector('.highlight, .highlight-strong');
  if (highlighted) {
    console.log('📍 [참조] 하이라이트 위치로 스크롤 중...');
    highlighted.scrollIntoView({ 
      behavior: 'smooth', // 참조용은 부드러운 스크롤
      block: 'center',
      inline: 'nearest'
    });
    console.log('✅ [참조] 하이라이트 위치로 스크롤 완료');
  } else {
    if (typeof window.viewerWrapper !== 'undefined' && window.viewerWrapper) {
      window.viewerWrapper.scrollTop = 0;
    }
    console.log('📍 [참조] 하이라이트 없음, 페이지 상단으로 스크롤');
  }
}

