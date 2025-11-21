// PDF 렌더러 모듈 - 검색용
// 이 모듈은 전역 변수들에 의존합니다.

/**
 * 검색용 페이지 렌더링 함수
 * 사용자가 입력한 검색어를 사용하여 하이라이트
 * @param {number} num - 페이지 번호
 * @param {HTMLElement} canvas - 캔버스 요소
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {HTMLElement} textLayerDiv - 텍스트 레이어 컨테이너
 * @param {Object} options - 옵션 객체
 * @param {string} options.searchText - 검색 텍스트
 * @param {number} options.searchIndex - 현재 검색 결과 인덱스
 * @param {Function} options.onComplete - 렌더링 완료 콜백
 */
function renderPageForSearch(num, canvas, ctx, textLayerDiv, options = {}) {
  const { searchText = '', searchIndex = 0, onComplete } = options;
  
  console.log(`🔄 [검색] renderPage 호출: ${num}, 검색 인덱스: ${searchIndex}`);
  
  if (!window.pdfDoc) {
    console.error('❌ [검색] PDF 문서가 로드되지 않았습니다.');
    if (onComplete) onComplete(num);
    return;
  }
  
  window.pdfDoc.getPage(num).then((page) => {
    console.log(`📄 [검색] PDF 페이지 ${num} 로드 완료, 렌더링 시작`);
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    
    const renderTask = page.render(renderContext);
    
    renderTask.promise.then(() => {
      console.log(`✅ [검색] PDF 페이지 ${num} 캔버스 렌더링 완료`);
      
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
        console.warn('⚠️ [검색] 텍스트 레이어 렌더링 실패 (계속 진행):', error);
      }
      
      // ✅ 개선: MutationObserver를 사용하여 텍스트 레이어 렌더링 완료 감지
      // 고정 지연(300ms) 대신 실제 렌더링 완료 시점을 감지
      let highlightApplied = false;
      const applyHighlight = () => {
        if (highlightApplied) return;
        highlightApplied = true;
        
        // 검색어 하이라이트 적용
        if (searchText && searchText.trim()) {
          applyHighlightForSearch(textLayerDiv, [], searchText);
        }
        // 하이라이트된 위치로 스크롤
        scrollToHighlightForSearch(textLayerDiv, searchIndex);
        console.log(`✅ [검색] 페이지 ${num} 렌더링 완료`);
        
        if (onComplete) {
          onComplete(num);
        }
      };
      
      // MutationObserver로 텍스트 레이어 변경 감지
      const observer = new MutationObserver((mutations, obs) => {
        // span 요소가 추가되었는지 확인
        const spans = textLayerDiv.querySelectorAll('span');
        if (spans.length > 0) {
          // span이 추가되었으면 잠시 대기 후 하이라이트 적용 (렌더링 완료 대기)
          obs.disconnect();
          // 짧은 지연으로 마지막 span까지 렌더링 완료 대기
          setTimeout(applyHighlight, 50);
        }
      });
      
      // 텍스트 레이어 변경 감지 시작
      observer.observe(textLayerDiv, {
        childList: true,
        subtree: true
      });
      
      // 폴백: 500ms 후에도 span이 없으면 하이라이트 적용 (빈 페이지 처리)
      setTimeout(() => {
        if (!highlightApplied) {
          observer.disconnect();
          applyHighlight();
        }
      }, 500);
    }).catch((error) => {
      console.error('❌ [검색] 텍스트 레이어 렌더링 오류:', error);
      if (onComplete) {
        onComplete(num);
      }
    });
  }).catch((error) => {
    console.error(`❌ [검색] PDF 페이지 ${num} 로드 실패:`, error);
    if (onComplete) {
      onComplete(num);
    }
  });
}

