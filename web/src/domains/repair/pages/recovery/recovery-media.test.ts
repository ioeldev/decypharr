import { expect, test } from 'bun:test';
import { recoveryMedia } from './recovery-media';

test('media titles use authoritative episodes, never Arr episode IDs as numbers', () => {
  const binding = { arrName: 'shows', arrType: 'sonarr', seriesId: 9, episodeIds: [901, 900], libraryPath: '/tv/Example/Season 1/Example.S01E03.mkv' };
  expect(recoveryMedia(binding).label).toBe('Example · S01E03');
  expect(recoveryMedia(binding, { title: 'Canonical title', episodes: [{ id: 901, seasonNumber: 2, episodeNumber: 4 }, { id: 900, seasonNumber: 2, episodeNumber: 3 }] }).label).toBe('Canonical title · S02E03, S02E04');
  expect(recoveryMedia(binding).path).toBe('api/repair/library/media?arr=shows&media=9');
});

test('legacy filename formats retain multi-episode and special labels', () => {
  for (const [filename, expected] of [['Show.S01.E03.mkv', 'S01E03'], ['Show.2x10.mkv', 'S02E10'], ['Show.S00E01E02.mkv', 'S00E01E02'], ['Show.S01E01-E03.mkv', 'S01E01-E03']]) {
    expect(recoveryMedia({ arrType: 'sonarr', entryFileName: filename ?? '' }).label).toBe(`Show · ${expected}`);
  }
  expect(recoveryMedia({ arrType: 'sonarr', entryName: 'Show', seasonNumber: 2 }).label).toBe('Show · Season 2 · episode unavailable');
  expect(recoveryMedia({}).label).toBe('Media unavailable');
  expect(recoveryMedia({ arrType: 'radarr', libraryPath: '/movies/A Movie (2020)/release.mkv' }).label).toBe('A Movie (2020)');
});
