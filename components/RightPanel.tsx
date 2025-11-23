import React, { useState, useEffect } from 'react';
import { Settings, Info, Layers, DollarSign, Database, Upload, Key, RefreshCw, Trash, CheckCircle, AlertCircle, Clock, BrainCircuit } from 'lucide-react';
import { ModelConfig, ContextCacheConfig } from '../types';
import { AVAILABLE_MODELS } from '../constants';

import { createBatchJob } from '../services/geminiService';

interface RightPanelProps {
  config: ModelConfig;
  contextCache: ContextCacheConfig;
  onConfigChange: (newConfig: ModelConfig) => void;
  onCacheChange: (newCache: ContextCacheConfig) => void;
  onCreateCache: (file: File) => void;
  onDeleteCache: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  totalCost: number;
  todayCost: number;
  monthCost: number;
  onBatchCreated: (jobName: string, prompt: string) => void;
}

const RightPanel: React.FC<RightPanelProps> = ({ 
  config, 
  contextCache,
  onConfigChange, 
  onCacheChange,
  onCreateCache,
  onDeleteCache,
  apiKey,
  onApiKeyChange,
  totalCost,
  todayCost,
  monthCost,
  onBatchCreated
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  const isGemini3 = config.model.includes('gemini-3');

  useEffect(() => {
    let interval: number;
    if (contextCache.status === 'active' && contextCache.expirationTime) {
      const updateTimer = () => {
        const now = Date.now();
        const diff = contextCache.expirationTime! - now;
        
        if (diff <= 0) {
           setTimeRemaining("00:00:00 (Expired)");
        } else {
           const hours = Math.floor(diff / (1000 * 60 * 60));
           const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
           const seconds = Math.floor((diff % (1000 * 60)) / 1000);
           setTimeRemaining(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
      };
      
      updateTimer(); 
      interval = window.setInterval(updateTimer, 1000);
    }
    return () => clearInterval(interval);
  }, [contextCache.status, contextCache.expirationTime]);

  if (!isOpen) {
    return (
      <div className="w-12 bg-studio-bg border-l border-studio-border flex flex-col items-center py-4 gap-4">
        <button onClick={() => setIsOpen(true)} className="text-gray-400 hover:text-white">
          <Settings size={20} />
        </button>
      </div>
    );
  }

  const handleChange = <K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) => {
    onConfigChange({ ...config, [key]: value });
  };

  const handleCacheFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          setSelectedFile(e.target.files[0]);
      }
  };

  const handleCreateCacheClick = () => {
      if (selectedFile) {
          onCreateCache(selectedFile);
      }
  };

  const handleBatchSubmit = async () => {
    const prompt = window.prompt("Enter the prompt for Batch processing (50% cheaper, results in 24h):");
    if (!prompt) return;

    if (!apiKey) {
        alert("Please enter API Key first.");
        return;
    }

    try {
        const result = await createBatchJob(apiKey, config.model, prompt);
        alert(`Batch Job Created!\nID: ${result.name}\nPlease save this ID to check results later.`);
        onBatchCreated(result.name, prompt);
    } catch (e: any) {
        alert("Batch failed: " + e.message);
    }
  };

  const calculateCacheCost = () => {
      if (!contextCache.tokenCount) return 0;
      // Approx: Storage is $1.00 - $4.50 per million tokens per hour depending on model
      // Simplified generic calc: $2.00 avg / 1M / hour
      const costPerHour = (contextCache.tokenCount / 1000000) * 2.00;
      return costPerHour;
  };

  return (
    <div className="w-80 bg-studio-bg border-l border-studio-border flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-studio-border flex justify-between items-center">
        <h2 className="font-semibold text-sm uppercase tracking-wide">Run Settings</h2>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
          <Settings size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* API Key Section */}
        <div className="space-y-2">
            <label className="text-xs font-semibold text-studio-subtext flex items-center gap-1">
                API KEY <span className="text-red-400">*</span>
            </label>
            <div className="relative">
                <Key size={14} className="absolute left-3 top-2.5 text-gray-500" />
                <input 
                    type="password" 
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    placeholder="Enter your Gemini API Key"
                    className="w-full bg-studio-panel border border-studio-border rounded px-3 py-2 pl-9 text-sm focus:border-studio-primary outline-none placeholder-gray-600"
                />
            </div>
            <p className="text-[10px] text-gray-500">Key is not saved to server.</p>
        </div>

        <hr className="border-studio-border" />

        {/* Model Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-studio-subtext flex items-center gap-1">
            MODEL
            <Info size={12} />
          </label>
          <select 
            value={config.model}
            onChange={(e) => handleChange('model', e.target.value)}
            className="w-full bg-studio-panel border border-studio-border rounded px-3 py-2 text-sm focus:border-studio-primary outline-none"
          >
            {AVAILABLE_MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Thinking Level (Gemini 3 Only) */}
        {isGemini3 && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                 <label className="text-xs font-semibold text-studio-subtext flex items-center gap-1 text-purple-400">
                    <BrainCircuit size={12} />
                    THINKING LEVEL
                </label>
                <div className="flex bg-studio-panel border border-studio-border rounded p-1">
                    <button 
                        onClick={() => handleChange('thinkingLevel', 'LOW')}
                        className={`flex-1 py-1 text-xs rounded transition-colors ${config.thinkingLevel === 'LOW' ? 'bg-studio-border text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Low
                    </button>
                    <button 
                        onClick={() => handleChange('thinkingLevel', 'HIGH')}
                        className={`flex-1 py-1 text-xs rounded transition-colors ${config.thinkingLevel === 'HIGH' ? 'bg-studio-border text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        High
                    </button>
                </div>
                <p className="text-[10px] text-gray-500">High is default for complex reasoning.</p>
            </div>
        )}

        {/* Google Search Toggle */}
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-studio-subtext flex items-center gap-1">
                    GOOGLE SEARCH
                </label>
                <input 
                    type="checkbox" 
                    checked={config.enableGoogleSearch} 
                    onChange={(e) => handleChange('enableGoogleSearch', e.target.checked)}
                    className="accent-studio-primary w-4 h-4 cursor-pointer"
                />
            </div>
            <p className="text-[10px] text-gray-500">Enable grounding with Google Search.</p>
        </div>

        {/* Temperature */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <label className="text-xs font-semibold text-studio-subtext">TEMPERATURE</label>
            <span className="text-xs font-mono">{config.temperature}</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="2" 
            step="0.1"
            value={config.temperature}
            onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
            className="w-full h-1 bg-studio-border rounded-lg appearance-none cursor-pointer accent-studio-primary"
          />
          {isGemini3 && config.temperature !== 1 && (
              <p className="text-[10px] text-yellow-500">Warning: 1.0 is recommended for Gemini 3.</p>
          )}
        </div>

        {/* Top P */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <label className="text-xs font-semibold text-studio-subtext">TOP P</label>
            <span className="text-xs font-mono">{config.topP}</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05"
            value={config.topP}
            onChange={(e) => handleChange('topP', parseFloat(e.target.value))}
            className="w-full h-1 bg-studio-border rounded-lg appearance-none cursor-pointer accent-studio-primary"
          />
        </div>

        {/* Top K */}
        <div className="space-y-3">
           <div className="flex justify-between">
            <label className="text-xs font-semibold text-studio-subtext">TOP K</label>
            <span className="text-xs font-mono">{config.topK}</span>
          </div>
          <input 
            type="number" 
            value={config.topK}
            onChange={(e) => handleChange('topK', parseInt(e.target.value))}
            className="w-full bg-studio-panel border border-studio-border rounded px-3 py-2 text-sm text-right outline-none focus:border-studio-primary"
          />
        </div>

        {/* Output Length */}
        <div className="space-y-3">
          <div className="flex justify-between">
             <label className="text-xs font-semibold text-studio-subtext">OUTPUT TOKEN LIMIT</label>
             <span className="text-xs font-mono">{config.maxOutputTokens}</span>
          </div>
          <input 
            type="range" 
            min="1" 
            max="65536" 
            step="100"
            value={config.maxOutputTokens}
            onChange={(e) => handleChange('maxOutputTokens', parseInt(e.target.value))}
            className="w-full h-1 bg-studio-border rounded-lg appearance-none cursor-pointer accent-studio-primary"
          />
          <div className="flex justify-between text-[10px] text-gray-500">
             <span>1</span>
             <span>64k</span>
          </div>
        </div>

        <hr className="border-studio-border" />

        {/* Explicit Context Caching */}
        <div className="space-y-2">
            <label className="text-xs font-semibold text-studio-subtext flex items-center gap-2">
            <Database size={14} /> CONTEXT CACHING (EXPLICIT)
            </label>
            <div className="p-3 bg-studio-panel rounded border border-studio-border relative overflow-hidden">
                {/* Header / Toggle */}
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Explicit Cache</span>
                    <input 
                        type="checkbox" 
                        checked={contextCache.enabled} 
                        onChange={(e) => onCacheChange({...contextCache, enabled: e.target.checked})}
                        className="accent-studio-accent w-4 h-4 cursor-pointer"
                    />
                </div>

                {contextCache.enabled && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        {/* Status Indicator */}
                        {contextCache.status === 'active' ? (
                            <div className="bg-green-900/20 border border-green-800 rounded p-2 flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-green-400 text-xs font-bold">
                                    <CheckCircle size={12} />
                                    CACHE ACTIVE
                                </div>
                                <div className="text-[10px] text-green-300 truncate">
                                    ID: {contextCache.cacheName}
                                </div>
                                <div className="flex items-center gap-2 text-green-200 text-xs font-mono mt-1">
                                    <Clock size={12} />
                                    <span>{timeRemaining}</span>
                                </div>
                                <button 
                                    onClick={onDeleteCache}
                                    className="mt-2 text-xs text-red-400 hover:text-red-300 flex items-center gap-1 self-start"
                                >
                                    <Trash size={10} /> Delete Cache
                                </button>
                            </div>
                        ) : contextCache.status === 'loading' ? (
                            <div className="flex items-center gap-2 text-xs text-studio-primary">
                                <RefreshCw size={12} className="animate-spin" />
                                Creating cache...
                            </div>
                        ) : contextCache.status === 'error' ? (
                            <div className="text-red-400 text-xs flex items-center gap-1">
                                <AlertCircle size={12} />
                                Creation Failed. Try larger file.
                            </div>
                        ) : null}

                        {/* Upload & Create (Only if no active cache) */}
                        {contextCache.status !== 'active' && contextCache.status !== 'loading' && (
                            <>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Upload Context (PDF/Txt/Code)</label>
                                    <label className="flex items-center gap-2 w-full p-2 bg-[#131314] border border-studio-border border-dashed rounded cursor-pointer hover:border-studio-primary transition-colors">
                                        <Upload size={14} className="text-studio-primary" />
                                        <span className="text-xs text-studio-text truncate flex-1">
                                            {selectedFile ? selectedFile.name : "Select file..."}
                                        </span>
                                        <input type="file" className="hidden" onChange={handleCacheFileSelect} />
                                    </label>
                                </div>
                                
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-400">Retention (TTL Seconds)</label>
                                    <input 
                                        type="number" 
                                        value={contextCache.ttlSeconds}
                                        onChange={(e) => onCacheChange({...contextCache, ttlSeconds: parseInt(e.target.value)})}
                                        className="w-full bg-[#131314] border border-studio-border rounded px-2 py-1 text-xs"
                                        min="300"
                                    />
                                </div>

                                <button
                                    onClick={handleCreateCacheClick}
                                    disabled={!selectedFile}
                                    className="w-full py-1.5 bg-studio-primary text-studio-bg text-xs font-bold rounded disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                                >
                                    Create Cache
                                </button>
                                <p className="text-[10px] text-gray-500">Min tokens: 1024 (Flash), 2048 (Gemini 3), 4096 (Pro).</p>
                            </>
                        )}
                        
                        {/* Cost Estimation */}
                        {contextCache.status === 'active' && (
                            <div className="pt-2 border-t border-studio-border/50 flex justify-between items-center text-xs">
                                <span className="text-gray-400">Est. Storage Cost:</span>
                                <span className="text-studio-primary font-mono">${calculateCacheCost().toFixed(6)} / hr</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

           {/* Batch Request */}
           <div className="pt-2">
              <button 
                  onClick={handleBatchSubmit}
                  className="w-full py-2 bg-studio-panel border border-studio-border hover:bg-[#2a2b2e] rounded text-sm flex items-center justify-center gap-2 transition-colors group"
              >
                  <Layers size={16} className="text-gray-400 group-hover:text-white" />
                  <span>Create Batch Job</span>
              </button>
              <div className="flex justify-between items-center mt-1 px-1">
                <p className="text-[10px] text-gray-500">Save 50% on costs</p>
                <span className="text-[10px] text-green-500 bg-green-900/20 px-1 rounded">Active</span>
              </div>
           </div>
      </div>

      <div className="p-4 border-t border-studio-border bg-studio-panel">
         <div className="flex flex-col gap-2">
             <div className="flex justify-between text-xs text-gray-400">
                 <span>Today:</span>
                 <span className="text-white font-mono">${todayCost.toFixed(4)}</span>
             </div>
             <div className="flex justify-between text-xs text-gray-400">
                 <span>This Month:</span>
                 <span className="text-white font-mono">${monthCost.toFixed(4)}</span>
             </div>
             
             <div className="flex items-center justify-between pt-2 border-t border-studio-border/30">
                 <div className="flex items-center gap-1 text-studio-primary">
                     <DollarSign size={16} />
                     <span className="font-mono text-lg font-bold">{totalCost.toFixed(4)}</span>
                 </div>
                 <span className="text-xs text-gray-500">Session Cost</span>
             </div>

             <button 
                onClick={() => alert("Cost History feature coming soon! (Check localStorage 'gemini_cost_history')")} 
                className="mt-1 w-full text-[10px] text-studio-primary hover:underline text-center"
            >
                View Cost Calendar
            </button>
         </div>
      </div>
    </div>
  );
};

export default RightPanel;