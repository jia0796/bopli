import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import StartupExperience from './components/StartupExperience.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><StartupExperience><App /></StartupExperience></React.StrictMode>);
