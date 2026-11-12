// Preview stand: renders the card with a fake `hass` in headless Chromium, takes a screenshot
// and prints the Home Assistant service calls the card made.
// Setup (once, in the repo root; node_modules is git-ignored):
//   npm i --no-save playwright && npx playwright install chromium-headless-shell
// Usage: node tools/preview.mjs <dir with the built card> <plan.json> <out.png> [on|off] [width] [height]
// Env: CLICK="text|text" clicks a text in the 3D app, WHEEL="x,y,delta,steps" zooms, WAIT=ms before acting,
//      ONIDS / OFFIDS="entity,entity" override single states, FEVAL="js" evaluates in the 3D app's frame,
//      ACT="js" runs in that frame after CLICK, RELOAD=1 then reloads the page (to test what is remembered).
//      SUN=elevation of sun.sun in degrees (default 25: day; -10 for night).
//      TAP="name" finds that device in the 3D view by its hover tooltip and taps it.
//      TOUCH=1 emulates a phone's touch screen (no hover).
//      DRAG="x1,y1,x2,y2;..." drags with the mouse (page pixels), after ACT.
//      PACT="js" runs in the dashboard page first (window.__card is the card), then waits PWAIT ms.
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
for (const k of ['weather', 'sun', 'temperature', 'humidity', 'pressure']) if (plan.outdoor?.[k]) ids.add(plan.outdoor[k]);
const states = {};
for (const id of ids) {
  const dom = id.split('.')[0];
  if (dom === 'sun') states[id] = { entity_id: id, state: 'above_horizon', attributes: { elevation: ${Number(process.env.SUN ?? 25)}, azimuth: 180 } };
  else if (dom === 'weather') states[id] = { entity_id: id, state: 'cloudy', attributes: { temperature: 2.6, humidity: 81, pressure: 1003, pressure_unit: 'hPa', temperature_unit: '°C' } };
  else if (id.endsWith('_humidity')) states[id] = { entity_id: id, state: id.includes('703732') ? '74' : '43.6', attributes: { device_class: 'humidity', unit_of_measurement: '%' } };
  else if (id.endsWith('_pressure')) states[id] = { entity_id: id, state: '1002.4', attributes: { device_class: 'atmospheric_pressure', unit_of_measurement: 'hPa' } };
  else if (id.includes('tkp1017s') && dom === 'sensor') states[id] = { entity_id: id, state: '87', attributes: { unit_of_measurement: '°C' } };
  else if (dom === 'sensor') states[id] = { entity_id: id, state: '23.4', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } };
  else if (dom === 'cover') states[id] = { entity_id: id, state: 'open', attributes: { current_position: 55 } };
  else if (dom === 'vacuum') states[id] = { entity_id: id, state: 'cleaning', attributes: {} };
  else if (dom === 'climate' && id.includes('0xa4c13885')) states[id] = { entity_id: id, state: 'heat', attributes: { temperature: 27, current_temperature: 24.5, hvac_modes: ['off', 'heat'], hvac_action: 'heating', min_temp: 5, max_temp: 35 } };
  else if (dom === 'climate') states[id] = { entity_id: id, state: 'cool', attributes: { temperature: 24, current_temperature: 25, hvac_modes: ['off','cool','heat'], fan_modes: ['1','2','3','4'], fan_mode: '2', min_temp: 16, max_temp: 32 } };
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
  connection: { sendMessagePromise: async (m) => {
    window.__ws = (window.__ws || []).concat([m.type]);
    if (m.type === 'config/entity_registry/list') return [...ids].map((entity_id) => ({ entity_id, platform: 'mqtt', disabled_by: null, area_id: 'a1' }));
    if (m.type === 'config/area_registry/list') return [{ area_id: 'a1', name: 'Комната' }];
    if (m.type === 'config/device_registry/list') return [];
    if (m.type === 'lovelace/config') return window.__dashboard;
    if (m.type === 'lovelace/config/save') { window.__dashboard = m.config; window.__saved = (window.__saved || 0) + 1; return null; }
    return {};
  } },
  callService: async (domain, service, data) => { window.__calls.push({ domain, service, data }); },
};
const el = document.createElement('house-control-card');
const cardConfig = { type: 'custom:house-control-card', platform: '*', plan, app_url: '/embed.html', dashboard_path: 'test' };
window.__dashboard = { views: [{ type: 'panel', cards: [cardConfig] }] };
el.setConfig(cardConfig);
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
const page = await browser.newPage({ viewport: { width: +width, height: +height }, ...(process.env.TOUCH ? { hasTouch: true, isMobile: true } : {}) });
// The 3D app's frame, or with FRAME=editor the plan editor's (open it first with PACT).
const appFrame = () => page.frames().find((f) => (process.env.FRAME === 'editor' ? f.url().includes('mode=editor') : f.url().includes('embed.html') && !f.url().includes('mode=editor')));
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(Number(process.env.WAIT || 9000));
if (process.env.PACT) {
  // Runs in the dashboard page (not the 3D frame): window.__card is the card element.
  await page.evaluate(process.env.PACT);
  await page.waitForTimeout(Number(process.env.PWAIT || 7000));
}
if (process.env.CLICK) {
  const frame = appFrame();
  for (const text of process.env.CLICK.split('|')) {
    await frame.getByText(text, { exact: true }).first().click();
    await page.waitForTimeout(3000);
  }
}
if (process.env.TAP) {
  // Finds the device in the 3D view by its hover tooltip, then taps it there.
  const frame = appFrame();
  const tip = () => frame.evaluate(() => document.querySelector('.tooltip.show')?.firstChild?.nextSibling?.textContent ?? document.querySelector('.tooltip.show')?.textContent ?? '');
  let spot = null;
  const seen = {};
  const step = Number(process.env.TAP_STEP || 16);
  for (let y = 80; y < +height - 40 && !spot; y += step) {
    for (let x = 20; x < +width * 0.62 && !spot; x += step) {
      await page.mouse.move(x, y);
      const name = (await tip()).trim();
      if (name) seen[name] = (seen[name] || 0) + 1;
      if (name === process.env.TAP) spot = [x, y];
    }
  }
  console.log('tap:', JSON.stringify({ target: process.env.TAP, at: spot, hovered: seen }));
  if (spot) { await page.mouse.click(...spot); await page.waitForTimeout(1500); }
}
if (process.env.ACT) {
  await appFrame().evaluate(process.env.ACT);
  await page.waitForTimeout(1500);
}
if (process.env.DRAG) {
  // "x1,y1,x2,y2[;...]" in page pixels: press, move in steps, release.
  for (const part of process.env.DRAG.split(';')) {
    const [x1, y1, x2, y2] = part.split(',').map(Number);
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(x1 + (x2 - x1) * i / 6, y1 + (y2 - y1) * i / 6);
    await page.mouse.up();
    await page.waitForTimeout(600);
  }
}
if (process.env.RELOAD) {
  await page.reload();
  await page.waitForTimeout(Number(process.env.WAIT || 9000));
}
if (process.env.AFTER) await page.waitForTimeout(Number(process.env.AFTER));
if (process.env.WHEEL) {
  const [x, y, delta, steps = 8] = process.env.WHEEL.split(',').map(Number);
  await page.mouse.move(x, y);
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, delta); await page.waitForTimeout(120); }
  await page.waitForTimeout(2500);
}
if (process.env.FEVAL) console.log('feval:', JSON.stringify(await appFrame().evaluate(process.env.FEVAL)));
if (process.env.EVAL) console.log('eval:', JSON.stringify(await page.evaluate(process.env.EVAL)));
await page.screenshot({ path: out });
const info = await page.evaluate(() => ({ ready: window.__card?._ready, notice: window.__card?._notice, calls: window.__calls }));
console.log(JSON.stringify(info));
for (const l of logs.slice(0, 15)) console.log(l);
await browser.close();
server.close();
