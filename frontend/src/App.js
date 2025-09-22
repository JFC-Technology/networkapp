import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import Dashboard from './components/Dashboard';
import DeviceManager from './components/DeviceManager';
import CommandExecutor from './components/CommandExecutor';
import DocumentationViewer from './components/DocumentationViewer';
import TerminalView from './components/TerminalView';
import { Toaster } from './components/ui/sonner';

const BACKEND_URL = process.env.REACT_APP_API_BASE_URL;
export const API = `${BACKEND_URL}/api`;

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <div className="min-h-screen bg-gradient-to-br via-blue-50 to-indigo-100 from-slate-50">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/devices" element={<DeviceManager />} />
            <Route path="/execute/:deviceId" element={<CommandExecutor />} />
            <Route path="/documentation" element={<DocumentationViewer />} />
            <Route path="/terminal/:deviceId" element={<TerminalView />} />
          </Routes>
          <Toaster />
        </div>
      </BrowserRouter>
    </div>
  );
}

export default App;
