import WebSocket from 'ws';
import dotenv from 'dotenv';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

dotenv.config();

const subscribedTokens = new Set(); // To keep track of subscribed tokens by ticker
const tokenScrapers = new Map(); // To keep track of intervals for scraping tokens

const ws = new WebSocket("wss://pumpportal.fun/api/data");

// Function to handle WebSocket messages
ws.on("message", async function message(data) {
  const tokenCreationData = JSON.parse(data);

  if (tokenCreationData.mint) {
    const mint = tokenCreationData.mint;

    if (!subscribedTokens.has(mint)) {
      try {
        const { ticker, marketcap, bondingCurve } = await scrapeTokenInfo(mint);

        if (ticker && !subscribedTokens.has(ticker)) {
          console.log(`Subscribed new token: ${ticker} (${mint})`);

          subscribedTokens.add(ticker);

          console.log(`Scraped info for ${ticker}: Market Cap: $${marketcap}, Bonding Curve: ${bondingCurve}%`);

          // Set up periodic scraping for this token
          const intervalId = setInterval(async () => {
            try {
              const { marketcap, bondingCurve } = await scrapeTokenInfo(mint);
              console.log(`Updated info for ${ticker}: Market Cap: $${marketcap}, Bonding Curve: ${bondingCurve}%`);
            } catch (error) {
              console.error(`Error updating info for ${ticker}:`, error);
            }
          }, 20000); // 20 seconds

          tokenScrapers.set(ticker, intervalId); // Store the interval ID with ticker as key
        }
      } catch (error) {
        console.error('Error processing token:', error);
      }
    }
  }
});

// Function to keep the WebSocket connection alive
ws.on("open", function open() {
  const payload = {
    method: "subscribeNewToken",
  };
  ws.send(JSON.stringify(payload));
});

// Error handling for WebSocket
ws.on("error", function error(err) {
  console.error('WebSocket error:', err);
});

// Handling WebSocket close event
ws.on("close", function close() {
  console.log('WebSocket connection closed');
});

// Function to extract text between keywords in page source
const extractText = (source, keyword) => {
  const index = source.indexOf(keyword);
  if (index !== -1) {
    const start = source.indexOf(':', index) + 2;
    const end = source.indexOf('<', start);
    return source.substring(start, end).trim();
  }
  return ''; // Return an empty string if keyword is not found
};

// Function to scrape token information
async function scrapeTokenInfo(contractAddress) {
  let options = new chrome.Options();
  options.addArguments('headless');
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  options.addArguments('--log-level=3'); // Suppress verbose logs
  options.addArguments('--disable-gpu'); // Disable GPU acceleration

  let driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  try {
    await driver.get(`https://pump.fun/${contractAddress}`);
    await driver.sleep(3000); // Adjust sleep time if needed

    const pageSource = await driver.getPageSource();

    const ticker = extractText(pageSource, 'Ticker');
    const marketcapStr = extractText(pageSource, 'Market cap');
    const bondingCurveStr = extractText(pageSource, 'bonding curve progress');

    // Handle potential null or empty values
    const marketcap = marketcapStr ? parseFloat(marketcapStr.replace(/\$|,/g, '')) || 0 : 0;
    const bondingCurve = bondingCurveStr ? parseInt(bondingCurveStr.replace('%', '')) || 0 : 0;

    return { ticker, marketcap, bondingCurve };
  } catch (error) {
    console.error('Error scraping token info:', error);
    return { ticker: '', marketcap: 0, bondingCurve: 0 };
  } finally {
    await driver.quit();
  }
}

// Ensure exit listener is added only once
const setupExitListener = (() => {
  let added = false;
  return () => {
    if (!added) {
      process.once('exit', () => {
        tokenScrapers.forEach((intervalId) => clearInterval(intervalId));
      });
      added = true;
    }
  };
})();

setupExitListener();
