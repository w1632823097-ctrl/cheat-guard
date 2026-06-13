import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AIResponse {
  id: string;
  text: string;
  confidence: number;
  timestamp: Date;
}

const Overlay: React.FC = () => {
  const [responses, setResponses] = useState<AIResponse[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [isListening, setIsListening] = useState(false);

  // 监听来自主进程的消息
  useEffect(() => {
    const { ipcRenderer } = window.require('electron');
    
    ipcRenderer.on('update-text', (event: any, text: string) => {
      addResponse(text);
    });

    return () => {
      ipcRenderer.removeAllListeners('update-text');
    };
  }, []);

  const addResponse = (text: string) => {
    const newResponse: AIResponse = {
      id: Date.now().toString(),
      text,
      confidence: Math.random() * 0.3 + 0.7, // 模拟置信度
      timestamp: new Date(),
    };

    setResponses((prev) => [newResponse, ...prev].slice(0, 10)); // 最多保留 10 条
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  return (
    <div className="w-full h-full p-4">
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="overlay-container w-full max-w-md"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between mb-4 p-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
                  {isListening && (
                    <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-400 animate-ping" />
                  )}
                </div>
                <span className="text-sm font-semibold text-gray-200">
                  CheatGuard AI
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {responses.length} 条提示
                </span>
                <button
                  onClick={toggleVisibility}
                  className="p-1 rounded hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 内容区域 */}
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              <AnimatePresence>
                {responses.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-8"
                  >
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3H5a2 2 0 00-2 2v4a2 2 0 002 2h2a2 2 0 002-2v-4z" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-400">
                      按 Cmd/Ctrl+Enter 触发 AI 提示
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      或等待自动检测问题
                    </p>
                  </motion.div>
                ) : (
                  responses.map((response) => (
                    <motion.div
                      key={response.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-200 leading-relaxed flex-1">
                          {response.text}
                        </p>
                        <button
                          onClick={() => copyToClipboard(response.text)}
                          className="p-1 rounded hover:bg-gray-700 transition-colors flex-shrink-0"
                          title="复制"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50">
                        <span className="text-xs text-gray-500">
                          置信度: {(response.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="text-xs text-gray-600">
                          {response.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* 底部状态栏 */}
            <div className="flex items-center justify-between p-4 border-t border-gray-700">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-green-400' : 'bg-gray-500'}`} />
                <span className="text-xs text-gray-400">
                  {isListening ? '监听中...' : '就绪'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setResponses([])}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                >
                  清空
                </button>
                <button
                  onClick={() => setIsListening(!isListening)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    isListening 
                      ? 'bg-red-600 hover:bg-red-500 text-white' 
                      : 'bg-green-600 hover:bg-green-500 text-white'
                  }`}
                >
                  {isListening ? '停止' : '开始'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Overlay;
