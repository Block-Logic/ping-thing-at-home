import { cliParams } from "../ping-thing-at-home-token.mjs";
import { sleep } from "./misc.mjs";

const MAX_BLOCKHASH_FETCH_ATTEMPTS =
  process.env.MAX_BLOCKHASH_FETCH_ATTEMPTS || 2;
let attempts = 0;

export const watchBlockhash = async (gBlockhash, connection) => {
  while (true) {
    try {
      // Use a 5 second timeout to avoid hanging the script
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              `${new Date().toISOString()} Blockhash fetch operation timed out`
            ),
          5000
        )
      );
      // Get the latest blockhash from the RPC node and update the global
      // blockhash object with the new value and timestamp. If the RPC node
      // fails to respond within 5 seconds, the promise will reject and the
      // script will log an error.
      gBlockhash.value = await Promise.race([
        // connection.getLatestBlockhash("finalized"),
        getLatestBlockhash("finalized"),
        timeoutPromise,
      ]);

      gBlockhash.updated_at = Date.now();
      attempts = 0;
    } catch (error) {
      gBlockhash.value = null;
      gBlockhash.updated_at = 0;

      ++attempts;

      console.log(
        `${new Date().toISOString()}  Catch block for blockhash triggered`
      );
      console.log(error);
    } finally {
      if (attempts >= MAX_BLOCKHASH_FETCH_ATTEMPTS) {
        console.log(
          `${new Date().toISOString()} ERROR: Max attempts for fetching blockhash reached, exiting`
        );
        process.exit();
      }
    }

    await sleep(5000);
  }
};

async function getLatestBlockhash(commitment) {
  const res = await fetch(cliParams.rpc, {
    method: "POST",
    body: JSON.stringify({
      method: "getLatestBlockhash",
      jsonrpc: "2.0",
      params: [
        {
          commitment,
        },
      ],
      id: "1",
    }),
    headers: {
      "content-type": "application/json",
    },
  });

  const responseJson = await res.json();

  return responseJson.result.value
}