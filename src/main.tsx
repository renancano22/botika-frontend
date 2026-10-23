import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import ScrollManager from './components/ScrollManager';
import { DialogHost, Toaster } from './components/feedback';
import './styles.css';
import './numberInputs'; // no leading zeros in quantity fields ("01" → "1")

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollManager />
      <AuthProvider>
        <App />
        <Toaster />
        <DialogHost />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
