const { ipcRenderer } = require('electron');

const mask = document.getElementById('mask');
const selection = document.getElementById('selection');
const info = document.getElementById('info');

let startX = 0, startY = 0;
let dragging = false;

mask.addEventListener('mousedown', (e) => {
  dragging = true;
  startX = e.screenX;
  startY = e.screenY;
  selection.style.display = 'block';
  selection.style.left = startX + 'px';
  selection.style.top = startY + 'px';
  selection.style.width = '0px';
  selection.style.height = '0px';
  info.style.display = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;

  const x = Math.min(startX, e.screenX);
  const y = Math.min(startY, e.screenY);
  const w = Math.abs(e.screenX - startX);
  const h = Math.abs(e.screenY - startY);

  selection.style.left = x + 'px';
  selection.style.top = y + 'px';
  selection.style.width = w + 'px';
  selection.style.height = h + 'px';

  if (w > 10 && h > 10) {
    info.style.display = 'block';
    info.textContent = `${w} × ${h} — 松开发送 / ESC 取消`;
  }
});

document.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;

  const x = Math.min(startX, e.screenX);
  const y = Math.min(startY, e.screenY);
  const w = Math.abs(e.screenX - startX);
  const h = Math.abs(e.screenY - startY);

  if (w < 10 || h < 10) {
    // Too small, cancel
    ipcRenderer.send('region:cancel');
    return;
  }

  ipcRenderer.send('region:selected', { x, y, width: w, height: h });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ipcRenderer.send('region:cancel');
  }
});
