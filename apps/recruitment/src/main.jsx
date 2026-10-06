import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CandidateAuthProvider } from './context/CandidateAuthContext.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import ActivityBar from './components/common/ActivityBar.jsx';
import { UploadProvider } from './context/UploadContext.jsx';
import './index.css';
import './styles/ta.css';
import './styles/home.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ActivityBar />
        <UploadProvider>
        <AuthProvider>
          <AppProvider>
            <CandidateAuthProvider>
              <App />
            </CandidateAuthProvider>
          </AppProvider>
        </AuthProvider>
        </UploadProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
