import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseChordProLine, transposeChord, transposeContent } from '../utils/chordPro';
import { downloadGigPack } from '../utils/gigPack';
import { loadDeviceSettings, loadGigPack, saveDeviceSettings, saveGigPack } from '../db/stageStore';
import useStageSync, { getGigPackURL } from '../hooks/useStageSync';
import './stage-view.css';

const defaultSettings = {
  role: 'follower',
  freeBrowse: false,
  theme: 'light',
  viewMode: 'musician',
  fontScale: 1,
  transpose: 0,
  autoScroll: false,
  scrollSpeed: 1,
  dismissedIOSPrompt: false,
};

function getSetlistEntries(pack) {
  if (!pack?.setlist) return [];
  const songsById = new Map((pack.songs || []).map((song) => [song.id, song]));
  return (pack.setlist.categories || []).flatMap((category, categoryIndex) =>
    (category.songIds || []).map((songId, songIndex) => {
      const song = songsById.get(songId);
      return song ? {
        category,
        categoryIndex,
        key: `${category.id}:${songId}:${songIndex}`,
        song,
        songIndex,
      } : null;
    }).filter(Boolean)
  );
}

function getReaderScrollAnchor(reader) {
  const lines = reader.querySelectorAll('.offline-stage-lyrics > *');
  if (!lines.length) return null;
  const readerTop = reader.getBoundingClientRect().top + reader.clientTop;
  let lineIndex = lines.length - 1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].getBoundingClientRect().bottom > readerTop) {
      lineIndex = index;
      break;
    }
  }
  const lineRect = lines[lineIndex].getBoundingClientRect();
  const offset = lineRect.height > 0
    ? Math.min(1, Math.max(0, (readerTop - lineRect.top) / lineRect.height))
    : 0;
  return { lineIndex, offset };
}

function getChordLineSegments(line) {
  const segments = [];
  let pendingChords = [];
  parseChordProLine(line).forEach((token) => {
    if (token.chord) {
      pendingChords.push(token.chord);
      return;
    }
    if (!token.lyric) return;

    const leadingWhitespace = /^\s+/.exec(token.lyric);
    if (pendingChords.length && leadingWhitespace && token.lyric.trim()) {
      segments.push({ chord: pendingChords.join(' '), lyric: '\u00a0' });
      pendingChords = [];
      segments.push({ chord: '', lyric: token.lyric });
      return;
    }
    segments.push({ chord: pendingChords.join(' '), lyric: token.lyric });
    pendingChords = [];
  });
  if (pendingChords.length) segments.push({ chord: pendingChords.join(' '), lyric: '\u00a0' });
  if (segments.length === 0) segments.push({ chord: '', lyric: '\u00a0' });
  return segments;
}

function ChordLyrics({ content, viewMode, fontScale }) {
  return (
    <div className="offline-stage-lyrics" style={{ fontSize: `${fontScale}em` }}>
      {(content || '').replace(/\r\n/g, '\n').split('\n').map((line, lineIndex) => {
        const section = /^\{([^{}]+)\}$/.exec(line.trim());
        if (section) return <h3 className="offline-stage-section" key={lineIndex}>{section[1]}</h3>;
        if (!line.trim()) return <div aria-hidden="true" className="offline-stage-line offline-stage-line--blank" key={lineIndex} />;
        return (
          <div className="offline-stage-line" key={lineIndex}>
            {getChordLineSegments(line).map((segment, segmentIndex) => (
              <span className="offline-stage-token" key={segmentIndex}>
                <span className={viewMode === 'vocalist' ? 'offline-stage-chord offline-stage-chord--hidden' : 'offline-stage-chord'}>
                  {segment.chord || '\u00a0'}
                </span>
                <span className="offline-stage-text">{segment.lyric || '\u00a0'}</span>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function isIOSBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function StageView() {
  const [settings, setSettings] = useState(() => ({
    ...defaultSettings,
    ...loadDeviceSettings(),
  }));
  const [pack, setPack] = useState(null);
  const [entries, setEntries] = useState([]);
  const [activeSongId, setActiveSongId] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [leaderState, setLeaderState] = useState(null);
  const [remoteScroll, setRemoteScroll] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [loadingPack, setLoadingPack] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [iosPromptVisible, setIOSPromptVisible] = useState(() => (
    isIOSBrowser() &&
    !navigator.standalone &&
    !window.matchMedia('(display-mode: standalone)').matches &&
    !loadDeviceSettings().dismissedIOSPrompt
  ));
  const fileInputRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const wakeLockRef = useRef(null);
  const wakeVideoRef = useRef(null);
  const videoStreamRef = useRef(null);
  const suppressScrollUntilRef = useRef(0);

  const entriesFromPack = useMemo(() => getSetlistEntries(pack), [pack]);
  const currentEntry = entries.find((entry) => entry.song.id === activeSongId) || entries[0] || null;

  function applyRemoteState(remoteState, sourceEntries = entries) {
    const followsLeader = settings.role === 'leader' ||
      (settings.role === 'follower' && !settings.freeBrowse);
    if (followsLeader && remoteState.songId) {
      const remoteEntry = sourceEntries.find((entry) => entry.song.id === remoteState.songId);
      if (remoteEntry) {
        setActiveSongId(remoteEntry.song.id);
        setActiveCategoryId(remoteEntry.category.id);
      }
    }
    setSettings((current) => {
      const transpose = followsLeader && Number.isFinite(remoteState.transpose)
        ? remoteState.transpose
        : current.transpose;
      const autoScroll = typeof remoteState.autoScroll === 'boolean'
        ? remoteState.autoScroll
        : current.autoScroll;
      const scrollSpeed = Number.isFinite(remoteState.scrollSpeed) && remoteState.scrollSpeed >= 0.5
        ? remoteState.scrollSpeed
        : current.scrollSpeed;
      if (transpose === current.transpose && autoScroll === current.autoScroll && scrollSpeed === current.scrollSpeed) {
        return current;
      }
      return { ...current, transpose, autoScroll, scrollSpeed };
    });
    if (remoteState.songId && Number.isInteger(remoteState.scrollLine) && Number.isFinite(remoteState.scrollOffset)) {
      setRemoteScroll({
        songId: remoteState.songId,
        line: remoteState.scrollLine,
        offset: Math.min(1, Math.max(0, remoteState.scrollOffset)),
      });
    }
  }

  const sync = useStageSync((remoteState) => {
    setLeaderState((current) => {
      if (
        current?.setlistId === remoteState.setlistId &&
        current?.songId === remoteState.songId &&
        current?.transpose === remoteState.transpose &&
        current?.autoScroll === remoteState.autoScroll &&
        current?.scrollSpeed === remoteState.scrollSpeed
      ) return current;
      return remoteState;
    });
    if (remoteState.setlistId && pack?.setlist?.id !== remoteState.setlistId) {
      applyRemoteState(remoteState, []);
      void refreshPack(false)
        .then((nextPack) => applyRemoteState(remoteState, getSetlistEntries(nextPack)))
        .catch(() => {});
      return;
    }
    applyRemoteState(remoteState);
  });

  const applyPack = useCallback(async (nextPack) => {
    const storedAs = await saveGigPack(nextPack);
    setPack(nextPack);
    const nextEntries = getSetlistEntries(nextPack);
    setEntries(nextEntries);
    const initialEntry = nextEntries[0] || null;
    setActiveSongId(initialEntry?.song.id || '');
    setActiveCategoryId(initialEntry?.category.id || '');
    setLeaderState({
      type: 'STATE_UPDATE',
      setlistId: nextPack.setlist?.id || '',
      songId: initialEntry?.song.id || '',
      transpose: 0,
      updatedAt: Math.floor(Date.now() / 1000),
    });
    setSettings((current) => ({ ...current, transpose: 0 }));
    return storedAs;
  }, []);

  const refreshPack = useCallback(async (showFeedback = true) => {
    if (showFeedback) setSyncing(true);
    try {
      const response = await fetch(getGigPackURL(), { cache: 'no-store' });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `Gig sync failed (${response.status}).`);
      }
      const nextPack = await response.json();
      const storedAs = await applyPack(nextPack);
      if (showFeedback) setStatusMessage(`Gig synced and saved to ${storedAs}.`);
      return nextPack;
    } catch (error) {
      if (showFeedback) setStatusMessage(error.message);
      throw error;
    } finally {
      if (showFeedback) setSyncing(false);
    }
  }, [applyPack]);

  useEffect(() => {
    let active = true;
    loadGigPack()
      .then((cachedPack) => {
        if (active && cachedPack) {
          setPack(cachedPack);
          const cachedEntries = getSetlistEntries(cachedPack);
          setEntries(cachedEntries);
          setActiveSongId(cachedEntries[0]?.song.id || '');
          setActiveCategoryId(cachedEntries[0]?.category.id || '');
        }
        if (active) {
          setLoadingPack(false);
          refreshPack(false).catch(() => {});
        }
      })
      .catch((error) => console.warn('Could not load the offline gig pack:', error))
      .finally(() => {
        if (active) setLoadingPack(false);
      });
    return () => { active = false; };
  }, [refreshPack]);

  useEffect(() => {
    saveDeviceSettings(settings);
  }, [settings]);

  useEffect(() => {
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (!themeColor) return undefined;
    const previousThemeColor = themeColor.content;
    themeColor.content = settings.theme === 'dark' ? '#000000' : '#f7f4ed';
    return () => {
      themeColor.content = previousThemeColor;
    };
  }, [settings.theme]);

  useEffect(() => {
    if (
      !settings.autoScroll ||
      !scrollContainerRef.current ||
      (settings.role === 'follower' && settings.freeBrowse)
    ) return undefined;
    const timer = window.setInterval(() => {
      scrollContainerRef.current?.scrollBy({ top: settings.scrollSpeed, behavior: 'instant' });
    }, 35);
    return () => window.clearInterval(timer);
  }, [settings.autoScroll, settings.freeBrowse, settings.role, settings.scrollSpeed]);

  useEffect(() => {
    const reader = scrollContainerRef.current;
    if (!reader || !activeSongId) return;
    suppressScrollUntilRef.current = performance.now() + 200;
    reader.scrollTop = 0;
  }, [activeSongId]);

  useEffect(() => {
    if (
      !remoteScroll ||
      remoteScroll.songId !== activeSongId ||
      (settings.role === 'follower' && settings.freeBrowse)
    ) return;
    const reader = scrollContainerRef.current;
    const lines = reader?.querySelectorAll('.offline-stage-lyrics > *');
    if (!reader || !lines?.length) return;
    const line = lines[Math.min(remoteScroll.line, lines.length - 1)];
    if (!line) return;

    const readerTop = reader.getBoundingClientRect().top + reader.clientTop;
    const lineRect = line.getBoundingClientRect();
    const target = reader.scrollTop + lineRect.top - readerTop + lineRect.height * remoteScroll.offset;
    suppressScrollUntilRef.current = performance.now() + 250;
    reader.scrollTop = Math.max(0, target);
  }, [remoteScroll, activeSongId, settings.freeBrowse, settings.role]);

  useEffect(() => {
    const reader = scrollContainerRef.current;
    if (!reader || settings.role !== 'leader') return undefined;

    const sendPosition = () => {
      if (settings.autoScroll || performance.now() < suppressScrollUntilRef.current) return;
      const anchor = getReaderScrollAnchor(reader);
      if (anchor) sync.sendScrollPosition(anchor.lineIndex, anchor.offset);
    };
    const handleScroll = () => {
      if (settings.autoScroll || performance.now() < suppressScrollUntilRef.current) return;
      window.clearTimeout(sendTimer);
      sendTimer = window.setTimeout(sendPosition, 180);
    };
    const handleScrollEnd = () => {
      window.clearTimeout(sendTimer);
      sendTimer = undefined;
      sendPosition();
    };
    let sendTimer;
    reader.addEventListener('scroll', handleScroll, { passive: true });
    reader.addEventListener('scrollend', handleScrollEnd);
    return () => {
      reader.removeEventListener('scroll', handleScroll);
      reader.removeEventListener('scrollend', handleScrollEnd);
      window.clearTimeout(sendTimer);
    };
  }, [settings.role, settings.autoScroll, activeSongId]);

  useEffect(() => {
    let disposed = false;
    async function requestWakeLock() {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try {
        const wakeLock = await navigator.wakeLock.request('screen');
        if (disposed) {
          await wakeLock.release();
          return;
        }
        wakeLockRef.current = wakeLock;
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      } catch (error) {
        if (!disposed) console.info('Screen Wake Lock is unavailable:', error.message);
      }
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') void requestWakeLock();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    void requestWakeLock();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch((error) => {
        console.warn('Offline Stage View shell could not be cached:', error);
      });
    }
    const appleStandalone = document.createElement('meta');
    appleStandalone.name = 'apple-mobile-web-app-capable';
    appleStandalone.content = 'yes';
    document.head.appendChild(appleStandalone);
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = '/stage-manifest.json';
    document.head.appendChild(manifestLink);
    return () => {
      manifestLink.remove();
      appleStandalone.remove();
    };
  }, []);

  useEffect(() => {
    function activateVideoWakeFallback() {
      const video = wakeVideoRef.current;
      if (!video || videoStreamRef.current || !HTMLCanvasElement.prototype.captureStream) return;
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      context?.fillRect(0, 0, 1, 1);
      videoStreamRef.current = canvas.captureStream(1);
      video.srcObject = videoStreamRef.current;
      video.play().catch((error) => console.info('iOS video wake fallback is unavailable:', error.message));
    }
    document.addEventListener('pointerdown', activateVideoWakeFallback, { once: true });
    return () => {
      document.removeEventListener('pointerdown', activateVideoWakeFallback);
      videoStreamRef.current?.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    setEntries(entriesFromPack);
    if (!entriesFromPack.length) {
      setActiveSongId('');
      setActiveCategoryId('');
      return;
    }
    const activeExists = entriesFromPack.some((entry) => entry.song.id === activeSongId);
    if (!activeExists) {
      setActiveSongId(entriesFromPack[0].song.id);
      setActiveCategoryId(entriesFromPack[0].category.id);
    }
  }, [entriesFromPack, activeSongId]);

  const updateSetting = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  function navigateToEntry(entry, { fromRemote = false } = {}) {
    if (!entry) return;
    setActiveSongId(entry.song.id);
    setActiveCategoryId(entry.category.id);
    setCategoryDrawerOpen(false);
    if (!fromRemote && settings.role === 'leader') {
      sync.sendChangeSong(pack?.setlist?.id || '', entry.song.id);
    } else if (!fromRemote && settings.role === 'follower') {
      setSettings((current) => ({ ...current, freeBrowse: true }));
    }
  }

  function navigateBy(offset) {
    if (!currentEntry) return;
    const currentIndex = entries.findIndex((entry) => entry.song.id === currentEntry.song.id);
    const nextEntry = entries[currentIndex + offset];
    if (nextEntry) navigateToEntry(nextEntry);
  }

  function changeTranspose(delta) {
    const nextTranspose = settings.transpose + delta;
    updateSetting('transpose', nextTranspose);
    if (settings.role === 'leader') sync.sendTranspose(nextTranspose);
  }

  function changeAutoScroll(autoScroll) {
    updateSetting('autoScroll', autoScroll);
    if (settings.role === 'leader') {
      sync.sendAutoScroll(autoScroll, settings.scrollSpeed);
      if (!autoScroll && scrollContainerRef.current) {
        const anchor = getReaderScrollAnchor(scrollContainerRef.current);
        if (anchor) sync.sendScrollPosition(anchor.lineIndex, anchor.offset);
      }
    }
  }

  function changeScrollSpeed(scrollSpeed) {
    updateSetting('scrollSpeed', scrollSpeed);
    if (settings.role === 'leader') sync.sendAutoScroll(settings.autoScroll, scrollSpeed);
  }

  function chooseRole(role) {
    updateSetting('role', role);
    if (role === 'leader' && currentEntry) {
      sync.sendChangeSong(pack?.setlist?.id || '', currentEntry.song.id);
      sync.sendTranspose(settings.transpose);
      sync.sendAutoScroll(settings.autoScroll, settings.scrollSpeed);
      updateSetting('freeBrowse', false);
    } else {
      sync.clearPending();
      if (!leaderState?.songId) return;
      updateSetting('freeBrowse', false);
      const leaderEntry = entries.find((entry) => entry.song.id === leaderState.songId);
      if (leaderEntry) {
        setActiveSongId(leaderEntry.song.id);
        setActiveCategoryId(leaderEntry.category.id);
      }
      updateSetting('transpose', leaderState.transpose);
    }
  }

  function returnToLeaderSync() {
    updateSetting('freeBrowse', false);
    if (!leaderState?.songId) return;
    const leaderEntry = entries.find((entry) => entry.song.id === leaderState.songId);
    if (leaderEntry) {
      setActiveSongId(leaderEntry.song.id);
      setActiveCategoryId(leaderEntry.category.id);
    }
    updateSetting('transpose', leaderState.transpose);
  }

  async function importGigPack(file) {
    if (!file) return;
    try {
      const importedPack = JSON.parse(await file.text());
      if (!importedPack?.setlist?.id || !Array.isArray(importedPack.setlist.categories) || !Array.isArray(importedPack.songs)) {
        throw new Error('This file is not a valid Setlist Builder gig pack.');
      }
      try {
        const response = await fetch(getGigPackURL(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(importedPack),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || `Relay rejected the gig pack (${response.status}).`);
        }
        await applyPack(await response.json());
        setStatusMessage('Gig pack imported, cached, and sent to the local relay.');
      } catch (relayError) {
        const storedAs = await applyPack(importedPack);
        setStatusMessage(`Gig pack imported to this device (${storedAs}); local relay was unavailable.`);
        console.info('Gig pack remains local because relay import failed:', relayError.message);
      }
      setSetupOpen(false);
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function dismissIOSPrompt() {
    setIOSPromptVisible(false);
    updateSetting('dismissedIOSPrompt', true);
  }

  const currentSong = currentEntry?.song;
  const currentKey = currentSong?.defaultKey
    ? transposeChord(currentSong.defaultKey, settings.transpose)
    : '—';

  return (
    <main className={`offline-stage${settings.theme === 'dark' ? ' offline-stage--dark' : ''}`}>
      <video aria-hidden="true" className="offline-stage-wake-video" muted playsInline ref={wakeVideoRef} />
      {iosPromptVisible && (
        <aside className="offline-stage-ios-prompt">
          <span>On iPhone: Tap Share → Add to Home Screen before syncing so offline songs stay saved.</span>
          <button aria-label="Dismiss iPhone setup tip" onClick={dismissIOSPrompt} type="button">×</button>
        </aside>
      )}
      <header className="offline-stage-topbar">
        <div className="offline-stage-brand">
          <span className={`offline-stage-status ${sync.connected ? 'is-live' : 'is-solo'}`} title={sync.connected ? 'Live synced' : 'Offline solo'} />
          <div>
            <strong>{pack?.setlist?.gigName || 'Stage View'}</strong>
            <small>{currentEntry ? `${currentEntry.category.name} · ${entries.findIndex((entry) => entry.song.id === currentEntry.song.id) + 1}/${entries.length}` : 'No gig loaded'}</small>
          </div>
        </div>
        <div className="offline-stage-top-actions">
          <label className="offline-stage-role">
            <span>Role</span>
            <select aria-label="Stage role" onChange={(event) => chooseRole(event.target.value)} value={settings.role}>
              <option value="leader">Leader</option>
              <option value="follower">Follower</option>
            </select>
          </label>
          <button aria-label="Open gig setup and sync" className="offline-stage-icon-button" onClick={() => setSetupOpen(true)} type="button">⚙</button>
          <button aria-label="Browse songs and categories" className="offline-stage-icon-button" onClick={() => setCategoryDrawerOpen(true)} type="button">☷</button>
        </div>
      </header>

      {iosPromptVisible && <div className="offline-stage-prompt-spacer" />}

      {settings.role === 'follower' && (
        <div className="offline-stage-follow-bar">
          <button
            className={settings.freeBrowse ? 'offline-stage-free-browse is-active' : 'offline-stage-free-browse'}
            onClick={() => settings.freeBrowse ? returnToLeaderSync() : updateSetting('freeBrowse', true)}
            type="button"
          >
            {settings.freeBrowse ? 'Free Browse: On' : 'Free Browse'}
          </button>
        </div>
      )}

      <section className="offline-stage-current">
        {!currentSong ? (
          <div className="offline-stage-empty">
            <h1>{loadingPack ? 'Loading saved gig…' : 'No gig pack loaded'}</h1>
            <p>Import a gig pack or sync from the local Stage Relay to get started.</p>
            <button onClick={() => setSetupOpen(true)} type="button">Gig Setup / Sync</button>
          </div>
        ) : (
          <>
            <header className="offline-stage-song-heading">
              <div className="offline-stage-song-title">
                <p>{currentEntry.category.name}</p>
                <h1>{currentSong.title}</h1>
              </div>
              <div className="offline-stage-song-meta">
                <span>KEY <b>{currentKey}</b></span>
                {currentSong.bpm > 0 && <span>{currentSong.bpm} BPM</span>}
                {currentSong.timeSignature && <span>{currentSong.timeSignature}</span>}
              </div>
            </header>
            <div className="offline-stage-reader" ref={scrollContainerRef}>
              <ChordLyrics
                content={transposeContent(currentSong.content || '', settings.transpose)}
                fontScale={settings.fontScale}
                viewMode={settings.viewMode}
              />
            </div>
          </>
        )}
      </section>

      <footer className="offline-stage-controls">
        <div className="offline-stage-navigation">
          <button disabled={!currentEntry || entries.findIndex((entry) => entry.song.id === currentEntry.song.id) <= 0} onClick={() => navigateBy(-1)} type="button">← Previous Song</button>
          <button disabled={!currentEntry || entries.findIndex((entry) => entry.song.id === currentEntry.song.id) >= entries.length - 1} onClick={() => navigateBy(1)} type="button">Next Song →</button>
        </div>
        <div className="offline-stage-performer-controls">
          <button
            aria-pressed={settings.viewMode === 'musician'}
            className={settings.viewMode === 'musician' ? 'offline-stage-chords-toggle is-selected' : 'offline-stage-chords-toggle'}
            onClick={() => updateSetting('viewMode', settings.viewMode === 'musician' ? 'vocalist' : 'musician')}
            type="button"
          >Chords</button>
          <div className="offline-stage-adjust-control" aria-label="Font size">
            <span>Font</span>
            <button aria-label="Decrease font size" onClick={() => updateSetting('fontScale', Math.max(.8, settings.fontScale - .1))} type="button">A−</button>
            <button aria-label="Increase font size" onClick={() => updateSetting('fontScale', Math.min(1.7, settings.fontScale + .1))} type="button">A+</button>
          </div>
          <div className="offline-stage-adjust-control" aria-label="Local transpose">
            <span>Transpose</span>
            <button aria-label="Transpose down one semitone" onClick={() => changeTranspose(-1)} type="button">−1</button>
            <b>{settings.transpose > 0 ? `+${settings.transpose}` : settings.transpose}</b>
            <button aria-label="Transpose up one semitone" onClick={() => changeTranspose(1)} type="button">+1</button>
          </div>
          <label className="offline-stage-scroll-control">
            <span><input checked={settings.autoScroll} disabled={settings.role !== 'leader'} onChange={(event) => changeAutoScroll(event.target.checked)} type="checkbox" /> Auto-scroll</span>
            <input
              aria-label="Auto-scroll speed"
              disabled={settings.role !== 'leader'}
              max="3"
              min="0.5"
              onChange={(event) => changeScrollSpeed(Number(event.target.value))}
              step="0.5"
              type="range"
              value={settings.scrollSpeed}
            />
          </label>
        </div>
      </footer>

      {statusMessage && (
        <div className="offline-stage-toast" role="status">
          <span>{statusMessage}</span>
          <button aria-label="Dismiss message" onClick={() => setStatusMessage('')} type="button">×</button>
        </div>
      )}

      {(setupOpen || categoryDrawerOpen) && (
        <button aria-label="Close drawer" className="offline-stage-drawer-backdrop" onClick={() => {
          setSetupOpen(false);
          setCategoryDrawerOpen(false);
        }} type="button" />
      )}
      {setupOpen && (
        <aside aria-label="Gig Setup and Sync" className="offline-stage-drawer">
          <header><div><h2>Gig Setup / Sync</h2><p>Keep this device ready for offline performance.</p></div><button aria-label="Close setup drawer" onClick={() => setSetupOpen(false)} type="button">×</button></header>
          <label className="offline-stage-theme-control">
            <span>Appearance</span>
            <select aria-label="Stage appearance" onChange={(event) => updateSetting('theme', event.target.value)} value={settings.theme}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button className="offline-stage-drawer-primary" disabled={syncing} onClick={() => refreshPack(true).catch(() => {})} type="button">
            {syncing ? 'Syncing…' : 'Sync Gig Now'}
          </button>
          <button className="offline-stage-drawer-button" disabled={!pack} onClick={() => downloadGigPack(pack)} type="button">Export Gig Pack (.json)</button>
          <button className="offline-stage-drawer-button" onClick={() => fileInputRef.current?.click()} type="button">Import Gig Pack (.json)</button>
          <input accept="application/json,.json" className="offline-stage-hidden-input" onChange={(event) => void importGigPack(event.target.files?.[0])} ref={fileInputRef} type="file" />
          <p className="offline-stage-drawer-note">{pack ? `${entries.length} songs cached on this device.` : 'No saved gig pack found on this device.'}</p>
          <small className="offline-stage-connection">{sync.connected ? 'Connected to the Local Stage Relay' : sync.online ? 'Relay unavailable · browsing from this device cache' : 'Offline · browsing from this device cache'}</small>
        </aside>
      )}
      {categoryDrawerOpen && (
        <aside aria-label="Setlist song navigation" className="offline-stage-drawer offline-stage-song-drawer">
          <header><div><h2>{pack?.setlist?.gigName || 'Setlist'}</h2><p>Categories and song order</p></div><button aria-label="Close song drawer" onClick={() => setCategoryDrawerOpen(false)} type="button">×</button></header>
          {(pack?.setlist?.categories || []).map((category) => (
            <section className="offline-stage-drawer-category" key={category.id}>
              <h3>{category.name}</h3>
              {(category.songIds || []).map((songId) => {
                const entry = entries.find((candidate) => candidate.song.id === songId);
                if (!entry) return null;
                return (
                  <button
                    className={activeSongId === songId ? 'offline-stage-drawer-song is-active' : 'offline-stage-drawer-song'}
                    key={`${category.id}-${songId}`}
                    onClick={() => navigateToEntry(entry)}
                    type="button"
                  >
                    <span>{entry.song.title}</span><small>{entry.song.defaultKey || '—'}</small>
                  </button>
                );
              })}
            </section>
          ))}
          {entries.length === 0 && <p className="offline-stage-drawer-note">Import or sync a gig pack to see songs.</p>}
        </aside>
      )}
    </main>
  );
}
