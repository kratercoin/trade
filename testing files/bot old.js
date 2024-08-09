const WebSocket = require("ws");
const dotenv = require('dotenv');

dotenv.config();

// Use the API key from environment variables
const pumpPortalAPIKey = process.env.PUMP_PORTAL_API_KEY;

// Initialize WebSocket connection
const ws = new WebSocket("wss://pumpportal.fun/api/data");

// Handle the WebSocket connection opening
ws.on("open", function open() {
  // Subscribing to token creation events
  const payload = {
    method: "subscribeNewToken",
  };
  ws.send(JSON.stringify(payload));
});

// Handle incoming messages from the WebSocket
ws.on("message", function message(data) {
  const tokenCreationData = JSON.parse(data);
  console.log(tokenCreationData);

  if (tokenCreationData.mint) {
    console.log("Buying: " + tokenCreationData.mint);
    sendPumpTransaction("buy", tokenCreationData.mint, 0.01189).then(() => {
      // Sell after 20000 milliseconds (20 seconds)
      setTimeout(() => {
        console.log("Selling: " + tokenCreationData.mint);
        sendPumpTransaction("sell", tokenCreationData.mint, "100%");
      }, 20000);
    });
  }
});

// Function to send buy/sell transactions
async function sendPumpTransaction(action, mint, amount) {
  try {
    const fetch = (await import('node-fetch')).default;

    const response = await fetch(
      `https://pumpportal.fun/api/trade?api-key=${pumpPortalAPIKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: action, // "buy" or "sell"
          mint: mint, // contract address of the token you want to trade
          denominatedInSol: "true", // "true" if amount is amount of SOL, "false" if amount is number of tokens
          amount: amount, // amount of SOL or tokens or percent
          slippage: 15, // percent slippage allowed
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
