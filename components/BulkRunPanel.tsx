import React, { useState } from 'react';
import { Play, Download, Trash2, AlertCircle, CheckCircle, Loader2, FileJson, FileSpreadsheet } from 'lucide-react';
import { BulkQAPair, ModelConfig, ContextCacheConfig } from '../types';
import { generateSingleContent, deleteCache } from '../services/geminiService';
import { AVAILABLE_MODELS } from '../constants';

interface BulkRunPanelProps {
  apiKey: string;
  config: ModelConfig;
  contextCache: ContextCacheConfig;
  onUpdateCost: (inTokens: number, outTokens: number) => void;
  onDeleteCache: () => void;
}

const BulkRunPanel: React.FC<BulkRunPanelProps> = ({ 
  apiKey, 
  config, 
  contextCache, 
  onUpdateCost,
  onDeleteCache
}) => {
  const [inputQuestions, setInputQuestions] = useState("");
  const [results, setResults] = useState<BulkQAPair[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  // 解析問題 (一行一個，排除空行)
  const parseQuestions = () => {
    return inputQuestions.split('\n').map(q => q.trim()).filter(q => q.length > 0);
  };

  const handleRun = async () => {
    if (!apiKey) return alert("Please enter API Key in settings.");
    
    // 強制檢查是否使用了快取，這是使用者的核心需求
    if (contextCache.status !== 'active' || !contextCache.cacheName) {
        const confirm = window.confirm("⚠️ 警告：目前沒有作用中的快取 (No Active Cache)。\n這樣會導致每次請求都重複計算 Token 費用，非常昂貴！\n\n確定要繼續嗎？建議先在右側面板上傳文件並建立快取。");
        if (!confirm) return;
    }

    const questions = parseQuestions();
    if (questions.length === 0) return alert("Please enter at least one question.");

    setIsRunning(true);
    setResults([]);
    setProgress(0);

    // 初始化結果列表
    const initialResults: BulkQAPair[] = questions.map((q, idx) => ({
        id: idx.toString(),
        question: q,
        answer: "",
        status: 'pending'
    }));
    setResults(initialResults);

    // 併發控制 (雖然瀏覽器有 HTTP 限制，但我們可以一次發送一批)
    // 為了最大化速度，我們使用 Promise.all 但分批次避免瞬間卡死
    const BATCH_SIZE = 5; 
    let completedCount = 0;

    for (let i = 0; i < initialResults.length; i += BATCH_SIZE) {
        const batch = initialResults.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (item) => {
            // 更新狀態為 loading
            setResults(prev => prev.map(r => r.id === item.id ? { ...r, status: 'loading' } : r));

            try {
                const response = await generateSingleContent(
                    apiKey,
                    config,
                    item.question,
                    contextCache.status === 'active' ? contextCache.cacheName : undefined
                );

                // 更新 Cost
                if (response.usageMetadata) {
                    onUpdateCost(response.usageMetadata.promptTokenCount, response.usageMetadata.candidatesTokenCount);
                }

                setResults(prev => prev.map(r => r.id === item.id ? { 
                    ...r, 
                    status: 'success', 
                    answer: response.text 
                } : r));

            } catch (err: any) {
                console.error(err);
                setResults(prev => prev.map(r => r.id === item.id ? { 
                    ...r, 
                    status: 'error', 
                    answer: `Error: ${err.message}` 
                } : r));
            } finally {
                completedCount++;
                setProgress(Math.round((completedCount / initialResults.length) * 100));
            }
        }));
    }

    setIsRunning(false);
    
    // 自動刪除快取邏輯 (可選，這裡做成按鈕讓用戶自己點比較安全，或者可以做成 checkbox)
    // alert("Batch completed!"); 
  };

  const handleDownloadJSON = () => {
    const dataStr = JSON.stringify(results, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_qa_results_${Date.now()}.json`;
    a.click();
  };

  const handleDownloadCSV = () => {
    // 簡單的 CSV 轉義
    const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`;
    const header = "ID,Question,Answer,Status\n";
    const rows = results.map(r => `${r.id},${escapeCsv(r.question)},${escapeCsv(r.answer)},${r.status}`).join("\n");
    
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_qa_results_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#131314] overflow-hidden p-6 gap-6">
      
      {/* Header */}
      <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-white mb-2">Bulk Q&A Runner (Cost Saver)</h1>
            <p className="text-sm text-gray-400">
                1. Upload file in Right Panel & Create Cache (TTL 5 min).<br/>
                2. Enter questions below.<br/>
                3. Run concurrent requests against cache.<br/>
                4. Delete cache immediately to save money.
            </p>
          </div>
          
          {/* Status Badge */}
          <div className={`px-4 py-2 rounded border ${contextCache.status === 'active' ? 'bg-green-900/20 border-green-800 text-green-400' : 'bg-red-900/20 border-red-800 text-red-400'}`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                  {contextCache.status === 'active' ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
                  {contextCache.status === 'active' ? 'CACHE ACTIVE' : 'NO ACTIVE CACHE'}
              </div>
              {contextCache.status === 'active' && (
                  <div className="text-xs mt-1 text-right">
                      <button onClick={onDeleteCache} className="underline hover:text-white">Delete Now</button>
                  </div>
              )}
          </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
          {/* Left: Input Area */}
          <div className="w-1/3 flex flex-col gap-4">
              <textarea
                className="flex-1 bg-studio-panel border border-studio-border rounded-lg p-4 text-sm font-mono text-gray-300 focus:border-studio-primary outline-none resize-none"
                placeholder="Paste your questions here (one per line)...&#10;Question 1?&#10;Question 2?&#10;..."
                value={inputQuestions}
                onChange={(e) => setInputQuestions(e.target.value)}
                disabled={isRunning}
              />
              <button
                onClick={handleRun}
                disabled={isRunning || !inputQuestions.trim()}
                className="w-full py-3 bg-studio-primary text-studio-bg font-bold rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {isRunning ? <Loader2 className="animate-spin"/> : <Play size={18} />}
                {isRunning ? `Running (${progress}%)` : 'Run Concurrent Requests'}
              </button>
          </div>

          {/* Right: Results Area */}
          <div className="flex-1 flex flex-col bg-studio-panel border border-studio-border rounded-lg overflow-hidden">
              <div className="p-3 border-b border-studio-border flex justify-between items-center bg-[#1e1e1e]">
                  <span className="text-sm font-medium">Results ({results.filter(r => r.status === 'success').length}/{results.length})</span>
                  <div className="flex gap-2">
                      <button 
                        onClick={handleDownloadCSV} 
                        disabled={results.length === 0}
                        className="p-1.5 hover:bg-[#333] rounded text-gray-400 hover:text-white flex items-center gap-1 text-xs"
                      >
                          <FileSpreadsheet size={14} /> CSV
                      </button>
                      <button 
                        onClick={handleDownloadJSON} 
                        disabled={results.length === 0}
                        className="p-1.5 hover:bg-[#333] rounded text-gray-400 hover:text-white flex items-center gap-1 text-xs"
                      >
                          <FileJson size={14} /> JSON
                      </button>
                  </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {results.length === 0 && (
                      <div className="h-full flex items-center justify-center text-gray-600 italic">
                          Results will appear here...
                      </div>
                  )}
                  {results.map((res) => (
                      <div key={res.id} className="bg-[#131314] rounded border border-studio-border p-3">
                          <div className="flex items-start gap-3 mb-2">
                              <span className="text-xs font-mono text-gray-500 mt-1">Q{parseInt(res.id)+1}</span>
                              <div className="font-medium text-gray-200">{res.question}</div>
                              <div className="ml-auto">
                                  {res.status === 'loading' && <Loader2 size={14} className="animate-spin text-blue-400"/>}
                                  {res.status === 'success' && <CheckCircle size={14} className="text-green-400"/>}
                                  {res.status === 'error' && <AlertCircle size={14} className="text-red-400"/>}
                                  {res.status === 'pending' && <span className="w-2 h-2 rounded-full bg-gray-600 block mt-1"></span>}
                              </div>
                          </div>
                          {res.answer && (
                              <div className="pl-8 text-sm text-gray-400 whitespace-pre-wrap border-l-2 border-studio-border ml-1">
                                  {res.answer}
                              </div>
                          )}
                      </div>
                  ))}
              </div>
          </div>
      </div>
    </div>
  );
};

export default BulkRunPanel;
