const puppeteer = require('puppeteer-core');
const CHROME = '/root/.cache/puppeteer/chrome/linux-151.0.7922.71/chrome-linux64/chrome';
const URL = 'https://flyimg.lii.qzz.io/zztest_20260906';
const FILE = 'https://img.lii.qzz.io/1788684852860-hfm4cdze-maxwrap.html';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.thumb-zoom', { timeout: 30000 });

  // 1) 运行时环境与配置
  const env = await page.evaluate(() => ({
    hostname: window.location.hostname,
    href: window.location.href,
    apiBase: window.API_BASE,
    config: window.DISPLAY_CONFIG,
  }));
  console.log('env:', JSON.stringify(env));

  // 2) 直接 fetch R2 直链（与 fetchFileBinary 相同方式）
  const fetchResult = await page.evaluate(async (file) => {
    try {
      const r = await fetch(file, { mode: 'cors' });
      const t = await r.text();
      return { ok: r.ok, status: r.status, len: t.length, head: t.slice(0, 40) };
    } catch (e) {
      return { err: String(e) };
    }
  }, FILE);
  console.log('direct fetch:', JSON.stringify(fetchResult));

  // 3) 实际预览徽标
  await page.evaluate(() => document.querySelector('.thumb-zoom').click());
  await page.waitForSelector('iframe[title="HTML 渲染预览"]', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));
  const badge = await page.evaluate(() => {
    const span = [...document.querySelectorAll('span')].find((s) => /直链|代理/.test(s.textContent || ''));
    return span ? span.textContent : null;
  });
  console.log('badge:', badge);
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
