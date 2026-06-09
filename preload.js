const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cyberfishApp", {
  toggleDock: () => ipcRenderer.invoke("toggle-dock"),
  close: (state) => ipcRenderer.invoke("close-window", state),
  getDockState: () => ipcRenderer.invoke("get-dock-state"),
  loadState: () => ipcRenderer.invoke("load-aquarium-state"),
  saveState: (state) => ipcRenderer.invoke("save-aquarium-state", state),
  onDockState: (callback) => ipcRenderer.on("dock-state", (_event, value) => callback(value))
});
