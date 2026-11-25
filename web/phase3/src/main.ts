import { updateBotAI } from '@ai/botController';
import type { PlayerCosmetics } from '@config/cosmetics';
import { applyTypographyToDocument, ensureFontsLoaded } from '@config/typography';
import { FIXED_DT, createDefaultLoadout } from '@core/constants';
import { createMatchState, stepSimulation } from '@core/physics/simulation';
import type { MatchState, PlayerLoadout, SimEvent, SlotKey } from '@core/types';
import { soundFX, triggerHaptic } from '@audio/index';
import { InputManager } from '@input/inputManager';
import { AuthClient } from '@net/authClient';
import type { RoomStatePayload } from '@net/protocol';
import { PvPClient } from '@net/pvpClient';
import { PvPInterpolator } from '@net/pvpInterpolator';
import { GameRenderer } from '@render/renderer';
import {
  loadAudioSettings,
  loadMobileHUDConfig,
  loadPCControlConfig,
  loadPlayerCosmetics,
  loadPlayerLoadout,
  saveAudioSettings,
  saveMobileHUDConfig,
  savePCControlConfig,
  savePlayerCosmetics,
  savePlayerLoadout,
  type AudioSettings,
  type MobileHUDConfig,
  type PCControlConfig,
} from '@storage/profiles';
import { AuthModal, renderSettingsModal } from '@ui/modals/authModal';
import { CosmeticsModal } from '@ui/modals/cosmeticsModal';
import {
  FULLSCREEN_CHANGE_EVENT,
  isDocumentFullscreen,
  syncAppViewportVars,
  tryLockLandscape,
} from '@ui/common/fullscreen';
import { HUDCustomizerController } from '@ui/hud/hudCustomizer';
import { LoadoutEditorModal } from '@ui/screens/loadoutEditor';
import { LobbyScreen, type LobbyPvPState } from '@ui/screens/lobby';
import { PvPRoomModal } from '@ui/modals/pvpRoomModal';
import { renderHelpModal, TopBarController } from '@ui/hud/topBar';

applyTypographyToDocument();

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const lobbyRoot = document.getElementById('lobbyRoot') as HTMLElement;
const modalRoot = document.getElementById('modalRoot') as HTMLElement;

// Persistent User Configurations & Auth Client (SQLite-backed)
const authClient = new AuthClient();
let playerLoadout: PlayerLoadout = loadPlayerLoadout();
let mobileHUDConfig: MobileHUDConfig = loadMobileHUDConfig();
let pcControlConfig: PCControlConfig = loadPCControlConfig();
let audioSettings: AudioSettings = loadAudioSettings();
let playerCosmetics: PlayerCosmetics = loadPlayerCosmetics();
soundFX.applySettings(audioSettings);

const unlockAudioOnce = () => {
  soundFX.init();
};
window.addEventListener('pointerdown', unlockAudioOnce, { once: true, capture: true });
window.addEventListener('keydown', unlockAudioOnce, { once: true, capture: true });

// Check deep-link ?room=XXXX invite param on startup
const urlRoom = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '';

// Screen & Match Mode State
let inLobby = true;
let matchMode: 'bot' | 'pvp' = 'bot';
let pvpCountdownActive = false;
let activeRoomState: RoomStatePayload | null = null;
const pvpInterpolator = new PvPInterpolator();
let pvpTickAccum = 0;
let pvpIdleSendTimer = 0;
let lastSentSig = '';

const lobbyPvP: LobbyPvPState = {
  tab: urlRoom ? 'pvp' : 'bot',
  waitingCode: null,
  joinCodeDraft: urlRoom,
  errorMessage: null,
  busy: false,
};

let state: MatchState = createMatchState(playerLoadout, createDefaultLoadout());
const renderer = new GameRenderer(canvas);

let activeLoadoutModal: LoadoutEditorModal | null = null;
let activePvPRoomModal: PvPRoomModal | null = null;
let activeCustomizer: HUDCustomizerController | null = null;
let activeAuthModal: AuthModal | null = null;
let activeCosmeticsModal: CosmeticsModal | null = null;
let settingsOpen = false;
let helpOpen = false;

function openPvPRoomView(room: RoomStatePayload): void {
  activeRoomState = room;
  lobbyPvP.busy = false;
  lobbyPvP.waitingCode = room.code;
  lobbyPvP.errorMessage = null;

  if (room.phase === 'room') {
    if (activePvPRoomModal) {
      activePvPRoomModal.update(room);
      return;
    }
    clearModalRefs();
    inLobby = true;
    lobby.hide();
    topBar.setVisible(false);
    topBar.hideCountdown();
    input.setPaused(true);

    activePvPRoomModal = new PvPRoomModal({
      mount: modalRoot,
      room,
      onSetHexCount: (count) => pvpClient.setRoomHexCount(count),
      onToggleReady: (ready) => pvpClient.setRoomReady(ready),
      onStartPrep: () => pvpClient.startPrep(),
      onLeaveRoom: () => {
        pvpClient.leaveRoom();
        activeRoomState = null;
        enterLobby();
      },
      onNotify: (msg) => topBar.showToast(msg),
    });
    return;
  }

  if (room.phase === 'prep') {
    const isHost = room.seat === 'player';
    const selfReady = isHost ? room.host.prepReady : !!room.guest?.prepReady;
    const oppReady = isHost ? !!room.guest?.prepReady : room.host.prepReady;
    const oppName = isHost ? room.guest?.name || 'Đối thủ' : room.host.name;

    if (activeLoadoutModal && activePvPRoomModal === null) {
      activeLoadoutModal.updatePvPPrep(room.prepRemainingSec, selfReady, oppReady);
      return;
    }

    clearModalRefs();
    inLobby = true;
    lobby.hide();
    topBar.setVisible(false);
    topBar.hideCountdown();
    input.setPaused(true);

    activeLoadoutModal = new LoadoutEditorModal({
      mount: modalRoot,
      initialLoadout: playerLoadout,
      openedFromLobby: false,
      pvpPrep: {
        roomCode: room.code,
        lockedHexCount: room.hexCount,
        remainingSec: room.prepRemainingSec,
        selfReady,
        oppReady,
        oppName,
        onDraftChange: (draft) => pvpClient.sendPrepLoadout(draft),
        onToggleReady: (ready, draft) => pvpClient.setPrepReady(ready, draft),
        onLeaveRoom: () => {
          pvpClient.leaveRoom();
          activeRoomState = null;
          enterLobby();
        },
      },
      onSave: () => {},
      onClose: () => {
        pvpClient.leaveRoom();
        activeRoomState = null;
        enterLobby();
      },
    });
    topBar.showToast(`Giai đoạn tinh chỉnh (1 phút) — Luật phòng: ${room.hexCount} mảnh.`);
  }
}

const pvpClient = new PvPClient({
  onRoomState: (room) => {
    openPvPRoomView(room);
  },
  onRoomError: (message) => {
    lobbyPvP.busy = false;
    lobbyPvP.errorMessage = message;
    refreshLobbyIfVisible();
    topBar.showToast(message);
  },
  onMatchStart: (msg) => {
    lobbyPvP.busy = false;
    lobbyPvP.waitingCode = null;
    lobbyPvP.errorMessage = null;
    activeRoomState = null;
    matchMode = 'pvp';
    pvpCountdownActive = msg.countdownSec > 0;
    pvpTickAccum = 0;
    pvpIdleSendTimer = 0;
    lastSentSig = '';

    clearModalRefs();
    inLobby = false;
    lobby.hide();

    state = createMatchState(msg.selfLoadout, msg.oppLoadout, Math.random, false);
    state.obstacles = msg.obstacles;
    const now = performance.now();
    pvpInterpolator.reset(msg.snapshot, now);
    pvpInterpolator.applyFrame(state, now, FIXED_DT);

    const selfName = msg.seat === 'player' ? msg.hostName : msg.guestName;
    const oppName = msg.seat === 'player' ? msg.guestName : msg.hostName;

    renderer.vfx.clear();
    soundFX.setBgmMode('match');
    soundFX.setMatchTension(0);
    topBar.hideMatchOver();
    topBar.setPlayerName(authClient.user?.username ?? selfName);
    topBar.setMatchModeLabel(true, msg.code, oppName);
    topBar.setRematchStatus(0);
    if (pvpClient.rttMs > 0) topBar.setPing(pvpClient.rttMs);
    topBar.setVisible(true);
    topBar.syncPortraitHint(false, input.live.mode);
    input.setPaused(pvpCountdownActive);
    input.clearAllInputs();
    input.recomputeLayouts();
  },
  onCountdownTick: (value) => {
    soundFX.playCountdown(value);
    topBar.showCountdown(value);
    if (value <= 0) {
      pvpCountdownActive = false;
      input.setPaused(false);
      input.clearAllInputs();
    } else {
      pvpCountdownActive = true;
      input.setPaused(true);
    }
  },
  onSnapshot: (msg) => {
    if (matchMode !== 'pvp' || inLobby) return;
    pvpInterpolator.pushSnapshot(msg.snapshot, performance.now(), state.obstacles);
    if (msg.snapshot.events.length > 0) {
      handleSimEvents(msg.snapshot.events);
    }
  },
  onPingUpdate: (rttMs) => {
    topBar.setPing(rttMs);
  },
  onRematchStatus: (readyCount) => {
    topBar.setRematchStatus(readyCount);
    topBar.showToast(`Tái đấu PvP: ${readyCount}/2 người sẵn sàng.`);
  },
  onOpponentLeft: (message) => {
    activeRoomState = null;
    pvpCountdownActive = false;
    topBar.hideCountdown();
    topBar.showToast(message);
    enterLobby();
  },
  onDisconnected: () => {
    lobbyPvP.busy = false;
    lobbyPvP.waitingCode = null;
    const wasInPvP = matchMode === 'pvp' || activeRoomState !== null;
    activeRoomState = null;
    pvpCountdownActive = false;
    topBar.hideCountdown();
    if (wasInPvP) {
      topBar.showToast('Mất kết nối máy chủ PvP.');
      enterLobby();
    } else {
      refreshLobbyIfVisible();
    }
  },
});

const IOS_FS_GUIDE_HIDDEN_KEY = 'hex_arena_p3_ios_fs_guide_hidden';

function showIOSFullscreenGuide(): void {
  let hidden = false;
  try {
    hidden = localStorage.getItem(IOS_FS_GUIDE_HIDDEN_KEY) === '1';
  } catch {
    hidden = false;
  }
  if (hidden) {
    topBar.showToast('Đã bật chế độ Tập trung iOS (Thêm vào MH chính từ Safari để toàn màn hình 100%).');
    return;
  }
  const overlay = document.getElementById('iosFsGuideOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
  }
}

function bindIOSGuideModal(): void {
  const overlay = document.getElementById('iosFsGuideOverlay');
  const chk = document.getElementById('iosFsDontShow') as HTMLInputElement | null;
  const closeGuide = () => {
    if (chk?.checked) {
      try {
        localStorage.setItem(IOS_FS_GUIDE_HIDDEN_KEY, '1');
      } catch {
        // Ignore storage error
      }
    }
    overlay?.classList.add('hidden');
  };
  document.getElementById('iosFsClose')?.addEventListener('click', closeGuide);
  document.getElementById('iosFsOk')?.addEventListener('click', closeGuide);
}
bindIOSGuideModal();

const topBar = new TopBarController({
  getState: () => state,
  onOpenLobby: () => enterLobby(),
  onOpenLoadout: () => openLoadoutEditor(),
  onOpenCustomize: () => openHUDCustomizer(),
  onOpenSettings: () => openSettingsModal(),
  onToggleMode: () => toggleInputMode(),
  onToggleSound: () => {
    audioSettings = { ...audioSettings, enabled: !audioSettings.enabled };
    soundFX.applySettings(audioSettings);
    saveAudioSettings(audioSettings);
    return audioSettings.enabled;
  },
  onOpenHelp: () => openHelpModal(),
  onShowIOSGuide: () => showIOSFullscreenGuide(),
  onRestart: () => {
    if (matchMode === 'pvp') {
      pvpClient.requestRematch();
    } else {
      startNewBotMatch();
    }
  },
  onSetRot: (rot) => input.dispatchAction({ kind: 'set_rot', rotMode: rot }),
  onSetScale: (scale) => input.dispatchAction({ kind: 'set_scale', scale }),
});

const lobby = new LobbyScreen({
  mount: lobbyRoot,
  onPlayBot: () => startNewBotMatch(),
  onCreateRoom: () => {
    lobbyPvP.busy = true;
    lobbyPvP.errorMessage = null;
    refreshLobbyIfVisible();
    void pvpClient.createRoom(playerLoadout, authClient.user?.username);
  },
  onJoinRoom: (code) => {
    lobbyPvP.joinCodeDraft = code.trim().toUpperCase();
    lobbyPvP.busy = true;
    lobbyPvP.errorMessage = null;
    refreshLobbyIfVisible();
    void pvpClient.joinRoom(lobbyPvP.joinCodeDraft, playerLoadout, authClient.user?.username);
  },
  onCancelRoom: () => {
    pvpClient.leaveRoom();
    lobbyPvP.waitingCode = null;
    lobbyPvP.busy = false;
    refreshLobbyIfVisible();
  },
  onOpenWeapons: (slot?: SlotKey) => openLoadoutEditor(slot),
  onOpenCosmetics: () => openCosmeticsModal(),
  onOpenSettings: () => openSettingsModal(),
  onOpenAuth: () => {
    if (authClient.user) openSettingsModal();
    else openAuthModal('login');
  },
  onNotify: (msg) => topBar.showToast(msg),
  onShowIOSGuide: () => showIOSFullscreenGuide(),
  onPvPTabChange: (tab) => {
    if (tab === 'bot' && lobbyPvP.waitingCode) {
      pvpClient.leaveRoom();
      lobbyPvP.waitingCode = null;
    }
    lobbyPvP.tab = tab;
    lobbyPvP.errorMessage = null;
    refreshLobbyIfVisible();
  },
  onJoinCodeInput: (code) => {
    lobbyPvP.joinCodeDraft = code;
  },
});

const input = new InputManager({
  canvas,
  getState: () => state,
  getMobileConfig: () => (activeCustomizer ? activeCustomizer.draftMobile : mobileHUDConfig),
  getPCConfig: () => (activeCustomizer ? activeCustomizer.draftPC : pcControlConfig),
  screenToWorld: (px, py) => renderer.screenToWorld(px, py),
  onModeChanged: (mode) => {
    topBar.syncMode(mode);
    refreshLobbyIfVisible();
  },
  onAudioUnlock: () => soundFX.init(),
  isPvPActive: () => matchMode === 'pvp' && !inLobby,
  onPvPAction: (action) => pvpClient.sendAction(action),
});

function hasModalOpen(): boolean {
  return (
    activeLoadoutModal !== null ||
    activePvPRoomModal !== null ||
    activeCustomizer !== null ||
    activeAuthModal !== null ||
    activeCosmeticsModal !== null ||
    settingsOpen ||
    helpOpen
  );
}

function refreshLobbyIfVisible(): void {
  if (inLobby && !hasModalOpen()) {
    lobby.show(playerLoadout, input.live.mode, lobbyPvP, authClient.user);
  }
}

function isSimulationPaused(): boolean {
  return inLobby || hasModalOpen();
}

function toggleInputMode(): void {
  const next = input.live.mode === 'desktop' ? 'touch' : 'desktop';
  input.setMode(next, true);
  topBar.showToast(next === 'desktop' ? 'Đã chuyển sang chế độ Máy tính (PC)' : 'Đã chuyển sang chế độ Điện thoại (Mobile)');
}

function clearModalRefs(): void {
  if (activeLoadoutModal) {
    activeLoadoutModal.destroy();
    activeLoadoutModal = null;
  }
  if (activePvPRoomModal) {
    activePvPRoomModal.destroy();
    activePvPRoomModal = null;
  }
  if (activeCustomizer) {
    activeCustomizer.destroy();
    activeCustomizer = null;
  }
  if (activeAuthModal) {
    activeAuthModal.destroy();
    activeAuthModal = null;
  }
  if (activeCosmeticsModal) {
    activeCosmeticsModal.destroy();
    activeCosmeticsModal = null;
  }
  settingsOpen = false;
  helpOpen = false;
  modalRoot.innerHTML = '';
}

function closeAllModals(): void {
  clearModalRefs();
  input.setPaused(inLobby);
  input.recomputeLayouts();
  refreshLobbyIfVisible();
}

function enterLobby(): void {
  if (matchMode === 'pvp' || lobbyPvP.waitingCode || activeRoomState !== null) {
    pvpClient.leaveRoom();
    lobbyPvP.waitingCode = null;
    lobbyPvP.busy = false;
    activeRoomState = null;
  }
  matchMode = 'bot';
  pvpCountdownActive = false;
  pvpInterpolator.reset();
  clearModalRefs();
  inLobby = true;
  soundFX.setBgmMode('lobby');
  soundFX.setMatchTension(0);
  topBar.setVisible(false);
  topBar.hideCountdown();
  topBar.hideMatchOver();
  input.setPaused(true);
  topBar.syncPortraitHint(true, input.live.mode);
  lobby.show(playerLoadout, input.live.mode, lobbyPvP, authClient.user);
}

function startNewBotMatch(): void {
  if (lobbyPvP.waitingCode) {
    pvpClient.leaveRoom();
    lobbyPvP.waitingCode = null;
  }
  matchMode = 'bot';
  pvpInterpolator.reset();
  clearModalRefs();
  inLobby = false;
  lobby.hide();
  state = createMatchState(playerLoadout, createDefaultLoadout(), Math.random, true);
  renderer.vfx.clear();
  soundFX.setBgmMode('match');
  soundFX.setMatchTension(0);
  topBar.hideMatchOver();
  topBar.setPlayerName(authClient.user?.username ?? null);
  topBar.setMatchModeLabel(false);
  topBar.setVisible(true);
  topBar.syncPortraitHint(false, input.live.mode);
  input.setPaused(false);
  input.clearAllInputs();
  input.recomputeLayouts();
}

function applyAccountProfile(user: {
  username: string;
  loadout: PlayerLoadout;
  mobileHud: MobileHUDConfig | null;
  pcControls: PCControlConfig | null;
  cosmetics: PlayerCosmetics | null;
}): void {
  playerLoadout = user.loadout;
  savePlayerLoadout(playerLoadout);
  if (user.mobileHud) {
    mobileHUDConfig = user.mobileHud;
    saveMobileHUDConfig(mobileHUDConfig);
  }
  if (user.pcControls) {
    pcControlConfig = user.pcControls;
    savePCControlConfig(pcControlConfig);
  }
  if (user.cosmetics) {
    playerCosmetics = user.cosmetics;
    savePlayerCosmetics(playerCosmetics);
  }
  topBar.setPlayerName(user.username);
  input.recomputeLayouts();
}

function openAuthModal(initialTab: 'login' | 'register' = 'login'): void {
  const wasLobby = inLobby;
  clearModalRefs();
  if (wasLobby) lobby.hide();
  input.setPaused(true);

  activeAuthModal = new AuthModal({
    mount: modalRoot,
    initialTab,
    onLogin: async (username, password) => {
      const res = await authClient.login(username, password);
      if (!res.ok) return res.error;
      applyAccountProfile(res.user);
      closeAllModals();
      topBar.showToast(`Xin chào, ${res.user.username}! Đã tải vũ khí & cài đặt phím của bạn.`);
      return null;
    },
    onRegister: async (username, password) => {
      const res = await authClient.register(
        username,
        password,
        playerLoadout,
        mobileHUDConfig,
        pcControlConfig,
        playerCosmetics,
      );
      if (!res.ok) return res.error;
      applyAccountProfile(res.user);
      closeAllModals();
      topBar.showToast(`Đăng ký thành công! Đã lưu vũ khí & cài đặt phím vào ${res.user.username}.`);
      return null;
    },
    onClose: () => closeAllModals(),
  });
}

function openSettingsModal(): void {
  const wasLobby = inLobby;
  clearModalRefs();
  if (wasLobby) lobby.hide();
  settingsOpen = true;
  input.setPaused(true);

  const rerender = () => {
    renderSettingsModal({
      mount: modalRoot,
      user: authClient.user,
      mode: input.live.mode,
      audioSettings,
      onOpenControls: () => openHUDCustomizer(),
      onOpenCosmetics: () => openCosmeticsModal(),
      onToggleMode: () => {
        toggleInputMode();
        rerender();
      },
      onAudioChange: (next) => {
        const toggledMute = next.enabled !== audioSettings.enabled;
        audioSettings = next;
        soundFX.applySettings(audioSettings);
        saveAudioSettings(audioSettings);
        if (toggledMute) rerender();
      },
      onTestSound: () => {
        soundFX.init();
        soundFX.play('clashSharp');
      },
      onOpenHelp: () => openHelpModal(),
      onOpenAuth: () => openAuthModal('login'),
      onLogout: () => {
        authClient.logout();
        topBar.setPlayerName(null);
        topBar.showToast('Đã đăng xuất tài khoản.');
        closeAllModals();
      },
      onClose: () => closeAllModals(),
    });
  };
  rerender();
}

function openCosmeticsModal(): void {
  const wasLobby = inLobby;
  clearModalRefs();
  if (wasLobby) lobby.hide();
  input.setPaused(true);

  activeCosmeticsModal = new CosmeticsModal({
    mount: modalRoot,
    initial: playerCosmetics,
    onSave: async (next) => {
      playerCosmetics = next;
      savePlayerCosmetics(playerCosmetics);
      let synced = false;
      if (authClient.user) {
        synced = await authClient.saveCosmeticsToAccount(playerCosmetics);
      }
      closeAllModals();
      topBar.showToast(
        synced
          ? `Đã lưu ngoại hình lên tài khoản ${authClient.user?.username}.`
          : 'Đã áp dụng ngoại hình mới.',
      );
    },
    onClose: () => closeAllModals(),
  });
}

function openLoadoutEditor(initialSlot?: SlotKey): void {
  const wasLobby = inLobby;
  clearModalRefs();
  if (wasLobby) lobby.hide();

  input.setPaused(true);
  activeLoadoutModal = new LoadoutEditorModal({
    mount: modalRoot,
    initialLoadout: playerLoadout,
    initialSlot,
    openedFromLobby: wasLobby,
    onSave: async (newLoadout, shouldStartMatch) => {
      playerLoadout = newLoadout;
      savePlayerLoadout(playerLoadout);
      let syncedCloud = false;
      if (authClient.user) {
        syncedCloud = await authClient.saveLoadoutToAccount(playerLoadout);
      }
      if (shouldStartMatch || !wasLobby) {
        startNewBotMatch();
        topBar.showToast(
          syncedCloud
            ? `Đã lưu lên tài khoản (${authClient.user?.username}) và vào trận.`
            : `Đã áp dụng bộ ${playerLoadout.hexMaterials.length} mảnh mới vào trận.`,
        );
      } else {
        closeAllModals();
        topBar.showToast(
          syncedCloud
            ? `Đã lưu bộ vũ khí vào tài khoản ${authClient.user?.username}.`
            : `Đã lưu bộ ${playerLoadout.hexMaterials.length} mảnh.`,
        );
      }
    },
    onClose: () => closeAllModals(),
  });
}

function openHUDCustomizer(): void {
  const wasLobby = inLobby;
  clearModalRefs();
  if (wasLobby) lobby.hide();

  input.setPaused(true);
  activeCustomizer = new HUDCustomizerController({
    mount: modalRoot,
    canvas,
    initialTab: input.live.mode === 'touch' ? 'mobile' : 'pc',
    mobileConfig: mobileHUDConfig,
    pcConfig: pcControlConfig,
    getMobileLayout: () => input.live.mobileLayout,
    onDraftChanged: () => {
      input.recomputeLayouts();
    },
    onSave: async (newMob, newPC) => {
      mobileHUDConfig = JSON.parse(JSON.stringify(newMob)) as MobileHUDConfig;
      pcControlConfig = JSON.parse(JSON.stringify(newPC)) as PCControlConfig;
      saveMobileHUDConfig(mobileHUDConfig);
      savePCControlConfig(pcControlConfig);
      let syncedCloud = false;
      if (authClient.user) {
        syncedCloud = await authClient.saveControlsToAccount(mobileHUDConfig, pcControlConfig);
      }
      closeAllModals();
      topBar.showToast(
        syncedCloud
          ? `Đã lưu cài đặt phím vào tài khoản ${authClient.user?.username}.`
          : 'Đã lưu cài đặt phím trên thiết bị (đăng nhập để đồng bộ tài khoản).',
      );
    },
    onCancel: () => closeAllModals(),
  });
}

function openHelpModal(): void {
  const wasLobby = inLobby;
  clearModalRefs();
  if (wasLobby) lobby.hide();
  helpOpen = true;
  input.setPaused(true);
  renderHelpModal(modalRoot, pcControlConfig, () => closeAllModals());
}

function handleSimEvents(events: SimEvent[]): void {
  if (events.length === 0) return;
  renderer.vfx.ingestEvents(events, playerCosmetics);
  for (const ev of events) {
    if (ev.type === 'sfx') soundFX.play(ev.kind);
    else if (ev.type === 'haptic') triggerHaptic(ev.pattern);
    else if (ev.type === 'toast') topBar.showToast(ev.message);
    else if (ev.type === 'matchEnd') topBar.showMatchOver(state, ev.playerWon);
  }
}

function processLocalSimEvents(): void {
  if (state.events.length === 0) return;
  const events = state.events.splice(0, state.events.length);
  handleSimEvents(events);
}

function handleViewportOrOrientationChange(): void {
  syncAppViewportVars();
  renderer.resize();
  input.recomputeLayouts();
  topBar.syncPortraitHint(inLobby, input.live.mode);
  refreshLobbyIfVisible();
}

window.addEventListener('resize', handleViewportOrOrientationChange);
window.visualViewport?.addEventListener('resize', handleViewportOrOrientationChange);
window.visualViewport?.addEventListener('scroll', handleViewportOrOrientationChange);
window.addEventListener('orientationchange', () => {
  window.setTimeout(handleViewportOrOrientationChange, 120);
});
window.screen?.orientation?.addEventListener?.('change', handleViewportOrOrientationChange);

const onFullscreenSync = () => {
  if (isDocumentFullscreen()) {
    const isMobileLike = window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
    if (isMobileLike) {
      void tryLockLandscape();
    }
  }
  window.setTimeout(handleViewportOrOrientationChange, 100);
};
document.addEventListener('fullscreenchange', onFullscreenSync);
document.addEventListener('webkitfullscreenchange', onFullscreenSync);
document.addEventListener(FULLSCREEN_CHANGE_EVENT, onFullscreenSync);

// Initialize viewport sizing, Lobby & restore SQLite user session if token present
syncAppViewportVars();
topBar.syncMode(input.live.mode);
enterLobby();
void authClient.restoreSession().then((user) => {
  if (user) {
    applyAccountProfile(user);
    refreshLobbyIfVisible();
  }
});

let lastTime = performance.now();
let accumulator = 0;

function gameLoop(now: number): void {
  const frameDt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  if (matchMode === 'pvp' && !inLobby) {
    if (!pvpCountdownActive) {
      pvpTickAccum += frameDt;
      pvpIdleSendTimer += frameDt;
      while (pvpTickAccum >= FIXED_DT) {
        pvpTickAccum -= FIXED_DT;
        const continuous = input.sampleContinuousInput(FIXED_DT);
        pvpInterpolator.predictLocalMovement(state, continuous.seq, FIXED_DT, continuous.mx, continuous.my);

        const sig = `${Math.round(continuous.mx * 20)},${Math.round(continuous.my * 20)},${Math.round(continuous.facing * 40)},${continuous.isAiming ? 1 : 0},${Math.round(continuous.aimAngle * 40)},${Math.round(continuous.aimStrength * 20)},${continuous.guidedInput.touchHoldingAttack ? 1 : 0}`;
        if (sig !== lastSentSig || pvpIdleSendTimer >= 0.09) {
          lastSentSig = sig;
          pvpIdleSendTimer = 0;
          pvpClient.sendInputState(continuous);
        }
      }
    }

    const formChanged = pvpInterpolator.applyFrame(state, now, frameDt);
    if (formChanged) input.recomputeLayouts();

    processLocalSimEvents();
    renderer.vfx.update(frameDt);
    renderer.updateCamera(state, frameDt);
  } else if (!isSimulationPaused()) {
    accumulator += frameDt;
    while (accumulator >= FIXED_DT) {
      const guidedInput = input.applyTickInputs(FIXED_DT);
      stepSimulation(state, FIXED_DT, guidedInput, updateBotAI);
      processLocalSimEvents();
      accumulator -= FIXED_DT;
    }
    renderer.vfx.update(frameDt);
    renderer.updateCamera(state, frameDt);
  }

  const activePC = activeCustomizer ? activeCustomizer.draftPC : pcControlConfig;
  if (!inLobby) {
    topBar.syncFrame(state, activePC);
    const minHpRatio = Math.min(
      state.player.hp / Math.max(1, state.player.maxHp),
      state.enemy.hp / Math.max(1, state.enemy.maxHp),
    );
    const tension = !state.matchOver && minHpRatio <= 0.30 ? Math.min(1, (0.30 - minHpRatio) / 0.25) : 0;
    soundFX.setMatchTension(tension);
  }

  const mobileEditOpts =
    activeCustomizer && activeCustomizer.activeTab === 'mobile'
      ? {
          editMode: true,
          selectedWidget: activeCustomizer.selectedWidget,
          snapGrid: activeCustomizer.draftMobile.snapGrid,
        }
      : undefined;

  renderer.renderFrame(
    state,
    input.live,
    activePC,
    now / 1000,
    mobileEditOpts,
    inLobby && !mobileEditOpts,
    playerCosmetics,
  );
  requestAnimationFrame(gameLoop);
}

void ensureFontsLoaded(() => {
  refreshLobbyIfVisible();
});

requestAnimationFrame(gameLoop);
