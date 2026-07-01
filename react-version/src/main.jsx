import React from 'react';
import ReactDOM from 'react-dom/client';
import $ from 'jquery';
window.jQuery = $;
import App from './App.jsx';
import './styles/main.css';
import './styles/login.css';
import './styles/workspace.css';
import './styles/dashboard.css';
import './styles/admin.css';
import { BrowserRouter } from 'react-router-dom';

import { SessionProvider } from './contexts/SessionContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
