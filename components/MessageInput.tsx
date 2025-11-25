import React, { useState } from 'react';
import SendIcon from './icons/SendIcon';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  theme?: 'light' | 'dark';
}

const MessageInput: React.FC<MessageInputProps> = ({ 
  onSendMessage, 
  disabled = false, 
  placeholder = "메시지를 입력하세요...",
  theme = 'dark'
}) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;
    
    onSendMessage(message.trim());
    setMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex gap-2 p-2 md:p-4 border-t ${
        theme === 'dark'
          ? 'bg-brand-surface border-brand-secondary'
          : 'bg-white border-gray-200'
      }`}
    >
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        disabled={disabled}
        className={`flex-1 p-2 md:p-3 rounded-lg focus:outline-none focus:border-brand-primary disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base border ${
          theme === 'dark'
            ? 'bg-brand-bg border-brand-secondary text-brand-text-primary'
            : 'bg-white border-gray-300 text-gray-900'
        }`}
      />
      <button
        type="submit"
        disabled={disabled || !message.trim()}
        className="px-3 py-2 md:px-4 md:py-3 bg-brand-primary text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        <SendIcon className="w-4 h-4 md:w-5 md:h-5" />
      </button>
    </form>
  );
};

export default MessageInput;