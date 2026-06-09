const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const WINDOW_WIDTH = 376;
const WINDOW_HEIGHT = 296;
const DOCKED_WIDTH = 194;
const DOCKED_HEIGHT = 44;

let win;
let restoreBounds = null;
let docked = false;
let aquariumSaveQueue = Promise.resolve();

function savePath() {
  return path.join(app.getPath("userData"), "aquarium-state.json");
}

async function loadAquariumState() {
  try {
    const content = await fs.readFile(savePath(), "utf8");
    const state = JSON.parse(content);
    return state && typeof state === "object" ? state : null;
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Unable to load aquarium state:", error);
    return null;
  }
}

async function saveAquariumState(state) {
  if (!state || typeof state !== "object") return false;
  const file = savePath();
  const temporary = `${file}.tmp`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(state), "utf8");
    await fs.rm(file, { force: true });
    await fs.rename(temporary, file);
    return true;
  } catch (error) {
    console.error("Unable to save aquarium state:", error);
    await fs.rm(temporary, { force: true }).catch(() => {});
    return false;
  }
}

function enqueueAquariumSave(state) {
  aquariumSaveQueue = aquariumSaveQueue
    .catch(() => false)
    .then(() => saveAquariumState(state));
  return aquariumSaveQueue;
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    x: Math.round(area.x + (area.width - WINDOW_WIDTH) / 2),
    y: Math.round(area.y + (area.height - WINDOW_HEIGHT) / 2),
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    useContentSize: true,
    resizable: false,
    frame: false,
    transparent: false,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#182020",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"), { query: { app: "1" } });
}

function nearestDisplay(bounds) {
  return screen.getDisplayMatching(bounds).workArea;
}

function dockWindow() {
  if (!win || docked) return;
  const bounds = win.getBounds();
  const area = nearestDisplay(bounds);
  restoreBounds = bounds;

  const distances = [
    { edge: "left", value: Math.abs(bounds.x - area.x) },
    { edge: "right", value: Math.abs(area.x + area.width - (bounds.x + bounds.width)) },
    { edge: "top", value: Math.abs(bounds.y - area.y) },
    { edge: "bottom", value: Math.abs(area.y + area.height - (bounds.y + bounds.height)) }
  ].sort((a, b) => a.value - b.value);

  const edge = distances[0].edge;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const x =
    edge === "left"
      ? area.x
      : edge === "right"
        ? area.x + area.width - DOCKED_WIDTH
        : clamp(Math.round(centerX - DOCKED_WIDTH / 2), area.x, area.x + area.width - DOCKED_WIDTH);
  const y =
    edge === "top"
      ? area.y
      : edge === "bottom"
        ? area.y + area.height - DOCKED_HEIGHT
        : clamp(Math.round(centerY - DOCKED_HEIGHT / 2), area.y, area.y + area.height - DOCKED_HEIGHT);

  docked = true;
  win.setBounds({ x, y, width: DOCKED_WIDTH, height: DOCKED_HEIGHT }, true);
  win.webContents.send("dock-state", true);
}

function restoreWindow() {
  if (!win || !docked) return;
  if (restoreBounds) {
    win.setBounds(restoreBounds, true);
  } else {
    const bounds = win.getBounds();
    const area = nearestDisplay(bounds);
    win.setBounds({
      x: clamp(bounds.x, area.x, area.x + area.width - WINDOW_WIDTH),
      y: clamp(bounds.y, area.y, area.y + area.height - WINDOW_HEIGHT),
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT
    }, true);
  }
  docked = false;
  win.webContents.send("dock-state", false);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

ipcMain.handle("toggle-dock", () => {
  if (docked) restoreWindow();
  else dockWindow();
  return docked;
});

ipcMain.handle("get-dock-state", () => docked);
ipcMain.handle("load-aquarium-state", loadAquariumState);
ipcMain.handle("save-aquarium-state", (_event, state) => enqueueAquariumSave(state));
ipcMain.handle("close-window", async (_event, state) => {
  if (state) await enqueueAquariumSave(state);
  if (win) win.close();
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
