import React, { useState } from 'react';
import { Role, ChatMessage } from '../types';
import { Bot, User, Copy, FileText, Image as ImageIcon, Pencil, X, Check, ClipboardCheck } from 'lucide-react';

interface MessageItemProps {
  message: ChatMessage;
  onEdit?: (id: string, newText: string) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, onEdit }) => {
  const isUser = message.role === Role.USER;
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(message.text);
  const [copied, setCopied] = useState(false);

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

  // Simple parser to separate code blocks from text
  const renderContent = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        const content = part.slice(3, -3).replace(/^[a-z]+\n/, ''); // remove lang identifier
        return (
          <div key={index} className="my-2 bg-[#1e1e1e] rounded border border-studio-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1 bg-[#2d2d2d] border-b border-studio-border">
              <span className="text-xs text-gray-400 font-mono">Code</span>
              <button 
                onClick={() => navigator.clipboard.writeText(content.trim())}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
              >
                <Copy size={12} /> Copy
              </button>
            </div>
            <pre className="p-3 overflow-x-auto text-sm font-mono text-green-400">
              <code>{content}</code>
            </pre>
          </div>
        );
      } else {
        // Basic formatting for bold/headers
        const lines = part.split('\n');
        return (
            <div key={index} className="whitespace-pre-wrap leading-relaxed">
                {lines.map((line, i) => {
                    if (line.startsWith('###')) return <h3 key={i} className="text-lg font-bold my-2">{line.replace('###', '')}</h3>;
                    if (line.startsWith('##')) return <h2 key={i} className="text-xl font-bold my-2">{line.replace('##', '')}</h2>;
                    if (line.startsWith('**')) return <b key={i}>{line.replace(/\*\*/g, '')}</b>; // Very naive bold
                    return <span key={i}>{line}{i < lines.length - 1 ? '\n' : ''}</span>;
                })}
            </div>
        );
      }
    });
  };

  return (
    <div className={`group flex gap-4 mb-6 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-studio-border' : 'bg-studio-accent'}`}>
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>
      
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col relative`}>
        {/* Actions Bar (Edit/Copy) */}
        <div className={`absolute -top-5 ${isUser ? 'right-0' : 'left-0'} flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity`}>
            {/* Copy Markdown Button */}
            <button 
                onClick={handleCopyMarkdown}
                className="text-gray-500 hover:text-white flex items-center gap-1 text-[10px]"
                title="Copy raw markdown"
            >
                {copied ? <ClipboardCheck size={14} className="text-green-400"/> : <Copy size={14} />}
            </button>

            {/* Edit Button (Only for User) */}
            {isUser && !isEditing && onEdit && (
                <button 
                    onClick={() => setIsEditing(true)}
                    className="text-gray-500 hover:text-white"
                    title="Edit message"
                >
                    <Pencil size={14} />
                </button>
            )}
        </div>

        {/* Attachments rendering */}
        {message.attachments && message.attachments.length > 0 && (
           <div className="flex flex-wrap gap-2 mb-2 justify-end">
              {message.attachments.map((att, idx) => (
                  <div key={idx} className="bg-studio-panel border border-studio-border rounded p-2 flex items-center gap-2">
                     {att.mimeType.startsWith('image/') ? (
                         <ImageIcon size={16} className="text-purple-400" />
                     ) : (
                         <FileText size={16} className="text-blue-400" />
                     )}
                     <span className="text-xs truncate max-w-[100px]">{att.name}</span>
                  </div>
              ))}
           </div>
        )}

        <div className={`text-studio-text w-full ${message.isError ? 'text-red-400 bg-red-900/10 p-2 rounded border border-red-800' : ''}`}>
          {isEditing ? (
            <div className="bg-[#1e1e1e] border border-studio-border rounded-lg p-2 w-full min-w-[300px]">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-sm resize-none p-1 min-h-[80px]"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button 
                  onClick={handleCancel}
                  className="p-1.5 hover:bg-[#333] rounded text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
                <button 
                  onClick={handleSave}
                  className="p-1.5 bg-studio-primary text-studio-bg rounded hover:opacity-90"
                >
                  <Check size={16} />
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