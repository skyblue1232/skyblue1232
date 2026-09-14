import fs from 'node:fs/promises';
import path from 'node:path';

const token = process.env.GITHUB_TOKEN;
const username = process.env.USERNAME;
const startYear = Number(process.env.START_YEAR || 2024);
const outputFile = process.env.OUTPUT_FILE || 'profile-3d-contrib/profile-2024-now.svg';

if (!token) throw new Error('GITHUB_TOKEN is required.');
if (!username) throw new Error('USERNAME is required.');
if (!Number.isInteger(startYear) || startYear < 2008) throw new Error('START_YEAR is invalid.');

const now = new Date();
const currentYear = now.getUTCFullYear();
if (startYear > currentYear) throw new Error('START_YEAR cannot be in the future.');

const GRAPHQL = `
  query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
              weekday
            }
          }
        }
      }
    }
  }
`;

async function fetchCalendar(year) {
  const from = `${year}-01-01T00:00:00Z`;
  const to = year === currentYear
    ? now.toISOString()
    : `${year}-12-31T23:59:59Z`;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'github-profile-multiyear-3d',
    },
    body: JSON.stringify({
      query: GRAPHQL,
      variables: { login: username, from, to },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed for ${year}: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL error for ${year}: ${JSON.stringify(payload.errors)}`);
  }

  const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error(`No contribution calendar returned for ${year}.`);

  const days = calendar.weeks.flatMap((week) => week.contributionDays);
  return {
    year,
    total: calendar.totalContributions,
    days,
  };
}

const years = [];
for (let year = startYear; year <= currentYear; year += 1) years.push(year);
const calendars = [];
for (const year of years) {
  console.log(`Fetching ${year} contribution data...`);
  calendars.push(await fetchCalendar(year));
}

const allDays = calendars.flatMap((c) => c.days);
const maxCount = Math.max(1, ...allDays.map((d) => d.contributionCount));
const grandTotal = calendars.reduce((sum, c) => sum + c.total, 0);

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const WIDTH = 1200;
const ROW_HEIGHT = 205;
const HEADER_HEIGHT = 105;
const FOOTER_HEIGHT = 58;
const HEIGHT = HEADER_HEIGHT + calendars.length * ROW_HEIGHT + FOOTER_HEIGHT;
const BASE_X = 128;
const BASE_Y = 128;
const STEP_X = 16.1;
const STEP_DAY_X = -5.1;
const STEP_DAY_Y = 5.5;
const CELL_W = 11.2;
const CELL_D = 5.5;
const MAX_BAR_H = 38;

const palette = [
  ['#172554', '#1d4ed8', '#60a5fa'],
  ['#312e81', '#7c3aed', '#c084fc'],
  ['#164e63', '#0891b2', '#67e8f9'],
  ['#3f1d5d', '#c026d3', '#f0abfc'],
];

function mix(hexA, hexB, t) {
  const a = hexA.match(/\w\w/g).map((x) => parseInt(x, 16));
  const b = hexB.match(/\w\w/g).map((x) => parseInt(x, 16));
  const v = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return `#${v.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function contributionColor(count, yearIndex, face = 'top') {
  if (count === 0) return face === 'top' ? '#18212d' : '#111821';
  const [low, mid, high] = palette[yearIndex % palette.length];
  const ratio = Math.log1p(count) / Math.log1p(maxCount);
  const base = ratio < 0.55
    ? mix(low, mid, ratio / 0.55)
    : mix(mid, high, (ratio - 0.55) / 0.45);
  if (face === 'left') return mix(base, '#000000', 0.28);
  if (face === 'right') return mix(base, '#000000', 0.42);
  return mix(base, '#ffffff', 0.08);
}

function barHeight(count) {
  if (count === 0) return 0;
  return 4 + Math.pow(Math.log1p(count) / Math.log1p(maxCount), 0.82) * MAX_BAR_H;
}

function points(arr) {
  return arr.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function renderBlock(x, y, count, yearIndex, date) {
  const h = barHeight(count);
  const topY = y - h;
  const p0 = [x, topY];
  const p1 = [x + CELL_W, topY + CELL_D];
  const p2 = [x, topY + CELL_D * 2];
  const p3 = [x - CELL_W, topY + CELL_D];

  const b0 = [x, y];
  const b1 = [x + CELL_W, y + CELL_D];
  const b2 = [x, y + CELL_D * 2];
  const b3 = [x - CELL_W, y + CELL_D];

  const top = `<polygon points="${points([p0,p1,p2,p3])}" fill="${contributionColor(count, yearIndex, 'top')}" stroke="#ffffff" stroke-opacity="${count ? 0.055 : 0.028}" stroke-width="0.65"/>`;
  if (!count) return `<g><title>${esc(date)} · 0 contributions</title>${top}</g>`;

  const right = `<polygon points="${points([p1,p2,b2,b1])}" fill="${contributionColor(count, yearIndex, 'right')}"/>`;
  const left = `<polygon points="${points([p3,p2,b2,b3])}" fill="${contributionColor(count, yearIndex, 'left')}"/>`;
  return `<g class="cube"><title>${esc(date)} · ${count} contributions</title>${left}${right}${top}</g>`;
}

function monthMarkers(calendar, rowY) {
  const months = new Map();
  for (const day of calendar.days) {
    const d = new Date(`${day.date}T00:00:00Z`);
    if (d.getUTCDate() <= 7) {
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      if (!months.has(key)) months.set(key, d);
    }
  }

  return [...months.values()].map((d) => {
    const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const offset = (jan1.getUTCDay() + 6) % 7;
    const dayOfYear = Math.floor((d - jan1) / 86400000);
    const week = Math.floor((dayOfYear + offset) / 7);
    const x = BASE_X + week * STEP_X - 12;
    const label = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    return `<text x="${x.toFixed(1)}" y="${(rowY - 18).toFixed(1)}" class="month">${label}</text>`;
  }).join('');
}

function rowsSvg() {
  return calendars.map((calendar, yearIndex) => {
    const rowY = BASE_Y + yearIndex * ROW_HEIGHT;
    const jan1 = new Date(Date.UTC(calendar.year, 0, 1));
    const mondayOffset = (jan1.getUTCDay() + 6) % 7;
    const dateToPos = new Map();
    calendar.days.forEach((day) => dateToPos.set(day.date, day));

    const blocks = [];
    const yearEnd = calendar.year === currentYear
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : new Date(Date.UTC(calendar.year, 11, 31));

    for (let cursor = new Date(Date.UTC(calendar.year, 0, 1)); cursor <= yearEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      const day = dateToPos.get(date) || { contributionCount: 0 };
      const dayOfYear = Math.floor((cursor - jan1) / 86400000);
      const weekIndex = Math.floor((dayOfYear + mondayOffset) / 7);
      const weekday = (cursor.getUTCDay() + 6) % 7; // Monday = 0
      const x = BASE_X + weekIndex * STEP_X + weekday * STEP_DAY_X;
      const y = rowY + weekday * STEP_DAY_Y;
      blocks.push(renderBlock(x, y, day.contributionCount, yearIndex, date));
    }

    const color = palette[yearIndex % palette.length][2];
    const rangeEnd = calendar.year === currentYear ? now.toISOString().slice(0, 10) : `${calendar.year}-12-31`;
    return `
      <g class="year-row">
        <text x="28" y="${(rowY + 18).toFixed(1)}" class="year" fill="${color}">${calendar.year}</text>
        <text x="28" y="${(rowY + 42).toFixed(1)}" class="count">${calendar.total.toLocaleString()} contributions</text>
        <text x="28" y="${(rowY + 62).toFixed(1)}" class="range">${calendar.year}-01-01 → ${rangeEnd}</text>
        ${monthMarkers(calendar, rowY)}
        ${blocks.join('')}
      </g>
    `;
  }).join('');
}

const startDate = `${startYear}-01-01`;
const endDate = now.toISOString().slice(0, 10);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(username)} GitHub contributions from ${startDate} to ${endDate}</title>
  <desc id="desc">A multi-year 3D contribution graph covering ${startDate} through ${endDate}.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#060914"/>
      <stop offset="0.52" stop-color="#0b1020"/>
      <stop offset="1" stop-color="#101827"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="9" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <style>
    .title { font: 700 28px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill:#f8fafc; letter-spacing:-.5px; }
    .subtitle { font: 500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill:#94a3b8; }
    .total { font: 700 18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill:#f8fafc; }
    .year { font: 800 25px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .count { font: 650 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill:#cbd5e1; }
    .range { font: 500 10px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill:#64748b; }
    .month { font: 600 8.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill:#64748b; }
    .footer { font: 500 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill:#64748b; }
    .cube { transition: opacity .2s ease; }
    @keyframes pulse { 0%,100%{opacity:.45} 50%{opacity:.8} }
    .orb { animation:pulse 3.8s ease-in-out infinite; }
  </style>
  <rect width="100%" height="100%" rx="20" fill="url(#bg)"/>
  <circle class="orb" cx="1080" cy="62" r="34" fill="#7c3aed" opacity=".14" filter="url(#glow)"/>
  <circle class="orb" cx="1120" cy="86" r="20" fill="#22d3ee" opacity=".12" filter="url(#glow)"/>

  <text x="28" y="42" class="title">Contribution Timeline · ${startYear} → Now</text>
  <text x="28" y="66" class="subtitle">${esc(username)} · one SVG · ${years.length} years · updated ${endDate}</text>
  <text x="1170" y="42" text-anchor="end" class="total">${grandTotal.toLocaleString()}</text>
  <text x="1170" y="62" text-anchor="end" class="subtitle">total contributions in this range</text>

  ${rowsSvg()}

  <line x1="28" y1="${HEIGHT - 44}" x2="1172" y2="${HEIGHT - 44}" stroke="#334155" stroke-opacity=".55"/>
  <text x="28" y="${HEIGHT - 20}" class="footer">Generated from GitHub contribution calendars · ${startDate} → ${endDate}</text>
  <text x="1172" y="${HEIGHT - 20}" text-anchor="end" class="footer">Keep digging. Keep improving.</text>
</svg>`;

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, svg, 'utf8');
console.log(`Wrote ${outputFile}`);
console.log(`Range: ${startDate} → ${endDate}`);
console.log(`Total contributions: ${grandTotal}`);
