import { cliParams } from "../ping-thing-at-home-token.mjs";
import { sleep } from "./misc.mjs";

const MAX_GRPF_FETCH_ATTEMPTS = process.env.MAX_GRPF_FETCH_ATTEMPTS || 2;
let attempts = 0;

export const watchGrpf = async (
  globalPrioFeeObject,
  addressToWatch,
  percentile
) => {
  while (true) {
    try {
      // Use a 5 second timeout to avoid hanging the script
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              `${new Date().toISOString()} grpf fetch operation timed out`
            ),
          5000
        )
      );
      // Get the latest blockhash from the RPC node and update the global
      // blockhash object with the new value and timestamp. If the RPC node
      // fails to respond within 5 seconds, the promise will reject and the
      // script will log an error.
      globalPrioFeeObject.value = await Promise.race([
        getRecentPriotitizationFee(addressToWatch, percentile),
        timeoutPromise,
      ]);

      globalPrioFeeObject.updated_at = Date.now();
      attempts = 0;
    } catch (error) {
      globalPrioFeeObject.value = null;
      globalPrioFeeObject.updated_at = 0;

      ++attempts;

      console.log(
        `${new Date().toISOString()}  Catch block for blockhash triggered`
      );
      console.log(error);
    } finally {
      if (attempts >= MAX_GRPF_FETCH_ATTEMPTS) {
        console.log(
          `${new Date().toISOString()} ERROR: Max attempts for fetching blockhash reached, exiting`
        );
        process.exit();
      }
    }

    await sleep(5000);
  }
};

async function getRecentPriotitizationFee(address, percentile) {
  const res = await fetch(cliParams.rpc, {
    method: "POST",
    body: JSON.stringify({
      method: "getRecentPrioritizationFees",
      jsonrpc: "2.0",
      params: [
        [address],
        {
          percentile: percentile,
        },
      ],
      id: "1",
    }),
    headers: {
      "content-type": "application/json",
    },
  });

  const responseJson = await res.json();

  const fees = responseJson.result.map((f) => f.prioritizationFee);

  return getMedian(fees);
}

const getMedian = (list) => {
  list.sort((a, b) => a - b);

  const median =
    list.length % 2 === 0
      ? (list[list.length / 2 - 1] + list[list.length / 2]) / 2
      : list[Math.floor(list.length / 2)];

  // return microLamportsToLamports(median);
  return Math.ceil(median);
};

function microLamportsToLamports(microLamports) {
  const LAMPORTS_PER_MICRO_LAMPORT = 1_000_000;
  return Math.ceil(microLamports / LAMPORTS_PER_MICRO_LAMPORT);
}
