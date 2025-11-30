import React, { useState, useRef, useEffect } from 'react';
import { Role, ChatMessage } from '../types';
import { Bot, User, Copy, FileText, Image as ImageIcon, Pencil, X, Check, ClipboardCheck, MoreVertical, Download } from 'lucide-react';

interface MessageItemProps {
  message: ChatMessage;
  onEdit?: (id: string, newText: string) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, onEdit }) => {
  const isUser = message.role === Role.USER;
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(message.text);
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = () => {
    if (onEdit && editedText.trim() !== '' && editedText !== message.text) {
      onEdit(message.id, editedText);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedText(message.text);
    setIsEditing(false);
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (format: 'txt' | 'md') => {
      const blob = new Blob([message.text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `message_${message.id}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowMenu(false);
  };

  // Improved Markdown Parser
  const renderContent = (text: string) => {
    // Split by code blocks first
    const parts = text.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        // --- Code Block ---
        const content = part.slice(3, -3).replace(/^[a-z]+\n/, ''); // remove lang identifier line if exists
        const langMatch = part.match(/^```([a-z]+)/);
        const lang = langMatch ? langMatch[1] : 'Code';

        return (
          <div key={index} className="my-3 bg-[#1e1e1e] rounded-lg border border-studio-border overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] border-b border-studio-border">
              <span className="text-xs text-gray-400 font-mono font-bold uppercase">{lang}</span>
              <button 
                onClick={() => navigator.clipboard.writeText(content.trim())}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
              >
                <Copy size={12} /> Copy
              </button>
            </div>
            <pre className="p-3 overflow-x-auto text-sm font-mono text-[#a5d6ff] leading-relaxed">
              <code>{content}</code>
            </pre>
          </div>
        );
      } else {
        // --- Regular Text with Markdown formatting ---
        // Basic parser for Headers, Bold, Lists. 
        // Note: For full markdown support, a library like react-markdown is usually better, 
        // but this keeps it dependency-free as per request context.
        
        return (
            <div key={index} className="whitespace-pre-wrap leading-relaxed space-y-2">
                {part.split('\n').map((line, i) => {
                    if (!line.trim()) return <br key={i}/>;

                    // Headers
                    if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-bold mt-4 mb-2 text-blue-200">{processInlineStyles(line.slice(4))}</h3>;
                    if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-bold mt-6 mb-3 text-blue-300 border-b border-gray-700 pb-1">{processInlineStyles(line.slice(3))}</h2>;
                    if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold mt-6 mb-4 text-white border-b border-gray-600 pb-2">{processInlineStyles(line.slice(2))}</h1>;
                    
                    // List Items
                    if (line.trim().startsWith('- ')) {
                        return (
                            <div key={i} className="flex gap-2 ml-2">
                                <span className="text-gray-400">•</span>
                                <span>{processInlineStyles(line.trim().slice(2))}</span>
                            </div>
                        );
                    }
                    
                    // Numbered Lists (Simple check)
                    if (/^\d+\.\s/.test(line.trim())) {
                         return (
                            <div key={i} className="flex gap-2 ml-2">
                                <span className="text-gray-400 font-mono">{line.trim().split('.')[0]}.</span>
                                <span>{processInlineStyles(line.trim().replace(/^\d+\.\s/, ''))}</span>
                            </div>
                        );
                    }

                    return <div key={i}>{processInlineStyles(line)}</div>;
                })}
            </div>
        );
      }
    });
  };

  // Helper to handle bold (**text**) inside lines
  const processInlineStyles = (text: string) => {
      const parts = text.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, idx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={idx} className="text-white font-bold">{part.slice(2, -2)}</strong>;
          }
          return part;
      });
  };

  return (
    <div className={`group flex gap-4 mb-8 ${isUser ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${isUser ? 'bg-studio-border' : 'bg-studio-accent'}`}>
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>
      
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col relative min-w-[200px]`}>
        
        {/* Actions Bar (Edit/Copy/Download) - Floating above */}
        <div className={`absolute -top-6 ${isUser ? 'right-0' : 'left-0'} flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-studio-bg/80 backdrop-blur-sm rounded-full px-2 py-0.5 border border-studio-border`}>
            {/* Copy Markdown */}
            <button 
                onClick={handleCopyMarkdown}
                className="p-1 text-gray-400 hover:text-white rounded hover:bg-white/10"
                title="Copy raw markdown"
            >
                {copied ? <ClipboardCheck size={12} className="text-green-400"/> : <Copy size={12} />}
            </button>

            {/* Download Menu */}
            <div className="relative" ref={menuRef}>
                <button 
                    onClick={() => setShowMenu(!showMenu)}
                    className="p-1 text-gray-400 hover:text-white rounded hover:bg-white/10"
                    title="Options"
                >
                    <MoreVertical size={12} />
                </button>
                
                {showMenu && (
                    <div className="absolute top-full mt-1 right-0 w-32 bg-[#2a2b2e] border border-studio-border rounded-lg shadow-xl z-20 overflow-hidden flex flex-col">
                        <button onClick={() => handleDownload('txt')} className="px-3 py-2 text-xs text-left hover:bg-[#3a3b3e] text-gray-200 flex gap-2 items-center">
                            <FileText size={12}/> Save as .txt
                        </button>
                        <button onClick={() => handleDownload('md')} className="px-3 py-2 text-xs text-left hover:bg-[#3a3b3e] text-gray-200 flex gap-2 items-center">
                            <Download size={12}/> Save as .md
                        </button>
                    </div>
                )}
            </div>

            {/* Edit Button (Only for User) */}
            {isUser && !isEditing && onEdit && (
                <button 
                    onClick={() => setIsEditing(true)}
                    className="p-1 text-gray-400 hover:text-white rounded hover:bg-white/10"
                    title="Edit message"
                >
                    <Pencil size={12} />
                </button>
            )}
        </div>

        {/* Attachments rendering */}
        {message.attachments && message.attachments.length > 0 && (
           <div className="flex flex-wrap gap-2 mb-2 justify-end">
              {message.attachments.map((att, idx) => (
                  <div key={idx} className="bg-studio-panel border border-studio-border rounded-lg p-2 flex items-center gap-2">
                     {att.mimeType.startsWith('image/') ? (
                         <ImageIcon size={16} className="text-purple-400" />
                     ) : (
                         <FileText size={16} className="text-blue-400" />
                     )}
                     <div className="flex flex-col">
                        <span className="text-xs truncate max-w-[150px] font-medium">{att.name}</span>
                        <span className="text-[9px] text-gray-500 uppercase">{att.mimeType.split('/')[1] || 'FILE'}</span>
                     </div>
                  </div>
              ))}
           </div>
        )}

        <div className={`text-studio-text w-full ${message.isError ? 'text-red-400 bg-red-900/10 p-3 rounded border border-red-800' : ''}`}>
          {isEditing ? (
            <div className="bg-[#1e1e1e] border border-studio-border rounded-lg p-3 w-full min-w-[300px] shadow-lg">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-sm resize-none p-1 min-h-[100px] font-mono leading-relaxed"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-gray-700">
                <button 
                  onClick={handleCancel}
                  className="px-3 py-1.5 hover:bg-[#333] rounded text-xs text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="px-3 py-1.5 bg-studio-primary text-studio-bg rounded text-xs font-bold hover:opacity-90 flex items-center gap-1"
                >
                  <Check size={12} /> Save
                </button>
              </div>
            </div>
          ) : (
            renderContent(message.text)
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageItem;