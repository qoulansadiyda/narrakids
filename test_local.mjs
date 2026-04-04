import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error));

  console.log('Navigating...');
  await page.goto('http://localhost:3000/app');
  
  // Wait for redirect to login or app
  try {
    await page.waitForTimeout(2000);
    // Fill login if needed
    console.log('Logging in...');
    await page.fill('input[placeholder*="Nama"]', 'tester_local');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Masuk Akun")');
  } catch (e) { console.log('Login skip'); }

  await page.waitForURL('**/app', { timeout: 10000 });

  // Create room
  console.log('Creating room...');
  await page.click('button:has-text("Buat Ruangan Baru")');
  
  // Start game
  console.log('Waiting for "Mulai Cerita Sekarang!"...');
  await page.waitForSelector('button:has-text("Mulai Cerita")');
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Mulai Cerita")');

  // Wait for Editor
  await page.waitForURL('**/editor/**');
  console.log('In Editor!');

  await page.waitForTimeout(1000);
  // Switch to Karakter
  console.log('Clicking Karakter tab...');
  await page.click('button:has-text("Karakter")');
  
  // Add Kancil
  console.log('Adding asset...');
  await page.click('img');
  
  // Wait to see if it renders
  await page.waitForTimeout(3000);

  await browser.close();
  console.log('Done test');
})();
