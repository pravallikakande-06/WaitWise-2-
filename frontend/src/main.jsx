import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { Providers } from './context/Providers.jsx';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter><Providers><App /></Providers></BrowserRouter>
);
