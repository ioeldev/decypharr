import { arrayValue, numberValue, objectValue, stringValue, type JsonObject } from '../../../../shared/api/json-response';

export function recoveryMedia(binding: JsonObject, details: JsonObject = {}): { label: string; filename: string; path: string } {
  const parts = stringValue(binding.libraryPath).replaceAll('\\', '/').split('/').filter(Boolean);
  const filename = parts.at(-1) || stringValue(binding.entryFileName);
  const parent = parts.at(-2) ?? '';
  const isSeries = binding.arrType === 'sonarr';
  const hasSeasonFolder = /^(?:(?:season|saison)\s+\d+|specials)$/i.test(parent);
  let title = stringValue(details.title) || (isSeries && hasSeasonFolder ? parts.at(-3) : parent);
  if (!title) {
    title = (stringValue(binding.entryFileName) || stringValue(binding.entryName)).replace(/\.[^.]+$/, '');
    if (isSeries) title = title.split(/(?:^|[ ._-])S\d+[ ._-]*E\d+|(?:^|[ ._-])\d+x\d+/i)[0] ?? '';
    title = title.replace(/[._]+/g, ' ').trim() || 'Media unavailable';
  }

  const episode = isSeries ? episodeLabel({ binding, details, filename, parent }) : '';
  const mediaId = numberValue(binding.movieId) || numberValue(binding.seriesId);
  const parameters = new URLSearchParams({ arr: stringValue(binding.arrName), media: String(mediaId) });
  const canLink = mediaId > 0 && Boolean(binding.arrName) && ['sonarr', 'radarr'].includes(stringValue(binding.arrType));
  return { label: episode ? `${title} · ${episode}` : title, filename, path: canLink ? `api/repair/library/media?${parameters}` : '' };
}

function episodeLabel({ binding, details, filename, parent }: { binding: JsonObject; details: JsonObject; filename: string; parent: string }): string {
  const episodeIds = new Set(arrayValue(binding.episodeIds));
  const episodes = arrayValue(details.episodes).map(objectValue).filter((episode) => episodeIds.has(episode.id ?? null))
    .sort((first, second) => numberValue(first.seasonNumber) - numberValue(second.seasonNumber) || numberValue(first.episodeNumber) - numberValue(second.episodeNumber));
  if (episodes.length > 0) {
    const labels = new Set(episodes.map((episode) => `S${pad(numberValue(episode.seasonNumber))}E${pad(numberValue(episode.episodeNumber))}`));
    return [...labels].join(', ') + (episodes.length < episodeIds.size ? ' · other episodes unavailable' : '');
  }

  // Arr episode IDs are not episode numbers. Filenames are only a display fallback.
  const match = filename.match(/(?:^|[ ._-])(S\d+[ ._-]*E\d+(?:(?:[ ._-]*E|[ ._-]*-[ ._-]*E?)\d+)*)(?=$|[ ._-])/i);
  if (match?.[1]) return match[1].replace(/[ ._]/g, '').toUpperCase();

  const alternate = filename.match(/(?:^|[ ._-])(\d+)x(\d+)(?=$|[ ._-])/i);
  if (alternate) return `S${pad(Number(alternate[1]))}E${pad(Number(alternate[2]))}`;

  const folderSeason = parent.match(/^(?:season|saison)\s+(\d+)$/i);
  const season = binding.seasonNumber ?? (folderSeason ? Number(folderSeason[1]) : null);
  return season === null ? 'Episode unavailable' : `Season ${season} · episode unavailable`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
