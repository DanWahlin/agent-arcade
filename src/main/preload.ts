import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agentBreak', {
  setClickThrough: (enabled: boolean) => ipcRenderer.send('agent-break:set-click-through', enabled),
  setPaused: (paused: boolean) => ipcRenderer.send('agent-break:set-paused', paused),
  onResumeRequest: (cb: () => void) => {
    ipcRenderer.on('agent-break:resume', () => cb());
  },
});
