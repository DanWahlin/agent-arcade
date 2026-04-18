import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agentArcade', {
  setClickThrough: (enabled: boolean) => ipcRenderer.send('agent-arcade:set-click-through', enabled),
  setPaused: (paused: boolean) => ipcRenderer.send('agent-arcade:set-paused', paused),
  onResumeRequest: (cb: () => void) => {
    ipcRenderer.on('agent-arcade:resume', () => cb());
  },
});
