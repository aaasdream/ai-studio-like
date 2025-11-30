import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, Eye, PiggyBank, Loader2, FileText, UploadCloud } from 'lucide-react';
import { ChatMessage, Role, Attachment, ModelConfig } from '../types';
import MessageItem from './MessageItem';
import { createCacheFromContent, formatHistory, deleteCache } from '../services/geminiService';
import { Content } from '@google/genai';

interface EconomyPanelProps {
  apiKey: string;
  config: ModelConfig;
  systemInstruction: string;
  onUpdateCost: (inTokens: number, outTokens: number) => void;
  // Shared state props from App
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  currentSessionId: string; // New prop for detecting switch
}

const EconomyPanel: React.FC<EconomyPanelProps> = ({
  apiKey,
  config,
  systemInstruction,
  onUpdateCost,
  messages,
  setMessages,
  currentSessionId
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<string>(''); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const activeCacheIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear inputs when switching sessions
  useEffect(() => {
      setInputText('');
      setAttachments([]);
      setStatus('');
      setShowDebug(false);
  }, [currentSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Unified File Handler
  const handleFiles = async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      Array.from(files).forEach(file => {
          // Check if text/code
          const isText = file.type.startsWith('text/') || 
                         /\.(txt|md|js|ts|tsx|jsx|json|py|html|css|csv|java|c|cpp|h|xml|yaml|yml)$/i.test(file.name);

          if (isText) {
              const textReader = new FileReader();
              textReader.onload = (ev) => {
                 const content = ev.target?.result as string;
                 setAttachments(prev => [...prev, {
                     name: file.name,
                     mimeType: file.type || 'text/plain',
                     data: '', 
                     textContent: content // Stored for prompt injection
                 }]);
              };
              textReader.readAsText(file);
          } else {
              // Binary
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
      });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Construct payload for Debug Preview (Using current state)
  const constructDebugPayload = (): Content[] => {
      const historyContents = formatHistory(messages);
      
      let finalUserText = "";
      attachments.forEach(att => {
          if (att.textContent) {
              finalUserText += `\n[FILE START: ${att.name}]\n${att.textContent}\n[FILE END]\n`;
          }
      });
      finalUserText += `\n${inputText}`;

      const binaryAttachments = attachments.filter(att => !att.textContent);
      
      let newParts: any[] = [{ text: finalUserText }];
      if (binaryAttachments.length > 0) {
          const attParts = binaryAttachments.map(att => ({
              inlineData: { mimeType: att.mimeType, data: att.data }
          }));
          newParts = [...attParts, ...newParts];
      }

      const nextContent: Content = { role: 'user', parts: newParts };
      return [...historyContents, nextContent];
  };

  const handleSend = async () => {
    if (!inputText.trim() && attachments.length === 0) return;
    if (!apiKey) return alert("Please enter API Key in settings.");

    setIsProcessing(true);
    setStatus('Preparing context...');

    // --- 修正重點：建立包含「完整內容」的文字 ---
    // 這樣寫入 History 後，下一輪對話才能讀到這些內容
    let fullUserText = "";
    
    // 1. Inject Text Files
    attachments.forEach(att => {
        if (att.textContent) {
            fullUserText += `\n[FILE START: ${att.name}]\n${att.textContent}\n[FILE END]\n`;
        }
    });
    
    // 2. Append User Input
    fullUserText += inputText ? `\n${inputText}` : "";
    
    // 3. Separate Binary Attachments (Images/PDFs)
    const binaryAttachments = attachments.filter(att => !att.textContent);

    // 4. Create User Message Object
    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: Role.USER,
      text: fullUserText, // Store FULL content here so it persists for next turn
      attachments: binaryAttachments, // Only keep binary, text is already merged
      timestamp: Date.now()
    };

    // 5. Update Local State & Clear Input
    // Note: We use a local variable `newHistory` for the immediate API call
    // because setMessages is async.
    const newHistory = [...messages, newUserMsg];
    setMessages(newHistory); 
    
    setInputText('');
    setAttachments([]);

    try {
        // 6. Format History for Cache (Using the updated history which includes the full text)
        // formatHistory converts ChatMessage[] -> Content[]
        const fullPayloadToCache = formatHistory(newHistory);

        setStatus('Uploading to Cache...');
        
        // TTL 5 min is plenty as we delete it immediately
        const { name: cacheName } = await createCacheFromContent(
            apiKey,
            config.model,
            fullPayloadToCache,
            300, 
            systemInstruction
        );
        
        activeCacheIdRef.current = cacheName;
        setStatus(`Cache Created (${cacheName.slice(-10)}). Triggering...`);

        // 7. Trigger Generation
        const botMsgId = (Date.now() + 1).toString();
        // Add placeholder bot message
        setMessages(prev => [...prev, {
            id: botMsgId,
            role: Role.MODEL,
            text: '',
            timestamp: Date.now()
        }]);

        const triggerPrompt = "請認真回答這對我很重要";

        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });
        const modelClient = ai.models;
        
        const result = await modelClient.generateContentStream({
            model: config.model,
            contents: [{ role: 'user', parts: [{ text: triggerPrompt }] }],
            config: {
                cachedContent: cacheName,
                temperature: config.temperature,
                maxOutputTokens: config.maxOutputTokens,
                // @ts-ignore
                thinkingLevel: config.model.includes('gemini-3') ? config.thinkingLevel : undefined
            }
        });

        let fullText = '';
        let cacheDeleted = false;

        // @ts-ignore
        for await (const chunk of result) {
            let text = '';
            // Safe text extraction
            if (typeof (chunk as any).text === 'function') {
                text = (chunk as any).text();
            } else if (typeof (chunk as any).text === 'string') {
                text = (chunk as any).text;
            }

            if (text) {
                fullText += text;
                setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: fullText } : m));
                
                // 4. Delete Cache ASAP
                if (!cacheDeleted) {
                    cacheDeleted = true;
                    deleteCache(apiKey, cacheName).then(() => {
                        setStatus(prev => `Streaming... (Cache Deleted ✅)`);
                        activeCacheIdRef.current = null;
                    }).catch(e => {
                        console.warn("Delete cache failed", e);
                        setStatus(prev => `Streaming... (Delete Failed ⚠️)`);
                    });
                }
            }
            if (chunk.usageMetadata) {
                onUpdateCost(chunk.usageMetadata.promptTokenCount, chunk.usageMetadata.candidatesTokenCount);
            }
        }
        
        setStatus('Finished.');

    } catch (error: any) {
        console.error(error);
        setStatus(`Error: ${error.message}`);
        setMessages(prev => prev.map(m => m.id === (Date.now()+1).toString() ? { ...m, text: "Error: " + error.message, isError: true } : m));
        
        if (activeCacheIdRef.current) {
             deleteCache(apiKey, activeCacheIdRef.current).catch(() => {});
             activeCacheIdRef.current = null;
        }
    } finally {
        setIsProcessing(false);
    }
  };

  // Drag & Drop Handlers
  const onDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
  };

  return (
    <div 
        className="flex-1 flex flex-col h-full relative bg-[#131314] min-w-0"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
    >
        {/* Drag Overlay */}
        {isDragging && (
            <div className="absolute inset-0 bg-green-900/20 border-2 border-green-500 border-dashed z-50 flex items-center justify-center backdrop-blur-sm pointer-events-none">
                <div className="text-green-400 font-bold text-xl flex flex-col items-center gap-2">
                    <UploadCloud size={48} />
                    <span>Drop files to add to context</span>
                </div>
            </div>
        )}
        
        {/* Header / Debug Bar */}
        <div className="bg-green-900/10 border-b border-green-900/30 p-2 flex justify-between items-center px-4">
             <div className="flex items-center gap-2 text-green-400 text-xs font-bold">
                 <PiggyBank size={14} />
                 ECONOMY MODE
             </div>
             <div className="flex items-center gap-4">
                 <span className="text-xs text-gray-400 font-mono">{status}</span>
                 <button 
                    onClick={() => setShowDebug(true)}
                    className="text-xs flex items-center gap-1 text-studio-primary hover:underline bg-[#2a2b2e] px-2 py-1 rounded"
                 >
                     <Eye size={12} /> Preview Cache
                 </button>
             </div>
        </div>

        {/* Debug Modal */}
        {showDebug && (
            <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-10 animate-in fade-in">
                <div className="bg-studio-panel border border-studio-border rounded-lg w-full max-w-3xl h-[80vh] flex flex-col shadow-2xl">
                    <div className="p-4 border-b border-studio-border flex justify-between items-center bg-[#1e1e1e]">
                        <h3 className="font-bold text-white text-sm">Preview: Content to be Cached</h3>
                        <button onClick={() => setShowDebug(false)}><X className="text-gray-400 hover:text-white"/></button>
                    </div>
                    <div className="flex-1 overflow-auto p-4 bg-[#0e0e0e] font-mono text-xs text-green-300 whitespace-pre-wrap">
                        {JSON.stringify(constructDebugPayload(), null, 2)}
                    </div>
                </div>
            </div>
        )}

        {/* Chat Area - Now uses shared 'messages' so history works */}
        <div className="flex-1 overflow-y-auto p-6 lg:px-20">
            {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-studio-subtext opacity-50">
                <div className="w-16 h-16 bg-studio-panel rounded-full flex items-center justify-center mb-4">
                    <PiggyBank size={32} className="text-green-400" />
                </div>
                <p>Economy Mode Active</p>
                <p className="text-sm mt-2 max-w-md text-center">
                    Drag files here to embed them into the context.<br/>
                    The entire conversation is cached and auto-deleted to save costs.
                </p>
            </div>
            ) : (
            messages.map((msg) => (
                <MessageItem key={msg.id} message={msg} />
            ))
            )}
            <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 p-4 lg:px-20 pb-8 bg-studio-bg">
            <div className={`bg-studio-panel border rounded-xl p-2 focus-within:ring-1 focus-within:ring-green-500 transition-all ${isDragging ? 'border-green-500' : 'border-green-900/30'}`}>
                
                {/* Attachments List */}
                {attachments.length > 0 && (
                    <div className="flex gap-2 p-2 flex-wrap">
                        {attachments.map((att, idx) => (
                            <div key={idx} className="bg-[#2a2b2e] px-2 py-1 rounded text-xs flex items-center gap-2 group border border-gray-700">
                                <FileText size={12} className="text-green-400" />
                                <span className="truncate max-w-[150px] text-gray-300">{att.name}</span>
                                {att.textContent && <span className="text-[9px] text-green-600 bg-green-900/20 px-1 rounded">TEXT</span>}
                                <button onClick={() => removeAttachment(idx)} className="text-gray-500 hover:text-red-400">
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-2 items-end">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-green-400 hover:bg-[#2a2b2e] rounded-full transition-colors"
                        disabled={isProcessing}
                        title="Attach File (Text files will be read)"
                    >
                        <Paperclip size={20} />
                        <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileSelect} />
                    </button>
                    
                    <textarea 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Type message..."
                        rows={1}
                        className="flex-1 bg-transparent border-none outline-none text-studio-text py-2 max-h-40 resize-none overflow-y-auto"
                        style={{ minHeight: '44px' }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />

                    {isProcessing ? (
                        <div className="p-2">
                             <Loader2 className="animate-spin text-green-500" size={20} />
                        </div>
                    ) : (
                        <button 
                            onClick={handleSend}
                            disabled={!inputText.trim() && attachments.length === 0}
                            className="p-2 text-studio-bg bg-green-600 hover:opacity-90 rounded-full transition-all disabled:opacity-50"
                        >
                            <Send size={20} />
                        </button>
                    )}
                </div>
            </div>
            <div className="mt-2 text-center text-[10px] text-gray-600">
                Pipeline: Pack Context & File &rarr; Create Cache &rarr; Trigger Prompt &rarr; Stream Response &rarr; Auto-Delete Cache
            </div>
        </div>
    </div>
  );
};

export default EconomyPanel;