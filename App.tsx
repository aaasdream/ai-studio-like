import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MainChat from './components/MainChat';
import RightPanel from './components/RightPanel';
import BulkRunPanel from './components/BulkRunPanel';
import { SessionData, ModelConfig, ChatMessage, Role, Attachment, ContextCacheConfig } from './types';
import { DEFAULT_CONFIG, INITIAL_SYSTEM_INSTRUCTION, AVAILABLE_MODELS } from './constants';
import { createChatSession, streamMessage, estimateTokens, createCache, formatHistory, deleteCache, getBatchJob } from './services/geminiService';
import { saveCostRecord, getDailyCost, getMonthlyCost } from './services/costService';
import { getBatchHistory, updateBatchJobStatus, deleteBatchJob, saveBatchJob } from './services/batchService';
import { BatchJobRecord } from './types';

export default function App() {
  // State
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('default');
  const [systemInstruction, setSystemInstruction] = useState(INITIAL_SYSTEM_INSTRUCTION);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [config, setConfig] = useState<ModelConfig>(DEFAULT_CONFIG);
  const [contextCache, setContextCache] = useState<ContextCacheConfig>({ 
    enabled: false, 
    ttlSeconds: 300, 
    status: 'none' 
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [todayCost, setTodayCost] = useState(0);
  const [monthCost, setMonthCost] = useState(0);
  const [batchJobs, setBatchJobs] = useState<BatchJobRecord[]>([]);
  const [activeView, setActiveView] = useState<'chat' | 'bulk'>('chat');
  
  // Ref for persistent ChatSession
  const chatSessionRef = React.useRef<any>(null);

  // Reset session ref when key parameters change
  useEffect(() => {
    chatSessionRef.current = null;
  }, [currentSessionId, config.model, systemInstruction, contextCache.cacheName, config.tools]); // Added config.tools dependency implicitly via config object, but explicit is better if I destructured. Here config is object.
  
  // API Key State
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });

  // Save API key to local storage
  useEffect(() => {
    localStorage.setItem('gemini_api_key', apiKey);
  }, [apiKey]);

  // Initialize default session
  useEffect(() => {
    const defaultSession: SessionData = {
      id: 'default',
      title: 'Untitled Prompt',
      systemInstruction: INITIAL_SYSTEM_INSTRUCTION,
      messages: [],
      config: DEFAULT_CONFIG,
      updatedAt: Date.now()
    };
    setSessions([defaultSession]);

    // Initialize costs
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    setTodayCost(getDailyCost(todayStr));
    setMonthCost(getMonthlyCost(now.getFullYear(), now.getMonth()));
    setBatchJobs(getBatchHistory());
  }, []);

  // Update session data when internal state changes
  useEffect(() => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return {
          ...s,
          systemInstruction,
          messages,
          config,
          updatedAt: Date.now()
        };
      }
      return s;
    }));
  }, [messages, config, systemInstruction, currentSessionId]);

  const handleNewChat = () => {
    const newId = Date.now().toString();
    const newSession: SessionData = {
      id: newId,
      title: 'New Prompt',
      systemInstruction: INITIAL_SYSTEM_INSTRUCTION,
      messages: [],
      config: DEFAULT_CONFIG,
      updatedAt: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setMessages([]);
    setSystemInstruction(INITIAL_SYSTEM_INSTRUCTION);
    setConfig(DEFAULT_CONFIG);
  };

  const handleSelectSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setCurrentSessionId(id);
      setMessages(session.messages);
      setSystemInstruction(session.systemInstruction);
      setConfig(session.config);
    }
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    if (newSessions.length === 0) {
       handleNewChat();
    } else {
       setSessions(newSessions);
       if (currentSessionId === id) {
         handleSelectSession(newSessions[0].id);
       }
    }
  };

  // --- Export / Import Logic ---
  const handleExportSession = () => {
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session) return;
    
    const exportData = {
        ...session,
        exportDate: new Date().toISOString(),
        appVersion: "1.0"
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-chat-${session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${session.id.slice(-4)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportSession = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        // Basic Validation
        if (!data.messages || !Array.isArray(data.messages)) {
            throw new Error("Invalid session format");
        }

        const newId = Date.now().toString();
        const newSession: SessionData = {
            id: newId,
            title: data.title ? `${data.title} (Import)` : 'Imported Chat',
            systemInstruction: data.systemInstruction || "",
            messages: data.messages,
            config: data.config || DEFAULT_CONFIG,
            updatedAt: Date.now()
        };

        setSessions(prev => [newSession, ...prev]);
        handleSelectSession(newId); // Switch to imported session

      } catch (err) {
        alert("Failed to import session. Invalid JSON file.");
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  const handleCreateCache = async (file: File, ttlSeconds?: number): Promise<{ name: string } | null> => {
    if (!apiKey) {
      alert("Please enter API Key first.");
      return null;
    }
    
    setContextCache(prev => ({ ...prev, status: 'loading' }));

    const finalTTL = ttlSeconds || contextCache.ttlSeconds;

    try {
      // FIX: Pass systemInstruction and enableGoogleSearch to cache
      const { name, sizeBytes } = await createCache(
        apiKey,
        config.model,
        file,
        finalTTL,
        systemInstruction,
        config.enableGoogleSearch
      );

      const expirationTime = Date.now() + (finalTTL * 1000);

      setContextCache(prev => ({
        ...prev,
        status: 'active',
        cacheName: name,
        fileName: file.name,
        // Approx tokens from bytes (very rough: 1 token ~ 4 bytes)
        tokenCount: Math.ceil(sizeBytes / 4),
        expirationTime: expirationTime,
        ttlSeconds: finalTTL // Update state with used TTL
      }));

      return { name };

    } catch (error) {
      console.error("Cache creation failed:", error);
      alert("Failed to create cache. Ensure your file meets the minimum token requirements (1024 for Flash, 4096 for Pro).");
      setContextCache(prev => ({ ...prev, status: 'error' }));
      return null;
    }
  };

  const handleDeleteCache = async () => {
    // FIX: Clear UI state first to avoid being stuck in "Active" status
    setContextCache(prev => ({
      ...prev,
      status: 'none',
      cacheName: undefined,
      tokenCount: 0,
      expirationTime: undefined
    }));

    // Try to delete on server side
    if (contextCache.cacheName && apiKey) {
      try {
        await deleteCache(apiKey, contextCache.cacheName);
      } catch (error) {
        // FIX: Silently handle 403/404 errors - only log to console
        // Since we've already cleared the UI state, this shouldn't disrupt the user
        console.warn("Attempted to delete cache on server but failed (it may have already expired):", error);
      }
    }
  };

  const updateCost = (inputText: string, outputText: string, exactInput?: number, exactOutput?: number) => {
    const modelData = AVAILABLE_MODELS.find(m => m.id === config.model) || AVAILABLE_MODELS[0];
    
    const inTokens = exactInput !== undefined ? exactInput : estimateTokens(inputText);
    const outTokens = exactOutput !== undefined ? exactOutput : estimateTokens(outputText);
    
    const cost = (inTokens / 1000000 * modelData.costInput) + (outTokens / 1000000 * modelData.costOutput);
    setTotalCost(prev => prev + cost);

    // Save to LocalStorage
    const now = new Date();
    saveCostRecord({
        date: now.toISOString().split('T')[0],
        model: config.model,
        inputTokens: inTokens,
        outputTokens: outTokens,
        cost: cost
    });

    // Update UI
    setTodayCost(prev => prev + cost);
    setMonthCost(prev => prev + cost);
  };

  const handleSendMessage = async (
    text: string, 
    attachments: Attachment[], 
    historyState: ChatMessage[] = messages // Optional override for history
  ) => {
    // API Key Validation - Show in Chat Log
    if (!apiKey) {
        const errorMsg: ChatMessage = {
          id: Date.now().toString(),
          role: Role.MODEL,
          text: "⚠️ **API Key Missing**: Please enter your Gemini API Key in the settings panel (right sidebar) to start chatting.",
          timestamp: Date.now(),
          isError: true
        };
        setMessages(prev => [...prev, errorMsg]);
        return;
    }

    // Prepare the history for the API (excludes the new message we are about to add)
    const history = formatHistory(historyState);

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: Role.USER,
      text: text,
      attachments,
      timestamp: Date.now()
    };
    
    // Update UI with new message (appended to the provided history state)
    setMessages([...historyState, userMsg]);
    setIsStreaming(true);

    const botMsgId = (Date.now() + 1).toString();
    const botMsg: ChatMessage = {
        id: botMsgId,
        role: Role.MODEL,
        text: '',
        timestamp: Date.now()
    };
    setMessages(prev => [...prev, botMsg]);

    try {
      // Initialize session if needed
      if (!chatSessionRef.current) {
          const activeCacheName = (contextCache.enabled && contextCache.status === 'active') 
            ? contextCache.cacheName 
            : undefined;
          const history = formatHistory(historyState);
          chatSessionRef.current = createChatSession(apiKey, config, systemInstruction, history, activeCacheName);
      }
      
      const stream = await streamMessage(chatSessionRef.current, text, attachments);
      
      let fullText = '';
      let finalThoughtSignature: string | undefined;
      let finalUsageMetadata: { promptTokenCount: number, candidatesTokenCount: number } | undefined;

      for await (const chunk of stream) {
        fullText += chunk.text;
        if (chunk.thoughtSignature) {
            finalThoughtSignature = chunk.thoughtSignature;
        }
        if (chunk.usageMetadata) {
            finalUsageMetadata = chunk.usageMetadata;
        }

        setMessages(prev => prev.map(m => 
            m.id === botMsgId ? { 
                ...m, 
                text: fullText,
                thoughtSignature: finalThoughtSignature
            } : m
        ));
      }
      
      if (finalUsageMetadata) {
          updateCost(text, fullText, finalUsageMetadata.promptTokenCount, finalUsageMetadata.candidatesTokenCount);
      } else {
          updateCost(text, fullText);
      }
      
      if (historyState.length === 0) {
         setSessions(prev => prev.map(s => 
           s.id === currentSessionId ? { ...s, title: text.slice(0, 30) + '...' } : s
         ));
      }

    } catch (error) {
      console.error(error);
      chatSessionRef.current = null;
      setMessages(prev => prev.map(m => 
        m.id === botMsgId ? { ...m, text: "Error generating response. " + (error as any).message, isError: true } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleEditMessage = (id: string, newText: string) => {
    const index = messages.findIndex(m => m.id === id);
    if (index === -1) return;

    const originalMessage = messages[index];
    
    // Keep everything BEFORE the edited message
    const newHistory = messages.slice(0, index);
    
    // Update state immediately to remove old future messages
    setMessages(newHistory);

    // Reset session ref because history has changed
    chatSessionRef.current = null;

    // Send the edited message as a new message, using the truncated history
    handleSendMessage(newText, originalMessage.attachments || [], newHistory);
  };

  const handleCheckBatchStatus = async (job: BatchJobRecord) => {
      if (!apiKey) return alert("Please enter API Key");
      try {
          const result = await getBatchJob(apiKey, job.jobName);
          const newState = result.state || "UNKNOWN";
          
          const updatedList = updateBatchJobStatus(job.id, newState);
          setBatchJobs(updatedList);
          
          alert(`Job Status: ${newState}\nCreated: ${result.createTime}`);
      } catch (e: any) {
          alert("Check failed: " + e.message);
      }
  };

  const handleAddBatchJob = (jobName: string, prompt: string) => {
      const newJob = saveBatchJob(jobName, prompt);
      setBatchJobs(prev => [newJob, ...prev]);
  };

  const handleDeleteBatchJob = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updatedList = deleteBatchJob(id);
      setBatchJobs(updatedList);
  };

  return (
    <div className="flex h-screen w-full bg-[#131314] text-[#e3e3e3] font-sans overflow-hidden">
      
      <Sidebar 
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onExportSession={handleExportSession}
        onImportSession={handleImportSession}
        batchJobs={batchJobs}
        onCheckBatchStatus={handleCheckBatchStatus}
        onDeleteBatchJob={handleDeleteBatchJob}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {activeView === 'chat' ? (
        <MainChat 
          systemInstruction={systemInstruction}
          setSystemInstruction={setSystemInstruction}
          messages={messages}
          onSendMessage={handleSendMessage}
          isStreaming={isStreaming}
          onRegenerate={() => {}}
          onEditMessage={handleEditMessage}
        />
      ) : (
        <BulkRunPanel 
            apiKey={apiKey}
            config={config}
            contextCache={contextCache}
            onCreateCache={handleCreateCache}
            systemInstruction={systemInstruction}
            onUpdateCost={(inTokens, outTokens) => {
                 const modelData = AVAILABLE_MODELS.find(m => m.id === config.model) || AVAILABLE_MODELS[0];
                 const cost = (inTokens / 1000000 * modelData.costInput) + (outTokens / 1000000 * modelData.costOutput);
                 setTotalCost(prev => prev + cost);
                 
                 // Save record
                 const now = new Date();
                 saveCostRecord({
                    date: now.toISOString().split('T')[0],
                    model: config.model,
                    inputTokens: inTokens,
                    outputTokens: outTokens,
                    cost: cost
                });

                 setTodayCost(prev => prev + cost);
                 setMonthCost(prev => prev + cost);
            }}
            onDeleteCache={handleDeleteCache}
        />
      )}

      <RightPanel 
        config={config}
        contextCache={contextCache}
        onConfigChange={setConfig}
        onCacheChange={setContextCache}
        onCreateCache={handleCreateCache}
        onDeleteCache={handleDeleteCache}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        totalCost={totalCost}
        todayCost={todayCost}
        monthCost={monthCost}
        onBatchCreated={handleAddBatchJob}
      />

    </div>
  );
}