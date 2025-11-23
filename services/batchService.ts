import { BatchJobRecord } from '../types';

const BATCH_STORAGE_KEY = 'gemini_batch_history';

export const getBatchHistory = (): BatchJobRecord[] => {
  const stored = localStorage.getItem(BATCH_STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const saveBatchJob = (jobName: string, prompt: string): BatchJobRecord => {
  const history = getBatchHistory();
  const newRecord: BatchJobRecord = {
    id: Date.now().toString(),
    jobName,
    promptPreview: prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt,
    status: 'JOB_STATE_PENDING', // Initial state
    createdAt: Date.now()
  };
  
  // Newest first
  const newHistory = [newRecord, ...history];
  localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(newHistory));
  return newRecord;
};

export const updateBatchJobStatus = (id: string, status: string, result?: string) => {
    const history = getBatchHistory();
    const newHistory = history.map(job => {
        if (job.id === id) {
            return { ...job, status, result };
        }
        return job;
    });
    localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(newHistory));
    return newHistory;
};

export const deleteBatchJob = (id: string) => {
    const history = getBatchHistory();
    const newHistory = history.filter(job => job.id !== id);
    localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(newHistory));
    return newHistory;
};
