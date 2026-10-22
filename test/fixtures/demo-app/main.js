const { app, BrowserWindow, ipcMain } = require('electron');
const axios = require('axios');
app.whenReady().then(() => {
  const w = new BrowserWindow({ webPreferences: { preload: __dirname + '/preload.js', contextIsolation: true } });
  w.loadURL('https://app.example.com/home');
});
ipcMain.handle('track', async (e, ev) => axios.post('https://api.mixpanel.com/track', ev));
fetch('https://o123.ingest.sentry.io/api/1/envelope/');
