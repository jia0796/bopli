import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import CloudApp from './components/CloudApp.jsx';
import StartupExperience from './components/StartupExperience.jsx';
import './styles.css';

const Product=import.meta.env.VITE_BOPLI_MODE==='local'&&import.meta.env.DEV?App:CloudApp;
createRoot(document.getElementById('root')).render(<React.StrictMode><StartupExperience><Product /></StartupExperience></React.StrictMode>);
