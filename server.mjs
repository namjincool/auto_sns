import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Minimal local-only .env reader. Values are never sent to the client.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const scrypt = promisify(scryptCallback);
const PORT = Number(process.env.API_PORT || 8787);
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://127.0.0.1:5173';
const DATA_FILE = resolve(process.env.DATA_FILE || '.local-data/data.json');
const LOCAL_AI = process.env.DEV_LOCAL_AI === 'true';
const SESSION_TTL = 8 * 60 * 60 * 1000;
const limiter = new Map();

const emptyDb = () => ({ users: [], sessions: [], campaigns: [], drafts: [], schedules: [], events: [] });
let db = emptyDb();
let writing = Promise.resolve();

function id(prefix) { return `${prefix}_${randomBytes(10).toString('hex')}`; }
function now() { return new Date().toISOString(); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function config() {
  return {
    mode: 'local-pilot',
    ai: LOCAL_AI ? 'local-safe-draft' : 'configuration-required',
    publisher: 'not-configured',
    persistentStore: 'file-backed-development-only',
    humanApprovalRequired: true,
  };
}
async function load() {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  try { db = { ...emptyDb(), ...JSON.parse(await readFile(DATA_FILE, 'utf8')) }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; await save(); }
}
function save() {
  writing = writing.then(() => writeFile(DATA_FILE, JSON.stringify(db, null, 2), { mode: 0o600 }));
  return writing;
}
function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('='); return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}
function sessionCookie(token, expires) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `mf_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor((expires - Date.now()) / 1000)}${secure}`;
}
function clearCookie() { return 'mf_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'; }
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 32768) throw new Error('payload_too_large'); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('invalid_json'); }
}
function text(value, max = 300) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null; }
function requireOrigin(req) {
  const origin = req.headers.origin;
  // Browser writes must be same-origin; command-line smoke tests may supply the configured origin explicitly.
  return origin === APP_ORIGIN;
}
function limited(req, key, max = 20, interval = 60_000) {
  const stamp = Date.now(); const bucketKey = `${req.socket.remoteAddress || 'unknown'}:${key}`;
  const bucket = limiter.get(bucketKey) || [];
  const fresh = bucket.filter((time) => stamp - time < interval);
  fresh.push(stamp); limiter.set(bucketKey, fresh);
  return fresh.length > max;
}
function currentUser(req) {
  const token = cookies(req).mf_session;
  if (!token) return null;
  const session = db.sessions.find((item) => item.tokenHash === hash(token) && item.expiresAt > Date.now());
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}
function publicUser(user) { return { id: user.id, email: user.email, createdAt: user.createdAt }; }
async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64); return `${salt}:${Buffer.from(derived).toString('hex')}`;
}
async function validPassword(password, stored) {
  const [salt, expected] = stored.split(':'); const actual = Buffer.from(await scrypt(password, salt, 64)).toString('hex');
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
function makeDraft(campaign) {
  const product = campaign.product || campaign.title;
  return `새로운 ${product} 이야기를 소개합니다.\n\n${campaign.story}\n\n방문 전 운영 시간과 제공 여부를 확인해 주세요.\n\n#매장소식 #콘텐츠초안`;
}
function audit(type, userId, meta = {}) { db.events.push({ id: id('evt'), type, userId, meta, at: now() }); }

async function route(req, res) {
  const url = new URL(req.url, APP_ORIGIN); const path = url.pathname; const method = req.method || 'GET';
  if (method === 'OPTIONS') return json(res, 204, {});
  if (method === 'GET' && path === '/api/health') return json(res, 200, { ok: true, service: 'mono-flow-api', time: now(), config: config() });
  if (!path.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
  if (method !== 'GET' && !requireOrigin(req)) return json(res, 403, { error: 'origin_denied', message: 'Same-origin request required.' });
  if (limited(req, path, path.startsWith('/api/auth') ? 10 : 60)) return json(res, 429, { error: 'rate_limited' });
  const user = currentUser(req);

  if (method === 'GET' && path === '/api/auth/me') return json(res, 200, { user: user ? publicUser(user) : null, config: config() });
  if (method === 'POST' && path === '/api/auth/register') {
    const input = await body(req); const email = text(input.email, 254)?.toLowerCase(); const password = typeof input.password === 'string' ? input.password : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.length > 128) return json(res, 400, { error: 'invalid_registration', message: 'Use a valid email and a password of 10–128 characters.' });
    if (db.users.some((item) => item.email === email)) return json(res, 409, { error: 'email_in_use' });
    const newUser = { id: id('usr'), email, passwordHash: await passwordHash(password), createdAt: now() }; db.users.push(newUser);
    const token = randomBytes(32).toString('base64url'); const expiresAt = Date.now() + SESSION_TTL;
    db.sessions.push({ id: id('ses'), userId: newUser.id, tokenHash: hash(token), expiresAt, createdAt: now() }); audit('account_registered', newUser.id); await save();
    return json(res, 201, { user: publicUser(newUser) }, { 'Set-Cookie': sessionCookie(token, expiresAt) });
  }
  if (method === 'POST' && path === '/api/auth/login') {
    const input = await body(req); const email = text(input.email, 254)?.toLowerCase(); const password = typeof input.password === 'string' ? input.password : '';
    const found = email && db.users.find((item) => item.email === email);
    if (!found || !(await validPassword(password, found.passwordHash))) return json(res, 401, { error: 'invalid_credentials' });
    const token = randomBytes(32).toString('base64url'); const expiresAt = Date.now() + SESSION_TTL;
    db.sessions.push({ id: id('ses'), userId: found.id, tokenHash: hash(token), expiresAt, createdAt: now() }); audit('login', found.id); await save();
    return json(res, 200, { user: publicUser(found) }, { 'Set-Cookie': sessionCookie(token, expiresAt) });
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    const token = cookies(req).mf_session; if (token) db.sessions = db.sessions.filter((item) => item.tokenHash !== hash(token)); await save();
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
  }
  if (!user) return json(res, 401, { error: 'authentication_required' });

  if (method === 'GET' && path === '/api/campaigns') {
    const campaigns = db.campaigns.filter((item) => item.userId === user.id).map((campaign) => ({ ...campaign, drafts: db.drafts.filter((draft) => draft.campaignId === campaign.id), schedules: db.schedules.filter((schedule) => schedule.campaignId === campaign.id) }));
    return json(res, 200, { campaigns });
  }
  if (method === 'POST' && path === '/api/campaigns') {
    const input = await body(req); const title = text(input.title, 120); const product = text(input.product, 120); const audience = text(input.audience, 240); const story = text(input.story, 1000);
    if (!title || !product || !audience || !story) return json(res, 400, { error: 'invalid_campaign', message: 'title, product, audience, and story are required.' });
    const campaign = { id: id('cmp'), userId: user.id, title, product, audience, story, createdAt: now() }; db.campaigns.push(campaign); audit('campaign_created', user.id, { campaignId: campaign.id }); await save();
    return json(res, 201, { campaign });
  }
  if (method === 'POST' && path === '/api/generate') {
    const input = await body(req); const campaignId = text(input.campaignId, 100); const campaign = db.campaigns.find((item) => item.id === campaignId && item.userId === user.id);
    if (!campaign) return json(res, 404, { error: 'campaign_not_found' });
    if (!LOCAL_AI) return json(res, 503, { error: 'ai_configuration_required', message: 'Set DEV_LOCAL_AI=true only for safe local pilot drafts. A production AI adapter is not bundled.' });
    const draft = { id: id('drf'), campaignId, userId: user.id, channel: 'instagram', content: makeDraft(campaign), status: 'DRAFT', generatedBy: 'local-safe-template', createdAt: now(), approvedAt: null };
    db.drafts.push(draft); audit('draft_generated', user.id, { campaignId, draftId: draft.id }); await save(); return json(res, 201, { draft, warning: 'Local deterministic draft only. Review facts, rights, and policy before approval.' });
  }
  const approve = path.match(/^\/api\/drafts\/([a-z0-9_]+)\/approve$/);
  if (method === 'POST' && approve) {
    const draft = db.drafts.find((item) => item.id === approve[1] && item.userId === user.id); if (!draft) return json(res, 404, { error: 'draft_not_found' });
    draft.status = 'APPROVED'; draft.approvedAt = now(); audit('draft_approved', user.id, { draftId: draft.id }); await save(); return json(res, 200, { draft });
  }
  if (method === 'POST' && path === '/api/schedules') {
    const input = await body(req); const draftId = text(input.draftId, 100); const scheduledFor = text(input.scheduledFor, 64); const draft = db.drafts.find((item) => item.id === draftId && item.userId === user.id);
    const scheduled = scheduledFor && Date.parse(scheduledFor);
    if (!draft) return json(res, 404, { error: 'draft_not_found' });
    if (draft.status !== 'APPROVED') return json(res, 409, { error: 'human_approval_required' });
    if (!scheduled || scheduled <= Date.now()) return json(res, 400, { error: 'invalid_schedule', message: 'Schedule must be a future ISO date/time.' });
    const schedule = { id: id('sch'), campaignId: draft.campaignId, draftId, userId: user.id, scheduledFor: new Date(scheduled).toISOString(), status: 'PENDING_CONFIGURATION', provider: null, createdAt: now(), lastError: 'No publish adapter configured; no external action will occur.' };
    db.schedules.push(schedule); audit('schedule_created', user.id, { scheduleId: schedule.id, draftId }); await save(); return json(res, 201, { schedule });
  }
  if (method === 'POST' && path === '/api/analytics') {
    const input = await body(req); const type = text(input.type, 80); const allowed = new Set(['landing_cta', 'workspace_opened', 'campaign_viewed']);
    if (!allowed.has(type)) return json(res, 400, { error: 'invalid_event' }); audit(type, user.id); await save(); return json(res, 202, { ok: true });
  }
  if (method === 'GET' && path === '/api/analytics') {
    const events = db.events.filter((event) => event.userId === user.id); const counts = Object.fromEntries([...new Set(events.map((event) => event.type))].map((type) => [type, events.filter((event) => event.type === type).length]));
    return json(res, 200, { counts, campaigns: db.campaigns.filter((item) => item.userId === user.id).length, approvedDrafts: db.drafts.filter((item) => item.userId === user.id && item.status === 'APPROVED').length, schedules: db.schedules.filter((item) => item.userId === user.id).length });
  }
  return json(res, 404, { error: 'not_found' });
}

// The worker intentionally has no network client or provider credentials. Due jobs stay safe.
async function processDueSchedules() {
  const due = db.schedules.filter((schedule) => schedule.status === 'PENDING_CONFIGURATION' && Date.parse(schedule.scheduledFor) <= Date.now());
  if (!due.length) return;
  for (const schedule of due) { schedule.status = 'BLOCKED_ADAPTER'; schedule.lastError = 'Due, but no approved publisher adapter is installed. Nothing was published.'; audit('schedule_blocked', schedule.userId, { scheduleId: schedule.id }); }
  await save();
}

await load();
setInterval(() => processDueSchedules().catch((error) => console.error('worker_error', error.message)), 30_000).unref();
export const server = http.createServer((req, res) => route(req, res).catch((error) => {
  const status = error.message === 'payload_too_large' ? 413 : error.message === 'invalid_json' ? 400 : 500;
  if (status === 500) console.error('request_error', error);
  json(res, status, { error: status === 500 ? 'internal_error' : error.message });
}));
if (process.env.MONO_FLOW_TEST !== 'true') server.listen(PORT, '127.0.0.1', () => console.log(`mono-flow API listening at http://127.0.0.1:${PORT}`));
function shutdown() { server.close(() => process.exit(0)); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
