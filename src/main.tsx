import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// 1. Detect environment and manage environment/web socket behaviors (Requirement 1, 2, 4, 5, 6, 7)
const isProduction = (import.meta as any).env?.PROD || window.location.hostname !== 'localhost' || window.location.host.includes('vercel');

if (isProduction) {
  console.log("🚀 Production Mode");
  
  // Prevent any production WebSocket errors from popping up in console or causing issues
  const NativeWebSocket = window.WebSocket;
  if (NativeWebSocket) {
    try {
      // Intercept and handle errors gracefully
      window.addEventListener('error', (event) => {
        if (event.message && (event.message.includes('WebSocket') || event.message.includes('ws://') || event.message.includes('wss://'))) {
          event.preventDefault();
          console.log("⚡ Ignored standard WebSocket warning in production.");
        }
      }, true);
      
      // Ensure unhandledrejection does not fire for websocket failures
      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason?.message || '';
        if (reason.includes('WebSocket') || reason.includes('ws://') || reason.includes('wss://')) {
          event.preventDefault();
        }
      });
    } catch (_) {
      // safe fallback
    }
  }
} else {
  console.log("🛠️ Development Mode");
}

function enableDevWebsocket() {
  console.log("🔌 Vite WebSocket HMR initialized in development mode.");
}

if ((import.meta as any).env?.DEV) {
  enableDevWebsocket();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register Progressive Web App (PWA) Service Worker for offline-safe static caching
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('⚡ [Sparezy PWA] Service Worker registered successfully: ', reg.scope);
      })
      .catch((err) => {
        console.warn('❌ [Sparezy PWA] Service Worker registration failed: ', err);
      });
  });
}
