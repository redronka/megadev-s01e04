import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const event = { at: '2026-10-28T23:00:00+01:00', job: 'task', status: 'ok', owner: 'owner' };
const temporaryDirs: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'rig-digest-reader-'));
  temporaryDirs.push(directory);
  writeFileSync(join(directory, `${night}.jsonl`), contents);
  return directory;
}

function jsonLines(events: unknown[]): string {
  return events.map(value => JSON.stringify(value)).join('\n');
}

describe('readNight', () => {
  it('agreguje pięć zadań z rzeczywistej nocy i zachowuje plik wejściowy', () => {
    const original = readFileSync(`runs/${night}.jsonl`);
    expect(readNight('runs', night)).toEqual({
      night,
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        { job: 'digest/render', owner: null, runs: 1, retries: 0, failures: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
        { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, failures: 0, lastStatus: 'ok', lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' },
        { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, failures: 0, lastStatus: 'ok', lastError: 'lock held', firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' },
        { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, failures: 1, lastStatus: 'fail', lastError: 'quota exceeded', firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00' },
        { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, failures: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00' },
      ],
    });
    expect(readFileSync(`runs/${night}.jsonl`)).toEqual(original);
    expect(readNight('runs', '2026-10-27')).toMatchObject({ badLines: 0, counts: { ok: 7, retry: 0, fail: 0 } });
  });

  it.each(['', ' \r\n\t\n'])('pomija puste linie i zwraca pustą noc (%j)', contents => {
    expect(readNight(fixture(contents), night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('zwraca null przy braku pliku, lecz zgłasza inne błędy odczytu', () => {
    const directory = fixture('');
    expect(readNight(directory, '2026-10-29')).toBeNull();
    mkdirSync(join(directory, '2026-10-30.jsonl'));
    expect(() => readNight(directory, '2026-10-30')).toThrow();
    expect(() => readNight('\0', night)).toThrow();
  });

  it.each(['../2026-10-28', '2026-1-01', '2026-00-01', '2026-13-01', '2026-01-00', '2026-04-31', '2026-02-29', '1900-02-29', '2026-10-28.jsonl', '2026-10-28\n'])('odrzuca niepoprawne night bez dostępu do pliku: %j', invalid => {
    expect(readNight('\0', invalid)).toBeNull();
  });

  it.each(['2000-02-29', '2024-02-29'])('przyjmuje poprawny dzień przestępny: %s', valid => {
    const directory = fixture('');
    writeFileSync(join(directory, `${valid}.jsonl`), '');
    expect(readNight(directory, valid)?.night).toBe(valid);
  });

  it('liczy niepoprawne zdarzenia i kontynuuje odczyt poprawnych linii CRLF', () => {
    const { owner: _owner, ...missingOwner } = event;
    const invalid = [null, [], 42, 'text', {}, missingOwner,
      { ...event, job: '' }, { ...event, job: 1 }, { ...event, owner: false },
      { ...event, status: 'done' }, { ...event, error: null }, { ...event, error: 1 },
      ...['2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-10-28T24:00:00Z',
        '2026-10-28T00:60:00Z', '2026-10-28T00:00:60Z', '2026-10-28T00:00:00+24:00',
        '2026-10-28T00:00:00+01:60', '2026-10-28T00:00:00', '2026-10-28',
        '2026-10-28T00:00:00.1Z', '2026-10-28T00:00:00.1234Z', '2026-10-28T00:00:00Z\n']
        .map(at => ({ ...event, at })),
    ];
    const contents = [JSON.stringify(event), 'broken {', ...invalid.map(value => JSON.stringify(value)), ' ', JSON.stringify({ ...event, extra: true })].join('\r\n');
    expect(readNight(fixture(contents), night)).toMatchObject({ badLines: invalid.length + 1, counts: { ok: 2, retry: 0, fail: 0 }, rows: [{ runs: 2 }] });
    expect(readNight(fixture('not json\nnull\n'), night)).toEqual({ night, rows: [], badLines: 2, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('ustala kolejność według czasu ze strefą, a remis według kolejności linii', () => {
    const events = [
      { ...event, at: '2026-10-28T03:00:00.001Z', owner: null },
      { ...event, at: '2026-10-28T02:00:00Z', status: 'retry', error: 'nowszy błąd' },
      { ...event, at: '2026-10-28T03:00:00+02:00', status: 'fail', error: 'starszy błąd' },
      { ...event, at: '2026-10-27T23:00:00-01:00', owner: 'pierwszy' },
      { ...event, at: '2026-10-28T03:00:00Z', status: 'retry', error: 'ostatni błąd' },
      { ...event, at: '2026-10-28T04:00:00+01:00', status: 'fail', owner: 'przy remisie' },
    ];
    expect(readNight(fixture(jsonLines(events)), night)?.rows).toEqual([{
      job: 'task', owner: null, runs: 6, retries: 2, failures: 2, lastStatus: 'ok', lastError: 'ostatni błąd',
      firstAt: '2026-10-27T23:00:00-01:00', lastAt: '2026-10-28T03:00:00.001Z',
    }]);
    expect(readNight(fixture(jsonLines(events.slice(1))), night)?.rows[0]).toMatchObject({ owner: 'przy remisie', lastStatus: 'fail', lastAt: '2026-10-28T04:00:00+01:00' });
  });

  it('zachowuje puste error, dokładne ciągi znaków i porządek niezależny od locale', () => {
    const jobs = ['ż', 'a', '__proto__', 'Z', ' a ', 'constructor', ' '];
    const events = jobs.map(job => ({ ...event, job, owner: '' }));
    events.push({ ...event, job: 'a', owner: '' });
    const directory = fixture(jsonLines([
      ...events,
      { ...event, job: 'a', error: 'pierwszy' },
      { ...event, job: 'a', error: '' },
      { ...event, job: 'a', owner: null },
    ]));
    const rows = readNight(directory, night)?.rows;
    expect(rows?.map(row => row.job)).toEqual([' ', ' a ', 'Z', '__proto__', 'a', 'constructor', 'ż']);
    expect(rows?.find(row => row.job === 'a')).toMatchObject({ owner: null, lastError: '', runs: 5 });
    expect(rows?.find(row => row.job === ' ')).toMatchObject({ owner: '', lastError: null });
  });
});
