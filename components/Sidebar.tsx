import React, { useRef, useState } from 'react';
import { Plus, MessageSquare, Save, Trash2, Download, Upload, Layers, RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { SessionData, BatchJobRecord } from '../types';
import { APP_VERSION } from '../constants';

interface SidebarProps {
  sessions: SessionData[];
  currentSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  onExportSession: () => void;
  onImportSession: (file: File) => void;
  batchJobs: BatchJobRecord[];
  onCheckBatchStatus: (job: BatchJobRecord) => void;
  onDeleteBatchJob: (id: string, e: React.MouseEvent) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  sessions, 
  currentSessionId, 
  onNewChat, 
  onSelectSession,
  onDeleteSession,
  onExportSession,
  onImportSession,
  batchJobs,
  onCheckBatchStatus,
  onDeleteBatchJob
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'chats' | 'batch'>('chats');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportSession(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getStatusColor = (status: string) => {
      if (status === 'JOB_STATE_SUCCEEDED') return 'text-green-400';
      if (status === 'JOB_STATE_FAILED') return 'text-red-400';
      return 'text-yellow-400';
  };

  return (
    <div className="w-64 flex-shrink-0 bg-studio-bg border-r border-studio-border h-full flex flex-col">
      <div className="p-4 space-y-3">
        {/* Create New Button */}
        <button 
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 bg-studio-primary text-studio-bg font-medium py-3 rounded-full hover:opacity-90 transition-opacity"
        >
          <Plus size={20} />
          <span>Create new</span>
        </button>

        {/* Tabs */}
        <div className="flex bg-studio-panel p-1 rounded-lg">
            <button 
                onClick={() => setActiveTab('chats')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'chats' ? 'bg-[#333] text-white shadow' : 'text-gray-400 hover:text-gray-200'
                }`}
            >
                <MessageSquare size={14} /> Chats
            </button>
            <button 
                 onClick={() => setActiveTab('batch')}
                 className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'batch' ? 'bg-[#333] text-white shadow' : 'text-gray-400 hover:text-gray-200'
                }`}
            >
                <Layers size={14} /> Batch
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {activeTab === 'chats' ? (
            <>
                <div className="mb-2 px-3 text-xs font-semibold text-studio-subtext uppercase tracking-wider">
                Recents
                </div>
                <ul className="space-y-1">
                {sessions.map((session) => (
                    <li key={session.id} className="group relative">
                    <button
                        onClick={() => onSelectSession(session.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        currentSessionId === session.id 
                            ? 'bg-[#004a77] text-blue-100' 
                            : 'text-studio-text hover:bg-studio-panel'
                        }`}
                    >
                        <MessageSquare size={16} className={currentSessionId === session.id ? 'text-blue-200' : 'text-gray-400'} />
                        <span className="truncate flex-1 text-left">{session.title || "Untitled Prompt"}</span>
                    </button>
                    <button 
                        onClick={(e) => onDeleteSession(session.id, e)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-gray-400 transition-opacity"
                    >
                        <Trash2 size={14} />
                    </button>
                    </li>
                ))}
                {sessions.length === 0 && (
                    <li className="px-3 py-4 text-center text-sm text-gray-500 italic">No recent chats</li>
                )}
                </ul>
            </>
        ) : (
            <>
                <div className="mb-2 px-3 text-xs font-semibold text-studio-subtext uppercase tracking-wider">
                Batch History
                </div>
                <ul className="space-y-2">
                    {batchJobs.map((job) => (
                        <li key={job.id} className="bg-studio-panel border border-studio-border rounded-lg p-3 group relative">
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-[10px] font-mono ${getStatusColor(job.status)} flex items-center gap-1`}>
                                    {job.status === 'JOB_STATE_SUCCEEDED' ? <CheckCircle size={10}/> : 
                                     job.status === 'JOB_STATE_PENDING' ? <Clock size={10}/> : <AlertCircle size={10}/>}
                                    {job.status.replace('JOB_STATE_', '')}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                    {new Date(job.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="text-xs text-studio-text truncate mb-2" title={job.promptPreview}>
                                {job.promptPreview}
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => onCheckBatchStatus(job)}
                                    className="flex-1 py-1 bg-[#2a2b2e] hover:bg-[#3a3b3e] text-[10px] rounded text-gray-300 flex items-center justify-center gap-1 transition-colors"
                                >
                                    <RefreshCw size={10} /> Check
                                </button>
                                <button 
                                    onClick={(e) => onDeleteBatchJob(job.id, e)}
                                    className="p-1 hover:bg-red-900/30 text-gray-500 hover:text-red-400 rounded transition-colors"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </li>
                    ))}
                    {batchJobs.length === 0 && (
                        <li className="px-3 py-4 text-center text-sm text-gray-500 italic">No batch jobs</li>
                    )}
                </ul>
            </>
        )}
      </div>
      
      {/* Import/Export Footer */}
      <div className="p-4 border-t border-studio-border space-y-2">
         {/* Export Button */}
         <button 
            onClick={onExportSession}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-studio-subtext text-sm hover:text-white hover:bg-studio-panel rounded transition-colors"
         >
            <Download size={16} />
            <span>Export Chat</span>
         </button>

         {/* Import Button */}
         <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-studio-subtext text-sm hover:text-white hover:bg-studio-panel rounded transition-colors"
         >
            <Upload size={16} />
            <span>Import Chat</span>
         </button>
         <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".json"
            onChange={handleFileChange} 
         />
         
         <div className="pt-2 text-center">
            <span className="text-xs text-gray-600">Version {APP_VERSION}</span>
         </div>
      </div>
    </div>
  );
};

export default Sidebar;