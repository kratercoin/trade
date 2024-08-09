import pkg from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const { Builder } = pkg;

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

// Function to scrape token information
const scrapeTokenInfo = async (contractAddress) => {
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
        console.error(`Error scraping token info: ${error}`);
        return null;
    } finally {
        await driver.quit();
    }
};

// Function to start scraping at intervals
const startScraping = (contractAddress, interval = 10000) => {
    setInterval(async () => {
        const info = await scrapeTokenInfo(contractAddress);
        if (info) {
            console.log('Token Info:', info);
        } else {
            console.log('Failed to scrape token information.');
        }
    }, interval);
};

// Example usage
const contractAddress = 'SUHZpzGG8r7tj1Ce6UchEzoZiKHN97cwSveM2oypump';
startScraping(contractAddress, 10000); // Scrape every 10 seconds
