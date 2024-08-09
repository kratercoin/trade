import WebSocket from 'ws';
import dotenv from 'dotenv';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fetch from 'node-fetch';
import blessed from 'blessed';
import contrib from 'blessed-contrib';

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
      logMessage("Buying: " + mint);
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
        logMessage("Taking profit for: " + mint);
        await sendPumpTransaction("sell", mint, "50%");
        tokenMarketCap[mint] = marketcap;

        setTimeout(async () => {
          const { marketcap: newMarketCap } = await scrapeTokenInfo(mint);
          if (newMarketCap >= tokenMarketCap[mint] * 1.25) {
            logMessage("Taking additional profit for: " + mint);
            await sendPumpTransaction("sell", mint, "75%");
          }
        }, 20000);
      }

      if (marketcap <= tokenMarketCap[mint] * 0.90) { // Updated stop-loss condition
        logMessage("Stop loss triggered for: " + mint);
        await sendPumpTransaction("sell", mint, "100%");
      }

      if (bondingCurve >= bondingCurveThreshold) {
        logMessage("Bonding curve threshold reached for: " + mint);
        await sendPumpTransaction("sell", mint, "75%");
      }
    } catch (error) {
      logMessage("Error monitoring token: " + error.message);
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

    logMessage(`\nTicker: ${ticker}`);
    logMessage(`Market Cap: $${marketcap}`);
    logMessage(`Bonding Curve Progress: ${bondingCurve}%`);

    return { ticker, marketcap, bondingCurve };
  } catch (error) {
    logMessage(`Error scraping token info for ${contractAddress}: ` + error.message);
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
    logMessage(data);

    if (data.errors && data.errors.length > 0) {
      logMessage("Errors: " + data.errors);
    } else {
      logMessage("Transaction: https://solscan.io/tx/" + data.signature);
    }
  } catch (error) {
    logMessage("Error sending transaction: " + error.message);
  }
}

// Set up the Blessed UI
const screen = blessed.screen({
  smartCSR: true,
  title: 'Trading Bot Dashboard'
});

const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

const logBox = grid.set(6, 0, 6, 8, blessed.box, {
  label: 'Log',
  content: '',
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    inverse: true,
  },
  style: {
    fg: 'white',
    bg: 'black',
    border: {
      fg: '#f0f0f0',
    },
    scrollbar: {
      bg: 'blue',
    }
  }
});

const accountInfoBox = grid.set(0, 0, 6, 8, blessed.box, {
  label: 'Account Info',
  content: 'Account Address: \nBalance: ',
  tags: true,
  style: {
    fg: 'white',
    bg: 'black',
    border: {
      fg: '#f0f0f0',
    },
  }
});

const menuBox = grid.set(0, 8, 12, 4, blessed.box, {
  label: 'Menu',
  content: 'Press {bold}R{/bold} to reset timer\nPress {bold}C{/bold} to continue trade\nPress {bold}S{/bold} to sell 75%\nPress {bold}Enter{/bold} to donate',
  tags: true,
  style: {
    fg: 'white',
    bg: 'black',
    border: {
      fg: '#f0f0f0',
    },
  }
});

function logMessage(message) {
  logBox.setContent(`${logBox.getContent()}\n${message}`);
  logBox.setScrollPerc(100);
  screen.render();
}

function updateAccountInfo(accountAddress, balance) {
  accountInfoBox.setContent(`Account Address: ${accountAddress}\nBalance: ${balance}`);
  screen.render();
}

// Key bindings
screen.key(['r', 'R'], function() {
  logMessage("Timer reset.");
});

screen.key(['c', 'C'], function() {
  logMessage("Continuing trade.");
});

screen.key(['s', 'S'], function() {
  logMessage("Selling 75% of tokens.");
});

screen.key(['enter'], function() {
  logMessage("Thank you for your support!");
});

screen.key(['q', 'Q', 'C-c'], function() {
  return process.exit(0);
});

// Initial splash screen
const splash = blessed.box({
  parent: screen,
  top: 'center',
  left: 'center',
  width: '50%',
  height: '50%',
  content: '{center}Welcome to Trading Bot\n\nPress any key to start{/center}',
  tags: true,
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    bg: 'blue',
    border: {
      fg: '#f0f0f0',
    },
  }
});

screen.render();

screen.onceKey(['q', 'Q', 'C-c'], function() {
  return process.exit(0);
});

screen.onceKey([' '], function() {
  splash.detach();
  screen.render();
});

screen.onceKey(['r', 'R', 'c', 'C', 's', 'S', 'enter'], function() {
  splash.detach();
  screen.render();
});

// Update account info with dummy data for demonstration
updateAccountInfo('0x1234567890abcdef', '100 SOL');
