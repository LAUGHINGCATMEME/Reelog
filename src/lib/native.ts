import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
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

/** Hardware back button in the Android app: run `handle`, exit the app if it had nothing to close. */
export function onNativeBack(handle: () => boolean) {
  if (!isNative) return () => {};
  const sub = App.addListener('backButton', () => {
    if (!handle()) void App.exitApp();
  });
  return () => void sub.then((s) => s.remove());
}
