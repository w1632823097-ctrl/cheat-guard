import React from 'react';
import ReactDOM from 'react-dom/client';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">CheatGuard</h1>
          <p className="text-gray-400">实时 AI 桌面助手 - 隐形覆盖层</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 状态面板 */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">状态</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">覆盖层</span>
                <span className="px-2 py-1 bg-green-600 rounded text-xs">运行中</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">快捷键</span>
                <span className="text-sm font-mono bg-gray-700 px-2 py-1 rounded">Cmd/Ctrl+Enter</span>
              </div>
            </div>
          </div>

          {/* 设置面板 */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">设置</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">自动检测</span>
                <input type="checkbox" className="rounded" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">透明度</span>
                <input type="range" className="w-32" defaultValue={95} />
              </div>
            </div>
          </div>
        </div>

        {/* 快捷键说明 */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">快捷键</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-700 rounded p-4">
              <kbd className="font-mono text-sm bg-gray-600 px-2 py-1 rounded">Cmd/Ctrl+Enter</kbd>
              <p className="text-sm text-gray-400 mt-2">显示/隐藏覆盖层</p>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <kbd className="font-mono text-sm bg-gray-600 px-2 py-1 rounded">Cmd/Ctrl+Shift+O</kbd>
              <p className="text-sm text-gray-400 mt-2">切换覆盖层</p>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <kbd className="font-mono text-sm bg-gray-600 px-2 py-1 rounded">Esc</kbd>
              <p className="text-sm text-gray-400 mt-2">隐藏覆盖层</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
