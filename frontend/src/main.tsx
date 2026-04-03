import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import StarknetProvider from './providers/StarknetProvider';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StarknetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StarknetProvider>
  </StrictMode>
);
