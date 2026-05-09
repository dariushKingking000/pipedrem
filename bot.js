const puppeteer = require("puppeteer");
const fs = require("fs");
const { execSync } = require("child_process");

let browser = null;
let page = null;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function reconnectPage() {
  try {
    await page.bringToFront();
    await page.evaluate(() => true);
    return true;
  } catch(e) {
    console.log("🔄 Reconnecting page...");
    if (page) await page.close().catch(() => {});
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await wait(1000);
    return true;
  }
}

async function initBrowser() {
  console.log("🚀 راه‌اندازی...");
  browser = await puppeteer.launch({
    headless: false,
    executablePath: '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
      '--no-first-run','--no-service-autorun',
      '--password-store=basic','--window-size=1920,1080',
      '--disable-web-security','--disable-features=VizDisplayCompositor'
    ]
  });
  
  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto("https://pipedream.com/auth/signup", { waitUntil: 'networkidle0', timeout: 60000 });
  await wait(5000);
  console.log("✅ آماده!");
}

async function takeScreenshot() {
  console.log("📸 Screenshot...");
  await reconnectPage();
  await page.screenshot({ path: 'screenshot.png', type: 'png' });
  await page.screenshot({ path: 'screenshot-full.png', fullPage: true, type: 'png' });
  const buffer = await page.screenshot({ type: 'png' });
  fs.writeFileSync("screenshot-base64.txt", buffer.toString('base64'));
}

async function executeCommand(cmd) {
  console.log(`🔧 ${cmd}`);
  await reconnectPage();
  
  if (cmd.startsWith("click ")) {
    const [x, y] = cmd.slice(6).trim().split(",").map(Number);
    await page.mouse.click(x, y);
  } else if (cmd.startsWith("type ")) {
    const text = cmd.slice(5).trim();
    await page.keyboard.type(text);
  } else if (cmd === "enter") {
    await page.keyboard.press('Enter');
  } else if (cmd === "copy") {
    const text = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync('page-text.txt', text);
    console.log("✅ Copy OK!");
  }
}

async function recordVideo(commands) {
  console.log("🎥 Video...");
  const uniqueId = Date.now();
  
  await reconnectPage();
  
  if (fs.existsSync('frames')) fs.rmSync('frames', { recursive: true });
  fs.mkdirSync('frames');
  
  let frame = 0;
  for(let cmd of commands) {
    // 3 pre frames
    for(let i = 0; i < 3; i++) {
      await reconnectPage();
      await page.screenshot({ path: `frames/f${frame.toString().padStart(5,'0')}.png` });
      frame++;
      await wait(500);
    }
    
    await executeCommand(cmd);
    
    // 7 post frames
    for(let i = 0; i < 7; i++) {
      await reconnectPage();
      await page.screenshot({ path: `frames/f${frame.toString().padStart(5,'0')}.png` });
      frame++;
      await wait(500);
    }
  }
  
  await takeScreenshot();
  
  const video = `video_${uniqueId}.mp4`;
  execSync(`ffmpeg -y -r 12 -i frames/f%05d.png -c:v libx264 -crf 23 -pix_fmt yuv420p ${video}`);
  console.log(`✅ Video: ${fs.statSync(video).size/1024/1024}MB`);
  
  fs.rmSync('frames', { recursive: true });
}

(async () => {
  await initBrowser();
  while(true) {
    if (fs.existsSync('command_pipe.txt')) {
      let cmd = fs.readFileSync('command_pipe.txt', 'utf8').trim();
      console.log(`🆕 ${cmd}`);
      
      if (cmd === "exit") process.exit(0);
      
      let commands = cmd.split('\n').map(l=>l.trim()).filter(l=>l);
      await recordVideo(commands);
      fs.writeFileSync('response.txt', `✅ ${commands.length} OK`);
      fs.unlinkSync('command_pipe.txt');
    }
    await wait(500);
  }
})();
