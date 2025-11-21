// PDF 검색 모듈
// 이 모듈은 window.searchViewer 네임스페이스를 사용합니다.

/**
 * 검색 함수: 전체 PDF에서 검색어 찾기 (콤마 구분 지원)
 * @param {string} searchText - 검색할 텍스트
 */
async function performSearch(searchText) {
  if (!window.pdfDoc || !searchText || !searchText.trim()) {
    console.log('⚠️ [검색] 검색할 수 없습니다:', { pdfDoc: !!window.pdfDoc, searchText });
    return;
  }
  
  // ✅ 검색 모드로 전환
  window.viewerMode = 'search';
  
  // ✅ 이전 검색의 하이라이트 제거 (문장 하이라이트 포함)
  const textLayerDiv = document.querySelector('.textLayer');
  if (textLayerDiv) {
    textLayerDiv.querySelectorAll('.highlight, .highlight-strong, .highlight-current, .highlight-sentence, .highlight-word').forEach(el => {
      el.classList.remove('highlight', 'highlight-strong', 'highlight-current', 'highlight-sentence', 'highlight-word');
    });
    console.log('🧹 [검색] 이전 검색의 하이라이트 제거 완료');
  }
  
  // ✅ 공백으로 구분된 검색어 파싱 (AND 조건)
  const searchQueries = searchText
    .split(/\s+/) // 공백(연속 공백 포함)으로 분할
    .map(q => q.trim())
    .filter(q => q.length > 0)
    .map(q => q.toLowerCase());
  
  // 단일 검색어인지 복수 검색어인지 확인
  const isMultiSearch = searchQueries.length > 1;
  
  console.log(`🔍 [검색] 검색 시작: ${isMultiSearch ? '복수 검색어 (AND 조건)' : '단일 검색어'}`, searchQueries);
  
  // ✅ 네임스페이스에 저장
  window.searchViewer.searchText = searchText.trim();
  window.searchViewer.searchResults = [];
  window.searchViewer.searchIndex = -1;
  
  // 하위 호환성 유지
  window.currentSearchText = window.searchViewer.searchText;
  window.searchResults = window.searchViewer.searchResults;
  window.currentSearchIndex = window.searchViewer.searchIndex;
  
  // 검색 버튼 비활성화
  window.searchButton.disabled = true;
  window.searchButton.textContent = '검색중...';
  
  try {
    // ✅ 개선: 현재 페이지부터 검색 시작 (검색 뷰어의 현재 페이지 사용)
    const startPage = window.searchViewer.currentPage || window.currentPage || 1;
    console.log(`🔍 [검색] 검색 시작 페이지: ${startPage} (현재 페이지부터)`);
    
    // 현재 페이지부터 끝까지, 그 다음 첫 페이지부터 현재 페이지 전까지 검색 (순환)
    for (let i = 0; i < window.numPages; i++) {
      const pageNum = ((startPage - 1 + i) % window.numPages) + 1;
      
      try {
        const page = await window.pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // 페이지의 모든 텍스트 합치기
        let fullText = '';
        textContent.items.forEach(item => {
          if (item.str) {
            fullText += item.str + ' ';
          }
        });
        
        const textLower = fullText.toLowerCase();
        
        if (isMultiSearch) {
          // ✅ 복수 검색어: 모든 검색어가 포함된 페이지만 찾기 (AND 조건)
          const allKeywordsFound = searchQueries.every(query => 
            textLower.includes(query)
          );
          
          if (allKeywordsFound) {
            // 모든 검색어가 포함된 경우, 페이지를 결과에 추가
            window.searchViewer.searchResults.push({
              page: pageNum,
              index: 0, // 페이지당 하나의 결과만
              keywords: searchQueries // 하이라이트용 검색어 목록
            });
          }
        } else {
          // 단일 검색어: 기존 로직 (모든 매칭 위치 찾기)
          const query = searchQueries[0];
          let index = textLower.indexOf(query);
          let resultIndex = 0;
          
          while (index !== -1) {
            window.searchViewer.searchResults.push({
              page: pageNum,
              index: resultIndex
            });
            resultIndex++;
            index = textLower.indexOf(query, index + 1);
          }
        }
      } catch (error) {
        console.warn(`⚠️ [검색] 페이지 ${pageNum} 검색 중 오류:`, error);
      }
    }
    
    // ✅ 검색 결과를 현재 페이지 기준으로 정렬 (현재 페이지부터 순서대로)
    window.searchViewer.searchResults.sort((a, b) => {
      if (a.page !== b.page) {
        // 페이지 번호 순 (현재 페이지 기준 순환)
        const aPageOrder = ((a.page - startPage + window.numPages) % window.numPages);
        const bPageOrder = ((b.page - startPage + window.numPages) % window.numPages);
        return aPageOrder - bPageOrder;
      }
      // 같은 페이지면 인덱스 순
      return a.index - b.index;
    });
    
    // 하위 호환성 유지
    window.searchResults = window.searchViewer.searchResults;
    
    console.log(`✅ [검색] 검색 완료: ${window.searchViewer.searchResults.length}개 ${isMultiSearch ? '페이지' : '결과'} 발견`);
    
    // 검색 결과 UI 업데이트
    if (window.searchViewer.searchResults.length > 0) {
      window.searchViewer.searchIndex = 0;
      window.currentSearchIndex = 0; // 하위 호환성
      window.searchNav.style.display = 'flex';
      updateSearchNav();
      // 첫 번째 결과로 이동
      navigateToSearchResult(0);
    } else {
      window.searchNav.style.display = 'none';
      alert(isMultiSearch 
        ? `모든 검색어(${searchQueries.join(' ')})가 포함된 페이지를 찾을 수 없습니다.`
        : '검색 결과를 찾을 수 없습니다.'
      );
    }
  } catch (error) {
    console.error('❌ [검색] 검색 오류:', error);
    alert('검색 중 오류가 발생했습니다.');
  } finally {
    window.searchButton.disabled = false;
    window.searchButton.textContent = '검색';
  }
}
    
    /**
     * 검색 결과로 이동
     * @param {number} index - 검색 결과 인덱스
     */
    function navigateToSearchResult(index) {
      if (index < 0 || index >= window.searchViewer.searchResults.length) return;
      
      // ✅ 검색 모드로 전환
      window.viewerMode = 'search';
      
      window.searchViewer.searchIndex = index;
      window.currentSearchIndex = index; // 하위 호환성
      const result = window.searchViewer.searchResults[index];
      
      console.log(`📄 [검색] 검색 결과 ${index + 1}/${window.searchViewer.searchResults.length}로 이동: 페이지 ${result.page}`);
      
      // 검색 뷰어의 현재 페이지 업데이트
      window.searchViewer.currentPage = result.page;
      
      // 페이지 변경
      if (window.currentPage !== result.page) {
        window.currentPage = result.page; // 하위 호환성
        window.queueRenderPage(result.page);
        // 페이지 렌더링 완료 후 하이라이트 (renderPage 함수 내에서 처리됨)
      } else {
        // 같은 페이지면 하이라이트 적용 후 스크롤
        const textLayerDiv = document.querySelector('.textLayer');
        if (textLayerDiv) {
          setTimeout(() => {
            // 검색어 하이라이트 적용
            const searchText = window.searchViewer.searchText || '';
            if (searchText && searchText.trim()) {
              applyHighlightForSearch(textLayerDiv, [], searchText);
            }
            // 하이라이트된 위치로 스크롤
            scrollToHighlightForSearch(textLayerDiv, index);
          }, 300);
        }
      }
      
      updateSearchNav();
    }
    
    /**
     * 검색 네비게이션 UI 업데이트
     */
    function updateSearchNav() {
      if (window.searchViewer.searchResults.length === 0) {
        window.searchNav.style.display = 'none';
        return;
      }
      
      window.searchCounter.textContent = `${window.searchViewer.searchIndex + 1}/${window.searchViewer.searchResults.length}`;
      window.searchPrevBtn.disabled = window.searchViewer.searchIndex <= 0;
      window.searchNextBtn.disabled = window.searchViewer.searchIndex >= window.searchViewer.searchResults.length - 1;
    }

