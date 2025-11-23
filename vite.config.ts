import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      base: './', // Ensure relative paths for static deployment (e.g. GitHub Pages)
      plugins: [react()],
      define: {
        // Removed API Key injection for security. 
        // Users must enter their own key in the UI.
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
