const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ファイル選択ダイアログを開く
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  
  // 指定したパスのファイルを読み込む
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath)
});