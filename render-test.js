const puppeteer = require('puppeteer-core');

const CHROME = '/root/.cache/puppeteer/chrome/linux-151.0.7922.71/chrome-linux64/chrome';
const URL = 'https://flyimg.lii.qzz.io/zztest_20260906';
const FIX_CSS = '.preview-modal [class*="animal-body"] { align-items: stretch !important; }';

async function run(page, width, height, label) {
  await page.setViewport({ width, height });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.thumb-zoom', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() => document.querySelector('.thumb-zoom').click());
  await page.waitForSelector('iframe[title="HTML 渲染预览"]', { timeout: 20000 });
  await page.evaluate((css) => {
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }, FIX_CSS);
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `/tmp/final_${label}.png` });

  const info = await page.evaluate(() => {
    const iframe = document.querySelector('iframe[title="HTML 渲染预览"]');
    const body = document.querySelector('[class*="animal-body"]');
    const mb = (n) => { const b = n.getBoundingClientRect(); return { w: Math.round(b.width), l: Math.round(b.left), r: Math.round(b.right) }; };
    return { vw: window.innerWidth, body: mb(body), iframe: mb(iframe) };
  });
  console.log(label, JSON.stringify(info));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await run(page, 1440, 900, 'desktop_1440');
  await run(page, 390, 844, 'mobile_390');
  await run(page, 844, 390, 'landscape_844');
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
