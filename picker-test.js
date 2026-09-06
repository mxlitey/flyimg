const puppeteer = require('puppeteer-core');
const CHROME = '/root/.cache/puppeteer/chrome/linux-151.0.7922.71/chrome-linux64/chrome';
const URL = 'http://localhost:4173/';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true });

  const events = [];
  cdp.on('Page.fileChooserOpened', async (p) => {
    const info = { mode: p.mode };
    try {
      const { node } = await cdp.send('DOM.describeNode', { backendNodeId: p.backendNodeId });
      const attrs = {};
      const a = node.attributes || [];
      for (let i = 0; i + 1 < a.length; i += 2) attrs[a[i]] = a[i + 1];
      info.type = attrs.type || null;
      info.webkitdirectory = 'webkitdirectory' in attrs ? 'present' : null;
    } catch (e) { info.attrErr = String(e); }
    events.push(info);
  });

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('button', { timeout: 30000 });

  // 挂载后（未点击前）检查两个 input 的属性
  const attrState = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type=file]');
    return [...inputs].map((el) => ({
      hasWd: el.hasAttribute('webkitdirectory'),
      wdProp: el.webkitdirectory,
    }));
  });
  console.log('mount-time inputs webkitdirectory:', JSON.stringify(attrState));

  const buttons = await page.$$('button');
  const texts = [];
  for (const b of buttons) texts.push(await b.evaluate((el) => el.textContent.trim()));
  const folderBtn = buttons[texts.findIndex((t) => t.includes('选择文件夹'))];
  const fileBtn = buttons[texts.findIndex((t) => t.includes('选择文件'))];

  // 测试 1：选择文件夹（第一次点击）
  console.log('\n=== click 选择文件夹 (第一次) ===');
  await folderBtn.click();
  await new Promise((r) => setTimeout(r, 600));
  console.log('chooser events:', JSON.stringify(events.slice()));
  const evCount = events.length;

  // 模拟取消（无原生对话框，直接看是否另有选择器事件）
  console.log('--- after cancel wait ---');
  await new Promise((r) => setTimeout(r, 1500));
  console.log('new chooser events after cancel:', JSON.stringify(events.slice(evCount)));

  // 测试 2：选择文件夹（第二次点击）
  events.length = 0;
  console.log('\n=== click 选择文件夹 (第二次) ===');
  await folderBtn.click();
  await new Promise((r) => setTimeout(r, 600));
  console.log('chooser events:', JSON.stringify(events.slice()));

  // 测试 3：选择文件
  events.length = 0;
  console.log('\n=== click 选择文件 ===');
  await fileBtn.click();
  await new Promise((r) => setTimeout(r, 600));
  console.log('chooser events:', JSON.stringify(events.slice()));

  await browser.close();
  console.log('\nDONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
