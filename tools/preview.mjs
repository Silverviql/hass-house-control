// Preview stand: renders the card with a fake `hass` in headless Chromium, takes a screenshot
// and prints the Home Assistant service calls the card made.
// Setup (once, in the repo root; node_modules is git-ignored):
//   npm i --no-save playwright && npx playwright install chromium-headless-shell
// Usage: node tools/preview.mjs <dir with the built card> <plan.json> <out.png> [on|off] [width] [height]
// Env: CLICK="text|text" clicks a text in the 3D app, WHEEL="x,y,delta,steps" zooms, WAIT=ms before acting,
//      ONIDS / OFFIDS="entity,entity" override single states, FEVAL="js" evaluates in the 3D app's frame.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [dirArg, planPath, out, lightsState = 'on', width = '1400', height = '900'] = process.argv.slice(2);
const dir = path.resolve(dirArg);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

const harness = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:#111}house-control-card{display:block;height:100vh}</style></head><body>
<script type="module">
import '/house-control-card.js';
const plan = ${JSON.stringify(plan)};
const ids = new Set();
for (const d of [...(plan.lights||[]), ...(plan.acs||[]), ...(plan.devices||[])]) {
  if (d.link?.id) ids.add(d.link.id);
  if (d.sensor?.id) ids.add(d.sensor.id);
}
for (const item of plan.sensors || []) for (const k of ['temperature', 'humidity']) if (item[k]) ids.add(item[k]);
for (const k of ['weather', 'temperature', 'humidity', 'pressure']) if (plan.outdoor?.[k]) ids.add(plan.outdoor[k]);
const states = {};
for (const id of ids) {
  const dom = id.split('.')[0];
  if (dom === 'weather') states[id] = { entity_id: id, state: 'cloudy', attributes: { temperature: 2.6, humidity: 81, pressure: 1003, pressure_unit: 'hPa', temperature_unit: '°C' } };
  else if (id.endsWith('_humidity')) states[id] = { entity_id: id, state: id.includes('703732') ? '74' : '43.6', attributes: { device_class: 'humidity', unit_of_measurement: '%' } };
  else if (id.endsWith('_pressure')) states[id] = { entity_id: id, state: '1002.4', attributes: { device_class: 'atmospheric_pressure', unit_of_measurement: 'hPa' } };
  else if (id.includes('tkp1017s') && dom === 'sensor') states[id] = { entity_id: id, state: '87', attributes: { unit_of_measurement: '°C' } };
  else if (dom === 'sensor') states[id] = { entity_id: id, state: '23.4', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } };
  else if (dom === 'cover') states[id] = { entity_id: id, state: 'open', attributes: { current_position: 55 } };
  else if (dom === 'vacuum') states[id] = { entity_id: id, state: 'cleaning', attributes: {} };
  else if (dom === 'climate' && id.includes('0xa4c13885')) states[id] = { entity_id: id, state: 'heat', attributes: { temperature: 27, current_temperature: 24.5, hvac_modes: ['off', 'heat'], hvac_action: 'heating', min_temp: 5, max_temp: 35 } };
  else if (dom === 'climate') states[id] = { entity_id: id, state: 'cool', attributes: { temperature: 24, current_temperature: 25, hvac_modes: ['off','cool','heat'], fan_modes: ['1','2','3'], min_temp: 16, max_temp: 32 } };
  else if (dom === 'light') states[id] = { entity_id: id, state: '${lightsState}', attributes: { brightness: 200, color_temp_kelvin: 3000, supported_color_modes: ['color_temp'], color_mode: 'color_temp' } };
  else states[id] = { entity_id: id, state: '${lightsState}', attributes: {} };
}
for (const id of ${JSON.stringify((process.env.OFFIDS || '').split(',').filter(Boolean))}) if (states[id]) states[id].state = 'off';
for (const id of ${JSON.stringify((process.env.ONIDS || '').split(',').filter(Boolean))}) if (states[id]) states[id].state = 'on';
window.__calls = [];
const hass = {
  states,
  user: { is_admin: true },
  language: 'ru',
  connection: { sendMessagePromise: async (m) => m.type === 'config/entity_registry/list' ? [...ids].map((entity_id) => ({ entity_id, platform: 'mqtt', disabled_by: null })) : {} },
  callService: async (domain, service, data) => { window.__calls.push({ domain, service, data }); },
};
const el = document.createElement('house-control-card');
el.setConfig({ type: 'custom:house-control-card', platform: '*', plan, app_url: '/embed.html' });
el.hass = hass;
document.body.append(el);
window.__card = el;
</script></body></html>`;

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(harness); return; }
  const file = path.join(dir, path.normalize(url.pathname));
  if (!file.startsWith(path.resolve(dir)) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +width, height: +height } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(Number(process.env.WAIT || 9000));
if (process.env.CLICK) {
  const frame = page.frames().find((f) => f.url().includes('embed.html'));
  for (const text of process.env.CLICK.split('|')) {
    await frame.getByText(text, { exact: true }).first().click();
    await page.waitForTimeout(3000);
  }
}
if (process.env.AFTER) await page.waitForTimeout(Number(process.env.AFTER));
if (process.env.WHEEL) {
  const [x, y, delta, steps = 8] = process.env.WHEEL.split(',').map(Number);
  await page.mouse.move(x, y);
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, delta); await page.waitForTimeout(120); }
  await page.waitForTimeout(2500);
}
if (process.env.FEVAL) console.log('feval:', JSON.stringify(await page.frames().find((f) => f.url().includes('embed.html')).evaluate(process.env.FEVAL)));
if (process.env.EVAL) console.log('eval:', JSON.stringify(await page.evaluate(process.env.EVAL)));
await page.screenshot({ path: out });
const info = await page.evaluate(() => ({ ready: window.__card?._ready, notice: window.__card?._notice, calls: window.__calls }));
console.log(JSON.stringify(info));
for (const l of logs.slice(0, 15)) console.log(l);
await browser.close();
server.close();
