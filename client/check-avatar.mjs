import { chromium } from 'playwright';

const base = 'https://codex26.vercel.app';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${base}/auth`, { waitUntil: 'networkidle', timeout: 60000 });
await page.fill('input[type="email"]', 'juan.delos@student.codex.org');
await page.fill('input[type="password"]', 'Student2026!');
await page.click('button[type="submit"]');
await page.waitForURL('**/app/**', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(4000);

const sidebarImg = await page.$$eval('.user-card .avatar img, .user-card .avatar--img img', (els) => els.map((e) => e.src));
const sidebarText = await page.$$eval('.user-card .avatar', (els) => els.map((e) => e.textContent));
console.log('sidebar avatar imgs:', sidebarImg.length ? sidebarImg : '(none)');
console.log('sidebar avatar text:', sidebarText);

await page.goto(`${base}/app/settings`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
const settingsImg = await page.$$eval('.avatar-edit img', (els) => els.map((e) => e.src));
console.log('settings avatar imgs:', settingsImg.length ? settingsImg : '(none)');
const settingsText = await page.$$eval('.avatar-edit .avatar', (els) => els.map((e) => e.textContent));
console.log('settings avatar text:', settingsText);

await page.goto(`${base}/app/idcard`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
const idPhoto = await page.$$eval('.idcard-photo img', (els) => els.map((e) => e.src));
console.log('idcard photo imgs:', idPhoto.length ? idPhoto : '(none)');
const idText = await page.$$eval('.idcard-photo', (els) => els.map((e) => e.textContent.trim()));
console.log('idcard photo block:', idText);

console.log('console errors:', errors.length ? errors : '(none)');
await page.screenshot({ path: 'avatar-check.png', fullPage: false });
await browser.close();
