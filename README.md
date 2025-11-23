# Gemini Studio Clone

A powerful, web-based client for Google's Gemini models, designed to replicate and enhance the AI Studio experience. Built with React, Vite, and the official Google GenAI SDK.

## ✨ Features

*   **Advanced Model Support**: Full support for **Gemini 3.0 Pro**, **Gemini 2.5 Flash**, and **Thinking Models**.
*   **Thinking Mode**: Visualize and control the "Thinking Level" for Gemini 3, enabling deeper reasoning capabilities.
*   **Context Caching**: Upload large documents (PDFs, codebases) to create persistent context caches, significantly reducing token costs and latency.
*   **Batch Processing**: Submit non-urgent tasks as Batch Jobs to save **50%** on API costs.
*   **Cost Tracking**: Real-time estimation of session costs, with daily and monthly usage tracking stored locally.
*   **Secure & Private**: **BYOK (Bring Your Own Key)** architecture. Your API Key and chat history are stored only in your browser's LocalStorage. No backend server involved.
*   **Session Management**: Export/Import chats, manage multiple sessions, and edit message history with automatic branching.

## 🚀 Live Demo

[**Try it now!**](https://aaasdream.github.io/ai-studio-like/)

*(Note: You will need your own Google Gemini API Key to use the app.)*

## 🛠️ Run Locally

1.  **Clone the repository**
    ```bash
    git clone https://github.com/aaasdream/ai-studio-like.git
    cd ai-studio-like
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Start the development server**
    ```bash
    npm run dev
    ```

4.  **Open in browser**
    Navigate to `http://localhost:3000` (or the port shown in your terminal).

## 🔑 Setup

1.  Get your API Key from [Google AI Studio](https://aistudio.google.com/).
2.  Open the app settings (Right Panel).
3.  Paste your API Key. It will be saved securely in your browser.

## 📦 Deployment

This project is configured for easy deployment to GitHub Pages.

```bash
npm run deploy
```

## 📄 License

MIT

