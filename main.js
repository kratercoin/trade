//working code

import WebSocket from 'ws';
import dotenv from 'dotenv';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fetch from 'node-fetch';

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
      console.log("Buying: " + mint);
      await sendPumpTransaction("buy", mint, 0.01189);

      buyTimestamps[mint] = Date.now();
      
      // Fetch initial data using Selenium
      const { marketcap } = await scrapeTokenInfo(mint);
      
      profitThresholds[mint] = marketcap;
      tokenMarketCap[mint] = marketcap;

      monitorToken(mint);
    }
  }
});

async function monitorToken(mint) {
  setInterval(async () => {
    try {
      const { marketcap, bondingCurve } = await scrapeTokenInfo(mint);

      if (marketcap >= tokenMarketCap[mint] * 1.25) {
        console.log("Taking profit for: " + mint);
        await sendPumpTransaction("sell", mint, "50%");
        tokenMarketCap[mint] = marketcap;

        setTimeout(async () => {
          const { marketcap: newMarketCap } = await scrapeTokenInfo(mint);
          if (newMarketCap >= tokenMarketCap[mint] * 1.25) {
            console.log("Taking additional profit for: " + mint);
            await sendPumpTransaction("sell", mint, "75%");
          }
        }, 20000);
      }

      if (marketcap <= tokenMarketCap[mint] * 0.90) { // Updated stop-loss condition
        console.log("Stop loss triggered for: " + mint);
        await sendPumpTransaction("sell", mint, "100%");
      }

      if (bondingCurve >= bondingCurveThreshold) {
        console.log("Bonding curve threshold reached for: " + mint);
        await sendPumpTransaction("sell", mint, "75%");
      }
    } catch (error) {
      console.error("Error monitoring token:", error);
    }
  }, 5000);
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

// Updated function to scrape token information
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

        console.log(`\nTicker: ${ticker}`);
        console.log(`Market Cap: $${marketcap}`);
        console.log(`Bonding Curve Progress: ${bondingCurve}%`);

        return { ticker, marketcap, bondingCurve };
    } catch (error) {
        console.error(`Error scraping token info for ${contractAddress}:`, error);
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
    console.log(data);

    if (data.errors && data.errors.length > 0) {
      console.log("Errors:", data.errors);
    } else {
      console.log("Transaction: https://solscan.io/tx/" + data.signature);
    }
  } catch (error) {
    console.error("Error sending transaction:", error);
  }
}
