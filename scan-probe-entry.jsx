import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './src/admin/components/Toast.jsx';
import Scanner from './src/admin/pages/Scanner.jsx';

window.__probeErrors = [];

createRoot(document.getElementById('probe-root')).render(
  <StrictMode>
    <ToastProvider>
      <Scanner />
    </ToastProvider>
  </StrictMode>
);