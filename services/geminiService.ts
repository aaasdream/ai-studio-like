import { GoogleGenAI, GenerateContentResponse, ChatSession, Content, Part } from "@google/genai";
import { ModelConfig, Attachment, ChatMessage, StreamChunk } from "../types";

// Helper to format history for the SDK
export const formatHistory = (messages: ChatMessage[]): Content[] => {
  return messages.map(msg => {
    let parts: Part[] = [{ text: msg.text }];
    if (msg.attachments && msg.attachments.length > 0) {
       const attParts = msg.attachments.map(att => ({
          inlineData: {
             mimeType: att.mimeType,
             data: att.data
          }
       }));
       parts = [...attParts, ...parts];
    }
    
    const content: any = {
      role: msg.role,
      parts: parts
    };

    // Restore thoughtSignature for Gemini 3 continuity
    if (msg.role === 'model' && msg.thoughtSignature) {
        content.thoughtSignature = msg.thoughtSignature;
    }

    return content;
  });
};

export const createChatSession = (
  apiKey: string, 
  config: ModelConfig, 
  systemInstruction: string,
  history: Content[] = [],
  cachedContentName?: string
): ChatSession => {
  const ai = new GoogleGenAI({ apiKey });
  const modelId = config.model;
  
  const generationConfig: any = {
    temperature: config.temperature,
    topP: config.topP,
    topK: config.topK,
    maxOutputTokens: config.maxOutputTokens,
  };

  // Gemini 3 Logic: Use thinkingLevel
  if (modelId.includes('gemini-3')) {
      generationConfig.thinkingLevel = config.thinkingLevel || 'HIGH'; 
      // Ensure temperature is 1 for best results as per docs, unless explicitly changed by user knowing risks
      // We apply user config, but UI warns if not 1.0
  } 
  // Gemini 2.5 Thinking Logic: Use thinkingBudget
  else if (modelId.includes('thinking')) {
      generationConfig.thinkingConfig = { thinkingBudget: 1024 };
  }

  // --- FIX: Handle Cache Limitations ---
  let sessionConfig: any = {
    safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
    ...generationConfig
  };

  if (cachedContentName) {
    // API LIMITATION: If cachedContent is present, we CANNOT send systemInstruction or tools 
    // in the GenerateContent request. They must be baked into the cache itself.
    sessionConfig.cachedContent = cachedContentName;
  } else {
    // Only apply dynamic system instructions and tools if NOT using a cache
    if (systemInstruction) {
        sessionConfig.systemInstruction = systemInstruction;
    }
    sessionConfig.tools = config.enableGoogleSearch ? [{ googleSearch: {} }] : [];
  }
  // --- FIX END ---

  return ai.chats.create({
    model: modelId,
    config: sessionConfig,
    history: history
  });
};

export const createCache = async (
  apiKey: string,
  model: string,
  file: File,
  ttlSeconds: number,
  systemInstruction?: string,
  enableGoogleSearch?: boolean
): Promise<{ name: string; sizeBytes: number }> => {
  const ai = new GoogleGenAI({ apiKey });
  
  // Convert File to content part
  let part: any;
  let mimeType = file.type;

  // Handle various text types or fall back to PDF/Image inline data
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType.endsWith('javascript') || mimeType.endsWith('python')) {
       const text = await file.text();
       part = { text };
  } else {
       // Binary formats (PDF, Image, etc.)
       const base64Data = await fileToBase64(file);
       part = {
          inlineData: {
              mimeType: mimeType || 'application/octet-stream',
              data: base64Data
          }
       };
  }
  
  const cacheConfig: any = {
      contents: [{
          role: 'user',
          parts: [part]
      }],
      ttl: `${ttlSeconds}s`
  };

  // Bake system instruction into the cache
  if (systemInstruction) {
      cacheConfig.systemInstruction = {
          parts: [{ text: systemInstruction }]
      };
  }
  
  // Note: Google Search tools are typically runtime features and may not be supported in cache config.
  // The API limitation requires us to choose between cache or dynamic tools in the request.
  // We prioritize cache functionality here.

  const cache = await ai.caches.create({
      model: model,
      config: cacheConfig
  });

  return { 
    name: cache.name, 
    // @ts-ignore
    sizeBytes: cache.sizeBytes || 0 
  };
};

export const deleteCache = async (apiKey: string, cacheName: string): Promise<void> => {
  const ai = new GoogleGenAI({ apiKey });
  await ai.caches.delete({ name: cacheName });
};

export const streamMessage = async (
  session: ChatSession, 
  message: string, 
  attachments: Attachment[]
): Promise<AsyncGenerator<StreamChunk, void, unknown>> => {
  
  let contentPart: any = { text: message };
  let parts: any[] = [contentPart];
  
  if (attachments && attachments.length > 0) {
    // Note: For large files (>20MB), consider using the Files API (ai.files.upload) 
    // instead of inlineData to avoid payload size limits.
    const attachmentParts = attachments.map(att => ({
      inlineData: {
        mimeType: att.mimeType,
        data: att.data
      }
    }));
    parts = [...attachmentParts, ...parts];
  }

  // Updated to use 'message' property as required by @google/genai SDK
  const result = await session.sendMessageStream({
    message: {
      role: 'user',
      parts: parts
    }
  });

  async function* generator() {
    for await (const chunk of result) {
       const c = chunk as any;
       const text = c.text ? c.text : '';
       const thoughtSignature = c.candidates?.[0]?.thoughtSignature;
       // @ts-ignore - Google SDK types might not be fully updated for usageMetadata in stream chunks yet
       const usageMetadata = c.usageMetadata;
       
       if (text || thoughtSignature || usageMetadata) {
         yield { text, thoughtSignature, usageMetadata };
       }
    }
  }

  return generator();
};

export const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// Batch Job Interface
export interface BatchJobStatus {
    name: string;
    state: string;
    createTime: string;
}

// Create Batch Job
export const createBatchJob = async (apiKey: string, model: string, prompt: string) => {
    // Using REST API for Batch as SDK support might vary
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent?key=${apiKey}`;
    
    const body = {
        requests: [
            {
                content: {
                    parts: [{ text: prompt }]
                }
            }
        ]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Batch creation failed: ${response.statusText} - ${err}`);
    }

    return await response.json();
};

export const getBatchJob = async (apiKey: string, jobName: string) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/${jobName}?key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
         throw new Error(`Failed to get batch job: ${response.statusText}`);
    }
    return await response.json();
};