import './storagePolyfill';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// 1. Detect environment and manage environment/web socket behaviors
const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
const isDev = Boolean((import.meta as any).env?.DEV);
const isProduction = (import.meta as any).env?.PROD && !isInIframe;

if (isInIframe || isDev) {
  // In development and AI Studio preview iframes, unregister any stale Service Workers
  // and clear stale asset caches to guarantee the live preview loads smoothly
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().catch(() => {});
      }
    }).catch(() => {});
  }
  if (typeof window !== 'undefined' && 'caches' in window) {
    caches.keys().then((keys) => {
      for (const k of keys) {
        caches.delete(k).catch(() => {});
      }
    }).catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Register Progressive Web App (PWA) Service Worker ONLY for standalone production
if (!isInIframe && !isDev && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('⚡ [Sparezy PWA] Service Worker registered: ', reg.scope);
      })
      .catch((err) => {
        console.warn('❌ [Sparezy PWA] Service Worker registration failed: ', err);
      });
  });
}

