import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const errors = [];

  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
    errors.push(error.message);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
      errors.push(msg.text());
    }
  });

  try {
    console.log('Navigating to local dev server...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    
    console.log('Waiting for + button to appear...');
    await page.waitForSelector('button.fixed.right-6.z-40', { timeout: 5000 });
    
    console.log('Clicking the + button...');
    await page.click('button.fixed.right-6.z-40');
    
    console.log('Waiting for potential crash...');
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Done.');
  } catch (err) {
    console.error('Script error:', err);
  } finally {
    await browser.close();
    process.exit(0);
  }
})();
