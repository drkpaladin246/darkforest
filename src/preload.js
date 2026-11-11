'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  loadData: () => ipcRenderer.sendSync('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  updateTimer: (state) => ipcRenderer.send('timer:update', state),
  notify: (title, body) => ipcRenderer.send('notify', { title, body, silent: true }),
  setMiniMode: (on) => ipcRenderer.send('mini-mode:set', on),
  showWindow: () => ipcRenderer.send('window:show'),
  onCommand: (fn) => ipcRenderer.on('command', (_e, cmd) => fn(cmd)),
  onMiniMode: (fn) => ipcRenderer.on('mini-mode', (_e, on) => fn(on)),
});
