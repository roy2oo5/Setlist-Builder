import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { adminRequest, setAdminToken } from './api/adminClient';
import ProtectedRoute from './components/ProtectedRoute';
import { getDiatonicChords, parseChordProLine, transposeChord, transposeContent } from './utils/chordPro';
import { createGigPack, downloadGigPack } from './utils/gigPack';
import StageView from './pages/StageView';

const pages = [
  { id: 'setlist-builder', label: 'Setlist Builder', icon: '☷' },
  { id: 'view-setlist', label: 'View Setlist', icon: '▤' },
  { id: 'library', label: 'Song Library', icon: '♫' },
  { id: 'add-song', label: 'Add Song', icon: '+' },
  { id: 'chord-builder', label: 'Chord Builder', icon: '⌁' },
  { id: 'view-song', label: 'Stage View', icon: '◉' },
];

function Sidebar({ activePage, onNavigate, onViewStage }) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand__mark">♪</div><div><strong>Setlist</strong><span>Builder</span></div></div>
    <nav className="sidebar__nav" aria-label="Main navigation">
      <span className="sidebar__label">Workspace</span>
      {pages.map((item) => <button className={`nav-item ${activePage === item.id ? 'nav-item--active' : ''}`} key={item.id} onClick={() => item.id === 'view-song' ? onViewStage() : onNavigate(item.id)} type="button"><span>{item.icon}</span>{item.label}</button>)}
    </nav>
    <div className="sidebar__footer"><span className="avatar" aria-hidden="true">B</span><div title="Band Velvet Street workspace"><strong>Band Velvet Street</strong><span>Workspace</span></div><button className="icon-button" aria-label="Workspace settings" type="button">•••</button></div>
  </aside>;
}

function LoginPage({ onUnlock }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  function updatePin(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const nextPin = [...pin];
    nextPin[index] = digit;
    setPin(nextPin);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (pin.some((digit) => !digit)) {
      setError('Enter the complete 4-digit PIN');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const result = await adminRequest('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ pin: pin.join('') }),
      });
      setAdminToken(result.token, rememberDevice);
      setStatus('ready');
      window.setTimeout(onUnlock, 300);
    } catch (requestError) {
      setStatus('idle');
      setError(requestError.message || 'Invalid PIN');
    }
  }

  return (
    <main className="login-page">
      <div className="login-glow login-glow--top" />
      <div className="login-glow login-glow--bottom" />
      <div className="telemetry">
        <span><i /> STAGE MESH ACTIVE</span>
        <span>NODE 04 // FOH LINKED <b>⌁</b></span>
      </div>

      <section className="login-card">
        <div className="login-card__accent" />
        <div className="login-card__body">
          <div className="stage-logo">♪</div>
          <h1>STAGECHORD</h1>
          <p className="login-subtitle">Band Leader &amp; Musician Console</p>

          <form onSubmit={handleSubmit}>
            <div className="pin-label">
              <label htmlFor="pin-0">⌁ &nbsp; ENTER BAND ADMIN PASSCODE</label>
              <span>DIGITS: 4</span>
            </div>
            <div className="pin-grid">
              {pin.map((digit, index) => (
                <input
                  aria-label={`Passcode digit ${index + 1}`}
                  className="pin-input"
                  id={`pin-${index}`}
                  inputMode="numeric"
                  key={index}
                  maxLength={1}
                  onChange={(event) => updatePin(index, event.target.value)}
                  placeholder="·"
                  type="text"
                  value={digit}
                />
              ))}
            </div>

            <div className="login-help"><span>⚿ &nbsp; Authorized Band Administrator</span></div>
            {error && <p role="alert" style={{ color: '#ff9f43', margin: '8px 0', fontSize: 13 }}>{error}</p>}

            <label className="remember-device">
              <input
                checked={rememberDevice}
                onChange={(event) => setRememberDevice(event.target.checked)}
                type="checkbox"
              />
              <span className="checkbox-mark">✓</span>
              Remember this stage device for 30 days
            </label>

            <button className="unlock-button" disabled={status === 'loading'} type="submit">
              <span>{status === 'loading' ? '◌' : status === 'ready' ? '✓' : '↗'}</span>
              {status === 'loading' ? 'Authenticating Mesh...' : status === 'ready' ? 'Stage Console Ready' : 'Unlock Admin Console'}
            </button>
          </form>

          <div className="patch-status"><span><i /> Secure Admin Session</span></div>
        </div>
        <footer className="login-footer">♢ &nbsp; ENCRYPTED LOCAL STAGE MESH NETWORK • V3.8.2</footer>
      </section>

    </main>
  );
}

function AddSongPage() {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [bpm, setBpm] = useState('');
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [lyrics, setLyrics] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchMessage, setFetchMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function fetchLyrics() {
    if (!title.trim() || !artist.trim()) {
      setFetchMessage('Enter both the song title and artist to fetch lyrics.');
      return;
    }

    setFetching(true);
    setFetchMessage('');
    const query = new URLSearchParams({
      artist_name: artist.trim(),
      track_name: title.trim(),
    });
    const providers = [
      {
        name: 'LRCLIB',
        fetch: async () => {
          const response = await fetch(`https://lrclib.net/api/get?${query}`);
          if (response.status === 404) return '';
          if (!response.ok) throw new Error(`LRCLIB request failed (${response.status}).`);
          const result = await response.json();
          return result.plainLyrics || '';
        },
      },
      {
        name: 'Lyrics.ovh',
        fetch: async () => {
          const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist.trim())}/${encodeURIComponent(title.trim())}`;
          const response = await fetch(url);
          if (response.status === 404) return '';
          if (!response.ok) throw new Error(`Lyrics.ovh request failed (${response.status}).`);
          const result = await response.json();
          return result.lyrics || '';
        },
      },
    ];
    const providerErrors = [];
    try {
      for (const provider of providers) {
        try {
          const fetchedLyrics = await provider.fetch();
          if (fetchedLyrics.trim()) {
            setLyrics(fetchedLyrics.replace(/\r\n/g, '\n'));
            setFetchMessage(`Lyrics fetched from ${provider.name}. Review them before saving.`);
            return;
          }
        } catch (requestError) {
          providerErrors.push(requestError);
        }
      }
      setFetchMessage(providerErrors.length
        ? 'Lyrics sources could not be reached. Try again later or enter the lyrics manually.'
        : 'No lyrics were returned by the connected providers. You can enter the lyrics manually below.');
    } finally {
      setFetching(false);
    }
  }

  function insertSection(section) {
    setLyrics((value) => `${value}\n\n{${section}}\n`);
  }

  async function saveSong() {
    if (!title.trim()) {
      window.alert('Song title is required.');
      return;
    }
    setSaving(true);
    try {
      await adminRequest('/api/admin/songs', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim(),
          defaultKey: '',
          bpm: bpm ? Number(bpm) : 0,
          timeSignature: timeSignature,
          content: lyrics,
        }),
      });
      setTitle('');
      setArtist('');
      setBpm('');
      setTimeSignature('4/4');
      setLyrics('');
      window.location.assign('/admin/songs');
    } catch (error) {
      window.alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="song-page">
      <div className="song-banner">
        <div><h1>Add New Song</h1><p>Enter the song details and save it to the library.</p></div>
      </div>

      <div className="song-workspace">
        <section className="fetch-panel">
          <div className="section-title"><h2>ϟ &nbsp; Fetch Lyrics</h2></div>
          <div className="fetch-fields">
            <label>SONG TITLE<input onChange={(event) => setTitle(event.target.value)} placeholder="Song title" value={title} /></label>
            <label>ARTIST / BAND NAME<input onChange={(event) => setArtist(event.target.value)} placeholder="Artist or band" value={artist} /></label>
            <button className="amber-button" disabled={fetching} onClick={fetchLyrics} type="button">{fetching ? 'Fetching...' : 'ϟ  Fetch Plain Lyrics'}</button>
          </div>
          {fetchMessage && <p className="fetch-message" role="status">{fetchMessage}</p>}
        </section>

        <section className="metadata-section">
          <div className="section-title section-title--plain"><h2>⌁ &nbsp; Song Details</h2></div>
          <div className="metadata-grid">
            <label className="field-card">TEMPO (BPM, OPTIONAL)<input max="260" min="30" onChange={(event) => setBpm(event.target.value)} type="number" value={bpm} /></label>
            <div className="field-card"><span>TIME SIGNATURE</span><div className="time-pills">{['4/4', '3/4', '6/8', '12/8'].map((item) => <button className={timeSignature === item ? 'selected' : ''} key={item} onClick={() => setTimeSignature(item)} type="button">{item}</button>)}</div></div>
          </div>
        </section>

        <section className="lyrics-section">
          <div className="lyrics-heading"><div><h2>Raw Song Lyrics (Plain Text)</h2><p>Double line breaks create stanzas. Chord symbols will be attached in the next step.</p></div><div className="section-buttons"><button onClick={() => insertSection('Verse')} type="button">+ {'{Verse}'}</button><button onClick={() => insertSection('Chorus')} type="button">+ {'{Chorus}'}</button><button onClick={() => insertSection('Bridge')} type="button">+ {'{Bridge}'}</button></div></div>
          <textarea onChange={(event) => setLyrics(event.target.value)} value={lyrics} />
          <div className="lyrics-meta"><span>{lyrics.trim().split(/\s+/).filter(Boolean).length} words</span></div>
        </section>

      </div>
      <div className="song-actions"><button className="amber-button" disabled={saving} onClick={saveSong} type="button">{saving ? 'Saving...' : 'Save Song'}</button></div>
    </div>
  );
}

function SongLibraryPage({ onAddSong }) {
  const [query, setQuery] = useState('');
  const [tempo, setTempo] = useState('any');
  const [songs, setSongs] = useState([]);
  useEffect(() => {
    adminRequest('/api/admin/songs')
      .then((items) => setSongs(items.map((song) => ({
        id: song.id,
        title: song.title || '',
        subtitle: '',
        artist: song.artist || '',
        key: song.defaultKey || '',
        bpm: Number(song.bpm) || 0,
        meter: song.timeSignature || '',
        status: '',
        synced: '',
        by: '',
      }))))
      .catch((error) => console.error(error.message));
  }, []);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredSongs = songs.filter((song) => {
    const matchesQuery = normalizedQuery === '' ||
      `${song.title || ''} ${song.artist || ''}`.toLocaleLowerCase().includes(normalizedQuery);
    const matchesTempo = tempo === 'any' ||
      (tempo === 'slow' && song.bpm > 0 && song.bpm < 80) ||
      (tempo === 'mid' && song.bpm >= 80 && song.bpm <= 120) ||
      (tempo === 'upbeat' && song.bpm > 120);
    return matchesQuery && matchesTempo;
  });

  function resetFilters() {
    setQuery('');
    setTempo('any');
  }

  return (
    <div className="library-page">
      <div className="library-heading">
        <div><h1>Band Song Library</h1><p>{songs.length} songs in the library</p></div>
        <div className="library-actions"><button className="amber-button" onClick={onAddSong} type="button">+ &nbsp; Add New Song</button></div>
      </div>
      <div className="library-filter-panel">
        <div className="library-search-row"><input aria-label="Search song library" onChange={(event) => setQuery(event.target.value)} placeholder="⌕  Search songs by title or artist..." value={query} /><div className="filter-controls"><select aria-label="Filter by tempo" onChange={(event) => setTempo(event.target.value)} value={tempo}><option value="any">Tempo: Any Tempo</option><option value="slow">Slow (&lt;80 BPM)</option><option value="mid">Mid (80-120 BPM)</option><option value="upbeat">Upbeat (120+ BPM)</option></select><button aria-label="Reset filters" onClick={resetFilters} type="button">⟲</button></div></div>
      </div>
      <div className="library-table-wrap">
        <table className="library-table"><thead><tr><th>#</th><th>Song Title</th><th>Artist</th><th>Key</th><th>Tempo &amp; Meter</th><th>Deck Actions</th></tr></thead><tbody>
          {filteredSongs.map((song, index) => <tr key={song.id || song.title}><td className="row-number">{String(index + 1).padStart(2, '0')}</td><td><div className="song-name"><i /><span><strong>{song.title}</strong></span></div></td><td>{song.artist}</td><td><b className="key-badge">{song.key || '—'}</b></td><td><span className="tempo-value">{song.bpm ? `${song.bpm} BPM` : '—'}</span>{song.meter ? <><em> • </em>{song.meter}</> : null}</td><td><div className="row-actions"><button className="deck-action" onClick={() => window.location.assign(`/admin/songs/${song.id}/edit/chords`)} type="button">Edit Chords</button><button className="deck-action" onClick={() => window.location.assign(`/admin/songs/${song.id}/edit/lyrics`)} type="button">Edit Lyrics</button><button className="deck-action deck-action--delete" title="Delete song" onClick={async () => {
            if (!window.confirm(`Delete ${song.title}?`)) return;
            try {
              await adminRequest(`/api/admin/songs/${song.id}`, { method: 'DELETE' });
              setSongs((value) => value.filter((item) => item.id !== song.id));
            } catch (error) { window.alert(error.message); }
          }} type="button">Delete Song</button></div></td></tr>)}
        </tbody></table>
        {filteredSongs.length === 0 && <div className="library-empty">{songs.length === 0 ? 'No songs in the library yet.' : 'No songs match the selected filters.'}</div>}
      </div>
    </div>
  );
}

function parseChordEditorContent(content) {
  const attached = {};
  const parsedLines = content.split(/\r?\n/).map((line, lineIndex) => {
    if (!line.trim()) return { type: 'blank', section: '', words: [] };
    if (/^\s*\{[^{}]+\}\s*$/.test(line)) {
      return { type: 'section', section: line.trim(), words: [] };
    }

    let plainText = '';
    let cursor = 0;
    const chordMarkers = [];
    const chordPattern = /\[([^\]]+)\]/g;
    let match;
    while ((match = chordPattern.exec(line)) !== null) {
      plainText += line.slice(cursor, match.index);
      chordMarkers.push({ chord: match[1], position: plainText.length });
      cursor = chordPattern.lastIndex;
    }
    plainText += line.slice(cursor);

    const wordMatches = [...plainText.matchAll(/\S+/g)];
    if (wordMatches.length === 0 && chordMarkers.length > 0) {
      return { type: 'chords', section: '', words: [], chords: chordMarkers.map(({ chord }) => chord) };
    }

    const chordGroups = chordMarkers.reduce((groups, marker) => {
      const previousGroup = groups[groups.length - 1];
      if (previousGroup?.position === marker.position) previousGroup.chords.push(marker.chord);
      else groups.push({ position: marker.position, chords: [marker.chord] });
      return groups;
    }, []);
    const chordBoxes = [];
    chordGroups.forEach(({ position, chords }) => {
      const containingWordIndex = wordMatches.findIndex((word) => (
        position >= word.index && position < word.index + word[0].length
      ));
      const nextWordIndex = wordMatches.findIndex((word) => word.index >= position);
      const wordIndex = containingWordIndex >= 0 ? containingWordIndex : nextWordIndex;
      const isBox = containingWordIndex < 0 && (
        wordIndex < 0 || plainText.slice(position, wordMatches[wordIndex].index).length > 0
      );
      if (isBox) {
        chords.forEach((chord) => {
          chordBoxes.push({ position: wordIndex < 0 ? wordMatches.length : wordIndex, chords: [chord] });
        });
      } else if (wordIndex >= 0) {
        attached[`${lineIndex}:${wordIndex}`] = chords[chords.length - 1];
      }
    });

    return { type: 'lyrics', section: '', words: wordMatches.map((word) => word[0]), chordBoxes };
  });

  parsedLines.forEach((line, lineIndex) => {
    if (line.type !== 'chords') return;
    let targetLineIndex = -1;
    for (let index = lineIndex - 1; index >= 0; index -= 1) {
      if (parsedLines[index].type === 'section') break;
      if (parsedLines[index].type === 'lyrics') {
        targetLineIndex = index;
        break;
      }
    }
    if (targetLineIndex < 0) {
      for (let index = lineIndex + 1; index < parsedLines.length; index += 1) {
        if (parsedLines[index].type === 'section') break;
        if (parsedLines[index].type === 'lyrics') {
          targetLineIndex = index;
          break;
        }
      }
    }
    if (targetLineIndex < 0) return;
    const targetLine = parsedLines[targetLineIndex];
    const position = targetLineIndex < lineIndex ? targetLine.words.length : 0;
    targetLine.chordBoxes.push(...line.chords.map((chord) => ({ position, chords: [chord] })));
    line.type = 'migrated-chords';
  });

  const lineIndexMap = new Map();
  const lines = parsedLines.filter((line, originalIndex) => {
    if (line.type === 'migrated-chords') return false;
    lineIndexMap.set(originalIndex, lineIndexMap.size);
    return true;
  });
  const remappedAttached = Object.entries(attached).reduce((next, [tokenId, chord]) => {
    const [originalLineIndex, wordIndex] = tokenId.split(':').map(Number);
    const lineIndex = lineIndexMap.get(originalLineIndex);
    if (lineIndex !== undefined) next[`${lineIndex}:${wordIndex}`] = chord;
    return next;
  }, {});
  return { lines, attached: remappedAttached };
}

function ChordBuilderPage({ editSongId = '' }) {
  const [activeChord, setActiveChord] = useState('');
  const [customChord, setCustomChord] = useState('');
  const [customChords, setCustomChords] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0);
  const [saved, setSaved] = useState(false);
  const [attached, setAttached] = useState({});
  const [songs, setSongs] = useState([]);
  const [songQuery, setSongQuery] = useState('');
  const [selectedSong, setSelectedSong] = useState(null);
  const [draft, setDraft] = useState(null);
  const [scales, setScales] = useState([]);
  const [selectedScale, setSelectedScale] = useState('');
  const [editorLines, setEditorLines] = useState([]);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [draggingChordBox, setDraggingChordBox] = useState(false);
  const [activeDropTarget, setActiveDropTarget] = useState(null);

  const scaleOptionValue = (entry) => `${entry.scale}::${entry.type}`;

  function selectSong(song, availableScales = scales) {
    setSelectedSong(song);
    setDraft({ ...song });
    const root = /^([A-G](?:#|b)?)/i.exec(song.defaultKey || '')?.[1];
    const minor = /m(?!aj)|minor/i.test((song.defaultKey || '').slice(root?.length || 0));
    const matchingScale = availableScales.find((entry) => (
      entry.scale === root && entry.type.toLowerCase() === (minor ? 'minor' : 'major')
    ));
    setSelectedScale(matchingScale ? scaleOptionValue(matchingScale) : '');
    setOffset(0);
    const parsedContent = parseChordEditorContent(song.content || '');
    setEditorLines(parsedContent.lines);
    setAttached(parsedContent.attached);
    setActiveLineIndex(-1);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([adminRequest('/api/admin/songs'), adminRequest('/api/admin/scales')])
      .then(([loadedSongs, loadedScales]) => {
        if (cancelled) return;
        setSongs(loadedSongs);
        setScales(loadedScales);
        if (editSongId) {
          const song = loadedSongs.find((item) => item.id === editSongId);
          if (!song) {
            window.alert('The selected song could not be found.');
            return;
          }
          selectSong(song, loadedScales);
        }
      })
      .catch((error) => {
        if (!cancelled) window.alert(error.message);
      });
    return () => { cancelled = true; };
  }, [editSongId]);

  const filteredSongs = songs.filter((song) =>
    `${song.title || ''} ${song.artist || ''}`.toLowerCase().includes(songQuery.toLowerCase())
  );
  const scaleEntry = scales.find((entry) => scaleOptionValue(entry) === selectedScale);
  const scalePalette = scaleEntry
    ? [...new Map([
        ...scaleEntry.chords.map((chord) => [chord.triad, chord.triad]),
        ...scaleEntry.chords.map((chord) => [chord.seventh, chord.seventh]),
      ]).values()]
    : [];
  const palette = [...scalePalette, ...customChords];
  const lines = editorLines;

  function insertChordBoxAt(lineIndex, wordIndex) {
    setEditorLines((current) => current.map((line, index) => {
      if (index !== lineIndex || line.type !== 'lyrics') return line;
      const chordBoxes = [...(line.chordBoxes || []), { position: wordIndex, chords: [''] }]
        .sort((left, right) => left.position - right.position);
      return { ...line, chordBoxes };
    }));
    setActiveLineIndex(lineIndex);
  }

  function addChordBoxLine() {
    const activeLine = editorLines[activeLineIndex];
    const lineIndex = activeLine?.type === 'lyrics'
      ? activeLineIndex
      : editorLines.reduce((lastIndex, line, index) => line.type === 'lyrics' ? index : lastIndex, -1);
    if (lineIndex >= 0) {
      insertChordBoxAt(lineIndex, editorLines[lineIndex].words.length);
    } else {
      setEditorLines((current) => [...current, { type: 'chords', section: '', words: [], chords: [''] }]);
    }
  }

  function getChordBoxDropTarget(event) {
    const lyricLines = Array.from(event.currentTarget.querySelectorAll('[data-editor-type="lyrics"]'));
    if (lyricLines.length === 0) return null;
    const targetLine = lyricLines.reduce((nearest, line) => {
      const bounds = line.getBoundingClientRect();
      const distance = event.clientY < bounds.top
        ? bounds.top - event.clientY
        : event.clientY > bounds.bottom ? event.clientY - bounds.bottom : 0;
      return !nearest || distance < nearest.distance ? { line, distance } : nearest;
    }, null)?.line;
    if (!targetLine) return null;

    const words = Array.from(targetLine.querySelectorAll('[data-editor-word-index]'))
      .map((word) => {
        const bounds = word.getBoundingClientRect();
        return {
          index: Number(word.dataset.editorWordIndex),
          bounds,
          verticalDistance: event.clientY < bounds.top
            ? bounds.top - event.clientY
            : event.clientY > bounds.bottom ? event.clientY - bounds.bottom : 0,
        };
      });
    if (words.length === 0) return { lineIndex: Number(targetLine.dataset.editorLine), wordIndex: 0 };

    const nearestWord = words.reduce((nearest, word) => (
      word.verticalDistance < nearest.verticalDistance ? word : nearest
    ));
    const rowWords = words
      .filter((word) => Math.abs(word.bounds.bottom - nearestWord.bounds.bottom) <= 2)
      .sort((left, right) => left.bounds.left - right.bounds.left);
    const centers = rowWords.map((word) => (word.bounds.left + word.bounds.right) / 2);
    let wordIndex = rowWords[0].index;
    if (event.clientX >= centers[0]) {
      wordIndex = rowWords[rowWords.length - 1].index + 1;
      for (let index = 0; index < rowWords.length - 1; index += 1) {
        if (event.clientX < (centers[index] + centers[index + 1]) / 2) {
          wordIndex = rowWords[index].index + 1;
          break;
        }
      }
    }
    return { lineIndex: Number(targetLine.dataset.editorLine), wordIndex };
  }

  function appendChordOnlyLine() {
    setEditorLines((current) => [...current, { type: 'chords', section: '', words: [], chords: [''] }]);
  }

  function handleChordBoxDragOver(event) {
    if (!draggingChordBox) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const target = getChordBoxDropTarget(event);
    setActiveDropTarget((current) => (
      current?.lineIndex === target?.lineIndex && current?.wordIndex === target?.wordIndex
        ? current
        : target
    ));
  }

  function handleChordBoxDrop(event) {
    if (!draggingChordBox || event.dataTransfer.getData('text/plain') !== 'setlist-chord-box') return;
    event.preventDefault();
    const target = getChordBoxDropTarget(event);
    if (target) insertChordBoxAt(target.lineIndex, target.wordIndex);
    else appendChordOnlyLine();
    setDraggingChordBox(false);
    setActiveDropTarget(null);
  }

  function updateChordBox(lineIndex, boxIndex) {
    if (!activeChord) return;
    setEditorLines((current) => current.map((line, index) => {
      if (index !== lineIndex) return line;
      const chordBoxes = line.chordBoxes.map((box, currentBoxIndex) => {
        if (currentBoxIndex !== boxIndex) return box;
        return { ...box, chords: [box.chords[0] === activeChord ? '' : activeChord] };
      });
      return { ...line, chordBoxes };
    }));
  }

  function updateLegacyChordBox(lineIndex, boxIndex) {
    if (!activeChord) return;
    setEditorLines((current) => current.map((line, index) => {
      if (index !== lineIndex) return line;
      const chords = [...line.chords];
      chords[boxIndex] = chords[boxIndex] === activeChord ? '' : activeChord;
      return { ...line, chords };
    }));
  }

  function removeLegacyChordBox(lineIndex, boxIndex) {
    if (editorLines[lineIndex]?.chords.length === 1) {
      removeChordBoxLine(lineIndex);
      return;
    }
    setEditorLines((current) => current.map((line, index) => (
      index === lineIndex
        ? { ...line, chords: line.chords.filter((_, currentIndex) => currentIndex !== boxIndex) }
        : line
    )));
  }

  function removeInlineChordBox(lineIndex, boxIndex) {
    setEditorLines((current) => current.map((line, index) => (
      index === lineIndex
        ? { ...line, chordBoxes: line.chordBoxes.filter((_, currentIndex) => currentIndex !== boxIndex) }
        : line
    )));
  }

  function removeChordBoxLine(lineIndex) {
    setEditorLines((current) => current.filter((_, index) => index !== lineIndex));
    setAttached((current) => Object.entries(current).reduce((next, [tokenId, chord]) => {
      const [currentLine, wordIndex] = tokenId.split(':').map(Number);
      if (currentLine < lineIndex) next[tokenId] = chord;
      else if (currentLine > lineIndex) next[`${currentLine - 1}:${wordIndex}`] = chord;
      return next;
    }, {}));
    setActiveLineIndex((current) => (
      current === lineIndex ? -1 : current > lineIndex ? current - 1 : current
    ));
  }

  function addChord(event) {
    event.preventDefault();
    const value = customChord.trim();
    if (!value) return;
    setCustomChords((current) => [...current, value]);
    setActiveChord(value);
    setCustomChord('');
  }

  function transposeEditor(semitones) {
    setOffset((current) => current + semitones);
    setAttached((current) => Object.fromEntries(
      Object.entries(current).map(([tokenId, chord]) => [tokenId, transposeChord(chord, semitones)])
    ));
    setCustomChords((current) => current.map((chord) => transposeChord(chord, semitones)));
    setActiveChord((current) => current ? transposeChord(current, semitones) : '');
    const currentKey = scaleEntry
      ? `${scaleEntry.scale}${scaleEntry.type.toLowerCase() === 'minor' ? 'm' : ''}`
      : draft?.defaultKey || 'C';
    const nextKey = transposeChord(currentKey, semitones);
    setDraft((current) => current ? { ...current, defaultKey: nextKey } : current);
    if (scaleEntry) {
      const nextRoot = /^([A-G](?:#|b)?)/.exec(nextKey)?.[1];
      const nextScale = scales.find((entry) => entry.scale === nextRoot && entry.type === scaleEntry.type);
      setSelectedScale(nextScale ? scaleOptionValue(nextScale) : '');
    }
  }

  async function saveSong() {
    if (!selectedSong || !draft) return;
    try {
      const chordContent = lines.map((line, lineIndex) => {
        if (line.type === 'blank') return '';
        if (line.type === 'section') return line.section;
        if (line.type === 'chords') return line.chords.filter(Boolean).map((chord) => `[${chord}]`).join('');
        return Array.from({ length: line.words.length + 1 }, (_, wordIndex) => {
          const chordBoxContent = (line.chordBoxes || [])
            .filter((box) => box.position === wordIndex)
            .flatMap((box) => box.chords)
            .filter(Boolean)
            .map((chord) => `[${chord}]`)
            .join('');
          const hasWord = wordIndex < line.words.length;
          const tokenId = `${lineIndex}:${wordIndex}`;
          return `${wordIndex > 0 && (chordBoxContent || hasWord) ? ' ' : ''}` +
            `${chordBoxContent}${chordBoxContent && hasWord ? ' ' : ''}` +
            `${hasWord ? `${attached[tokenId] ? `[${attached[tokenId]}]` : ''}${line.words[wordIndex]}` : ''}`;
        }).join('');
      }).join('\n');
      const currentRoot = /^([A-G](?:#|b)?)/.exec(draft.defaultKey || '')?.[1];
      const currentMinor = /m(?!aj)|minor/i.test((draft.defaultKey || '').slice(currentRoot?.length || 0));
      const sameScale = scaleEntry
        && scaleEntry.scale === currentRoot
        && (scaleEntry.type.toLowerCase() === 'minor') === currentMinor;
      const selectedKey = scaleEntry && !sameScale
        ? `${scaleEntry.scale}${scaleEntry.type.toLowerCase() === 'minor' ? 'm' : ''}`
        : draft.defaultKey;
      await adminRequest(`/api/admin/songs/${selectedSong.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: draft.title,
          artist: draft.artist,
          defaultKey: selectedKey,
          bpm: draft.bpm,
          timeSignature: draft.timeSignature,
          content: chordContent,
        }),
      });
      setSaved(true);
      if (editSongId) {
        window.setTimeout(() => setSaved(false), 1800);
      } else {
        sessionStorage.removeItem('band_song_draft');
        window.setTimeout(() => window.location.assign('/admin/songs'), 500);
      }
    } catch (error) {
      window.alert(error.message);
    }
  }

  return (
    !draft ? (
      <div className="chord-picker-page">
        <div className="chord-picker-heading">
          <div>
            <h1>Chord Builder</h1>
            <p>Select a saved song to open the chord editor.</p>
          </div>
        </div>
        <div className="chord-picker-search">
          <input
            aria-label="Search songs"
            onChange={(event) => setSongQuery(event.target.value)}
            placeholder="Search by title or artist"
            value={songQuery}
          />
        </div>
        <div className="chord-picker-list">
          {filteredSongs.length === 0 ? (
            <p className="library-empty">{songs.length === 0 ? 'No songs in the library.' : 'No matching songs.'}</p>
          ) : filteredSongs.map((song) => (
            <button className="chord-picker-song" key={song.id} onClick={() => selectSong(song)} type="button">
              <span>
                <strong>{song.title}</strong>
                <small>{song.artist || 'Unknown artist'}{song.defaultKey ? ` • ${song.defaultKey}` : ''}{song.bpm ? ` • ${song.bpm} BPM` : ''}</small>
              </span>
              <span>Open Editor →</span>
            </button>
          ))}
        </div>
      </div>
    ) : (
    <div className="chord-page">
      <section className="chord-toolbar">
        <div className="song-context"><span className="live-dot" /><strong>{draft.title || 'Untitled song'}</strong>{scaleEntry ? <span>SCALE <b>{scaleEntry.scale} — {scaleEntry.type}</b></span> : draft.defaultKey ? <span>KEY <b>{draft.defaultKey}</b></span> : null}{draft.bpm && <span>TEMPO <b>{draft.bpm} BPM</b></span>}{draft.timeSignature && <span>METER <b>{draft.timeSignature}</b></span>}</div>
        <div className="mode-pill">⌖ &nbsp; Click a lyric word or chord box to attach <b>{activeChord || 'a selected chord'}</b></div>
        <div className="chord-controls">
          <label className="scale-select-label">
            SCALE
            <select value={selectedScale} onChange={(event) => {
              setSelectedScale(event.target.value);
              setActiveChord('');
            }}>
              <option value="">Select a scale</option>
              {scales.map((entry) => (
                <option key={scaleOptionValue(entry)} value={scaleOptionValue(entry)}>
                  {entry.scale} — {entry.type}
                </option>
              ))}
            </select>
          </label>
          <div className="palette-label">CHORDS:</div>
          {palette.map((chord, index) => <button className={activeChord === chord ? 'chord-pill selected' : 'chord-pill'} key={`${chord}-${index}`} onClick={() => setActiveChord(chord)} type="button">{chord}</button>)}
          <form onSubmit={addChord}><input aria-label="Custom chord" onChange={(event) => setCustomChord(event.target.value)} placeholder="Extra chord" value={customChord} /><button type="submit">+ Add</button></form>
          <select defaultValue="" onChange={(event) => event.target.value && setCustomChord(event.target.value)}><option value="" disabled>+ Insert Section Tag</option><option>{'{Intro}'}</option><option>{'{Verse}'}</option><option>{'{Chorus}'}</option><option>{'{Bridge}'}</option></select>
        </div>
      </section>

      <div className="chord-split">
        <section className="chord-panel lyric-canvas">
          <div className="chord-panel-heading">
            <h2>✎ &nbsp; Interactive Lyric Canvas <small>EDITOR MODE</small></h2>
            <div className="chord-canvas-actions">
              <button
                className="add-chord-box"
                draggable="true"
                onClick={addChordBoxLine}
                onDragEnd={() => {
                  setDraggingChordBox(false);
                  setActiveDropTarget(null);
                }}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', 'setlist-chord-box');
                  event.dataTransfer.effectAllowed = 'copy';
                  setDraggingChordBox(true);
                }}
                title="Click to add at the end of the selected lyric line, or drag to choose a position"
                type="button"
              >
                Add Chord Box
              </button>
              <button className="clear-chords" onClick={() => {
                setAttached({});
                setEditorLines((current) => current.map((line) => (
                  line.type === 'chords'
                    ? { ...line, chords: line.chords.map(() => '') }
                    : line.type === 'lyrics'
                      ? { ...line, chordBoxes: (line.chordBoxes || []).map((box) => ({ ...box, chords: box.chords.map(() => '') })) }
                      : line
                )));
              }} type="button">Clear All Chords</button>
            </div>
          </div>
          <div
            className={`token-canvas ${draggingChordBox ? 'token-canvas--dragging' : ''}`}
            onDragOver={handleChordBoxDragOver}
            onDrop={handleChordBoxDrop}
          >
              {lines.length === 0 && <p className="helper-text">Add lyrics or drag a chord box here.</p>}
              {lines.map((line, lineIndex) => {
                if (line.type === 'section') return <div className="token-section" data-editor-line={lineIndex} key={lineIndex}>{line.section}</div>;
                if (line.type === 'blank') return <div aria-hidden="true" className="token-line token-line--blank" data-editor-line={lineIndex} key={lineIndex} />;
                if (line.type === 'chords') return (
                  <div className="chord-box-line" data-editor-line={lineIndex} key={lineIndex}>
                    <div className="chord-boxes">
                      {line.chords.map((chord, boxIndex) => (
                        <span className="inline-chord-box" key={boxIndex}>
                          <button
                            aria-label={`Chord box ${boxIndex + 1}${chord ? `: ${chord}` : ''}`}
                            className={chord ? 'chord-only-box chord-only-box--filled' : 'chord-only-box'}
                            onClick={() => updateLegacyChordBox(lineIndex, boxIndex)}
                            title={activeChord ? `Add ${activeChord}` : 'Select a chord first'}
                            type="button"
                          >
                            {chord || 'Chord'}
                          </button>
                          <button aria-label={`Remove chord box ${boxIndex + 1}`} className="chord-box-remove" onClick={() => removeLegacyChordBox(lineIndex, boxIndex)} type="button">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
                const inlineItems = [];
                for (let wordIndex = 0; wordIndex <= line.words.length; wordIndex += 1) {
                  if (activeDropTarget?.lineIndex === lineIndex && activeDropTarget.wordIndex === wordIndex) {
                    inlineItems.push(<span aria-hidden="true" className="inline-chord-drop-indicator" key={`drop-${wordIndex}`} />);
                  }
                  (line.chordBoxes || []).forEach((box, boxIndex) => {
                    if (box.position !== wordIndex) return;
                    inlineItems.push(
                      <span className="inline-chord-box" key={`box-${boxIndex}`}>
                        <button
                          aria-label={`Inline chord box ${boxIndex + 1}${box.chords[0] ? `: ${box.chords[0]}` : ''}`}
                          className={box.chords[0] ? 'chord-only-box chord-only-box--filled' : 'chord-only-box'}
                          onClick={() => updateChordBox(lineIndex, boxIndex)}
                          title={activeChord ? `Add ${activeChord}` : 'Select a chord first'}
                          type="button"
                        >
                          {box.chords[0] || 'Chord'}
                        </button>
                        <button aria-label="Remove inline chord box" className="chord-box-remove" onClick={() => removeInlineChordBox(lineIndex, boxIndex)} type="button">×</button>
                      </span>
                    );
                  });
                  if (wordIndex < line.words.length) {
                    const word = line.words[wordIndex];
                    const tokenId = `${lineIndex}:${wordIndex}`;
                    inlineItems.push(
                      <button
                        className={`word-token ${attached[tokenId] ? 'has-chord' : ''}`}
                        data-editor-word-index={wordIndex}
                        key={tokenId}
                        onClick={() => {
                          setActiveLineIndex(lineIndex);
                          if (activeChord) setAttached((current) => {
                            const next = { ...current };
                            if (next[tokenId] === activeChord) delete next[tokenId];
                            else next[tokenId] = activeChord;
                            return next;
                          });
                        }}
                        type="button"
                      >
                        <span className="attached-chord">{attached[tokenId] || ''}</span><span>{word}</span>
                      </button>
                    );
                  }
                }
                return (
                  <div className="token-line" data-editor-line={lineIndex} data-editor-type="lyrics" key={lineIndex}>
                    {inlineItems}
                  </div>
                );
              })}
          </div>
        </section>
      </div>
      <footer className="chord-actions"><div>☁ &nbsp; Autosaved <span>Transpose: <button onClick={() => transposeEditor(-1)} type="button">-1</button><b>{offset > 0 ? '+' : ''}{offset} ({scaleEntry?.scale || draft.defaultKey || '—'})</b><button onClick={() => transposeEditor(1)} type="button">+1</button></span></div><div><button type="button">▣ &nbsp; Preview on Stage iPads</button><button className={saved ? 'saved' : ''} onClick={saveSong} type="button">{saved ? '✓ Saved' : '✓ Save Song & Chords to Library'}</button></div></footer>
    </div>
    )
  );
}

function EditSongPage() {
  const [offset, setOffset] = useState(0);
  const location = useLocation();
  const [mode, setMode] = useState(location.pathname.endsWith('/lyrics') ? 'lyrics' : 'point');
  const [saved, setSaved] = useState(false);
  const [fontSize, setFontSize] = useState(1);
  const [activeChord, setActiveChord] = useState('');
  const songId = location.pathname.split('/')[3];
  const [song, setSong] = useState(null);
  const [chordPro, setChordPro] = useState('');
  useEffect(() => {
    if (!songId) return;
    adminRequest(`/api/admin/songs/${songId}`)
      .then((loaded) => {
        setSong(loaded);
        setChordPro(loaded.content || '');
        setActiveChord(loaded.defaultKey || 'C');
      })
      .catch((error) => window.alert(error.message));
  }, [songId]);
  const chords = song?.defaultKey ? getDiatonicChords(song.defaultKey) : [];
  const sections = chordPro
    ? [{ title: 'SONG', note: '', lines: chordPro.split('\n').filter(Boolean).map((line) => ['', '', line]) }]
    : [];
  async function save() {
    if (!songId || !song) return;
    try {
      await adminRequest(`/api/admin/songs/${songId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...song, content: chordPro, defaultKey: song.defaultKey }),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      window.alert(error.message);
    }
  }

  return (
    <div className="edit-song-page">
      <header className="edit-command-bar">
        <div className="edit-song-identity"><button type="button" onClick={() => window.location.assign('/admin/songs')}>←</button><div><h1>{song?.title || 'Loading song...'}</h1><p>{song?.artist || ''}{song?.defaultKey && <> &nbsp;•&nbsp; <b>Key: {song.defaultKey}</b></>}{song?.bpm ? <> &nbsp;•&nbsp; {song.bpm} BPM</> : ''}{song?.timeSignature ? <> &nbsp;•&nbsp; {song.timeSignature}</> : ''}</p></div></div>
        <div className="edit-header-actions"><div className="transpose"><button onClick={() => {
          setOffset((value) => value - 1);
          setChordPro((value) => transposeContent(value, -1));
          setSong((value) => value ? { ...value, defaultKey: transposeChord(value.defaultKey || 'C', -1) } : value);
        }} type="button">-1</button><span>KEY <b>{song?.defaultKey || 'Bm'} ({offset})</b></span><button onClick={() => {
          setOffset((value) => value + 1);
          setChordPro((value) => transposeContent(value, 1));
          setSong((value) => value ? { ...value, defaultKey: transposeChord(value.defaultKey || 'C', 1) } : value);
        }} type="button">+1</button></div><span className="capo-pill">♩ Capo: <b>Open</b></span><div className="mode-switch"><button className={mode === 'lyrics' ? 'selected' : ''} onClick={() => setMode('lyrics')} type="button">Edit Lyrics</button><button className={mode === 'point' ? 'selected' : ''} onClick={() => setMode('point')} type="button">⌖ Chords</button><button className={mode === 'chordpro' ? 'selected' : ''} onClick={() => setMode('chordpro')} type="button">⌘ ChordPro</button></div><button className="delete-song" type="button">Delete Song</button><button className="save-song-button" onClick={save} type="button">☁ {saved ? 'Saved' : 'Save'}</button></div>
      </header>
      <div className="edit-grid">
        <main className="edit-main">
          <section className="edit-palette"><div><span>♬ &nbsp; BM DIATONIC PALETTE</span><small>i - VII + Secondary Dominants</small><em>Click chord to stamp syllable</em></div><div className="edit-chord-buttons">{chords.map((chord) => <button className={activeChord === chord ? 'selected' : ''} key={chord} onClick={() => setActiveChord(chord)} type="button">{chord}</button>)}<button type="button">+ Custom</button></div></section>
          <div className="marker-row"><span>INSERT MARKER:</span>{['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Guitar Solo', 'Outro'].map((marker) => <button key={marker} type="button">{`{${marker}}`}</button>)}</div>
          {mode === 'lyrics' ? <section className="chordpro-editor"><div>SONG LYRICS <span>Plain Text</span></div><textarea onChange={(event) => setChordPro(event.target.value)} value={chordPro.replace(/\[([^\]]+)\]/g, '')} spellCheck="false" /></section> : mode === 'chordpro' ? <section className="chordpro-editor"><div>CHORDPRO 6.0 STRICT SYNTAX</div><textarea onChange={(event) => setChordPro(event.target.value)} value={chordPro} spellCheck="false" /></section> : <section className="edit-canvas"><div className="edit-canvas-heading"><h2>✎ &nbsp; Interactive Chord Canvas <small>EDITOR MODE</small></h2><button type="button">Clear Chords</button></div>{sections.map((section) => <div className="song-section" key={section.title}><div className="song-section-heading"><b>[SECTION: {section.title}]</b><span>{section.note}</span><aside>⚙　▣　×</aside></div>{section.lines.map((line) => <div className="edit-line" key={line[2]}><div><button onClick={() => setActiveChord(line[0])} type="button">{line[0]}</button><button onClick={() => setActiveChord(line[1])} type="button">{line[1]}</button></div><p>{line[2]}</p></div>)}</div>)}<button className="add-section" type="button">⊕ &nbsp; Add Song Section (Bridge, Guitar Outro, Tag)</button></section>}
        </main>
        <aside className="edit-preview"><div className="tablet-frame"><div className="tablet-status"><span>● STAGE PREVIEW</span></div><div className="tablet-screen" style={{ fontSize: `${fontSize}em` }}><div className="tablet-heading"><div><h2>{song?.title || 'Untitled song'}</h2><span>{song?.artist || ''}</span></div><div><b>{song?.defaultKey || ''}</b>{song?.bpm ? <small>{song.bpm} BPM</small> : null}</div></div><div className="tablet-content">{chordPro ? <pre>{chordPro}</pre> : <p>No chord chart content.</p>}</div></div></div><div className="preview-tools"><button onClick={() => setFontSize((value) => Math.min(1.2, value + .1))} type="button">A+</button><button onClick={() => setFontSize((value) => Math.max(.85, value - .1))} type="button">A−</button></div></aside>
      </div>
      <footer className="edit-footer"><span>☁ Autosaved 12s ago</span><span>Chord engine ready • {activeChord} selected</span><div><button type="button">Preview on Stage iPads</button><button className="save-song-button" onClick={save} type="button">✓ {saved ? 'Synced' : 'Save Song & Chords to Library'}</button></div></footer>
    </div>
  );
}

function getChordLineSegments(line) {
  const segments = [];
  let pendingChords = [];
  parseChordProLine(line).forEach((token) => {
    if (token.chord) {
      pendingChords.push(token.chord);
    } else if (token.lyric) {
      segments.push({ chord: pendingChords.join(' '), lyric: token.lyric });
      pendingChords = [];
    }
  });
  if (pendingChords.length) segments.push({ chord: pendingChords.join(' '), lyric: '' });
  if (segments.length === 0) segments.push({ chord: '', lyric: '\u00a0' });
  return segments;
}

function StageSongLyrics({ content, viewMode }) {
  const lines = (content || '').replace(/\r\n/g, '\n').split('\n');
  return (
    <div className="stage-live-lyrics">
      {lines.map((line, lineIndex) => {
        const section = /^\{([^{}]+)\}$/.exec(line.trim());
        if (section) return <h3 key={lineIndex}>{section[1]}</h3>;
        if (!line.trim()) return <div aria-hidden="true" className="stage-live-line stage-live-line--blank" key={lineIndex} />;
        return (
          <div className="stage-live-line" key={lineIndex}>
            {getChordLineSegments(line).map((segment, segmentIndex) => (
              <span className="stage-live-token" key={segmentIndex}>
                <span className={`stage-live-chord ${viewMode === 'vocalist' ? 'stage-live-chord--hidden' : ''}`}>{segment.chord || '\u00a0'}</span>
                <span className="stage-live-text">{segment.lyric}</span>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ViewSongPage() {
  const [viewMode, setViewMode] = useState('both');
  const [fontScale, setFontScale] = useState(1);
  const [autoScroll, setAutoScroll] = useState(false);
  const [oled, setOled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [setlists, setSetlists] = useState([]);
  const [songs, setSongs] = useState([]);
  const [search, setSearch] = useState('');
  const [activeCategoryID, setActiveCategoryID] = useState('');
  const [activeEntryKey, setActiveEntryKey] = useState('');
  const [transposeByEntry, setTransposeByEntry] = useState({});
  const readerRef = useRef(null);
  const songNodes = useRef(new Map());
  const location = useLocation();
  const setlistID = location.pathname.split('/')[3] || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    Promise.all([adminRequest('/api/admin/setlists'), adminRequest('/api/admin/songs')])
      .then(([loadedSetlists, loadedSongs]) => {
        if (cancelled) return;
        setSetlists(loadedSetlists);
        setSongs(loadedSongs);
        if (setlistID && !loadedSetlists.some((setlist) => setlist.id === setlistID)) {
          setLoadError('The selected setlist could not be found.');
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [setlistID]);

  const selectedSetlist = setlists.find((setlist) => setlist.id === setlistID) || null;
  const songsById = new Map(songs.map((song) => [song.id, song]));
  const entries = (selectedSetlist?.categories || []).flatMap((category, categoryIndex) =>
    (category.songIds || []).map((songID, songIndex) => {
      const song = songsById.get(songID);
      return song ? {
        category,
        categoryIndex,
        key: `${categoryIndex}:${category.id}:${songID}:${songIndex}`,
        song,
        songIndex,
      } : null;
    }).filter(Boolean)
  );

  useEffect(() => {
    if (!selectedSetlist) return;
    const firstEntry = entries[0];
    setActiveEntryKey(firstEntry?.key || '');
    setActiveCategoryID(firstEntry?.category.id || selectedSetlist.categories?.[0]?.id || '');
    setTransposeByEntry({});
    setSearch('');
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, [selectedSetlist, setlistID]);

  useEffect(() => {
    if (!autoScroll) return undefined;
    const timer = window.setInterval(() => readerRef.current?.scrollBy({ top: 1, behavior: 'instant' }), 40);
    return () => window.clearInterval(timer);
  }, [autoScroll]);

  function jumpToEntry(entry) {
    if (!entry) return;
    setActiveEntryKey(entry.key);
    setActiveCategoryID(entry.category.id);
    setSearch('');
    songNodes.current.get(entry.key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleReaderScroll(event) {
    const threshold = event.currentTarget.getBoundingClientRect().top + 48;
    let visibleEntry = entries[0];
    entries.forEach((entry) => {
      const node = songNodes.current.get(entry.key);
      if (node && node.getBoundingClientRect().top <= threshold) visibleEntry = entry;
    });
    if (visibleEntry) {
      setActiveEntryKey(visibleEntry.key);
      setActiveCategoryID(visibleEntry.category.id);
    }
  }

  function navigateWorkspace(pageID) {
    const routes = {
      'setlist-builder': '/admin/setlists',
      'view-setlist': '/admin/setlists/view',
      library: '/admin/songs',
      'add-song': '/admin/songs/new',
      'chord-builder': '/admin/songs/new/chords',
      'edit-song': '/admin/songs',
    };
    window.location.assign(routes[pageID] || '/admin/songs');
  }

  const activeEntryIndex = entries.findIndex((entry) => entry.key === activeEntryKey);
  const activeEntry = entries[activeEntryIndex] || null;
  const searchResults = search.trim()
    ? entries.filter(({ category, song }) => `${song.title || ''} ${song.artist || ''} ${category.name || ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className={`stage-app-shell ${setlistID ? 'stage-app-shell--player' : ''}`}>
      {!setlistID && <Sidebar activePage="view-song" onNavigate={navigateWorkspace} onViewStage={() => window.location.assign('/admin/stage')} />}
      <main className={`view-stage ${oled ? 'view-stage--oled' : ''}`}>
        <header className="stage-toolbar">
          <div className="stage-toolbar__left">
            <button className="exit-stage" onClick={() => window.location.assign(setlistID ? '/admin/stage' : '/admin/setlists')} type="button">
              {setlistID ? '← All Setlists' : '← Setlist Builder'}
            </button>
            <h1>{selectedSetlist?.gigName || (setlistID ? 'Stage View' : 'Choose a Setlist')}</h1>
          </div>
          {selectedSetlist && (
            <div className="stage-controls">
              <div className="stage-song-search">
                <input aria-label="Search songs in this setlist" onChange={(event) => setSearch(event.target.value)} placeholder="Search songs" value={search} />
                {search.trim() && (
                  <div className="stage-search-results">
                    {searchResults.length ? searchResults.map((entry) => (
                      <button key={entry.key} onClick={() => jumpToEntry(entry)} type="button">
                        <strong>{entry.song.title}</strong><span>{entry.category.name}</span>
                      </button>
                    )) : <p>No matching songs.</p>}
                  </div>
                )}
              </div>
              <button className="stage-control" disabled={activeEntryIndex <= 0} onClick={() => jumpToEntry(entries[activeEntryIndex - 1])} type="button">← Previous</button>
              <button className="stage-control" disabled={activeEntryIndex < 0 || activeEntryIndex >= entries.length - 1} onClick={() => jumpToEntry(entries[activeEntryIndex + 1])} type="button">Next →</button>
              <div className="stage-mode">
                <button className={viewMode === 'both' ? 'selected' : ''} onClick={() => setViewMode('both')} type="button">CHORDS &amp; LYRICS</button>
                <button className={viewMode === 'vocalist' ? 'selected' : ''} onClick={() => setViewMode('vocalist')} type="button">VOCALIST</button>
              </div>
              <div className="font-control">
                <button onClick={() => setFontScale((value) => Math.max(.85, value - .1))} type="button">A-</button>
                <b>{Math.round(fontScale * 100)}%</b>
                <button onClick={() => setFontScale((value) => Math.min(1.5, value + .1))} type="button">A+</button>
              </div>
              <button className={autoScroll ? 'stage-control selected' : 'stage-control'} onClick={() => setAutoScroll((value) => !value)} type="button">{autoScroll ? 'Ⅱ Pause' : '▶ Auto Scroll'}</button>
              <button className="stage-control" onClick={() => setOled((value) => !value)} type="button">Low Glare</button>
            </div>
          )}
        </header>

        {!setlistID ? (
          <section className="stage-setlist-picker">
            {loading ? <p className="stage-empty-state">Loading setlists...</p> : loadError ? <p className="stage-empty-state" role="alert">{loadError}</p> : setlists.length === 0 ? (
              <p className="stage-empty-state">No saved setlists. Create one in Setlist Builder first.</p>
            ) : (
              <div className="stage-setlist-grid">
                {setlists.map((setlist) => (
                  <button className="stage-setlist-card" key={setlist.id} onClick={() => window.location.assign(`/admin/stage/${encodeURIComponent(setlist.id)}`)} type="button">
                    <strong>{setlist.gigName || 'Untitled setlist'}</strong>
                    <span>{(setlist.categories || []).length} categories · {(setlist.songIds || []).length} songs</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : loading ? (
          <p className="stage-empty-state">{'Loading setlist...'}</p>
        ) : loadError || !selectedSetlist ? (
          <p className="stage-empty-state" role="alert">{loadError || 'The selected setlist could not be found.'}</p>
        ) : (
          <div className="stage-player-layout">
            <aside className="stage-category-nav">
              <h2>Categories</h2>
              {(selectedSetlist.categories || []).map((category) => {
                const categorySongCount = entries.filter((entry) => entry.category.id === category.id).length;
                const firstEntry = entries.find((entry) => entry.category.id === category.id);
                return (
                  <button
                    aria-current={activeCategoryID === category.id ? 'true' : undefined}
                    className={activeCategoryID === category.id ? 'stage-category-link stage-category-link--active' : 'stage-category-link'}
                    key={category.id}
                    onClick={() => {
                      setActiveCategoryID(category.id);
                      if (firstEntry) jumpToEntry(firstEntry);
                    }}
                    type="button"
                  >
                    <span>{category.name}</span><small>{categorySongCount}</small>
                  </button>
                );
              })}
            </aside>
            <section aria-label="Setlist songs" className="stage-reader" onScroll={handleReaderScroll} ref={readerRef}>
              {entries.length === 0 ? <p className="stage-empty-state">This setlist has no songs.</p> : entries.map((entry, index) => {
                const transposeBy = transposeByEntry[entry.key] || 0;
                const displayedKey = entry.song.defaultKey ? transposeChord(entry.song.defaultKey, transposeBy) : '—';
                return (
                  <article
                    className={activeEntryKey === entry.key ? 'stage-song-card stage-song-card--active' : 'stage-song-card'}
                    data-stage-category={entry.category.id}
                    data-stage-entry={entry.key}
                    key={entry.key}
                    ref={(node) => {
                      if (node) songNodes.current.set(entry.key, node);
                      else songNodes.current.delete(entry.key);
                    }}
                  >
                    <header className="stage-song-heading">
                      <div>
                        <span className="stage-song-category">{entry.category.name} · {index + 1} / {entries.length}</span>
                        <h2>{entry.song.title}</h2>
                        <p>{entry.song.artist || '—'}</p>
                      </div>
                      <div className="stage-song-tools">
                        <span className="stage-song-scale">Scale <strong>{displayedKey}</strong></span>
                        <div className="stage-transpose-control">
                          <span>Transpose</span>
                          <button aria-label={`Transpose ${entry.song.title} down one semitone`} onClick={() => setTransposeByEntry((current) => ({ ...current, [entry.key]: transposeBy - 1 }))} type="button">−</button>
                          <output>{transposeBy > 0 ? `+${transposeBy}` : transposeBy}</output>
                          <button aria-label={`Transpose ${entry.song.title} up one semitone`} onClick={() => setTransposeByEntry((current) => ({ ...current, [entry.key]: transposeBy + 1 }))} type="button">+</button>
                        </div>
                      </div>
                    </header>
                    {entry.song.content?.trim() ? (
                      <div className="stage-song-lyrics" style={{ fontSize: `${fontScale}em` }}>
                        <StageSongLyrics content={transposeContent(entry.song.content, transposeBy)} viewMode={viewMode} />
                      </div>
                    ) : <p className="stage-song-no-lyrics">No lyrics or chords added.</p>}
                  </article>
                );
              })}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function PrintSongLyrics({ content }) {
  const lines = (content || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').split('\n');
  return (
    <div className="print-song-lyrics">
      {lines.map((line, lineIndex) => {
        const section = /^\{([^{}]+)\}$/.exec(line.trim());
        if (section) return <h4 key={lineIndex}>{section[1]}</h4>;
        if (!line.trim()) return <div aria-hidden="true" className="print-chord-line print-chord-line--blank" key={lineIndex} />;
        const segments = [];
        let pendingChords = [];
        parseChordProLine(line).forEach((token) => {
          if (token.chord) {
            pendingChords.push(token.chord);
          } else if (token.lyric) {
            segments.push({ chord: pendingChords.join(' '), lyric: token.lyric });
            pendingChords = [];
          }
        });
        if (pendingChords.length) segments.push({ chord: pendingChords.join(' '), lyric: '' });
        if (segments.length === 0) segments.push({ chord: '', lyric: '\u00a0' });
        return (
          <div className="print-chord-line" key={lineIndex}>
            {segments.map((segment, segmentIndex) => (
              <span className="print-chord-token" key={segmentIndex}>
                <span className="print-chord-label">{segment.chord || '\u00a0'}</span>
                <span className="print-lyric-text">{segment.lyric}</span>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ViewSetlistPage() {
  const location = useLocation();
  const [setlists, setSetlists] = useState([]);
  const [songs, setSongs] = useState([]);
  const [selectedID, setSelectedID] = useState('');
  const [search, setSearch] = useState('');
  const requestedSetlistID = new URLSearchParams(location.search).get('selected');

  useEffect(() => {
    Promise.all([adminRequest('/api/admin/setlists'), adminRequest('/api/admin/songs')])
      .then(([loadedSetlists, loadedSongs]) => {
        setSetlists(loadedSetlists);
        setSongs(loadedSongs);
        const selected = loadedSetlists.find((setlist) => setlist.id === requestedSetlistID) || loadedSetlists[0];
        setSelectedID(selected?.id || '');
      })
      .catch((error) => window.alert(error.message));
  }, [requestedSetlistID]);

  const normalizedSearch = search.trim().toLowerCase();
  const visibleSetlists = setlists.filter((setlist) =>
    !normalizedSearch || (setlist.gigName || '').toLowerCase().includes(normalizedSearch)
  );
  const selected = setlists.find((setlist) => setlist.id === selectedID) || null;
  const songsById = new Map(songs.map((song) => [song.id, song]));

  function exportSetlistPDF() {
    if (!selected) return;
    const previousTitle = document.title;
    document.title = `${selected.gigName || 'Setlist'} - Setlist`;
    window.addEventListener('afterprint', () => {
      document.title = previousTitle;
    }, { once: true });
    window.print();
  }

  function exportGigPack() {
    if (!selected) return;
    let pack;
    try {
      pack = createGigPack(selected, songs);
    } catch (error) {
      window.alert(error.message);
      return;
    }
    downloadGigPack(pack);
  }

  return (
    <div className="view-setlist-page">
      <header className="view-setlist-heading">
        <div>
          <h1>View Setlist</h1>
          <p>{setlists.length} saved setlist{setlists.length === 1 ? '' : 's'}</p>
        </div>
      </header>

      <div className="view-setlist-layout">
        <aside className="saved-setlists">
          <input
            aria-label="Search setlists"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search setlists"
            value={search}
          />
          {visibleSetlists.length === 0 ? (
            <p className="library-empty">No setlists found.</p>
          ) : visibleSetlists.map((setlist) => (
            <button
              className={selectedID === setlist.id ? 'saved-setlist saved-setlist--active' : 'saved-setlist'}
              key={setlist.id}
              onClick={() => setSelectedID(setlist.id)}
              type="button"
            >
              <strong>{setlist.gigName || 'Untitled setlist'}</strong>
              <span>{(setlist.categories || []).length} categories • {(setlist.songIds || []).length} songs</span>
            </button>
          ))}
        </aside>

        <main className="saved-setlist-detail">
          {!selected ? (
            <div className="category-empty">Select a setlist to view it.</div>
          ) : (
            <>
              <header className="saved-setlist-detail__heading">
                <h2>{selected.gigName || 'Untitled setlist'}</h2>
                <div className="saved-setlist-detail__actions">
                  <button className="view-setlist-export" onClick={exportSetlistPDF} type="button">Export PDF</button>
                  <button className="view-setlist-export" onClick={exportGigPack} type="button">Export Gig Pack (.json)</button>
                  <button
                    className="view-setlist-edit"
                    onClick={() => window.location.assign(`/admin/setlists?edit=${encodeURIComponent(selected.id)}`)}
                    type="button"
                  >
                    Edit Setlist
                  </button>
                </div>
              </header>
              {(selected.categories || []).length === 0 ? (
                <div className="category-empty">This setlist has no categories.</div>
              ) : (selected.categories || []).map((category) => (
                <section className="view-setlist-category" key={category.id}>
                  <h3>{category.name}</h3>
                  {(category.songIds || []).length === 0 ? (
                    <p className="view-setlist-empty">No songs in this category.</p>
                  ) : (
                    <div className="view-setlist-songs">
                      {(category.songIds || []).map((songID, index) => {
                        const song = songsById.get(songID);
                        if (!song) return null;
                        return (
                          <article className="view-setlist-print-song" key={`${category.id}-${songID}-${index}`}>
                            <div className="view-setlist-song">
                              <b>{String(index + 1).padStart(2, '0')}</b>
                              <strong>{song.title}</strong>
                              <span>{song.artist || '—'}</span>
                              <span>{song.defaultKey || '—'}</span>
                            </div>
                            <PrintSongLyrics content={song.content} />
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function SetlistBuilderPage() {
  const location = useLocation();
  const editSetlistID = new URLSearchParams(location.search).get('edit') || '';
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [pushed, setPushed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [librarySongs, setLibrarySongs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategoryID, setActiveCategoryID] = useState('');

  useEffect(() => {
    const setlistsRequest = editSetlistID ? adminRequest('/api/admin/setlists') : Promise.resolve([]);
    Promise.all([adminRequest('/api/admin/songs'), setlistsRequest])
      .then(([items, setlists]) => {
        const mapped = items.map((song) => ({
          id: song.id,
          title: song.title,
          artist: song.artist,
          key: song.defaultKey,
          bpm: song.bpm,
        }));
        setLibrarySongs(mapped);
        if (editSetlistID) {
          const setlistToEdit = setlists.find((setlist) => setlist.id === editSetlistID);
          if (!setlistToEdit) throw new Error('The selected setlist could not be found.');
          setTitle(setlistToEdit.gigName || '');
          const loadedCategories = (setlistToEdit.categories || []).map((category) => ({
            id: category.id,
            name: category.name,
            songIds: [...(category.songIds || [])],
          }));
          setCategories(loadedCategories);
          setActiveCategoryID(loadedCategories[0]?.id || '');
        }
      })
      .catch((error) => window.alert(error.message));
  }, [editSetlistID]);

  const available = librarySongs.filter((song) =>
    `${song.title || ''} ${song.artist || ''}`.toLowerCase().includes(search.toLowerCase())
  );
  const activeCategory = categories.find((category) => category.id === activeCategoryID);
  const totalSongs = categories.reduce((total, category) => total + category.songIds.length, 0);
  const songById = new Map(librarySongs.map((song) => [song.id, song]));

  function addCategory() {
    const name = window.prompt('Category name');
    if (!name?.trim()) return;
    const category = {
      id: `${Date.now()}`,
      name: name.trim(),
      songIds: [],
    };
    setCategories((current) => [...current, category]);
    setActiveCategoryID(category.id);
  }

  function removeCategory(categoryID) {
    setCategories((current) => current.filter((category) => category.id !== categoryID));
    if (activeCategoryID === categoryID) setActiveCategoryID('');
  }

  function addSongToCategory(song) {
    if (!activeCategoryID) {
      window.alert('Create or select a category first.');
      return;
    }
    setCategories((current) => current.map((category) => {
      if (category.id !== activeCategoryID) return category;
      if (category.songIds.includes(song.id)) return category;
      return { ...category, songIds: [...category.songIds, song.id] };
    }));
  }

  function removeSong(categoryID, songID) {
    setCategories((current) => current.map((category) =>
      category.id === categoryID
        ? { ...category, songIds: category.songIds.filter((id) => id !== songID) }
        : category
    ));
  }

  function moveCategory(categoryID, direction) {
    setCategories((current) => {
      const index = current.findIndex((category) => category.id === categoryID);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function moveSong(categoryID, songIndex, direction) {
    setCategories((current) => current.map((category) => {
      if (category.id !== categoryID) return category;
      const target = songIndex + direction;
      if (target < 0 || target >= category.songIds.length) return category;
      const songIds = [...category.songIds];
      [songIds[songIndex], songIds[target]] = [songIds[target], songIds[songIndex]];
      return { ...category, songIds };
    }));
  }

  async function pushStage() {
    if (!title.trim()) {
      window.alert('Setlist name is required.');
      return;
    }
    setSaving(true);
    try {
      const allSongIDs = categories.flatMap((category) => category.songIds);
      const saved = await adminRequest('/api/admin/setlists', {
        method: 'POST',
        body: JSON.stringify({
          id: editSetlistID || undefined,
          gigName: title.trim(),
          songIds: allSongIDs,
          categories,
          isActive: true,
        }),
      });
      if (editSetlistID) {
        window.location.assign(`/admin/setlists/view?selected=${encodeURIComponent(saved.id || editSetlistID)}`);
        return;
      }
      setPushed(true);
      setTitle('');
      setSearch('');
      setCategories([]);
      setActiveCategoryID('');
      window.setTimeout(() => setPushed(false), 2800);
    } catch (error) {
      window.alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  const saveLabel = saving ? 'Saving...' : pushed ? 'Saved' : editSetlistID ? 'Save Changes' : 'Save Setlist';

  return (
    <div className="setlist-page">
      <header className="setlist-header">
        <div className="setlist-title-block">
          <label>{editSetlistID ? 'Edit setlist name' : 'Setlist name'}</label>
          <input onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Friday Gig" value={title} />
        </div>
        <div className="setlist-header-actions">
          {editSetlistID && <button onClick={() => window.location.assign(`/admin/setlists/view?selected=${encodeURIComponent(editSetlistID)}`)} type="button">Cancel Edit</button>}
          <button className="amber-button" disabled={saving} onClick={pushStage} type="button">{saveLabel}</button>
        </div>
        <div className="setlist-metrics">
          <div><small>Categories</small><strong>{categories.length}</strong></div>
          <div><small>Total songs</small><strong>{totalSongs}</strong></div>
          <div><small>Library songs</small><strong>{librarySongs.length}</strong></div>
        </div>
      </header>

      <div className="setlist-columns">
        <section className="setlist-library">
          <div className="setlist-card-heading">
            <h2>Song Library</h2>
            <span>{librarySongs.length} songs</span>
          </div>
          <input className="library-search" onChange={(event) => setSearch(event.target.value)} placeholder="Search songs" value={search} />
          <div className="setlist-category-select">
            <label>Add selected song to</label>
            <select value={activeCategoryID} onChange={(event) => setActiveCategoryID(event.target.value)}>
              <option value="">Select category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <div className="library-list">
            {available.length === 0 ? <p className="library-empty">No songs available.</p> : available.map((song) => (
              <div className="library-song" key={song.id}>
                <div><strong>{song.title}</strong><small>{song.artist || '—'}{song.key ? ` • ${song.key}` : ''}{song.bpm ? ` • ${song.bpm} BPM` : ''}</small></div>
                <button onClick={() => addSongToCategory(song)} type="button">+ Add</button>
              </div>
            ))}
          </div>
        </section>

        <section className="setlist-categories">
          <div className="category-toolbar">
            <div><h2>Setlist Categories</h2><p>Organize the gig playlist into sections.</p></div>
            <button className="amber-button" onClick={addCategory} type="button">+ Add Category</button>
          </div>
          {categories.length === 0 ? (
            <div className="category-empty">Create a category, then add songs from the library.</div>
          ) : categories.map((category, categoryIndex) => (
            <article className={`setlist-category ${activeCategoryID === category.id ? 'setlist-category--active' : ''}`} key={category.id}>
              <header onClick={() => setActiveCategoryID(category.id)}>
                <div><strong>{category.name}</strong><span>{category.songIds.length} songs</span></div>
                <div className="category-actions">
                  <button title="Move category up" onClick={(event) => { event.stopPropagation(); moveCategory(category.id, -1); }} disabled={categoryIndex === 0} type="button">↑</button>
                  <button title="Move category down" onClick={(event) => { event.stopPropagation(); moveCategory(category.id, 1); }} disabled={categoryIndex === categories.length - 1} type="button">↓</button>
                  <button title="Delete category" onClick={(event) => { event.stopPropagation(); removeCategory(category.id); }} type="button">×</button>
                </div>
              </header>
              <div className="category-songs">
                {category.songIds.length === 0 ? (
                  <p>Select this category, then add songs from the library.</p>
                ) : category.songIds.map((songID, songIndex) => {
                  const song = songById.get(songID);
                  if (!song) return null;
                  return (
                    <div className="set-song" key={songID}>
                      <b className="song-index">{String(songIndex + 1).padStart(2, '0')}</b>
                      <div className="set-song-info"><strong>{song.title}</strong><span>{song.artist || '—'}{song.key ? ` • ${song.key}` : ''}{song.bpm ? ` • ${song.bpm} BPM` : ''}</span></div>
                      <div className="set-song-actions">
                        <button onClick={() => moveSong(category.id, songIndex, -1)} disabled={songIndex === 0} type="button">↑</button>
                        <button onClick={() => moveSong(category.id, songIndex, 1)} disabled={songIndex === category.songIds.length - 1} type="button">↓</button>
                        <button onClick={() => removeSong(category.id, songID)} type="button">Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      </div>
      <footer className="setlist-footer"><strong>{totalSongs} songs in setlist</strong><button className="amber-button" disabled={saving} onClick={pushStage} type="button">{saveLabel}</button></footer>
    </div>
  );
}

function Workspace({ onViewStage }) {
  const location = useLocation();
  const routePage = location.pathname === '/admin/songs/new/chords'
    ? 'chord-builder'
    : location.pathname.startsWith('/admin/songs/new')
      ? 'add-song'
    : /\/admin\/songs\/[^/]+\/edit\/(chords|lyrics)$/.test(location.pathname)
      ? 'edit-song'
    : location.pathname === '/admin/setlists/view'
      ? 'view-setlist'
    : location.pathname.startsWith('/admin/setlists')
      ? 'setlist-builder'
      : location.pathname.startsWith('/admin/songs')
        ? 'library'
        : 'setlist-builder';
  const [activePage, setActivePage] = useState(routePage);
  useEffect(() => setActivePage(routePage), [routePage]);
  const page = pages.find((item) => item.id === activePage)
    ?? (activePage === 'edit-song' ? { label: 'Edit Song / Chords', icon: '✎' } : pages[0]);

  function navigatePage(pageID) {
    const routes = {
      'setlist-builder': '/admin/setlists',
      'view-setlist': '/admin/setlists/view',
      library: '/admin/songs',
      'add-song': '/admin/songs/new',
      'chord-builder': '/admin/songs/new/chords',
      'edit-song': '/admin/songs',
    };
    window.location.assign(routes[pageID] || '/admin/songs');
  }

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={navigatePage} onViewStage={onViewStage} />
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{page.label}</strong></div><button aria-label="Band Admin account" className="profile-button" type="button"><span aria-hidden="true" className="avatar avatar--small">B</span><span className="hide-mobile">Band Admin</span><span aria-hidden="true">⌄</span></button></header>
        {activePage === 'library' ? <SongLibraryPage onAddSong={() => navigatePage('add-song')} /> : activePage === 'add-song' ? <AddSongPage /> : activePage === 'chord-builder' ? <ChordBuilderPage /> : activePage === 'edit-song' ? location.pathname.endsWith('/chords') ? <ChordBuilderPage editSongId={location.pathname.split('/')[3]} /> : <EditSongPage /> : activePage === 'setlist-builder' ? <SetlistBuilderPage /> : activePage === 'view-setlist' ? <ViewSetlistPage /> : <div className="content"><div className="page-heading"><h1>{page.label}</h1></div><section className="empty-state"><span className="empty-state__icon">{page.icon}</span><h2>{page.label}</h2><p>No content configured.</p></section></div>}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/stage" element={<StageView />} />
        <Route path="/admin/login" element={<LoginPage onUnlock={() => window.location.assign('/admin/songs')} />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/admin/stage" element={<ViewSongPage />} />
          <Route path="/admin/stage/:setlistId" element={<ViewSongPage />} />
          <Route path="/admin/*" element={<Workspace onViewStage={() => window.location.assign('/admin/stage')} />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
