//remove duplicate entries
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { Builder, logging } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fetch from 'node-fetch';

dotenv.config();

const pumpPortalAPIKey = process.env.PUMP_PORTAL_API_KEY;
const tokenMarketCap = {};
const buyTimestamps = {};
const subscribedTokens = new Set(); // To keep track of subscribed tokens by ticker
const bondingCurveThreshold = 1.5;
const MAX_TOKENS = 10; // Set the maximum number of tokens to subscribe to
let tokenCount = 0; // Counter to track the number of subscribed tokens

const ws = new WebSocket("wss://pumpportal.fun/api/data");

// WebSocket Event Handlers
ws.on("open", function open() {
  const payload = {
    method: "subscribeNewToken",
  };
  ws.send(JSON.stringify(payload));
});

ws.on("message", async function message(data) {
  if (tokenCount >= MAX_TOKENS) return; // Stop processing if the maximum token limit is reached

  const tokenCreationData = JSON.parse(data);

  if (tokenCreationData.mint) {
    const mint = tokenCreationData.mint;

    if (!buyTimestamps[mint]) {
      // Fetch token details before buying to check for duplicates
      const { ticker, purchaseSuccessful } = await scrapeTokenInfo(mint);

      if (purchaseSuccessful && !subscribedTokens.has(ticker)) {
        console.log(`Subscribed new token: ${ticker} (${mint})`);
        await sendPumpTransaction("buy", mint, 0.01189);

        // Mark the token as subscribed
        subscribedTokens.add(ticker);
        tokenCount++; // Increment the token counter
        buyTimestamps[mint] = Date.now();

        // Start monitoring the token in parallel
        monitorToken(mint);
      } else {
        console.log(`Duplicate token detected or purchase failed, not subscribing: ${ticker}`);
      }
    }
  }
});

// Run monitorToken and scrapeTokenInfo in parallel
async function monitorToken(mint) {
  setInterval(async () => {
    try {
      // Fetch and monitor token info in parallel
      const { marketcap, bondingCurve } = await scrapeTokenInfo(mint);

      if (marketcap >= tokenMarketCap[mint] * 1.25) {
        console.log(`Taking profit for: ${mint}`);
        await sendPumpTransaction("sell", mint, "50%");
        tokenMarketCap[mint] = marketcap;

        setTimeout(async () => {
          const { marketcap: newMarketCap } = await scrapeTokenInfo(mint);
          if (newMarketCap >= tokenMarketCap[mint] * 1.25) {
            console.log(`Taking additional profit for: ${mint}`);
            await sendPumpTransaction("sell", mint, "75%");
          }
        }, 20000);
      }

      if (marketcap <= tokenMarketCap[mint] * 0.90) {
        console.log(`Stop loss triggered for: ${mint}`);
        await sendPumpTransaction("sell", mint, "100%");
      }

      if (bondingCurve >= bondingCurveThreshold) {
        console.log(`Bonding curve threshold reached for: ${mint}`);
        await sendPumpTransaction("sell", mint, "75%");
      }
    } catch (error) {
      // Optional: You can handle or log specific errors if needed
    }
  }, 5000); // Check every 5 seconds
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
  
  // Set logging preferences to suppress browser console logs
  options.setLoggingPrefs(new logging.Preferences(logging.Level.SEVERE));

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

    // Log essential information only
    console.log(`Scraped info for ${ticker}: Market Cap: $${marketcap}, Bonding Curve: ${bondingCurve}%`);

    return { ticker, marketcap, bondingCurve, purchaseSuccessful: true };
  } catch (error) {
    // Optional: Handle specific scraping errors if needed
    return { ticker: '', marketcap: 0, bondingCurve: 0, purchaseSuccessful: false };
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

    // Log essential transaction information only
    if (data.errors && data.errors.length > 0) {
      console.log("Errors:", data.errors);
    } else {
      console.log("Transaction: https://solscan.io/tx/" + data.signature);
    }
  } catch (error) {
    // Optional: Handle specific transaction errors if needed
  }
}
