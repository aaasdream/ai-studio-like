export enum Role {
  USER = 'user',
  MODEL = 'model'
}

export interface Attachment {
  name: string;
  mimeType: string;
  data: string; // Base64
}

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  attachments?: Attachment[];
  thoughtSignature?: string;
  timestamp: number;
  isError?: boolean;
}

export interface ModelConfig {
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
  safetySettings: string;
  thinkingLevel: 'LOW' | 'HIGH';
  enableGoogleSearch: boolean;
}

export interface ContextCacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  cacheName?: string; // The ID returned by API, e.g., 'caches/...'
  status: 'none' | 'loading' | 'active' | 'error';
  fileName?: string;
  tokenCount?: number;
  expirationTime?: number;
}

export interface SessionData {
  id: string;
  title: string;
  systemInstruction: string;
  messages: ChatMessage[];
  config: ModelConfig;
  updatedAt: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  totalCost: number;
}

export interface BatchJobRecord {
  id: string;          // Local unique ID
  jobName: string;     // Google API ID (e.g., "batches/123...")
  promptPreview: string;
  status: string;      // "JOB_STATE_PENDING", "JOB_STATE_SUCCEEDED", etc.
  createdAt: number;
  result?: string;     // If succeeded, store short result or download link
}

export type StreamChunk = {
    text: string;
    thoughtSignature?: string;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
};