import React, { useState, useEffect, useRef } from 'react';
import { 
    Play, Download, Trash2, AlertCircle, CheckCircle, Loader2, 
    FolderInput, FileText, ChevronRight, ChevronDown, Archive, Database, History, X, FileUp, Zap, Square
} from 'lucide-react';
import { BatchSession, BatchFileItem, ModelConfig, ContextCacheConfig } from '../types';
import { generateBatchContent } from '../services/geminiService';
import { 
    getLocalBatchSessions, saveLocalBatchSession, deleteLocalBatchSession, 
    clearAllLocalBatchSessions, readFileContent, createZipFromSession, 
    sanitizeFileName, updateItemInSession 
} from '../services/batchRunService';

interface BulkRunPanelProps {
  apiKey: string;
  config: ModelConfig;
  contextCache: ContextCacheConfig;
  onUpdateCost: (inTokens: number, outTokens: number) => void;
  onDeleteCache: () => void;
  onCreateCache: (file: File, ttlSeconds?: number) => Promise<{ name: string } | null>;
  systemInstruction: string;
}

const BulkRunPanel: React.FC<BulkRunPanelProps> = ({ 
  apiKey, 
  config, 
  contextCache, 
  onUpdateCost,
  onDeleteCache,
  onCreateCache,
  systemInstruction
}) => {
  const [sessions, setSessions] = useState<BatchSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [autoDeleteCache, setAutoDeleteCache] = useState(true);
  const [ttlMinutes, setTtlMinutes] = useState<number>(5); // Default 5 mins
  const [concurrency, setConcurrency] = useState<number>(1); // Default 1 to avoid 503
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  
  // Context File State
  const [contextFile, setContextFile] = useState<File | null>(null);
  const [creationStatus, setCreationStatus] = useState<string>('');

  const folderInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const contextInputRef = useRef<HTMLInputElement>(null);
  
  // 用來控制迴圈停止
  const abortControllerRef = useRef<AbortController | null>(null);
  // 用來記錄當前正在使用的 Cache Name，以便緊急停止時刪除
  const currentRunningCacheRef = useRef<string | undefined>(undefined);

  // Load history on mount
  useEffect(() => {
      setSessions(getLocalBatchSessions());
  }, []);

  // Get active session object
  const activeSession = sessions.find(s => s.id === activeSessionId);

  const handleContextFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          setContextFile(e.target.files[0]);
      }
  };

  // 緊急停止按鈕
  const handleStop = async () => {
      if (!isRunning) return;
      
      const confirmStop = confirm("⚠️ 確定要停止嗎？\n這將會中斷剩餘的任務，並立即刪除 Cache 以節省費用。");
      if (!confirmStop) return;

      // 1. 發送中斷訊號
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
      }
      setIsRunning(false);
      setCreationStatus('Stopped by user.');

      // 2. 如果有 Cache，強制刪除
      if (currentRunningCacheRef.current) {
          console.log("User stopped. Deleting cache:", currentRunningCacheRef.current);
          try {
              await onDeleteCache();
              setCreationStatus('Stopped. Cache deleted.');
          } catch (e) {
              console.error("Error deleting cache on stop", e);
          }
          currentRunningCacheRef.current = undefined;
      }
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('text/') || f.name.endsWith('.txt') || f.name.endsWith('.md') || f.name.endsWith('.json') || f.name.endsWith('.js') || f.name.endsWith('.ts'));
      
      if (files.length === 0) return alert("No text files found in the selected folder.");

      const newSessionId = Date.now().toString();
      const folderName = files[0].webkitRelativePath.split('/')[0] || "Upload-" + newSessionId;

      const newItems: BatchFileItem[] = [];
      
      // Read all files (Show loading state if many files?)
      for (let i = 0; i < files.length; i++) {
          const content = await readFileContent(files[i]);
          newItems.push({
              id: `${newSessionId}-${i}`,
              originalFileName: files[i].name,
              question: content,
              answer: "",
              status: 'pending'
          });
      }

      const newSession: BatchSession = {
          id: newSessionId,
          name: folderName,
          createdAt: Date.now(),
          totalFiles: newItems.length,
          completedFiles: 0,
          items: newItems,
          isFinished: false,
          cacheNameUsed: undefined
      };

      saveLocalBatchSession(newSession);
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSessionId);
      
      // Clear input
      if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleIntegratedRun = async () => {
      if (!activeSession) return;
      if (!apiKey) return alert("Please enter API Key.");

      // 初始化中斷控制器
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      let activeCacheName = contextCache.status === 'active' ? contextCache.cacheName : undefined;

      setIsRunning(true);
      setCreationStatus('Initializing...');

      try {
          // 1. Handle Cache Creation (Only if file provided)
          if (contextFile) {
              // If there is an existing cache (even if from previous run), delete it first to avoid "State Residue"
              if (contextCache.status === 'active' || contextCache.cacheName) {
                  setCreationStatus('Cleaning up old cache...');
                  try {
                      await onDeleteCache();
                  } catch (e) {
                      console.warn("Failed to delete old cache, proceeding...", e);
                  }
              }

              setCreationStatus('Uploading & Caching file...');
              const result = await onCreateCache(contextFile, ttlMinutes * 60);
              if (!result) {
                  throw new Error("Failed to create cache");
              }
              activeCacheName = result.name;
              currentRunningCacheRef.current = activeCacheName;
              
              // Warm-up wait
              setCreationStatus(`✅ Cache Created (ID: ${activeCacheName.slice(-10)}). Warming up (5s)...`);
              await new Promise(resolve => setTimeout(resolve, 5000)); 

              setCreationStatus('Cache Ready. Starting Batch...');
          } else {
              // No new file, check if we have an existing active cache
              if (!activeCacheName) {
                  const proceed = confirm("No active context cache found. Run without context?");
                  if (!proceed) {
                      setIsRunning(false);
                      setCreationStatus('');
                      return;
                  }
              } else {
                  currentRunningCacheRef.current = activeCacheName;
                  console.log("Using existing cache:", activeCacheName);
              }
          }
      } catch (e: any) {
          console.error(e);
          setIsRunning(false);
          setCreationStatus('Error during initialization: ' + e.message);
          return;
      }
      
      if (signal.aborted) return;

      // Step 2: Start Batch
      // 降低併發數以避免 503 Overloaded 錯誤 (建議 3-5)
      const CONCURRENCY = concurrency;
      const pendingItems = activeSession.items.filter(i => i.status === 'pending' || i.status === 'error');
      
      // Queue for processing (supports re-queueing)
      const queue: { item: BatchFileItem, retries: number }[] = pendingItems.map(i => ({ item: i, retries: 0 }));

      let currentSessionState = { ...activeSession, cacheNameUsed: activeCacheName }; 
      let cacheDeleted = false;

      // Helper to process one item (Returns true if success, false if failed)
      const processItem = async (queueItem: { item: BatchFileItem, retries: number }): Promise<boolean> => {
           const { item } = queueItem;
           if (signal.aborted) return false;

           // Update status to loading
           currentSessionState = updateItemInSession(currentSessionState, item.id, { status: 'loading' });
           setSessions(prev => prev.map(s => s.id === currentSessionState.id ? currentSessionState : s));

           try {
               let finalPrompt = item.question;
               if (activeCacheName) {
                   finalPrompt = `[System Instruction: You have access to a cached document. Please answer the user's question strictly based on that document.]\n\nUser Question:\n${item.question}`;
               }

               const response = await generateBatchContent(
                   apiKey,
                   config,
                   finalPrompt,
                   activeCacheName
                   // Removed onFirstToken callback to prevent early cache deletion which breaks retries
               );

               if (response.usageMetadata) {
                   onUpdateCost(response.usageMetadata.promptTokenCount, response.usageMetadata.candidatesTokenCount);
               }

               currentSessionState = updateItemInSession(currentSessionState, item.id, { 
                   status: 'success', 
                   answer: response.text,
                   tokenUsage: {
                       prompt: response.usageMetadata?.promptTokenCount || 0,
                       candidates: response.usageMetadata?.candidatesTokenCount || 0
                   }
               });
               
               if (!signal.aborted) {
                   setSessions(prev => prev.map(s => s.id === currentSessionState.id ? currentSessionState : s));
                   saveLocalBatchSession(currentSessionState);
               }
               return true;

           } catch (err: any) {
               if (signal.aborted) return false;
               console.error(`Error processing item ${item.id}:`, err);
               
               currentSessionState = updateItemInSession(currentSessionState, item.id, { 
                   status: 'error', 
                   errorMsg: err.message 
               });
               
               if (!signal.aborted) {
                   setSessions(prev => prev.map(s => s.id === currentSessionState.id ? currentSessionState : s));
               }
               return false;
           }
      };

      // Dynamic Concurrency Pool with Re-queueing
      const executing: Promise<void>[] = [];

      while (queue.length > 0 || executing.length > 0) {
          if (signal.aborted) break;
          if (activeSessionId !== currentSessionState.id) break;

          // Fill the pool
          while (queue.length > 0 && executing.length < concurrency) {
              const queueItem = queue.shift();
              if (!queueItem) break;

              // Throttling to avoid 503
              await new Promise(resolve => setTimeout(resolve, 1000));

              const p = processItem(queueItem).then(async (success) => {
                  if (!success) {
                      // Handle Retry
                      if (queueItem.retries < 5) { // MAX_RETRIES = 5
                          queueItem.retries++;
                          const delay = Math.pow(2, queueItem.retries) * 2000; // Increased backoff
                          console.log(`Re-queueing item ${queueItem.item.id} in ${delay}ms (Attempt ${queueItem.retries})`);
                          
                          await new Promise(r => setTimeout(r, delay));
                          queue.push(queueItem);
                      } else {
                          console.error(`Item ${queueItem.item.id} failed after ${queueItem.retries} retries.`);
                      }
                  }
              });
              executing.push(p);
          }

          if (executing.length === 0 && queue.length === 0) break;

          // Wait for one to finish
          const index = await Promise.race(executing.map((p, i) => p.then(() => i)));
          executing.splice(index, 1);
      }
      
      await Promise.all(executing);

      // 如果是正常跑完 (非中斷)，且還沒刪 Cache，則執行刪除
      if (!signal.aborted) {
          setIsRunning(false);
          setCreationStatus('');
          
          if (autoDeleteCache && activeCacheName && !cacheDeleted) {
               onDeleteCache();
               cacheDeleted = true;
               currentRunningCacheRef.current = undefined;
          }
          
          if (cacheDeleted) {
              alert("Batch complete! Cache was auto-deleted.");
          } else {
              alert("Batch complete!");
          }
      }
  };

  const handleDownloadZip = async (session: BatchSession) => {
      const blob = await createZipFromSession(session);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFileName(session.name)}_results.zip`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm("Are you sure you want to delete this history?")) {
          setSessions(deleteLocalBatchSession(id));
          if (activeSessionId === id) setActiveSessionId(null);
      }
  };

  const handleClearAllHistory = () => {
      if (confirm("Delete ALL batch history? This cannot be undone.")) {
          clearAllLocalBatchSessions();
          setSessions([]);
          setActiveSessionId(null);
      }
  };

  const handleRestoreFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
      // Allow importing a folder of previously downloaded results to view them
      if (!e.target.files || e.target.files.length === 0) return;
      const files = Array.from(e.target.files);
      
      const newSessionId = Date.now().toString();
      const folderName = "Restored-" + (files[0].webkitRelativePath.split('/')[0] || "Folder");

      const newItems: BatchFileItem[] = [];

      for (let i = 0; i < files.length; i++) {
          const content = await readFileContent(files[i]);
          // Simple heuristic to split Q and A if formatted by our tool
          const parts = content.split('=== ANSWER ===');
          const question = parts[0].replace('=== QUESTION ===', '').trim();
          const answer = parts[1] ? parts[1].trim() : "";
          
          newItems.push({
              id: `${newSessionId}-${i}`,
              originalFileName: files[i].name,
              question: question,
              answer: answer,
              status: answer ? 'success' : 'pending' // Assume success if answer exists
          });
      }

      const newSession: BatchSession = {
          id: newSessionId,
          name: folderName,
          createdAt: Date.now(),
          totalFiles: newItems.length,
          completedFiles: newItems.filter(i => i.status === 'success').length,
          items: newItems,
          isFinished: true
      };

      saveLocalBatchSession(newSession);
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSessionId);
      
      if (restoreInputRef.current) restoreInputRef.current.value = '';
  };

  const pendingItems = activeSession?.items.filter(i => i.status === 'pending' || i.status === 'loading') || [];
  const completedItems = activeSession?.items.filter(i => i.status === 'success' || i.status === 'error') || [];

  return (
    <div className="flex h-full w-full bg-[#131314] text-[#e3e3e3] overflow-hidden">
        
        {/* Left Sidebar: Session List */}
        <div className="w-64 border-r border-studio-border bg-studio-bg flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-studio-border">
                <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
                    <History size={16} /> Batch History
                </h2>
                <div className="flex gap-2">
                    <button 
                        onClick={() => folderInputRef.current?.click()}
                        className="flex-1 bg-studio-primary text-studio-bg text-xs font-bold py-2 rounded flex items-center justify-center gap-1 hover:opacity-90"
                    >
                        <FolderInput size={14} /> Import Questions
                    </button>
                    <input 
                        type="file" 
                        ref={folderInputRef} 
                        // @ts-ignore - webkitdirectory is standard in modern browsers
                        webkitdirectory="" 
                        multiple 
                        className="hidden" 
                        onChange={handleFolderSelect} 
                    />
                    
                    <button 
                         onClick={() => restoreInputRef.current?.click()}
                         className="px-2 bg-studio-panel border border-studio-border text-gray-400 rounded hover:text-white"
                         title="Restore from Results Folder"
                    >
                        <Archive size={14} />
                    </button>
                    <input 
                        type="file" 
                        ref={restoreInputRef} 
                        // @ts-ignore
                        webkitdirectory="" 
                        multiple 
                        className="hidden" 
                        onChange={handleRestoreFiles} 
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {sessions.map(s => (
                    <div 
                        key={s.id}
                        onClick={() => setActiveSessionId(s.id)}
                        className={`p-3 border-b border-studio-border cursor-pointer hover:bg-studio-panel group relative ${activeSessionId === s.id ? 'bg-[#004a77]/30 border-l-2 border-l-studio-primary' : ''}`}
                    >
                        <div className="text-sm font-medium truncate pr-6">{s.name}</div>
                        <div className="text-[10px] text-gray-500 mt-1 flex justify-between">
                             <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                             <span>{s.completedFiles}/{s.totalFiles}</span>
                        </div>
                        {s.isFinished && <CheckCircle size={12} className="text-green-500 absolute top-3 right-2" />}
                        
                        <button 
                            onClick={(e) => handleDeleteSession(s.id, e)}
                            className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
                {sessions.length === 0 && (
                    <div className="p-4 text-center text-xs text-gray-500 italic">No history</div>
                )}
            </div>
            
            {sessions.length > 0 && (
                <div className="p-2 border-t border-studio-border">
                    <button 
                        onClick={handleClearAllHistory}
                        className="w-full text-[10px] text-red-400 hover:bg-red-900/20 py-1 rounded"
                    >
                        Clear All History
                    </button>
                </div>
            )}
        </div>

        {/* Main Content: Active Session */}
        <div className="flex-1 flex flex-col overflow-hidden bg-studio-panel">
            {activeSession ? (
                <>
                        {/* Header - Stop Button 移到這裡 */}
                    <div className="p-6 border-b border-studio-border bg-studio-bg">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h1 className="text-xl font-bold flex items-center gap-2">
                                    {activeSession.name}
                                    <span className={`text-xs px-2 py-0.5 rounded border ${activeSession.isFinished ? 'bg-green-900/20 border-green-800 text-green-400' : 'bg-blue-900/20 border-blue-800 text-blue-400'}`}>
                                        {activeSession.isFinished ? 'Completed' : 'Ready'}
                                    </span>
                                </h1>
                                <p className="text-xs text-gray-500 mt-1">Session ID: {activeSession.id}</p>
                            </div>

                            {/* --- 停止按鈕 (總是可見，如果是 Running 狀態) --- */}
                            {isRunning && (
                                <button
                                    onClick={handleStop}
                                    className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 hover:bg-red-700 transition-all animate-pulse border-2 border-red-400"
                                >
                                    <Square size={16} fill="currentColor" />
                                    EMERGENCY STOP
                                </button>
                            )}
                        </div>

                        {/* --- Integrated Context & Run --- */}
                        {!activeSession.isFinished && !isRunning && (
                            <div className="mb-4 bg-[#1e1e1e] border border-studio-border rounded-lg p-4 animate-in fade-in">
                                <h3 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                    <Database size={16} className="text-studio-primary"/>
                                    Context Configuration
                                </h3>
                                
                                <div className="flex gap-4 items-end">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 mb-1 block">
                                            1. Attach Context File (PDF/TXT)
                                        </label>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => contextInputRef.current?.click()}
                                                disabled={isRunning}
                                                className={`flex-1 py-2 px-3 rounded border text-sm flex items-center gap-2 truncate ${contextFile ? 'bg-studio-primary/10 border-studio-primary text-studio-primary' : 'bg-[#131314] border-studio-border text-gray-400'} disabled:opacity-50`}
                                            >
                                                <FileUp size={16} />
                                                <span className="truncate">
                                                    {contextFile ? contextFile.name : (contextCache.status === 'active' ? `Using Active: ${contextCache.fileName}` : "Select Reference File...")}
                                                </span>
                                            </button>
                                            <input type="file" ref={contextInputRef} className="hidden" onChange={handleContextFileSelect} />
                                            {contextFile && !isRunning && (
                                                <button onClick={() => setContextFile(null)} className="p-2 text-gray-500 hover:text-red-400">
                                                    <Trash2 size={16}/>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1">
                                         <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                            2. Verify System Instruction
                                            <div className="group relative">
                                                <AlertCircle size={12} className="text-gray-500 cursor-help"/>
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-black border border-gray-700 rounded text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                                    This instruction is prepended to every request in the batch.
                                                </div>
                                            </div>
                                        </label>
                                        <div className="text-xs bg-[#131314] border border-studio-border rounded p-2 text-gray-400 truncate" title={systemInstruction}>
                                            {systemInstruction ? `"${systemInstruction.slice(0, 50)}..."` : "(Empty - Model will just answer questions)"}
                                        </div>
                                    </div>

                                    {/* 按鈕區域：根據是否正在執行顯示不同按鈕 */}
                                    {isRunning ? (
                                        <button
                                            onClick={handleStop}
                                            className="h-10 px-6 bg-red-900/80 border border-red-700 text-white font-bold rounded flex items-center gap-2 hover:bg-red-800 transition-colors animate-pulse"
                                        >
                                            <Square size={16} fill="currentColor" />
                                            STOP & DELETE CACHE
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleIntegratedRun}
                                            className="h-10 px-6 bg-studio-primary text-studio-bg font-bold rounded flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
                                        >
                                            <Zap size={16} fill="currentColor" />
                                            Start Integrated Run
                                        </button>
                                    )}
                                </div>
                                
                                {creationStatus && (
                                    <div className="mt-2 text-xs text-yellow-400 flex items-center gap-2">
                                        <Loader2 size={12} className={isRunning ? "animate-spin" : ""}/> {creationStatus}
                                    </div>
                                )}
                                
                                <div className="mt-2 flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox" 
                                            checked={autoDeleteCache} 
                                            onChange={(e) => setAutoDeleteCache(e.target.checked)}
                                            className="accent-studio-primary"
                                            disabled={isRunning}
                                        />
                                        <span className="text-xs text-gray-500">Auto-delete cache immediately after all requests start (Saves money)</span>
                                    </div>

                                    <div className="flex items-center gap-2 border-l border-gray-700 pl-4">
                                        <span className="text-xs text-gray-500">TTL (Mins):</span>
                                        <input 
                                            type="number" 
                                            min="1"
                                            max="60"
                                            value={ttlMinutes}
                                            onChange={(e) => setTtlMinutes(parseInt(e.target.value) || 5)}
                                            className="w-16 bg-[#131314] border border-studio-border rounded px-2 py-1 text-xs text-gray-300 focus:border-studio-primary outline-none"
                                            disabled={isRunning}
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 border-l border-gray-700 pl-4">
                                        <span className="text-xs text-gray-500" title="Requests at the same time">Concurrency:</span>
                                        <input 
                                            type="number" 
                                            min="1"
                                            max="5" 
                                            value={concurrency}
                                            onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
                                            className="w-12 bg-[#131314] border border-studio-border rounded px-2 py-1 text-xs text-gray-300 focus:border-studio-primary outline-none"
                                            disabled={isRunning}
                                        />
                                    </div>
                                </div>
                                
                                {creationStatus && (
                                    <div className={`mt-2 text-xs flex items-center gap-2 ${
                                        creationStatus.includes('✅') || creationStatus.includes('Ready') 
                                            ? 'text-green-400' 
                                            : 'text-yellow-400'
                                    }`}>
                                        <Loader2 size={12} className={isRunning && !creationStatus.includes('Stopped') ? "animate-spin" : ""}/> 
                                        {creationStatus}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Progress Bar */}
                        <div className="h-2 w-full bg-[#131314] rounded-full overflow-hidden mb-2">
                            <div 
                                className="h-full bg-studio-primary transition-all duration-300"
                                style={{ width: `${(activeSession.completedFiles / activeSession.totalFiles) * 100}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                             <span>Progress: {activeSession.completedFiles} / {activeSession.totalFiles}</span>
                        </div>
                    </div>

                    {/* Content Area - Split View (Pending vs Completed) */}
                    <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                        
                        {/* Pending List (Hidden if empty) */}
                        {pendingItems.length > 0 && (
                             <div className={`flex-1 overflow-y-auto p-4 border-r border-studio-border min-w-[300px] ${completedItems.length > 0 ? 'hidden md:block' : 'w-full'}`}>
                                <h3 className="text-xs font-bold text-gray-500 mb-3 sticky top-0 bg-studio-panel py-2 z-10 flex justify-between">
                                    <span>PENDING / RUNNING ({pendingItems.length})</span>
                                </h3>
                                <div className="space-y-2">
                                    {pendingItems.map((item) => (
                                        <div key={item.id} className="bg-[#131314] border border-studio-border rounded p-3 opacity-80">
                                            <div className="flex items-center gap-2 mb-1">
                                                {item.status === 'loading' ? <Loader2 size={14} className="animate-spin text-blue-400"/> : <div className="w-2 h-2 rounded-full bg-gray-600"/>}
                                                <span className="text-xs font-mono truncate">{item.originalFileName}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">{item.question.slice(0, 50)}...</div>
                                        </div>
                                    ))}
                                </div>
                             </div>
                        )}

                        {/* Completed List (Results) */}
                        <div className="flex-[2] overflow-y-auto p-4 bg-[#0e0e0e]">
                            <h3 className="text-xs font-bold text-gray-500 mb-3 sticky top-0 bg-[#0e0e0e] py-2 z-10 flex justify-between items-center">
                                <span>COMPLETED ({completedItems.length})</span>
                                {completedItems.length > 0 && (
                                    <button
                                        onClick={() => handleDownloadZip(activeSession)}
                                        className="text-xs flex items-center gap-1 text-studio-primary hover:underline"
                                    >
                                        <Download size={12} /> Download ZIP
                                    </button>
                                )}
                            </h3>
                            <div className="space-y-4">
                                {completedItems.length === 0 && (
                                    <div className="text-center text-gray-600 italic py-10">Results will appear here as they finish...</div>
                                )}
                                {completedItems.map((item) => (
                                    <div key={item.id} className="bg-[#131314] border border-studio-border rounded-lg overflow-hidden">
                                        <div 
                                            className="p-3 flex items-center gap-3 cursor-pointer hover:bg-[#1e1e1e]"
                                            onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                                        >
                                            {expandedItemId === item.id ? <ChevronDown size={16} className="text-gray-500"/> : <ChevronRight size={16} className="text-gray-500"/>}
                                            <div className="text-sm font-medium text-green-400 flex-1 truncate">{item.originalFileName}</div>
                                            {item.status === 'error' && <AlertCircle size={16} className="text-red-400"/>}
                                            {item.tokenUsage && (
                                                <span className="text-[10px] font-mono text-gray-600">
                                                    {item.tokenUsage.prompt + item.tokenUsage.candidates} toks
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Auto expand recent or click to expand */}
                                        {expandedItemId === item.id && (
                                            <div className="border-t border-studio-border p-4 bg-[#1a1a1a]">
                                                 <div className="mb-2">
                                                    <span className="text-[10px] text-gray-500 uppercase">Question</span>
                                                    <div className="text-xs text-gray-400 mb-2 line-clamp-2 hover:line-clamp-none">{item.question}</div>
                                                 </div>
                                                 <div>
                                                    <span className="text-[10px] text-gray-500 uppercase">Answer</span>
                                                    <div className="text-sm text-gray-200 whitespace-pre-wrap font-mono mt-1">
                                                        {item.answer || <span className="text-red-400">{item.errorMsg}</span>}
                                                    </div>
                                                 </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                    <Database size={48} className="mb-4 opacity-20" />
                    <p className="text-lg font-medium text-gray-400">Select "Import Questions" to start</p>
                    <p className="text-sm mt-2 max-w-md text-center">
                        Select a folder of text files to process them concurrently.
                        <br/>
                        You can attach a context file in the next step.
                    </p>
                    <button 
                        onClick={() => folderInputRef.current?.click()}
                        className="mt-6 px-6 py-3 bg-studio-primary text-studio-bg font-bold rounded-full hover:opacity-90"
                    >
                        Import Questions
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};

export default BulkRunPanel;
