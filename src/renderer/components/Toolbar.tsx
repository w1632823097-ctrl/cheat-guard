import React, { useState, useEffect } from 'react';
import { useApp } from '../hooks/useAppState';

export default function Toolbar() {
  const {
    isExpanded,
    setIsExpanded,
    setIsDragging,
    isRecording,
    currentTranscription,
  } = useApp();

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 自动更新状态
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const unsub1 = window.electronAPI?.updater?.onUpdateAvailable((info) => {
      setUpdateInfo(info);
    });
    const unsub2 = window.electronAPI?.updater?.onDownloadProgress((percent) => {
      setDownloadPercent(percent);
    });
    const unsub3 = window.electronAPI?.updater?.onUpdateDownloaded((info) => {
      setDownloadPercent(null);
      setUpdateReady(true);
      setUpdateInfo(info);
    });
    return () => {
      unsub1?.();
      unsub2?.();
      unsub3?.();
    };
  }, []);

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

  // 拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.ask-btn') || 
        (e.target as HTMLElement).closest('.close-btn') || 
        (e.target as HTMLElement).closest('.record-btn') ||
        (e.target as HTMLElement).closest('.update-btn')) return;
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

  return (
    <div 
      id="toolbar" 
      className="toolbar"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* 图标 */}
      <div className="logo">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>

      {/* Ask/Hide 按钮 */}
      <button className="ask-btn" onClick={handleAskToggle}>
        <span id="askText">{isExpanded ? 'Hide' : 'Ask'}</span>
      </button>

      {/* 更新提示区域 */}
      {updateReady && (
        <button
          className="update-btn update-btn--ready"
          onClick={() => window.electronAPI?.updater?.install()}
          title={`v${updateInfo?.version} 已下载完成，点击重启安装`}
        >
          重启更新
        </button>
      )}
      {!updateReady && downloadPercent !== null && (
        <span className="update-btn update-btn--downloading">
          {downloadPercent}%
        </span>
      )}
      {!updateReady && downloadPercent === null && updateInfo && (
        <button
          className="update-btn update-btn--available"
          onClick={() => window.electronAPI?.updater?.download()}
          title={`发现新版本 v${updateInfo.version}，点击下载`}
        >
          有更新
        </button>
      )}

      {/* 关闭按钮 */}
      <button
        className="close-btn"
        onClick={() => window.electronAPI?.send('quit-app')}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
          <rect x="4" y="4" width="16" height="16" rx="3"/>
        </svg>
      </button>
    </div>
  );
}
