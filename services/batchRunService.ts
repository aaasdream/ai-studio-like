import JSZip from 'jszip';
import { BatchSession, BatchFileItem } from '../types';

const STORAGE_KEY = 'gemini_local_batch_sessions';

// --- LocalStorage Management ---

export const getLocalBatchSessions = (): BatchSession[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error("Failed to load batch sessions", e);
        return [];
    }
};

export const saveLocalBatchSession = (session: BatchSession) => {
    const sessions = getLocalBatchSessions();
    const index = sessions.findIndex(s => s.id === session.id);
    
    if (index >= 0) {
        sessions[index] = session;
    } else {
        sessions.unshift(session); // Add to top
    }
    
    // Safety check: Limit storage size roughly (e.g., keep last 10 sessions only to prevent crash)
    if (sessions.length > 10) {
        sessions.pop(); 
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
        console.error("Storage full or error", e);
        alert("Warning: Local storage is full. Oldest sessions might be lost or functionality limited.");
    }
};

export const deleteLocalBatchSession = (id: string) => {
    const sessions = getLocalBatchSessions().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return sessions;
};

export const clearAllLocalBatchSessions = () => {
    localStorage.removeItem(STORAGE_KEY);
};

// --- File Utilities ---

// Sanitize string to be a valid filename
export const sanitizeFileName = (text: string): string => {
    return text.replace(/[/\\?%*:|"<>]/g, '-').replace(/[\r\n]/g, '').trim().slice(0, 80); 
};

export const createZipFromSession = async (session: BatchSession): Promise<Blob> => {
    const zip = new JSZip();
    
    // Create a folder inside the zip
    const folder = zip.folder(sanitizeFileName(session.name));

    session.items.forEach((item, index) => {
        // Filename rule: Use first line of question as filename (as requested)
        const firstLine = item.question.split('\n')[0].trim();
        const safeName = sanitizeFileName(firstLine) || sanitizeFileName(item.originalFileName.replace('.txt', ''));
        
        // Add index to prevent overwriting files with same name
        const fileName = `${index + 1}_${safeName}.txt`;
        
        // Content: Question + Answer
        const content = `=== QUESTION ===\n${item.question}\n\n=== ANSWER ===\n${item.answer || (item.errorMsg ? `ERROR: ${item.errorMsg}` : '')}`;
        
        if (folder) {
            folder.file(fileName, content);
        }
    });

    return await zip.generateAsync({ type: 'blob' });
};

// Helper to read file content
export const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
};

// Helper to update a specific item status in a session
export const updateItemInSession = (
    session: BatchSession, 
    itemId: string, 
    updates: Partial<BatchFileItem>
): BatchSession => {
    const newItems = session.items.map(item => 
        item.id === itemId ? { ...item, ...updates } : item
    );
    
    const completedCount = newItems.filter(i => i.status === 'success' || i.status === 'error').length;
    
    return {
        ...session,
        items: newItems,
        completedFiles: completedCount,
        isFinished: completedCount === session.totalFiles
    };
};
