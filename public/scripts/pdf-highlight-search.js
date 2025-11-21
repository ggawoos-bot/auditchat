// PDF 하이라이트 모듈 - 검색용
// 이 모듈은 window.viewerWrapper 변수에 의존합니다.

/**
 * Y 좌표를 기준으로 span들을 라인별로 그룹화
 * @param {NodeList|Array} textSpans - 텍스트 span 요소들
 * @returns {Map} 라인 키를 값으로 하는 span 배열 맵
 */
function groupSpansByLine(textSpans) {
  const lines = new Map();
  
  Array.from(textSpans).forEach(span => {
    const style = window.getComputedStyle(span);
    const top = parseFloat(style.top) || 0;
    // Y 좌표를 3px 단위로 반올림하여 라인 그룹화
    const lineKey = Math.round(top / 3) * 3;
    
    if (!lines.has(lineKey)) {
      lines.set(lineKey, []);
    }
    lines.get(lineKey).push(span);
  });
  
  return lines;
}

/**
 * span 배열의 고유 라인 수 계산
 * @param {Array} spans - span 요소 배열
 * @param {Map} lines - 라인별 그룹화된 맵
 * @returns {number} 고유 라인 수
 */
function getLineCount(spans, lines) {
  const uniqueLines = new Set();
  
  spans.forEach(span => {
    const style = window.getComputedStyle(span);
    const top = parseFloat(style.top) || 0;
    const lineKey = Math.round(top / 3) * 3;
    uniqueLines.add(lineKey);
  });
  
  return uniqueLines.size;
}

/**
 * 새로운 라인인지 확인 (Y 좌표 차이 기준)
 * @param {number} currentTop - 현재 span의 top 값
 * @param {number} lastTop - 이전 span의 top 값
 * @returns {boolean} 새로운 라인 여부
 */
function isNewLine(currentTop, lastTop) {
  if (lastTop === null) return false;
  return Math.abs(currentTop - lastTop) > 5;
}

/**
 * span 내부의 텍스트를 검색어 기준으로 분할하고 검색어 부분만 하이라이트
 * @param {HTMLElement} span - 원본 span 요소
 * @param {string} query - 검색어 (원본 대소문자)
 * @param {string} queryLower - 검색어 (소문자)
 * @param {number} queryIndex - 검색어의 시작 인덱스 (소문자 기준)
 * @returns {boolean} 하이라이트 성공 여부
 */
function highlightWordInSpan(span, query, queryLower, queryIndex) {
  const text = span.textContent || '';
  if (!text || queryIndex === -1) return false;
  
  // 단어 경계 체크
  const textLower = text.toLowerCase();
  const beforeChar = queryIndex > 0 ? textLower[queryIndex - 1] : '';
  const afterChar = queryIndex + query.length < text.length 
    ? textLower[queryIndex + query.length] 
    : '';
  
  const isWordBoundaryBefore = queryIndex === 0 || /[^\w가-힣]/.test(beforeChar);
  
  // ✅ 한글 조사/어미 패턴 (검색어 뒤에 붙을 수 있는 것들)
  // 조사: 을, 를, 이, 가, 에, 에서, 와, 과, 로, 으로, 의, 도, 만, 부터, 까지, 조차, 마저 등
  // 어미: 은, 는, 이다, 이며, 으며 등
  let isKoreanParticle = false;
  if (afterChar && queryIndex + query.length < text.length && /[가-힣]/.test(afterChar)) {
    // 검색어 바로 뒤 문자부터 시작하는 텍스트 확인 (최대 3글자까지)
    const afterText = textLower.substring(queryIndex + query.length, Math.min(queryIndex + query.length + 3, text.length));
    // 일반적인 한글 조사/어미 패턴
    const koreanParticlePattern = /^[을를이가에에서와과로으로의도만부터까지조차마저은는이다이며으며]/;
    isKoreanParticle = koreanParticlePattern.test(afterText);
  }
  
  // ✅ 단어 경계 판단:
  // 1. 문자열의 끝
  // 2. 공백/구두점 등 비문자
  // 3. 한글 조사/어미 (검색어 뒤에 붙어있어도 단어 경계로 인정)
  const isWordBoundaryAfter = queryIndex + query.length >= text.length || 
                               /[^\w가-힣]/.test(afterChar) ||
                               isKoreanParticle;
  
  if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
    return false;
  }
  
  // span의 스타일 복사 함수
  const copySpanStyles = (source, target) => {
    const style = window.getComputedStyle(source);
    // PDF.js span의 필수 스타일 속성들 복사
    const styleProps = [
      'position', 'left', 'top', 'fontSize', 'fontFamily', 'fontWeight',
      'transform', 'transformOrigin', 'color', 'whiteSpace', 'letterSpacing',
      'wordSpacing', 'textRendering', 'textTransform'
    ];
    styleProps.forEach(prop => {
      const value = style[prop];
      if (value) {
        target.style[prop] = value;
      }
    });
    // 클래스도 복사 (PDF.js가 사용하는 클래스들)
    target.className = source.className;
  };
  
  // 텍스트를 검색어 기준으로 분할
  const beforeText = text.substring(0, queryIndex);
  const matchText = text.substring(queryIndex, queryIndex + query.length);
  const afterText = text.substring(queryIndex + query.length);
  
  // 원본 span의 부모
  const parent = span.parentNode;
  
  // 새로운 fragment 생성
  const fragment = document.createDocumentFragment();
  
  // 검색어 이전 텍스트가 있으면 span 생성
  if (beforeText) {
    const beforeSpan = span.cloneNode(false);
    beforeSpan.textContent = beforeText;
    copySpanStyles(span, beforeSpan);
    fragment.appendChild(beforeSpan);
  }
  
  // 검색어 부분 - 하이라이트 적용
  const highlightSpan = span.cloneNode(false);
  highlightSpan.textContent = matchText;
  highlightSpan.classList.add('highlight-word');
  copySpanStyles(span, highlightSpan);
  fragment.appendChild(highlightSpan);
  
  // 검색어 이후 텍스트가 있으면 span 생성
  if (afterText) {
    const afterSpan = span.cloneNode(false);
    afterSpan.textContent = afterText;
    copySpanStyles(span, afterSpan);
    fragment.appendChild(afterSpan);
  }
  
  // 원본 span을 fragment로 교체
  parent.replaceChild(fragment, span);
  
  return true;
}

/**
 * 복수 검색어에 대한 문장/라인 하이라이트 적용
 * 검색어들이 하나의 문장 또는 5개 라인 이내에 있으면 해당 문장/라인을 하이라이트
 * @param {HTMLElement} textLayer - 텍스트 레이어 요소
 * @param {string[]} searchQueries - 검색어 배열
 */
function applySentenceOrLineHighlight(textLayer, searchQueries) {
  if (!textLayer || !searchQueries || searchQueries.length < 2) {
    return;
  }
  
  // 모든 span 요소 수집
  const allSpans = Array.from(textLayer.querySelectorAll('span'));
  if (allSpans.length === 0) {
    return;
  }
  
  // 라인별로 그룹화
  const lines = groupSpansByLine(allSpans);
  
  // 하이라이트된 검색어들의 위치 정보 수집
  const highlightedSpans = Array.from(textLayer.querySelectorAll('.highlight-word'));
  if (highlightedSpans.length === 0) {
    console.log('ℹ️ [검색] 하이라이트된 검색어를 찾을 수 없습니다.');
    return;
  }
  
  // 각 검색어별로 하이라이트된 span들을 그룹화
  const queryMatches = new Map(); // query -> [span 배열]
  
  highlightedSpans.forEach(span => {
    const spanText = (span.textContent || '').toLowerCase().trim();
    // 어떤 검색어와 일치하는지 찾기
    for (const query of searchQueries) {
      const queryLower = query.toLowerCase();
      if (spanText === queryLower || spanText.includes(queryLower)) {
        if (!queryMatches.has(query)) {
          queryMatches.set(query, []);
        }
        queryMatches.get(query).push(span);
        break; // 첫 번째 일치하는 검색어에만 할당
      }
    }
  });
  
  // 모든 검색어가 최소 1개씩은 하이라이트되어 있는지 확인
  const allQueriesFound = searchQueries.every(query => {
    const queryLower = query.toLowerCase();
    return Array.from(queryMatches.keys()).some(matchedQuery => 
      matchedQuery.toLowerCase() === queryLower
    );
  });
  
  if (!allQueriesFound) {
    console.log('ℹ️ [검색] 일부 검색어를 찾을 수 없어 문장 하이라이트를 건너뜁니다.');
    return;
  }
  
  // 모든 하이라이트된 span의 위치 정보 수집
  const allHighlightedSpans = Array.from(queryMatches.values()).flat();
  
  // 각 하이라이트된 span의 라인 정보 수집
  const highlightedLineInfo = new Map(); // lineKey -> {spans: [], minTop: number, maxTop: number}
  
  allHighlightedSpans.forEach(span => {
    const style = window.getComputedStyle(span);
    const top = parseFloat(style.top) || 0;
    const lineKey = Math.round(top / 3) * 3;
    
    if (!highlightedLineInfo.has(lineKey)) {
      highlightedLineInfo.set(lineKey, {
        spans: [],
        minTop: top,
        maxTop: top
      });
    }
    
    const lineInfo = highlightedLineInfo.get(lineKey);
    lineInfo.spans.push(span);
    lineInfo.minTop = Math.min(lineInfo.minTop, top);
    lineInfo.maxTop = Math.max(lineInfo.maxTop, top);
  });
  
  // 라인 키를 정렬
  const sortedLineKeys = Array.from(highlightedLineInfo.keys()).sort((a, b) => a - b);
  
  // 최대 라인 간격 확인 (5개 라인 이내)
  // 연속된 라인들을 그룹화 (간격이 너무 크면 별도 그룹)
  const maxLineGap = 5;
  const lineHeight = 15; // 대략적인 라인 높이 (px)
  let lineGroups = [];
  let currentGroup = [sortedLineKeys[0]];
  
  for (let i = 1; i < sortedLineKeys.length; i++) {
    const prevLine = sortedLineKeys[i - 1];
    const currentLine = sortedLineKeys[i];
    const lineDiff = currentLine - prevLine;
    
    // 라인 간격 계산
    const lineGap = Math.round(lineDiff / lineHeight);
    
    if (lineGap <= maxLineGap) {
      currentGroup.push(currentLine);
    } else {
      lineGroups.push(currentGroup);
      currentGroup = [currentLine];
    }
  }
  if (currentGroup.length > 0) {
    lineGroups.push(currentGroup);
  }
  
  // 각 그룹에 대해 문장 경계 확인 및 하이라이트
  lineGroups.forEach((lineGroup, groupIdx) => {
    if (lineGroup.length === 0) return;
    
    // 이 그룹에 속한 모든 span 수집 (라인 범위 확장)
    const minLineKey = Math.min(...lineGroup);
    const maxLineKey = Math.max(...lineGroup);
    const groupSpans = [];
    const processedSpans = new Set();
    
    // 라인 그룹 범위 내의 모든 span 수집
    for (let lineKey = minLineKey; lineKey <= maxLineKey + (lineHeight * 2); lineKey += 3) {
      const lineSpans = lines.get(lineKey) || [];
      lineSpans.forEach(span => {
        if (!processedSpans.has(span)) {
          groupSpans.push(span);
          processedSpans.add(span);
        }
      });
    }
    
    if (groupSpans.length === 0) return;
    
    // span들을 문서 순서대로 정렬 (top, left 기준)
    groupSpans.sort((a, b) => {
      const styleA = window.getComputedStyle(a);
      const styleB = window.getComputedStyle(b);
      const topA = parseFloat(styleA.top) || 0;
      const topB = parseFloat(styleB.top) || 0;
      if (Math.abs(topA - topB) > 5) {
        return topA - topB;
      }
      const leftA = parseFloat(styleA.left) || 0;
      const leftB = parseFloat(styleB.left) || 0;
      return leftA - leftB;
    });
    
    // 전체 텍스트 구성 및 span 위치 매핑
    let fullText = '';
    const spanPositions = new Map(); // span -> {start: number, end: number}
    let charPos = 0;
    
    groupSpans.forEach(span => {
      const text = span.textContent || '';
      spanPositions.set(span, { start: charPos, end: charPos + text.length });
      fullText += text;
      charPos += text.length;
    });
    
    // 문장 경계 찾기 (마침표, 느낌표, 물음표 등)
    const sentenceEndPattern = /[.!?。！？]\s*/g;
    const sentenceEnds = [];
    let match;
    while ((match = sentenceEndPattern.exec(fullText)) !== null) {
      sentenceEnds.push(match.index + match[0].length);
    }
    
    // 하이라이트된 검색어들의 위치 찾기
    // 각 검색어별로 그룹 내에 최소 1개씩 있는지 확인 (같은 단어 중복 카운트 방지)
    const foundQueries = new Set(); // 그룹 내에서 발견된 서로 다른 검색어들
    const queryPositions = [];
    
    // 각 검색어별로 그룹 내에 있는지 확인
    for (const query of searchQueries) {
      const queryLower = query.toLowerCase();
      let foundInGroup = false;
      
      // 이 검색어에 해당하는 span들 중에서 그룹 내에 있는 것 찾기
      const querySpans = queryMatches.get(query) || [];
      for (const span of querySpans) {
        if (groupSpans.includes(span)) {
          const pos = spanPositions.get(span);
          if (pos) {
            if (!foundInGroup) {
              // 각 검색어는 최소 1개만 카운트 (같은 단어가 여러 번 나타나도 1번만)
              foundQueries.add(queryLower);
              queryPositions.push({
                start: pos.start,
                end: pos.end,
                span: span,
                query: queryLower
              });
              foundInGroup = true;
              break; // 이 검색어는 이미 그룹 내에서 찾았으므로 중복 체크 중단
            }
          }
        }
      }
    }
    
    // 모든 서로 다른 검색어가 그룹 내에 있어야 함 (2개 이상)
    if (foundQueries.size < 2) {
      return; // 서로 다른 검색어가 2개 미만이면 건너뛰기
    }
    
    // 모든 검색어가 하나의 문장 내에 있는지 확인
    const minPos = Math.min(...queryPositions.map(p => p.start));
    const maxPos = Math.max(...queryPositions.map(p => p.end));
    
    // 문장 경계 찾기
    let sentenceStart = 0;
    let sentenceEnd = fullText.length;
    
    for (let i = 0; i < sentenceEnds.length; i++) {
      if (sentenceEnds[i] > minPos) {
        sentenceEnd = sentenceEnds[i];
        if (i > 0) {
          sentenceStart = sentenceEnds[i - 1];
        }
        break;
      }
    }
    
    // 검색어들이 하나의 문장 내에 있거나, 5개 라인 이내에 있는지 확인
    const isWithinSentence = minPos >= sentenceStart && maxPos <= sentenceEnd;
    const isWithin5Lines = lineGroup.length <= 5;
    
    if (isWithinSentence || isWithin5Lines) {
      // 해당 문장 또는 라인들을 하이라이트
      const startChar = isWithinSentence ? sentenceStart : 0;
      const endChar = isWithinSentence ? sentenceEnd : fullText.length;
      
      // 해당 범위의 span들을 찾아서 하이라이트
      groupSpans.forEach(span => {
        const pos = spanPositions.get(span);
        if (pos && pos.end > startChar && pos.start < endChar) {
          span.classList.add('highlight-sentence');
        }
      });
      
      console.log(`✅ [검색] 문장/라인 하이라이트 적용: 그룹 ${groupIdx + 1} (${lineGroup.length}개 라인, ${isWithinSentence ? '문장 내' : '5라인 이내'})`);
    }
  });
  
  console.log(`✅ [검색] 문장/라인 하이라이트 완료`);
}

/**
 * 검색용 하이라이트 적용 함수
 * @param {HTMLElement} textLayer - 텍스트 레이어 요소
 * @param {string[]} keywords - 하이라이트할 키워드 배열 (사용 안 함)
 * @param {string} searchText - 검색 텍스트
 */
function applyHighlightForSearch(textLayer, keywords, searchText) {
  if (!textLayer) {
    return;
  }
  
  // ✅ 기존 하이라이트 제거
  textLayer.querySelectorAll('.highlight, .highlight-strong, .highlight-current, .highlight-sentence, .highlight-word').forEach(el => {
    el.classList.remove('highlight', 'highlight-strong', 'highlight-current', 'highlight-sentence', 'highlight-word');
  });
  
  if (!searchText || !searchText.trim()) {
    console.log('ℹ️ [검색] 검색 텍스트가 없습니다.');
    return;
  }
  
  // ✅ 공백으로 구분된 검색어 파싱 (원본과 소문자 버전 모두 저장)
  const searchQueries = searchText
    .split(/\s+/)
    .map(q => q.trim())
    .filter(q => q.length > 0);
  
  if (searchQueries.length === 0) {
    console.log('ℹ️ [검색] 검색어가 없습니다.');
    return;
  }
  
  // 1단계: 모든 검색어를 개별적으로 하이라이트
  console.log(`🔍 [검색] 하이라이트 시작: 검색어 ${searchQueries.length}개`, searchQueries);
  let totalHighlighted = 0;
  
  searchQueries.forEach((queryOriginal, queryIdx) => {
    const query = queryOriginal.toLowerCase();
    console.log(`🔍 [검색] 검색어 ${queryIdx + 1}/${searchQueries.length} 처리 중: "${queryOriginal}"`);
    let queryHighlighted = 0;
    
    // ✅ DOM이 변경될 수 있으므로 매번 span을 다시 수집
    let textSpans = Array.from(textLayer.querySelectorAll('span'));
    let processedSpans = new Set(); // 이미 처리된 span 추적
    
    for (let i = 0; i < textSpans.length; i++) {
      // 이미 처리된 span은 건너뛰기 (분할로 인해 새로 생성된 span)
      if (processedSpans.has(textSpans[i])) continue;
      
      const span = textSpans[i];
      const text = span.textContent || '';
      
      if (!text.trim()) continue;
      
      // 단일 span에서 검색어 찾기
      const textLower = text.toLowerCase();
      let queryIndex = textLower.indexOf(query);
      
      // ✅ span 내에서 검색어가 여러 번 나타날 수 있으므로 모두 처리
      while (queryIndex !== -1) {
        // span을 분할하여 검색어 부분만 하이라이트
        if (highlightWordInSpan(span, queryOriginal, query, queryIndex)) {
          queryHighlighted++;
          totalHighlighted++;
          
          // ✅ 디버깅: 처음 몇 개만 로그 출력
          if (queryHighlighted <= 5) {
            console.log(`  ✓ [검색] span 분할 하이라이트: "${text.substring(queryIndex, queryIndex + query.length)}"`);
          }
          
          // DOM이 변경되었으므로 span을 다시 수집하고 현재 위치 조정
          processedSpans.add(span);
          textSpans = Array.from(textLayer.querySelectorAll('span'));
          break; // 현재 span 처리는 완료, 다음 span으로 이동
        }
        
        // 같은 span 내에서 다음 검색어 위치 찾기
        queryIndex = textLower.indexOf(query, queryIndex + 1);
      }
      
      // 검색어가 여러 span에 걸쳐 있을 수 있으므로 인접한 span들을 결합하여 검색
      // ✅ 개선: 검색어가 정확히 일치하는 부분만 하이라이트 (문장 전체가 아닌 검색어만)
      let combinedText = '';
      let spanTexts = []; // 각 span의 텍스트와 인덱스를 저장
      
      for (let j = i; j < Math.min(i + 10, textSpans.length); j++) {
        // 이미 처리된 span은 건너뛰기
        if (processedSpans.has(textSpans[j])) continue;
        
        const nextSpan = textSpans[j];
        const nextText = nextSpan.textContent || '';
        
        if (nextText.trim()) {
          spanTexts.push({ text: nextText, span: nextSpan, index: j });
          combinedText += nextText;
          
          // 검색어가 포함되는지 확인
          const lowerCombined = combinedText.toLowerCase();
          const queryIndex = lowerCombined.indexOf(query);
          
          if (queryIndex !== -1) {
            // ✅ 개선: 각 span 내에서 단어 경계를 체크 (span 경계 고려)
            // 검색어가 시작하는 span과 끝나는 span을 찾기
            let charCount = 0;
            let queryStartSpanIdx = -1;
            let queryEndSpanIdx = -1;
            let queryStartInStartSpan = -1;
            let queryEndInEndSpan = -1;
            const queryStart = queryIndex;
            const queryEnd = queryIndex + query.length;
            
            for (let k = 0; k < spanTexts.length; k++) {
              const spanStart = charCount;
              const spanEnd = charCount + spanTexts[k].text.length;
              
              // 검색어 시작이 이 span에 있는지
              if (queryStart >= spanStart && queryStart < spanEnd && queryStartSpanIdx === -1) {
                queryStartSpanIdx = k;
                queryStartInStartSpan = queryStart - spanStart;
              }
              
              // 검색어 끝이 이 span에 있는지
              if (queryEnd > spanStart && queryEnd <= spanEnd && queryEndSpanIdx === -1) {
                queryEndSpanIdx = k;
                queryEndInEndSpan = queryEnd - spanStart;
              }
              
              charCount += spanTexts[k].text.length;
            }
            
            if (queryStartSpanIdx === -1 || queryEndSpanIdx === -1) {
              continue; // span을 찾지 못함
            }
            
            // ✅ 시작 span에서 단어 경계 체크
            const startSpanText = spanTexts[queryStartSpanIdx].text.toLowerCase();
            const beforeChar = queryStartInStartSpan > 0 
              ? startSpanText[queryStartInStartSpan - 1] 
              : '';
            const isWordBoundaryBefore = queryStartInStartSpan === 0 || /[^\w가-힣]/.test(beforeChar);
            
            // ✅ 끝 span에서 단어 경계 체크
            const endSpanText = spanTexts[queryEndSpanIdx].text.toLowerCase();
            const afterChar = queryEndInEndSpan < endSpanText.length 
              ? endSpanText[queryEndInEndSpan] 
              : '';
            
            // ✅ span 경계는 단어 경계로 간주
            // 1. 검색어가 span의 끝에서 끝나는 경우 (queryEndInEndSpan === endSpanText.length)
            // 2. 검색어가 다음 span의 시작에서 끝나는 경우 (queryEndInEndSpan === 0 && 다른 span)
            // 예: span1="과태료", span2="를" → "과태료"는 span1의 끝에서 끝나므로 단어 경계로 인정
            const isAtSpanEnd = queryEndInEndSpan >= endSpanText.length;
            const isAtNextSpanStart = queryEndInEndSpan === 0 && queryEndSpanIdx > queryStartSpanIdx;
            const isAtSpanBoundary = isAtSpanEnd || isAtNextSpanStart;
            
            // ✅ 한글 조사/어미 패턴 (검색어 뒤에 붙을 수 있는 것들)
            // 조사: 을, 를, 이, 가, 에, 에서, 와, 과, 로, 으로, 의, 도, 만, 부터, 까지, 조차, 마저 등
            // 어미: 은, 는, 이다, 이며, 으며 등
            let isKoreanParticle = false;
            if (afterChar && !isAtSpanBoundary && /[가-힣]/.test(afterChar)) {
              // 검색어 바로 뒤 문자부터 시작하는 텍스트 확인 (최대 3글자까지)
              const afterText = endSpanText.substring(queryEndInEndSpan, Math.min(queryEndInEndSpan + 3, endSpanText.length));
              // 일반적인 한글 조사/어미 패턴
              const koreanParticlePattern = /^[을를이가에에서와과로으로의도만부터까지조차마저은는이다이며으며]/;
              isKoreanParticle = koreanParticlePattern.test(afterText);
            }
            
            // ✅ 단어 경계 판단:
            // 1. span 경계
            // 2. 공백/구두점 등 비문자
            // 3. 한글 조사/어미 (검색어 뒤에 붙어있어도 단어 경계로 인정)
            const isWordBoundaryAfter = isAtSpanBoundary || 
                                       /[^\w가-힣]/.test(afterChar) ||
                                       isKoreanParticle;
            
            // ✅ 검색어가 단어 경계에서 일치하는 경우에만 하이라이트
            if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
              // 단어 경계가 아니면 건너뛰기
              if (queryHighlighted <= 3) {
                console.log(`  ✗ [검색] 다중 span 하이라이트 건너뜀 (단어 경계 아님): "${combinedText.substring(0, 50)}"`);
              }
              continue; // 다음 span 조합 시도
            }
            
            // ✅ 검색어가 정확히 일치하는 부분만 하이라이트
            // 검색어의 시작과 끝 위치를 정확히 계산하여 해당 span들을 분할
            charCount = 0;
            let spansToProcess = [];
            
            for (let k = 0; k < spanTexts.length; k++) {
              const spanInfo = spanTexts[k];
              const spanText = spanInfo.text;
              const spanStart = charCount;
              const spanEnd = charCount + spanText.length;
              
              // ✅ 검색어가 이 span과 겹치는지 확인
              // 겹침 조건: span의 시작이 queryEnd보다 작고, span의 끝이 queryStart보다 커야 함
              const hasOverlap = spanStart < queryEnd && spanEnd > queryStart;
              
              if (hasOverlap) {
                // span 내에서 검색어의 시작과 끝 위치 계산
                const spanQueryStart = Math.max(0, queryStart - spanStart);
                const spanQueryEnd = Math.min(spanText.length, queryEnd - spanStart);
                spansToProcess.push({
                  span: spanInfo.span,
                  spanStart: spanStart,
                  spanEnd: spanEnd,
                  queryStartInSpan: spanQueryStart,
                  queryEndInSpan: spanQueryEnd
                });
              }
              
              charCount += spanText.length;
            }
            
            // ✅ 각 span을 검색어 부분만 하이라이트하도록 분할
            // 역순으로 처리하여 인덱스 변경 문제 방지
            for (let k = spansToProcess.length - 1; k >= 0; k--) {
              const spanInfo = spansToProcess[k];
              const span = spanInfo.span;
              const spanText = span.textContent || '';
              
              // span 내에서 검색어 위치
              const localQueryStart = spanInfo.queryStartInSpan;
              const localQueryEnd = spanInfo.queryEndInSpan;
              
              // span을 분할하여 검색어 부분만 하이라이트
              if (localQueryStart === 0 && localQueryEnd === spanText.length) {
                // span 전체가 검색어인 경우
                span.classList.add('highlight-word');
                queryHighlighted++;
                totalHighlighted++;
                processedSpans.add(span);
              } else {
                // span의 일부만 검색어인 경우 - 분할 필요
                const beforeText = spanText.substring(0, localQueryStart);
                const matchText = spanText.substring(localQueryStart, localQueryEnd);
                const afterText = spanText.substring(localQueryEnd);
                
                // span의 스타일 복사 함수
                const copySpanStyles = (source, target) => {
                  const style = window.getComputedStyle(source);
                  const styleProps = [
                    'position', 'left', 'top', 'fontSize', 'fontFamily', 'fontWeight',
                    'transform', 'transformOrigin', 'color', 'whiteSpace', 'letterSpacing',
                    'wordSpacing', 'textRendering', 'textTransform'
                  ];
                  styleProps.forEach(prop => {
                    const value = style[prop];
                    if (value) {
                      target.style[prop] = value;
                    }
                  });
                  target.className = source.className;
                };
                
                const parent = span.parentNode;
                const fragment = document.createDocumentFragment();
                
                if (beforeText) {
                  const beforeSpan = span.cloneNode(false);
                  beforeSpan.textContent = beforeText;
                  copySpanStyles(span, beforeSpan);
                  fragment.appendChild(beforeSpan);
                }
                
                const highlightSpan = span.cloneNode(false);
                highlightSpan.textContent = matchText;
                highlightSpan.classList.add('highlight-word');
                copySpanStyles(span, highlightSpan);
                fragment.appendChild(highlightSpan);
                
                if (afterText) {
                  const afterSpan = span.cloneNode(false);
                  afterSpan.textContent = afterText;
                  copySpanStyles(span, afterSpan);
                  fragment.appendChild(afterSpan);
                }
                
                parent.replaceChild(fragment, span);
                queryHighlighted++;
                totalHighlighted++;
                processedSpans.add(span);
                
                // DOM이 변경되었으므로 span을 다시 수집
                textSpans = Array.from(textLayer.querySelectorAll('span'));
              }
              
              if (queryHighlighted <= 5) {
                console.log(`  ✓ [검색] 다중 span 분할 하이라이트: "${spanText.substring(localQueryStart, localQueryEnd)}"`);
              }
            }
            
            break; // 검색어를 찾았으므로 더 이상 조합하지 않음
          }
        }
      }
    }
    
    console.log(`✅ [검색] 검색어 "${queryOriginal}" 처리 완료: ${queryHighlighted}개 하이라이트`);
  });
  
  console.log(`✅ [검색] 전체 하이라이트 완료: 총 ${totalHighlighted}개 하이라이트`);
  
  // 2단계: 복수 검색어(2개 이상)인 경우 문장/라인 하이라이트 적용
  if (searchQueries.length >= 2) {
    console.log(`🔍 [검색] 복수 검색어 감지: 문장/라인 하이라이트 시작`);
    applySentenceOrLineHighlight(textLayer, searchQueries);
  } else {
    // 단일 검색어인 경우 기존 문장 하이라이트 제거
    textLayer.querySelectorAll('.highlight-sentence').forEach(el => {
      el.classList.remove('highlight-sentence');
    });
    console.log('ℹ️ [검색] 단일 검색어: 문장 하이라이트를 적용하지 않습니다.');
  }
  
  console.log('✅ [검색] 하이라이트 적용 완료');
}

/**
 * 검색용 하이라이트된 요소로 스크롤
 * 검색어 하이라이트로 스크롤
 * @param {HTMLElement} textLayer - 텍스트 레이어 요소
 * @param {number} currentIndex - 현재 검색 결과 인덱스
 */
function scrollToHighlightForSearch(textLayer, currentIndex = 0) {
  if (!textLayer) {
    if (typeof window.viewerWrapper !== 'undefined' && window.viewerWrapper) {
      window.viewerWrapper.scrollTop = 0;
    }
    return;
  }
  
  // 검색어 하이라이트로 스크롤
  const wordHighlight = textLayer.querySelector('.highlight-word');
  if (wordHighlight) {
    console.log('📍 [검색] 검색어 하이라이트 위치로 스크롤 중...');
    wordHighlight.scrollIntoView({
      behavior: 'auto',
      block: 'center',
      inline: 'nearest'
    });
    console.log('✅ [검색] 검색어 하이라이트 위치로 스크롤 완료');
    return;
  }
  
  // 하이라이트가 없으면 페이지 상단으로
  if (typeof window.viewerWrapper !== 'undefined' && window.viewerWrapper) {
    window.viewerWrapper.scrollTop = 0;
    console.log('📍 [검색] 하이라이트 없음, 페이지 상단으로 스크롤');
  }
}
