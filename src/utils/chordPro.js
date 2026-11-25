const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function normalizeNote(note) {
  const match = /^([A-G])([#b]?)(.*)$/.exec(note);
  if (!match) return note;
  let root = match[1];
  if (match[2] === '#') root += '#';
  if (match[2] === 'b') {
    const flatIndex = chromatic.indexOf(root + 'b');
    const alternatives = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
    root = alternatives[root + 'b'] || root;
  }
  return root + match[3];
}

export function parseChordProLine(line) {
  const tokens = [];
  const pattern = /\[([^\]]+)\]/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    tokens.push({ chord: '', lyric: line.slice(cursor, match.index) });
    tokens.push({ chord: match[1], lyric: '' });
    cursor = match.index + match[0].length;
  }
  tokens.push({ chord: '', lyric: line.slice(cursor) });
  return tokens;
}

export function transposeChord(chord, semitones) {
  return chord.replace(/^([A-G])([#b]?)([^/]*)((?:\/([A-G][#b]?))?)$/,
    (_, rootLetter, accidental, suffix, slash, bass) => {
      const root = normalizeNote(rootLetter + accidental);
      const rootIndex = chromatic.indexOf(root);
      const shiftedRoot = rootIndex >= 0 ? chromatic[(rootIndex + semitones + 120) % 12] : root;
      if (!bass) return shiftedRoot + suffix;
      const normalizedBass = normalizeNote(bass);
      const bassIndex = chromatic.indexOf(normalizedBass);
      const shiftedBass = bassIndex >= 0 ? chromatic[(bassIndex + semitones + 120) % 12] : normalizedBass;
      return `${shiftedRoot}${suffix}/${shiftedBass}`;
    });
}

export function transposeContent(content, semitones) {
  return content.replace(/\[([^\]]+)\]/g, (_, chord) => `[${transposeChord(chord, semitones)}]`);
}

export function getDiatonicChords(key) {
  const minor = /m$/i.test(key);
  const root = normalizeNote(key.replace(/m$/i, ''));
  const majorKeys = {
    C: ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'],
    D: ['D', 'Em', 'F#m', 'G', 'A', 'Bm', 'C#dim'],
    E: ['E', 'F#m', 'G#m', 'A', 'B', 'C#m', 'D#dim'],
    F: ['F', 'Gm', 'Am', 'Bb', 'C', 'Dm', 'Edim'],
    G: ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim'],
    A: ['A', 'Bm', 'C#m', 'D', 'E', 'F#m', 'G#dim'],
    B: ['B', 'C#m', 'D#m', 'E', 'F#', 'G#m', 'A#dim'],
  };
  const minorKeys = {
    Am: ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G'],
    Em: ['Em', 'F#dim', 'G', 'Am', 'Bm', 'C', 'D'],
    Bm: ['Bm', 'C#dim', 'D', 'Em', 'F#m', 'G', 'A'],
    Dm: ['Dm', 'Edim', 'F', 'Gm', 'Am', 'Bb', 'C'],
  };
  if (minor) return minorKeys[key] || minorKeys[`${root}m`] || ['m', 'dim', '', 'm', 'm', '', ''];
  return majorKeys[root] || majorKeys[key] || [key, 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'];
}
