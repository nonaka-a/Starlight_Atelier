const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // セキュリティ上のベストプラクティス
      contextIsolation: true,
      nodeIntegration: false
    },
  });

  // 開発者ツールを自動で開く場合はコメントを外してください
  // win.webContents.openDevTools();

  win.loadFile('editor.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// レンダラープロセスからのファイル選択ダイアログ呼び出し
ipcMain.handle('open-file-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Assets', extensions: ['json', 'jpg', 'jpeg', 'png', 'gif', 'mp3', 'wav', 'ogg', 'm4a', 'JSON', 'JPG', 'JPEG', 'PNG', 'GIF', 'MP3', 'WAV', 'OGG', 'M4A'] }
    ]
  });
  if (canceled) return [];
  return filePaths;
});

// ファイルを読み込む処理
ipcMain.handle('read-file', async (event, filePath, encoding = 'utf8') => {
  try {
    return fs.readFileSync(filePath, encoding === 'binary' ? null : encoding);
  } catch (err) {
    console.error("File Read Error:", err);
    throw err;
  }
});