import { readPreference } from './shared/browser/preferences';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import './app/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');

const savedTheme = readPreference('theme');
document.documentElement.dataset.theme = savedTheme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

createRoot(root).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
