import React from 'react';
import { SourceInfo as SourceInfoType } from '../types';

interface SourceInfoProps {
  sources: SourceInfoType[];
  onSourceClick?: (sourceId: string) => void;
  theme?: 'light' | 'dark';
}

const SourceInfo: React.FC<SourceInfoProps> = ({ sources, onSourceClick, theme = 'dark' }) => {
  if (!sources || sources.length === 0) return null;

  // PDF 파일명에서 확장자 제거하는 함수
  const removeFileExtension = (filename: string) => {
    return filename.replace(/\.pdf$/i, '');
  };

  // 텍스트에서 화이트스페이스 정리하는 함수 (탭, 연속 공백 등 제거)
  const cleanTitle = (title: string) => {
    return title
      .replace(/[\t\n\r\u00A0\u200B-\u200D\u2028\u2029\uFEFF]/g, ' ') // 모든 종류의 공백 문자를 일반 공백으로
      .replace(/\s+/g, ' ')      // 연속된 공백을 하나로
      .trim();                   // 앞뒤 공백 제거
  };

  return (
    <div
      className={
        `mt-4 p-4 rounded-lg border ` +
        (theme === 'dark'
          ? 'bg-brand-surface border-brand-secondary'
          : 'bg-white border-gray-200')
      }
    >
      <h4
        className={
          `text-sm font-semibold mb-2 ` +
          (theme === 'dark' ? 'text-brand-text-primary' : 'text-gray-900')
        }
      >
        참조 소스 (클릭 가능)
      </h4>
      <div className="space-y-2">
        {sources.map((source) => (
          <button
            key={source.id}
            onClick={() => onSourceClick?.(source.id)}
            className={
              `w-full text-left p-2 rounded transition-colors text-sm ` +
              (theme === 'dark' ? 'hover:bg-brand-secondary' : 'hover:bg-gray-100')
            }
          >
            <div className="flex items-center gap-2">
              <span
                className={
                  `px-2 py-1 rounded text-xs ` +
                  (theme === 'dark'
                    ? 'bg-brand-secondary text-brand-text-secondary'
                    : 'bg-gray-100 text-gray-700')
                }
              >
                {source.type.toUpperCase()}
              </span>
              <span
                className={
                  `font-medium ` +
                  (theme === 'dark' ? 'text-brand-text-primary' : 'text-gray-900')
                }
              >
                {cleanTitle(removeFileExtension(source.title))}
              </span>
            </div>
          </button>
        ))}
      </div>
      
      {/* 설정 링크 */}
      <div
        className={
          `mt-3 pt-3 border-t ` +
          (theme === 'dark' ? 'border-brand-secondary' : 'border-gray-200')
        }
      >
        <a 
          href="/auditchat/admin.html" 
          className={
            `inline-flex items-center gap-2 transition-colors text-sm ` +
            (theme === 'dark'
              ? 'text-brand-primary hover:text-brand-text-primary'
              : 'text-blue-600 hover:text-blue-800')
          }
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          설정
        </a>
      </div>
    </div>
  );
};

export default SourceInfo;
