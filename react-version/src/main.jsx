import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/main.css';
import './styles/login.css';
import './styles/workspace.css';
import './styles/dashboard.css';
import './styles/admin.css';
import { BrowserRouter } from 'react-router-dom';

import { SessionProvider } from './contexts/SessionContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
