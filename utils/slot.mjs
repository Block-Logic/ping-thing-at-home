import { sleep } from "./misc.mjs";

const MAX_SLOT_FETCH_ATTEMPTS = process.env.MAX_SLOT_FETCH_ATTEMPTS || 20;
let attempts = 0;

export const watchSlotSent = async (gSlotSent, connection) => {
  while (true) {
    try {
      const subscriptionId = connection.onSlotUpdate((value) => {
        if (value.type === "firstShredReceived") {
          gSlotSent.value = value.slot;
          gSlotSent.updated_at = Date.now();
          attempts = 0;
        }
      });

      // do not re-subscribe before first update, max 60s
      const started_at = Date.now();
      while (gSlotSent.value === null && Date.now() - started_at < 2000) {
        await sleep(1);
      }

      // If update not received in last 3s, re-subscribe
      if (gSlotSent.value !== null) {
        while (Date.now() - gSlotSent.updated_at < 3000) {
          await sleep(1);
        }
      }

      await connection.removeSlotUpdateListener(subscriptionId);
      gSlotSent.value = null;
      gSlotSent.updated_at = 0;

      ++attempts;

      if (attempts >= MAX_SLOT_FETCH_ATTEMPTS) {
        console.log(
          `${new Date().toISOString()} ERROR: Max attempts for fetching slot type "firstShredReceived" reached, exiting`
        );
        process.exit(0);
      }
    } catch (e) {
      console.log(`${new Date().toISOString()} ERROR: ${e}`);
      ++attempts;
    }
  }
};

// Calculate latencies for each slot
export function calculateLatencies(slotSent, slotLanded) {
  if (slotSent.length !== slotLanded.length) {
    throw new Error("The number of sent and landed slots must be the same");
  }

  return slotSent.map((sent, index) => slotLanded[index] - sent);
}

// Calculate median of an array
function calculateMedian(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

// Calculate average of an array
function calculateAverage(arr) {
  return arr.reduce((sum, value) => sum + value, 0) / arr.length;
}

// Calculate median and average latency
export function calculateMedianAndAverageLatency(latencies) {
  if (latencies.length === 0) {
    return [null, null];
  }

  const medianLatency = Math.floor(calculateMedian(latencies));
  const averageLatency = Math.floor(calculateAverage(latencies));

  return {medianLatency, averageLatency};
}
