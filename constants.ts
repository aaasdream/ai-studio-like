import { ModelConfig } from './types';

export const AVAILABLE_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', costInput: 0.10, costOutput: 0.40 }, // Cost per 1M tokens (approx)
  { id: 'gemini-2.5-pro-latest', name: 'Gemini 2.5 Pro', costInput: 3.50, costOutput: 10.50 }, // Updated to 2.5 Pro
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro', costInput: 1.25, costOutput: 5.00 },
  { id: 'gemini-2.5-flash-thinking', name: 'Gemini 2.5 Flash Thinking', costInput: 0.10, costOutput: 0.40 },
];

export const DEFAULT_CONFIG: ModelConfig = {
  model: 'gemini-2.5-flash',
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 65536,
  safetySettings: 'BLOCK_NONE',
  thinkingLevel: 'HIGH', // Default for Gemini 3
  enableGoogleSearch: true,
};

export const INITIAL_SYSTEM_INSTRUCTION = "";