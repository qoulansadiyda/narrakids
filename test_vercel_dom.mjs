import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error));

  await page.goto('https://narrakids-client.vercel.app/login');
  
  await page.evaluate(() => {
     localStorage.setItem('narrakids-token', 'dummy-test'); // Or whatever auth they use
     // Wait, if I just bypass it, it will redirect to /app!
  });
  
  await page.goto('https://narrakids-client.vercel.app/app');
  await page.waitForTimeout(2000);
  
  // Try to find the form
  const handles = await page.$$('button');
  for (let h of handles) {
      const text = await h.textContent();
      if (text.includes('Buat Ruangan Baru')) {
          await h.click();
          break;
      }
  }

  await page.waitForTimeout(2000);
  
  // Try to find Mulai Cerita
  const handles2 = await page.$$('button');
  for (let h of handles2) {
      const text = await h.textContent();
      if (text.includes('Mulai Cerita')) {
          await h.click();
          break;
      }
  }

  await page.waitForURL('**/editor/**');
  console.log('Editor reached!');
  await page.waitForTimeout(2000);

  // Click asset tab
  const tabs = await page.$$('button');
  for (let t of tabs) {
     if ((await t.textContent()).includes('Karakter')) {
         await t.click(); break;
     }
  }
  
  const imgs = await page.$$('img');
  if(imgs.length > 0) {
      console.log('Clicking image...');
      await imgs[0].click();
  }

  await page.waitForTimeout(2000);

  // Inspect the canvas state
  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
  console.log('Canvas count in DOM:', canvasCount);
  
  const fabricData = await page.evaluate(() => {
     // Fabric injects an upper-canvas and lower-canvas if properly initialized
     return Array.from(document.querySelectorAll('canvas')).map(c => ({
         id: c.id,
         className: c.className,
         width: c.width,
         height: c.height
     }));
  });
  console.log('Canvas props:', fabricData);

  await browser.close();
})();
