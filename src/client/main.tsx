import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';

import { App } from './app';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
