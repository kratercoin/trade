const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');

// Replace with your actual details
const SOLSCAN_API_KEY = 'YOUR_SOLSCAN_API_KEY';
const WALLET_ADDRESS = 'YOUR_WALLET_ADDRESS';
const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const CHAT_ID = 'YOUR_TELEGRAM_CHAT_ID';
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3/coins/';

// Initialize Telegram Bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// WebSocket Connection
const ws = new WebSocket('wss://pumpportal.fun/api/data');

// Function to get wallet tokens from Solscan
const getWalletTokens = async () => {
    try {
        const response = await axios.get(`https://api.solscan.io/account/tokens?address=${WALLET_ADDRESS}`, {
            headers: {
                'Authorization': `Bearer ${SOLSCAN_API_KEY}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching wallet tokens:', error);
        return [];
    }
};

// Function to get token market cap from CoinGecko
const getTokenMarketCap = async (tokenId) => {
    try {
        const response = await axios.get(`${COINGECKO_BASE_URL}${tokenId}`);
        return response.data.market_data.market_cap.usd;
    } catch (error) {
        console.error('Error fetching token market cap:', error);
        return null;
    }
};

// Function to send a message to Telegram
const sendTelegramMessage = async (message) => {
    try {
        await bot.sendMessage(CHAT_ID, message);
    } catch (error) {
        console.error('Error sending Telegram message:', error);
    }
};

// Function to check tokens with a market cap of $75,000 USD
const checkTokenMarketCap = async () => {
    const tokens = await getWalletTokens();

    if (tokens.length > 0) {
        for (const token of tokens) {
            const tokenId = token.tokenId; // Adjust based on actual API response
            const marketCap = await getTokenMarketCap(tokenId);

            if (marketCap && marketCap >= 75000) {
                const message = `Token with ID ${tokenId} has a market cap of $${marketCap}.`;
                await sendTelegramMessage(message);
            }
        }
    }
};

// WebSocket Event Handlers
ws.on('open', function open() {
    // Subscribe to new token creation events
    ws.send(JSON.stringify({
        method: "subscribeNewToken"
    }));

    // Subscribe to trades made by specific accounts
    ws.send(JSON.stringify({
        method: "subscribeAccountTrade",
        keys: ["AArPXm8JatJiuyEffuC1un2Sc835SULa4uQqDcaGpAjV"] // Replace with actual account keys
    }));

    // Subscribe to trades on specific tokens
    ws.send(JSON.stringify({
        method: "subscribeTokenTrade",
        keys: ["91WNez8D22NwBssQbkzjy4s2ipFrzpmn5hfvWVe2aY5p"] // Replace with actual token addresses
    }));
});

// Handle incoming WebSocket messages
ws.on('message', async function message(data) {
    const parsedData = JSON.parse(data);
    console.log('Received data:', parsedData);

    // Example: Check market cap on token creation events
    if (parsedData.method === 'newToken') {
        const tokenId = parsedData.data.tokenId; // Adjust based on actual event data
        const marketCap = await getTokenMarketCap(tokenId);

        if (marketCap && marketCap >= 75000) {
            const message = `New token with ID ${tokenId} has a market cap of $${marketCap}.`;
            await sendTelegramMessage(message);
        }
    }
});

// Error and Close Handlers
ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
});

ws.on('close', function close() {
    console.log('WebSocket connection closed');
});

// Periodically check token market cap
setInterval(checkTokenMarketCap, 60000); // Adjust the interval as needed
