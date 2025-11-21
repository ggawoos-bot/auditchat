/**
 * PDF.js Legacy 빌드 다운로드 스크립트
 * CDN에서 Legacy 빌드를 다운로드하여 public/assets에 저장
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pdfjsVersion = '5.4.296'; // 메인 버전
const legacyVersion = '3.11.174'; // Legacy 빌드가 있는 버전 (UMD 형식)
const assetsDir = path.join(__dirname, '..', 'public', 'assets');

// assets 디렉토리 생성
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // 리다이렉트 처리
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${url}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // 실패 시 파일 삭제
      reject(err);
    });
  });
}

async function downloadPdfJsLegacy() {
  console.log('📥 PDF.js Legacy 빌드 다운로드 시작...\n');
  
  // 5.4.296에는 legacy 빌드가 없으므로 일반 빌드 사용
  // 하지만 일반 빌드는 ES 모듈이므로, 대신 3.x 버전의 legacy 빌드 사용
  const legacyVersion = '3.11.174'; // Legacy 빌드가 있는 마지막 버전
  
  const files = [
    {
      url: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${legacyVersion}/legacy/build/pdf.min.js`,
      dest: path.join(assetsDir, 'pdf.min.js'),
      name: 'pdf.min.js'
    },
    {
      url: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${legacyVersion}/legacy/build/pdf.worker.min.js`,
      dest: path.join(assetsDir, 'pdf.worker.min.js'),
      name: 'pdf.worker.min.js'
    }
  ];
  
  // 대체 URL (첫 번째 실패 시)
  const fallbackFiles = [
    {
      url: `https://unpkg.com/pdfjs-dist@${legacyVersion}/legacy/build/pdf.min.js`,
      dest: path.join(assetsDir, 'pdf.min.js'),
      name: 'pdf.min.js'
    },
    {
      url: `https://unpkg.com/pdfjs-dist@${legacyVersion}/legacy/build/pdf.worker.min.js`,
      dest: path.join(assetsDir, 'pdf.worker.min.js'),
      name: 'pdf.worker.min.js'
    }
  ];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fallback = fallbackFiles[i];
    
    try {
      console.log(`[${i + 1}/${files.length}] ${file.name} 다운로드 중...`);
      await downloadFile(file.url, file.dest);
      console.log(`✅ ${file.name} 다운로드 완료`);
    } catch (error) {
      console.warn(`⚠️ 첫 번째 URL 실패, 대체 URL 시도: ${error.message}`);
      try {
        await downloadFile(fallback.url, fallback.dest);
        console.log(`✅ ${file.name} 다운로드 완료 (대체 URL)`);
      } catch (fallbackError) {
        console.error(`❌ ${file.name} 다운로드 실패: ${fallbackError.message}`);
        throw fallbackError;
      }
    }
  }
  
  console.log('\n🎉 모든 파일 다운로드 완료!');
  console.log(`📁 저장 위치: ${assetsDir}`);
}

downloadPdfJsLegacy().catch((error) => {
  console.error('\n❌ 다운로드 실패:', error.message);
  process.exit(1);
});

