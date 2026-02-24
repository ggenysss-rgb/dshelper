// Preload script — secure bridge between renderer and main process
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
    isDesktop: true,
    platform: process.platform,
});
