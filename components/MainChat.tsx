import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic, StopCircle, RefreshCw, X } from 'lucide-react';
import { ChatMessage, Role, Attachment } from '../types';
import MessageItem from './MessageItem';

interface MainChatProps {
  systemInstruction: string;
  setSystemInstruction: (val: string) => void;
  messages: ChatMessage[];
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  isStreaming: boolean;
  onRegenerate: () => void;
  onEditMessage: (id: string, newText: string) => void;
}

const MainChat: React.FC<MainChatProps> = ({
  systemInstruction,
  setSystemInstruction,
  messages,
  onSendMessage,
  isStreaming,
  onRegenerate,
  onEditMessage
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSend = () => {
    if (!inputText.trim() && attachments.length === 0) return;
    onSendMessage(inputText, attachments);
    setInputText('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setAttachments(prev => [...prev, {
            name: file.name,
            mimeType: file.type,
            data: base64String
        }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Drag and drop handlers
  const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
           const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                setAttachments(prev => [...prev, {
                    name: file.name,
                    mimeType: file.type,
                    data: base64String
                }]);
            };
            reader.readAsDataURL(file);
      }
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  return (
    <div 
        className="flex-1 flex flex-col h-full relative min-w-0"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
    >
      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 lg:px-20">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-studio-subtext opacity-50">
            <div className="w-16 h-16 bg-studio-panel rounded-full flex items-center justify-center mb-4">
               <RefreshCw size={32} />
            </div>
            <p>Start a conversation with the model</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageItem 
              key={msg.id} 
              message={msg} 
              onEdit={onEditMessage}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 p-4 lg:px-20 pb-8 bg-studio-bg">
        {/* Token Counter Stub */}
        <div className="flex justify-end mb-2 text-xs text-studio-subtext">
            <span>{inputText.length} chars</span>
        </div>

        <div className="bg-studio-panel border border-studio-border rounded-xl p-2 focus-within:ring-1 focus-within:ring-studio-primary transition-all">
          
          {/* Attachment Preview */}
          {attachments.length > 0 && (
              <div className="flex gap-2 p-2 flex-wrap">
                  {attachments.map((att, idx) => (
                      <div key={idx} className="bg-[#2a2b2e] px-2 py-1 rounded text-xs flex items-center gap-2 group">
                          <span className="truncate max-w-[150px]">{att.name}</span>
                          <button onClick={() => removeAttachment(idx)} className="text-gray-400 hover:text-red-400">
                              <X size={12} />
                          </button>
                      </div>
                  ))}
              </div>
          )}

          <div className="flex gap-2 items-end">
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-studio-primary hover:bg-[#2a2b2e] rounded-full transition-colors"
                title="Add media"
            >
              <Paperclip size={20} />
              <input 
                 type="file" 
                 ref={fileInputRef} 
                 className="hidden" 
                 onChange={handleFileSelect}
                 accept="image/*,application/pdf,audio/*"
              />
            </button>
            
            <textarea 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message here..."
              rows={1}
              className="flex-1 bg-transparent border-none outline-none text-studio-text py-2 max-h-40 resize-none overflow-y-auto"
              style={{ minHeight: '44px' }}
            />

            {isStreaming ? (
                <div className="p-2">
                    <div className="w-5 h-5 border-2 border-studio-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : (
                 <button 
                    onClick={handleSend}
                    disabled={!inputText.trim() && attachments.length === 0}
                    className="p-2 text-studio-bg bg-studio-primary hover:opacity-90 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Send size={20} />
                </button>
            )}
          </div>
        </div>
        <div className="mt-2 text-center text-xs text-studio-subtext">
            Gemini may display inaccurate info, including about people, so double-check its responses.
        </div>
      </div>
    </div>
  );
};

export default MainChat;