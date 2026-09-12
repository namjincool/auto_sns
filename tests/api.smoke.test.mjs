import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = 'http://127.0.0.1:5173';
const dir = await mkdtemp(join(tmpdir(), 'mono-flow-test-'));
process.env.MONO_FLOW_TEST = 'true';
process.env.APP_ORIGIN = origin;
process.env.DEV_LOCAL_AI = 'true';
process.env.DATA_FILE = join(dir, 'data.json');
const { server } = await import('../server.mjs');
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const endpoint = (path) => `http://127.0.0.1:${port}${path}`;
async function request(path, options = {}, cookie = '') {
  const response = await fetch(endpoint(path), { ...options, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  return [response, await response.json()];
}
test('secure local pilot happy path and guards', async (t) => {
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  let [response] = await request('/api/campaigns', { method: 'POST', body: '{}' }); assert.equal(response.status, 401, 'unauthenticated write denied');
  let data; [response, data] = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'pilot@example.test', password: 'a secure local password' }) }); assert.equal(response.status, 201); const cookie = response.headers.get('set-cookie').split(';')[0];
  [response, data] = await request('/api/campaigns', { method: 'POST', body: JSON.stringify({ title: '가을 메뉴', product: '무화과 라떼', audience: '성수 카페 고객', story: '직접 조린 무화과 콩포트를 사용합니다.' }) }, cookie); assert.equal(response.status, 201); const campaignId = data.campaign.id;
  [response, data] = await request('/api/generate', { method: 'POST', body: JSON.stringify({ campaignId }) }, cookie); assert.equal(response.status, 201); const draftId = data.draft.id;
  [response] = await request('/api/schedules', { method: 'POST', body: JSON.stringify({ draftId, scheduledFor: '2030-01-01T10:00:00.000Z' }) }, cookie); assert.equal(response.status, 409, 'schedule before approval denied');
  [response] = await request(`/api/drafts/${draftId}/approve`, { method: 'POST', body: '{}' }, cookie); assert.equal(response.status, 200);
  [response, data] = await request('/api/schedules', { method: 'POST', body: JSON.stringify({ draftId, scheduledFor: '2030-01-01T10:00:00.000Z' }) }, cookie); assert.equal(response.status, 201); assert.equal(data.schedule.status, 'PENDING_CONFIGURATION');
  [response, data] = await request('/api/analytics', {}, cookie); assert.equal(response.status, 200); assert.equal(data.campaigns, 1);
});
