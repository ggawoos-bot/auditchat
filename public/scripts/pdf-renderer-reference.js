// PDF 렌더러 모듈 - 참조 클릭용 (원숫자 클릭)
// 이 모듈은 전역 변수들에 의존합니다.

/**
 * 참조 클릭용 페이지 렌더링 함수
 * URL 파라미터의 키워드와 검색 텍스트를 사용하여 하이라이트
 * @param {number} num - 페이지 번호
 * @param {HTMLElement} canvas - 캔버스 요소
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {HTMLElement} textLayerDiv - 텍스트 레이어 컨테이너
 * @param {Object} options - 옵션 객체
 * @param {string[]} options.highlightKeywords - 하이라이트할 키워드 배열
 * @param {string} options.searchText - 검색 텍스트
 * @param {Function} options.onComplete - 렌더링 완료 콜백
 */
function renderPageForReference(num, canvas, ctx, textLayerDiv, options = {}) {
  const { highlightKeywords = [], searchText = '', onComplete } = options;
  
  console.log(`🔄 [참조] renderPage 호출: ${num}`);
  
  if (!window.pdfDoc) {
    console.error('❌ [참조] PDF 문서가 로드되지 않았습니다.');
    if (onComplete) onComplete(num);
    return;
  }
  
  window.pdfDoc.getPage(num).then((page) => {
    console.log(`📄 [참조] PDF 페이지 ${num} 로드 완료, 렌더링 시작`);
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    
    const renderTask = page.render(renderContext);
    
    renderTask.promise.then(() => {
      console.log(`✅ [참조] PDF 페이지 ${num} 캔버스 렌더링 완료`);
      
      return page.getTextContent();
    }).then((textContent) => {
      // 텍스트 레이어 초기화
      textLayerDiv.innerHTML = '';
      textLayerDiv.style.width = viewport.width + 'px';
      textLayerDiv.style.height = viewport.height + 'px';
      
      // PDF.js의 텍스트 레이어 렌더링
      try {
        pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: viewport,
          textDivs: []
        });
      } catch (error) {
        console.warn('⚠️ [참조] 텍스트 레이어 렌더링 실패 (계속 진행):', error);
      }
      
      // 하이라이트 적용 및 스크롤 (텍스트 레이어가 렌더링된 후)
      setTimeout(() => {
        // 참조용 하이라이트 함수 사용
        applyHighlightForReference(textLayerDiv, highlightKeywords, searchText);
        scrollToHighlightForReference(textLayerDiv);
        console.log(`✅ [참조] 페이지 ${num} 렌더링 및 하이라이트 완료`);
        
        if (onComplete) {
          onComplete(num);
        }
      }, 300);
    }).catch((error) => {
      console.error('❌ [참조] 텍스트 레이어 렌더링 오류:', error);
      if (onComplete) {
        onComplete(num);
      }
    });
  }).catch((error) => {
    console.error(`❌ [참조] PDF 페이지 ${num} 로드 실패:`, error);
    if (onComplete) {
      onComplete(num);
    }
  });
}

