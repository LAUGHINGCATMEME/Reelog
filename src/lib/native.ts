import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = Capacitor.isNativePlatform();

/**
 * Saves a text file. In the browser it downloads; in the Android app (where WebView
 * downloads don't work) it writes to the app cache and opens the share sheet,
 * so the file can go to Files, Drive, email, etc.
 * Resolves to false if the user dismissed the share sheet.
 */
export async function saveFile(name: string, text: string, type: string): Promise<boolean> {
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: name, files: [uri] });
    return true;
  } catch {
    return false;
  }
}

/** Saves a PNG data URL the same way: a download in the browser, the share sheet in the Android app. */
export async function saveImage(name: string, dataUrl: string): Promise<boolean> {
  if (!isNative) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }
  // Without an encoding, Filesystem takes the data as base64.
  const { uri } = await Filesystem.writeFile({ path: name, data: dataUrl.slice(dataUrl.indexOf(',') + 1), directory: Directory.Cache });
  try {
    await Share.share({ title: name, files: [uri] });
    return true;
  } catch {
    return false;
  }
}

/** A short tick of haptic feedback, where the device has it. */
export function buzz(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here */
  }
}

/** Hardware back button in the Android app: run `handle`, exit the app if it had nothing to close. */
export function onNativeBack(handle: () => boolean) {
  if (!isNative) return () => {};
  const sub = App.addListener('backButton', () => {
    if (!handle()) void App.exitApp();
  });
  return () => void sub.then((s) => s.remove());
}

/** Runs `fn` when the app goes to the background (Android app) or the tab is hidden (web). */
export function onBackground(fn: () => void) {
  const onHide = () => document.visibilityState === 'hidden' && fn();
  document.addEventListener('visibilitychange', onHide);
  const sub = isNative ? App.addListener('pause', fn) : null;
  return () => {
    document.removeEventListener('visibilitychange', onHide);
    void sub?.then((s) => s.remove());
  };
}

// ---- Auto-backup (Android app) ----

/** Folder in the phone's Documents. It's outside the app, so the backups survive uninstalling it. */
export const BACKUP_DIR = 'Reelog';
const KEEP = 10;
const AUTO = /^reelog-auto-\d{4}-\d{2}-\d{2}(-\d+)?\.json$/;

/**
 * Writes Documents/Reelog/reelog-auto-<day>.json (replacing today's, if there is one) and keeps
 * only the newest few. Resolves to the file name.
 */
export async function writeAutoBackup(day: string, text: string): Promise<string> {
  // Android 9 and older need storage permission for Documents; newer versions don't.
  try {
    const p = await Filesystem.checkPermissions();
    if (p.publicStorage !== 'granted') await Filesystem.requestPermissions();
  } catch {
    /* not needed on this version */
  }
  try {
    await Filesystem.mkdir({ path: BACKUP_DIR, directory: Directory.Documents, recursive: true });
  } catch {
    /* already there */
  }
  let name = `reelog-auto-${day}.json`;
  try {
    await Filesystem.writeFile({ path: `${BACKUP_DIR}/${name}`, data: text, directory: Directory.Documents, encoding: Encoding.UTF8 });
  } catch {
    // A file left by an earlier install of the app can't be replaced; write beside it.
    name = `reelog-auto-${day}-${Date.now() % 100000}.json`;
    await Filesystem.writeFile({ path: `${BACKUP_DIR}/${name}`, data: text, directory: Directory.Documents, encoding: Encoding.UTF8 });
  }
  try {
    const { files } = await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Documents });
    const old = files.map((f) => f.name).filter((n) => AUTO.test(n)).sort().reverse().slice(KEEP);
    for (const n of old) await Filesystem.deleteFile({ path: `${BACKUP_DIR}/${n}`, directory: Directory.Documents }).catch(() => {});
  } catch {
    /* can't list: keep everything */
  }
  return name;
}

// ---- System bars ----

type Bars = { set(o: { color: string; light: boolean }): Promise<void> };
const SystemBars = registerPlugin<Bars>('SystemBars');

/** Colours Android's status and navigation bars to match the theme. */
export function setSystemBars(color: string, light: boolean) {
  if (isNative) void SystemBars.set({ color, light }).catch(() => {});
}
