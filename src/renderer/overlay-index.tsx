import React from 'react';
import ReactDOM from 'react-dom/client';
import Overlay from './overlay';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>
);
