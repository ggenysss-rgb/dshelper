const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');

const DASHBOARD_URL = 'https://worker-production-c151.up.railway.app';

let mainWindow = null;
let tray = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'Ticket Notifier',
        icon: path.join(__dirname, 'icon.png'),
        autoHideMenuBar: true,
        backgroundColor: '#0a0a0f',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
    });

    mainWindow.loadURL(DASHBOARD_URL);

    // Show window when content is ready (avoids white flash)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open external links in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://') || url.startsWith('http://')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    // Minimize to tray instead of closing
    mainWindow.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'icon.png');
    let trayIcon;
    try {
        trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } catch {
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('Ticket Notifier');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Открыть',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            },
        },
        { type: 'separator' },
        {
            label: 'Обновить',
            click: () => {
                if (mainWindow) mainWindow.webContents.reload();
            },
        },
        {
            label: 'DevTools',
            click: () => {
                if (mainWindow) mainWindow.webContents.toggleDevTools();
            },
        },
        { type: 'separator' },
        {
            label: 'Выход',
            click: () => {
                app.isQuitting = true;
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// Single instance lock — prevent multiple windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        createWindow();
        createTray();
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
}
