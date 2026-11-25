interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface LockableOrientation extends ScreenOrientation {
  lock?: (orientation: string) => Promise<void>;
}

interface IOSNavigator extends Navigator {
  standalone?: boolean;
}

export const FULLSCREEN_CHANGE_EVENT = 'hexarena-fullscreen-change';

let immersiveFallbackActive = false;

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIPhoneIPad = /iPad|iPhone|iPod/i.test(ua);
  // iPadOS 13+ reports "Macintosh" in UA with multi-touch support
  const isIPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
  return isIPhoneIPad || isIPadOS;
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as IOSNavigator;
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)').matches === true
  );
}

export function isNativeFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDocument;
  const docEl = document.documentElement as FullscreenElement;
  const hasMethod = typeof docEl.requestFullscreen === 'function' || typeof docEl.webkitRequestFullscreen === 'function';
  if (!hasMethod) return false;
  if (doc.fullscreenEnabled === false && doc.webkitFullscreenEnabled === false) return false;
  return true;
}

export function isDocumentFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDocument;
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement || immersiveFallbackActive || isStandalonePWA());
}

export function isImmersiveFallback(): boolean {
  return immersiveFallbackActive;
}

export function getViewportSize(): { vw: number; vh: number } {
  if (typeof window === 'undefined') return { vw: 1280, vh: 720 };
  const vv = window.visualViewport;
  const vw = Math.round(vv && vv.width > 0 ? vv.width : window.innerWidth);
  const vh = Math.round(vv && vv.height > 0 ? vv.height : window.innerHeight);
  return { vw: Math.max(320, vw), vh: Math.max(240, vh) };
}

export function syncAppViewportVars(): { vw: number; vh: number } {
  const { vw, vh } = getViewportSize();
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.style.setProperty('--app-vw', `${vw}px`);
    root.style.setProperty('--app-vh', `${vh}px`);
  }
  return { vw, vh };
}

function emitFullscreenChange(): void {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent(FULLSCREEN_CHANGE_EVENT));
  }
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

function enterImmersiveFallback(
  onNotify?: (msg: string) => void,
  onShowIOSGuide?: () => void,
): void {
  immersiveFallbackActive = true;
  document.documentElement.classList.add('ios-immersive');
  // Nudge Safari to collapse its toolbar on iOS when possible
  try {
    window.scrollTo(0, 1);
  } catch {
    // ignore
  }
  syncAppViewportVars();
  emitFullscreenChange();

  if (isIOSDevice()) {
    if (onShowIOSGuide) {
      onShowIOSGuide();
    } else if (window.innerHeight > window.innerWidth) {
      onNotify?.('Đã tối ưu khung nhìn iOS — hãy xoay ngang máy hoặc Thêm vào MH chính để toàn màn hình 100%.');
    } else {
      onNotify?.('Đã bật chế độ Tập trung iOS (Thêm vào MH chính từ Safari để ẩn hoàn toàn thanh địa chỉ).');
    }
  } else if (window.innerHeight > window.innerWidth) {
    onNotify?.('Đã bật chế độ Tập trung — hãy xoay ngang điện thoại để có góc nhìn rộng nhất.');
  } else {
    onNotify?.('Đã bật chế độ Tập trung toàn khung nhìn.');
  }
}

function exitImmersiveFallback(onNotify?: (msg: string) => void): void {
  immersiveFallbackActive = false;
  document.documentElement.classList.remove('ios-immersive');
  syncAppViewportVars();
  emitFullscreenChange();
  onNotify?.('Đã thoát chế độ Toàn màn hình.');
}

/**
 * Toggles Fullscreen cleanly across Desktop, Android, and iOS (Safari/Chrome/PWA):
 * - Native Fullscreen API + landscape lock on Android & Desktop.
 * - Standalone PWA detection (already true 100% fullscreen on iOS Home Screen).
 * - Seamless Immersive Fallback + helpful iOS Add-to-Home-Screen guide on iPhone browsers (never throws an unsupported error!).
 */
export async function toggleFullscreenLandscape(
  onNotify?: (msg: string) => void,
  onShowIOSGuide?: () => void,
): Promise<void> {
  const doc = document as FullscreenDocument;
  const docEl = document.documentElement as FullscreenElement;

  // Already running as a true borderless Home Screen Web App on iOS/Android
  if (isStandalonePWA() && !doc.fullscreenElement && !doc.webkitFullscreenElement) {
    if (window.innerHeight > window.innerWidth) {
      onNotify?.('Đang chạy Toàn màn hình ứng dụng — hãy xoay ngang điện thoại để chơi thoải mái nhất.');
    } else {
      onNotify?.('Đang ở chế độ Toàn màn hình ứng dụng.');
    }
    return;
  }

  // Currently in iOS/WebView Immersive Fallback -> exit cleanly
  if (immersiveFallbackActive) {
    exitImmersiveFallback(onNotify);
    return;
  }

  const nativeActive = !!(doc.fullscreenElement || doc.webkitFullscreenElement);

  if (nativeActive) {
    try {
      tryUnlockOrientation();
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) await Promise.resolve(exit.call(doc));
      emitFullscreenChange();
    } catch {
      exitImmersiveFallback(onNotify);
    }
    return;
  }

  // iPhone Safari/Chrome & browsers without native Fullscreen API -> seamless Immersive Mode + iOS guide
  if (!isNativeFullscreenSupported()) {
    enterImmersiveFallback(onNotify, onShowIOSGuide);
    return;
  }

  try {
    const reqResult = docEl.requestFullscreen
      ? docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => docEl.requestFullscreen())
      : Promise.resolve(docEl.webkitRequestFullscreen?.());
    await reqResult;

    const isMobileLike =
      window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
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
    emitFullscreenChange();
  } catch {
    // Graceful fallback if browser blocks native Fullscreen (e.g. iPadOS WKWebView / in-app browser)
    enterImmersiveFallback(onNotify, onShowIOSGuide);
  }
}
