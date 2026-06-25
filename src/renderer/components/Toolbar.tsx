import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../hooks/useAppState';

export default function Toolbar() {
  const {
    isExpanded,
    setIsExpanded,
    availableModels,
    setAvailableModels,
    currentModelId,
    setCurrentModelId,
    isModelDropdownOpen,
    setIsModelDropdownOpen,
    setIsDragging,
    isRecording,
    currentTranscription,
  } = useApp();

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // 加载模型列表
  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    if (!window.electronAPI?.llm?.getModels) return;
    try {
      const result = await window.electronAPI.llm.getModels();
      if (result.success && result.data && (result.data as any[]).length > 0) {
        setAvailableModels(result.data as any[]);
        setCurrentModelId((result.data as any[])[0].id);
      }
    } catch (err) {
      console.error('[Models] Failed to load:', err);
    }
  };

  const handleAskToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    if (window.electronAPI) {
      window.electronAPI.send('set-overlay-height', newExpanded);
      if (newExpanded) {
        setTimeout(() => {
          window.electronAPI?.send('focus-input');
        }, 350);
      } else {
        window.electronAPI.send('blur-input');
      }
    }
  };

  // 模型切换
  const handleSwitchModel = async (modelId: string) => {
    if (!window.electronAPI?.llm?.setModel) return;
    try {
      const result = await window.electronAPI.llm.setModel(modelId);
      if (result.success) {
        setCurrentModelId(modelId);
      }
    } catch (err) {
      console.error('[Models] Switch failed:', err);
    }
    setIsModelDropdownOpen(false);
  };

  // 拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.ask-btn') || 
        (e.target as HTMLElement).closest('.close-btn') || 
        (e.target as HTMLElement).closest('.record-btn')) return;
    setIsDragging(true);
    if (window.electronAPI) {
      window.electronAPI.send('start-drag');
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (window.electronAPI) {
      window.electronAPI.send('stop-drag');
    }
  };

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isModelDropdownOpen && modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isModelDropdownOpen]);

  const currentModel = availableModels.find((m: any) => m.id === currentModelId);

  return (
    <div 
      id="toolbar" 
      className="toolbar"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* 模型选择器 */}
      <div className="model-selector" ref={modelDropdownRef}>
        <button
          className="model-btn"
          onClick={(e) => {
            e.stopPropagation();
            setIsModelDropdownOpen(!isModelDropdownOpen);
          }}
          title={`切换模型 (当前: ${currentModel ? currentModel.name : currentModelId})`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </button>
        {isModelDropdownOpen && (
          <div className="model-dropdown">
            {availableModels.map((model: any) => (
              <button
                key={model.id}
                className={`model-dropdown-item ${model.id === currentModelId ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSwitchModel(model.id);
                }}
              >
                <span>{model.name}</span>
                {model.id === currentModelId && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ask/Hide 按钮 */}
      <button className="ask-btn" onClick={handleAskToggle}>
        <span id="askText">{isExpanded ? 'Hide' : 'Ask'}</span>
      </button>

      {/* 关闭按钮 */}
      <button
        className="close-btn"
        onClick={() => window.electronAPI?.send('quit-app')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
