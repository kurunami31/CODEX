import { chromium } from 'playwright';

const BASE = 'https://codex26.vercel.app';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 140)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', 'juan.delos@student.codex.org');
  await page.fill('#password', 'Student2026!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/app/**', { timeout: 30000 });
  await page.goto(`${BASE}/app/feed`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);

  const tabs = await page.locator('.feed-tab').allTextContents();
  console.log('tabs:', tabs);

  const unique = `E2E test post ${Date.now()}`;
  await page.fill('.composer .textarea', unique);
  await page.click('.composer .foot .btn-accent');
  await sleep(2500);

  const ownCard = page.locator('.post-card', { hasText: unique }).first();
  const actions = await ownCard.locator('.post-actions button').allTextContents();
  console.log('own post actions:', actions);

  await ownCard.getByRole('button', { name: 'Edit' }).click();
  await sleep(800);
  await page.fill('.post-edit .textarea', unique + ' [edited]');
  await page.getByRole('button', { name: 'Save' }).click();
  await sleep(2500);
  const edited = await page.locator('.post-card', { hasText: unique + ' [edited]' }).count();
  console.log('edited content visible:', edited > 0);

  await page.locator('.post-card', { hasText: unique + ' [edited]' }).first().getByRole('button', { name: 'Archive' }).click();
  await sleep(2500);
  const goneFromFeed = await page.locator('.post-card', { hasText: unique + ' [edited]' }).count();
  console.log('archived -> hidden from feed:', goneFromFeed === 0);

  await page.locator('.feed-tab', { hasText: 'My archived' }).click();
  await sleep(2500);
  const inArchive = await page.locator('.post-card', { hasText: unique + ' [edited]' }).count();
  console.log('shown in My archived:', inArchive > 0);

  await page.locator('.post-card', { hasText: unique + ' [edited]' }).first().getByRole('button', { name: 'Restore' }).click();
  await sleep(2500);
  await page.locator('.feed-tab', { hasText: 'Feed' }).click();
  await sleep(2500);
  const backOnFeed = await page.locator('.post-card', { hasText: unique + ' [edited]' }).count();
  console.log('restored -> back on feed:', backOnFeed > 0);

  page.on('dialog', (d) => d.accept());
  await page.locator('.post-card', { hasText: unique + ' [edited]' }).first().getByRole('button', { name: 'Delete' }).click();
  await sleep(2500);
  const deleted = await page.locator('.post-card', { hasText: unique + ' [edited]' }).count();
  console.log('deleted -> gone:', deleted === 0);

  console.log('console errors:', errs.length ? errs : '(none)');
} catch (e) {
  console.log('FAILED:', e.message.slice(0, 300));
  console.log('console errors:', errs.length ? errs : '(none)');
} finally {
  await browser.close();
}
