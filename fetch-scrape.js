import WebSocket from 'ws';
import dotenv from 'dotenv';
import { Builder, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

dotenv.config();

const pumpPortalAPIKey = process.env.PUMP_PORTAL_API_KEY;
const tokenMarketCap = {};
const buyTimestamps = {};
const processedTokens = new Set();
const bondingCurveThreshold = 1.5;
const scrapingInterval = 10000; // 10 seconds
const batchSize = 10; // Adjust as needed for batch processing

const ws = new WebSocket("wss://pumpportal.fun/api/data");

let tokenQueue = [];

ws.on("open", function open() {
  ws.send(JSON.stringify({ method: "subscribeNewToken" }));
});

ws.on("message", function message(data) {
  const tokenCreationData = JSON.parse(data);
  const mint = tokenCreationData.mint;

  if (mint && !processedTokens.has(mint)) {
    tokenQueue.push(mint);
    if (tokenQueue.length >= batchSize) {
      processTokens(tokenQueue.splice(0, batchSize));
    }
  }
});

async function processTokens(tokens) {
  await Promise.all(tokens.map(async (mint) => {
    processedTokens.add(mint);
    buyTimestamps[mint] = Date.now();
    
    const { marketcap, bondingCurve } = await scrapeTokenInfo(mint);
    tokenMarketCap[mint] = marketcap;

    console.log(`Bought Token: ${mint}`);
    console.log(`Market Cap: $${marketcap}`);
    console.log(`Bonding Curve Progress: ${bondingCurve}%\n`);

    monitorToken(mint);
  }));
}

function monitorToken(mint) {
  setInterval(async () => {
    try {
      const { marketcap, bondingCurve } = await scrapeTokenInfo(mint);
      if (marketcap) {
        console.log(`Market Cap: $${marketcap}`);
        console.log(`Bonding Curve Progress: ${bondingCurve}%\n`);
      }
    } catch (error) {
      console.error("Error monitoring token:", error);
    }
  }, scrapingInterval);
}

async function scrapeTokenInfo(contractAddress) {
  let options = new chrome.Options();
  options.addArguments('headless');
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');

  let driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

  try {
    await driver.get(`https://pump.fun/${contractAddress}`);
    await driver.sleep(3000); // Adjust if necessary

    const tickerElement = await driver.findElement(By.css('selector-for-ticker'));
    const marketcapElement = await driver.findElement(By.css('selector-for-marketcap'));
    const bondingCurveElement = await driver.findElement(By.css('selector-for-bonding-curve'));

    const ticker = await tickerElement.getText();
    const marketcap = parseFloat(await marketcapElement.getText().replace(/\$|,/g, ''));
    const bondingCurve = parseInt(await bondingCurveElement.getText().replace('%', ''));

    return { ticker, marketcap, bondingCurve };
  } catch (error) {
    console.error(`Error scraping token info: ${error}`);
    return { marketcap: 0, bondingCurve: 0 };
  } finally {
    await driver.quit();
  }
}
