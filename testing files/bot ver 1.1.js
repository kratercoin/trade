//doesn't display log
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { Builder, By } from 'selenium-webdriver';
import fetch from 'node-fetch';
import chrome from 'selenium-webdriver/chrome.js';

dotenv.config();

const pumpPortalAPIKey = process.env.PUMP_PORTAL_API_KEY;
const tokenMarketCap = {};
const buyTimestamps = {};
const profitThresholds = {};
const bondingCurveThreshold = 1.5;

const ws = new WebSocket("wss://pumpportal.fun/api/data");

ws.on("open", function open() {
  const payload = {
    method: "subscribeNewToken",
  };
  ws.send(JSON.stringify(payload));
});

ws.on("message", async function message(data) {
  const tokenCreationData = JSON.parse(data);

  if (tokenCreationData.mint) {
    const mint = tokenCreationData.mint;

    if (!buyTimestamps[mint]) {
      // Buying the token
      await sendPumpTransaction("buy", mint, 0.01189);

      buyTimestamps[mint] = Date.now();
      
      // Fetch initial data using Selenium
      const { marketcap, bondingCurve } = await scrapeTokenInfo(mint);
      
      profitThresholds[mint] = marketcap;
      tokenMarketCap[mint] = marketcap;

      // Log the initial market cap and bonding curve
      console.log(`Bought Token: ${mint}`);
      console.log(`Market Cap: $${marketcap}`);
      console.log(`Bonding Curve Progress: ${bondingCurve}%\n`);

      monitorToken(mint);
    }
  }
});

async function monitorToken(mint) {
  setInterval(async () => {
    try {
      const { marketcap, bondingCurve } = await scrapeTokenInfo(mint);

      // Update token details
      if (marketcap >= tokenMarketCap[mint] * 1.25) {
        await sendPumpTransaction("sell", mint, "50%");
        tokenMarketCap[mint] = marketcap;

        // Log the updated market cap and bonding curve
        console.log(`Updated Market Cap: $${marketcap}`);
        console.log(`Updated Bonding Curve Progress: ${bondingCurve}%\n`);

        setTimeout(async () => {
          const { marketcap: newMarketCap } = await scrapeTokenInfo(mint);
          if (newMarketCap >= tokenMarketCap[mint] * 1.25) {
            await sendPumpTransaction("sell", mint, "75%");
          }
        }, 20000);
      }

      if (marketcap <= tokenMarketCap[mint] * 0.90) {
        await sendPumpTransaction("sell", mint, "100%");
      }

      if (bondingCurve >= bondingCurveThreshold) {
        await sendPumpTransaction("sell", mint, "75%");
      }
    } catch (error) {
      console.error("Error monitoring token:", error);
    }
  }, 5000);
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
    // Navigate to the token page
    await driver.get(`https://pump.fun/${contractAddress}`);
    await driver.sleep(5000); // Wait for the page to load

    const pageSource = await driver.getPageSource();

    // Extract token details
    const ticker = extractText(pageSource, 'Ticker');
    const marketcap = parseFloat(extractText(pageSource, 'Market cap').replace(/\$|,/g, ''));
    const bondingCurve = parseInt(extractText(pageSource, 'bonding curve progress').replace('%', ''));

    return { ticker, marketcap, bondingCurve };
  } catch (error) {
    console.error(`Error scraping token info: ${error}`);
    return { marketcap: 0, bondingCurve: 0 };
  } finally {
    await driver.quit();
  }
}

async function sendPumpTransaction(action, mint, amount) {
  try {
    const response = await fetch(
      `https://pumpportal.fun/api/trade?api-key=${pumpPortalAPIKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: action,
          mint: mint,
          denominatedInSol: "true",
          amount: amount,
          slippage: 15,
          priorityFee: 0.0005,
          pool: "pump",
        }),
      }
    );

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      console.error("Errors:", data.errors);
    } else {
      console.log("Transaction: https://solscan.io/tx/" + data.signature);
    }
  } catch (error) {
    console.error("Error sending transaction:", error);
  }
}

// Function to extract text between keywords in page source
const extractText = (source, keyword) => {
  const index = source.indexOf(keyword);
  if (index !== -1) {
      const start = source.indexOf(':', index) + 2;
      const end = source.indexOf('<', start);
      return source.substring(start, end).trim();
  }
  return null;
};
