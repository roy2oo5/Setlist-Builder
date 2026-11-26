export function createGigPack(setlist, allSongs) {
  const songIDs = [...new Set((setlist.categories || []).flatMap((category) => category.songIds || []))];
  const songsByID = new Map(allSongs.map((song) => [song.id, song]));
  const missingCount = songIDs.filter((songID) => !songsByID.has(songID)).length;
  if (missingCount > 0) {
    throw new Error(`Cannot export this gig pack because ${missingCount} song${missingCount === 1 ? ' is' : 's are'} missing from the library.`);
  }
  return {
    version: 1,
    setlist: {
      ...setlist,
      categories: (setlist.categories || []).map((category) => ({
        ...category,
        songIds: [...(category.songIds || [])],
      })),
      songIds: songIDs,
    },
    songs: songIDs.map((songID) => songsByID.get(songID)),
  };
}

export function downloadGigPack(pack) {
  if (!pack) return;
  const file = new Blob([`${JSON.stringify(pack, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  const safeName = (pack.setlist?.gigName || 'gig-pack')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'gig-pack';
  link.href = url;
  link.download = `${safeName}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
