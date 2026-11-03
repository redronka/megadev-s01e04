import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestCounts, DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
  time: number;
  line: number;
};

function isDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function timestamp(value: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || !isDate(match[1])) return null;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null;
  if (match[5] && (Number(match[6]) > 23 || Number(match[7]) > 59)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function parseEvent(line: string, index: number): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (typeof event.at !== 'string' || typeof event.job !== 'string' || event.job.length === 0) return null;
  if (event.status !== 'ok' && event.status !== 'retry' && event.status !== 'fail') return null;
  if (event.owner !== null && typeof event.owner !== 'string') return null;
  if ('error' in event && typeof event.error !== 'string') return null;
  const time = timestamp(event.at);
  if (time === null) return null;
  return {
    at: event.at,
    job: event.job,
    status: event.status,
    owner: event.owner,
    ...(typeof event.error === 'string' ? { error: event.error } : {}),
    time,
    line: index,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isDate(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const events: RunEvent[] = [];
  let badLines = 0;
  contents.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    const event = parseEvent(line, index);
    if (event) events.push(event);
    else badLines += 1;
  });
  events.sort((a, b) => a.time - b.time || a.line - b.line);

  const jobs = new Map<string, DigestRow>();
  const counts: DigestCounts = { ok: 0, retry: 0, fail: 0 };
  for (const event of events) {
    counts[event.status] += 1;
    const row = jobs.get(event.job) ?? {
      job: event.job,
      owner: event.owner,
      runs: 0,
      retries: 0,
      failures: 0,
      lastStatus: event.status,
      lastError: null,
      firstAt: event.at,
      lastAt: event.at,
    };
    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    if (event.status === 'fail') row.failures += 1;
    row.owner = event.owner;
    row.lastStatus = event.status;
    if (event.error !== undefined) row.lastError = event.error;
    row.lastAt = event.at;
    jobs.set(event.job, row);
  }

  const rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { night, rows, badLines, counts };
};
