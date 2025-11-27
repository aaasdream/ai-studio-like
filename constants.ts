import { ModelConfig } from './types';

export const AVAILABLE_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', costInput: 0.10, costOutput: 0.40 }, // Cost per 1M tokens (approx)
  { id: 'gemini-2.5-pro-latest', name: 'Gemini 2.5 Pro', costInput: 3.50, costOutput: 10.50 }, // Updated to 2.5 Pro
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro', costInput: 1.25, costOutput: 5.00 },
  { id: 'gemini-2.5-flash-thinking', name: 'Gemini 2.5 Flash Thinking', costInput: 0.10, costOutput: 0.40 },
];

export const DEFAULT_CONFIG: ModelConfig = {
  model: 'gemini-3-pro-preview', // 修改：預設為 Gemini 3 Pro
  temperature: 1, // Gemini 3 建議預設 1
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 65536,
  safetySettings: 'BLOCK_NONE',
  thinkingLevel: 'HIGH', 
  enableGoogleSearch: true,
};

export const INITIAL_SYSTEM_INSTRUCTION = '';

export const APP_VERSION = 'v1.0.6';