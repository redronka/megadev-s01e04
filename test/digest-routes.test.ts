import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-10-28';
const config = (runsDir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

const event = (
  at: string,
  job: string,
  status: 'ok' | 'retry' | 'fail',
  owner: string | null,
  error?: string,
) => ({ at, job, status, owner, ...(error === undefined ? {} : { error }) });

describe('digest routes', () => {
  let runsDir: string;

  beforeEach(async () => {
    runsDir = await mkdtemp(path.join(tmpdir(), 'rig-digest-routes-'));
  });

  afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true });
  });

  it('renders the digest as HTML and returns the full digest as JSON in the same job order', async () => {
    const events = [
      event('2026-10-28T01:00:00+02:00', 'zeta', 'retry', 'zed'),
      event('2026-10-28T01:01:00+02:00', 'zeta', 'retry', 'zed'),
      event('2026-10-28T01:02:00+02:00', 'zeta', 'retry', 'zed'),
      event('2026-10-28T02:00:00-04:00', 'alpha<&', 'ok', null),
      event('2026-10-28T08:00:00+02:00', 'alpha<&', 'fail', null, '<boom>'),
    ];
    await writeFile(
      path.join(runsDir, `${night}.jsonl`),
      `${events.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    );

    const app = createApp(config(runsDir));
    const htmlResponse = await app.request(`/digest/${night}`);
    const html = await htmlResponse.text();
    const jsonResponse = await app.request(`/api/digest/${night}`);
    const digest = await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers.get('content-type')).toContain('text/html');
    expect(html).toContain(`digest · ${night}`);
    expect(html).toContain('alpha&lt;&amp;');
    expect(html).not.toContain('alpha<&');
    expect(html).toContain('&lt;boom&gt;');
    expect(html).toContain('—');
    expect(html).toContain('class="warn"');
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">1</td>');
    expect(html).toContain('2026-10-28T02:00:00-04:00');
    expect(html).toContain('2026-10-28T08:00:00+02:00');

    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');
    expect(digest).toEqual({
      night,
      rows: [
        {
          job: 'alpha<&',
          owner: null,
          runs: 2,
          retries: 0,
          failures: 1,
          lastStatus: 'fail',
          lastError: '<boom>',
          firstAt: '2026-10-28T02:00:00-04:00',
          lastAt: '2026-10-28T08:00:00+02:00',
        },
        {
          job: 'zeta',
          owner: 'zed',
          runs: 3,
          retries: 3,
          failures: 0,
          lastStatus: 'retry',
          lastError: null,
          firstAt: '2026-10-28T01:00:00+02:00',
          lastAt: '2026-10-28T01:02:00+02:00',
        },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 3, fail: 1 },
    });

    expect(html.indexOf('alpha&lt;&amp;')).toBeLessThan(html.indexOf('zeta'));
  });

  it('returns 404 for a night without a file', async () => {
    const app = createApp(config(runsDir));

    const htmlResponse = await app.request('/digest/2026-10-29');
    const jsonResponse = await app.request('/api/digest/2026-10-29');

    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });

  it('renders an empty night and returns empty rows and counts as JSON', async () => {
    await writeFile(path.join(runsDir, `${night}.jsonl`), '');
    const app = createApp(config(runsDir));

    const htmlResponse = await app.request(`/digest/${night}`);
    const html = await htmlResponse.text();
    const jsonResponse = await app.request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      night,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts a malformed line and still serves the remaining night', async () => {
    const validEvent = event('2026-10-28T03:15:00+05:30', 'build', 'ok', null);
    await writeFile(path.join(runsDir, `${night}.jsonl`), `not valid JSON\n${JSON.stringify(validEvent)}\n`);
    const app = createApp(config(runsDir));

    const htmlResponse = await app.request(`/digest/${night}`);
    const html = await htmlResponse.text();
    const jsonResponse = await app.request(`/api/digest/${night}`);
    const digest = await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('build');
    expect(html).toContain('—');
    expect(html).toContain('2026-10-28T03:15:00+05:30');
    expect(jsonResponse.status).toBe(200);
    expect(digest).toEqual({
      night,
      rows: [
        {
          job: 'build',
          owner: null,
          runs: 1,
          retries: 0,
          failures: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T03:15:00+05:30',
          lastAt: '2026-10-28T03:15:00+05:30',
        },
      ],
      badLines: 1,
      counts: { ok: 1, retry: 0, fail: 0 },
    });
  });
});
