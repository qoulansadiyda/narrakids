import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error));

  console.log('Navigating...');
  await page.goto('https://narrakids-client.vercel.app/login');
  
  // Fill login
  console.log('Logging in...');
  await page.fill('input[type="text"]', 'tester_playwright');
  await page.fill('input[type="password"]', 'password123');
  // click "Masuk Akun" or whatever the submit button says
  await page.click('button[type="submit"]');

  // Wait for redirect to app
  await page.waitForURL('**/app');

  // Create room
  console.log('Creating room...');
  await page.click('button:has-text("Buat Ruangan Baru")');
  
  // Start game
  console.log('Waiting for "Mulai Cerita Sekarang!"...');
  await page.waitForSelector('button:has-text("Mulai Cerita")');
  // ensure the network resolves state so it's not disabled
  await page.waitForTimeout(3000);
  await page.click('button:has-text("Mulai Cerita")');

  // Wait for Editor
  await page.waitForURL('**/editor/**');
  console.log('In Editor!');

  // Switch to Karakter
  console.log('Clicking Karakter tab...');
  await page.click('button:has-text("Karakter")');
  
  // Add Kancil
  console.log('Adding asset...');
  await page.click('img'); // just click the first image in the tab
  
  // Wait to see if it renders
  await page.waitForTimeout(3000);
  
  console.log('Done!');
  await browser.close();
})();
