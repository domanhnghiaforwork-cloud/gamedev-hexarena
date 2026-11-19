interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface LockableOrientation extends ScreenOrientation {
  lock?: (orientation: string) => Promise<void>;
}

export function isDocumentFullscreen(): boolean {
  const doc = document as FullscreenDocument;
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export async function tryLockLandscape(): Promise<boolean> {
  const orientation = (window.screen?.orientation ?? null) as LockableOrientation | null;
  if (!orientation || typeof orientation.lock !== 'function') return false;
  try {
    await orientation.lock('landscape');
    return true;
  } catch {
    try {
      await orientation.lock('landscape-primary');
      return true;
    } catch {
      return false;
    }
  }
}

export function tryUnlockOrientation(): void {
  const orientation = (window.screen?.orientation ?? null) as LockableOrientation | null;
  if (!orientation || typeof orientation.unlock !== 'function') return;
  try {
    orientation.unlock();
  } catch {
    // Ignore unsupported unlock
  }
}

/**
 * Toggles Fullscreen and automatically locks mobile screen orientation to Landscape.
 * Handles both standard Fullscreen API and webkit-prefixed mobile browsers.
 */
export async function toggleFullscreenLandscape(onNotify?: (msg: string) => void): Promise<void> {
  const doc = document as FullscreenDocument;
  const docEl = document.documentElement as FullscreenElement;

  try {
    if (!isDocumentFullscreen()) {
      const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
      if (!req) {
        onNotify?.('Thiết bị không hỗ trợ Toàn màn hình trực tiếp. Hãy xoay ngang điện thoại.');
        return;
      }

      const promise = docEl.requestFullscreen
        ? docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => docEl.requestFullscreen())
        : Promise.resolve(docEl.webkitRequestFullscreen?.());
      await promise;

      const isMobileLike = window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
      if (isMobileLike) {
        const locked = await tryLockLandscape();
        if (!locked && window.innerHeight > window.innerWidth) {
          onNotify?.('Đã bật Toàn màn hình — vui lòng bật xoay màn hình và xoay ngang máy.');
        } else {
          onNotify?.('Đã bật Toàn màn hình ngang.');
        }
      } else {
        onNotify?.('Đã bật chế độ Toàn màn hình.');
      }
    } else {
      tryUnlockOrientation();
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) await exit.call(doc);
    }
  } catch {
    onNotify?.('Trình duyệt không cho phép Toàn màn hình lúc này.');
  }
}
