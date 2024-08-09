import WebSocket from 'ws';
import dotenv from 'dotenv';
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
      profitThresholds[mint] = await getTokenMarketCap(mint);
      tokenMarketCap[mint] = profitThresholds[mint];

      monitorToken(mint);
    }
  }
});

async function monitorToken(mint) {
  setInterval(async () => {
    try {
      const currentMarketCap = await getTokenMarketCap(mint);

      if (currentMarketCap >= tokenMarketCap[mint] * 1.25) {
        console.log("Taking profit for: " + mint);
        await sendPumpTransaction("sell", mint, "50%");
        tokenMarketCap[mint] = currentMarketCap;

        setTimeout(async () => {
          const newMarketCap = await getTokenMarketCap(mint);
          if (newMarketCap >= tokenMarketCap[mint] * 1.25) {
            console.log("Taking additional profit for: " + mint);
            await sendPumpTransaction("sell", mint, "75%");
          }
        }, 20000);
      }

      if (currentMarketCap <= tokenMarketCap[mint] * 0.9) {
        console.log("Stop loss triggered for: " + mint);
        await sendPumpTransaction("sell", mint, "100%");
      }

      const bondingCurve = await getBondingCurve(mint);
      if (bondingCurve >= bondingCurveThreshold) {
        console.log("Bonding curve threshold reached for: " + mint);
        await sendPumpTransaction("sell", mint, "75%");
      }
    } catch (error) {
      console.error("Error monitoring token:", error);
    }
  }, 5000);
}

async function getTokenMarketCap(mint) {
  try {
    const response = await fetch(`https://pump.fun/${mint}/market-cap`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}, StatusText: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.marketCap;
  } catch (error) {
    console.error("Error fetching market cap:", error);
    return 0;
  }
}

async function getBondingCurve(mint) {
  try {
    const response = await fetch(`https://pump.fun/mint/${mint}/bonding-curve`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}, StatusText: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.bondingCurve;
  } catch (error) {
    console.error("Error fetching bonding curve:", error);
    return 0;
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
