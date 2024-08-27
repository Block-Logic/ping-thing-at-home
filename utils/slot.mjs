import { sleep } from "./misc.mjs";

export const watchSlotSent = async (gSlotSent, connection) => {
  while (true) {
    try {
      let firstShredReceivedTimer;

      const subscriptionId = connection.onSlotUpdate((value) => {
        if (value.type === "firstShredReceived") {
          gSlotSent.value = value.slot;
          gSlotSent.updated_at = Date.now();
          clearTimeout(firstShredReceivedTimer); // Clear the timer when we receive firstShredReceived
        }
      });

      const resetSubscription = async () => {
        await connection.removeSlotUpdateListener(subscriptionId);
        gSlotSent.value = null;
        gSlotSent.updated_at = 0;
      };

      // Set up a timer for 5 seconds
      firstShredReceivedTimer = setTimeout(async () => {
        console.log(
          "firstShredReceived not received in 5 seconds, redoing onSlotUpdate"
        );
        await resetSubscription();
        return; // This will cause the outer while loop to restart
      }, 5000);

      // Wait for first update, max 60s
      const started_at = Date.now();
      while (gSlotSent.value === null && Date.now() - started_at < 60000) {
        await sleep(1);
      }

      // If update received, wait until it's 3s old
      if (gSlotSent.value !== null) {
        while (Date.now() - gSlotSent.updated_at < 3000) {
          await sleep(1);
        }
      }

      clearTimeout(firstShredReceivedTimer); // Clear the timer if we've made it this far
      await resetSubscription();
    } catch (e) {
      console.log(`${new Date().toISOString()} ERROR: ${e}`);
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

  return { medianLatency, averageLatency };
}
