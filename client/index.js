import { createRoot } from 'react-dom/client';
import { App } from './App';

import TokenStorage from './storage/tokenStorage';
TokenStorage.loadStoredToken();

const container = document.getElementById("app");
const root = createRoot(container);
root.render(<App />);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register(new URL('./service-worker.js', import.meta.url))
            .catch(() => {});
    });
}
