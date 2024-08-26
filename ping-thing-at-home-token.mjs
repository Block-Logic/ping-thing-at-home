// Sample use:
// node ping-thing-at-home.mjs

import web3 from "@solana/web3.js";
import bs58 from "bs58";
import { watchBlockhash } from "./utils/blockhash.mjs";
import {
  calculateLatencies,
  calculateMedianAndAverageLatency,
  watchSlotSent,
} from "./utils/slot.mjs";
import { sleep } from "./utils/misc.mjs";
import { parseArgs } from "util";

import { setGlobalDispatcher, Agent } from "undici";
import { writeFile } from "fs/promises";
import { watchGrpf } from "./utils/grpf.mjs";
import { PublicKey } from "@solana/web3.js";
import { createTransferInstruction } from "@solana/spl-token";

setGlobalDispatcher(
  new Agent({
    connections: 10,
  })
);

// Catch interrupts & exit
process.on("SIGINT", function () {
  console.log(`${new Date().toISOString()} Caught interrupt signal`, "\n");
  process.exit();
});

const SLEEP_MS_RPC = 2000;
const SLEEP_MS_LOOP = 8000;

const COMMITMENT_LEVEL = "confirmed";
const USE_PRIORITY_FEE = true;

const TX_RETRY_INTERVAL = 2000;
const MAX_ITERATIONS = 100;
// Run inside a loop that will exit after 3 consecutive failures
const MAX_PING_ATTEMPTS = 3;

const gBlockhash = { value: null, updated_at: 0 };
const gPriorityFees = { value: null, updated_at: 0 };

// Record new slot on `firstShredReceived`
const gSlotSent = { value: null, updated_at: 0 };

const args = process.argv;
const options = {
  rpc: {
    type: "string",
    multiple: false,
  },
  iterations: {
    type: "string",
    multiple: false,
  },
  resultFileName: {
    type: "string",
    multiple: false,
  },
  verboseOutput: {
    type: "string",
    multiple: false,
  },
  privateKey: {
    type: "string",
    multiple: false,
  },
  market: {
    type: "string",
    multiple: false,
  },
  marketLabel: {
    type: "string",
    multiple: false,
  },
  percentile: {
    type: "string",
    multiple: false,
  },
  ataSend: {
    type: "string",
    multiple: false,
  },
  ataReceive: {
    type: "string",
    multiple: false,
  },
  ataAmount: {
    type: "string",
    multiple: false,
  },
};

export const { values: cliParams } = parseArgs({
  args,
  options,
  allowPositionals: true,
});

const connection = new web3.Connection(cliParams.rpc, {
  commitment: COMMITMENT_LEVEL,
});

const USER_KEYPAIR = web3.Keypair.fromSecretKey(
  bs58.decode(cliParams.privateKey)
);

const marketToWatchForPriorityFees = cliParams.market;

const percentile = cliParams.percentile ? parseInt(cliParams.percentile) : 5000;

const ATA_SEND = new PublicKey(cliParams.ataSend);
const ATA_REC = new PublicKey(cliParams.ataReceive);
const ATA_AMT = BigInt(cliParams.ataAmount);

async function pingThing() {
  // Pre-define loop constants & variables
  const FAKE_SIGNATURE =
    "9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999";

  let tryCount = 0;

  const pingResults = [];

  let successfulTxsCount = 0;
  let failedTxsCount = 0;

  const iterations = cliParams.iterations
    ? parseInt(cliParams.iterations)
    : MAX_ITERATIONS;

  for (let i = 0; i < iterations; ++i) {
    // Sleep before the next loop
    if (i > 0) {
      await sleep(SLEEP_MS_LOOP);
    }

    let blockhash;
    let slotSent;
    let slotLanded;
    let signature;
    let txStart;
    let txSendAttempts = 1;

    // Wait fresh data
    while (true) {
      if (
        Date.now() - gBlockhash.updated_at < 10000 &&
        Date.now() - gSlotSent.updated_at < 50
      ) {
        blockhash = gBlockhash.value;
        slotSent = gSlotSent.value;
        break;
      }

      await sleep(1);
    }

    try {
      const priorityFeeMicroLamports = gPriorityFees.value;
      try {
        // Setup our transaction
        const tx = new web3.Transaction();
        if (USE_PRIORITY_FEE) {
          tx.add(
            web3.ComputeBudgetProgram.setComputeUnitLimit({
              units: 5000,
            }),
            web3.ComputeBudgetProgram.setComputeUnitPrice({
              microLamports: priorityFeeMicroLamports,
            })
          );
        }
        tx.add(
          createTransferInstruction(
            ATA_SEND,
            ATA_REC,
            USER_KEYPAIR.publicKey,
            ATA_AMT
          )
        );

        // Sign
        tx.lastValidBlockHeight = blockhash.lastValidBlockHeight;
        tx.recentBlockhash = blockhash.blockhash;
        tx.sign(USER_KEYPAIR);

        const signatureRaw = tx.signatures[0].signature;
        signature = bs58.encode(signatureRaw);

        console.log(`${new Date().toISOString()} sending: ${signature}`);

        // Send and wait confirmation (subscribe on confirmation before sending)
        const resultPromise = connection.confirmTransaction(
          {
            signature,
            blockhash: tx.recentBlockhash,
            lastValidBlockHeight: tx.lastValidBlockHeight,
          },
          COMMITMENT_LEVEL
        );

        txStart = Date.now();
        const sendTxResult = await connection.sendRawTransaction(
          tx.serialize(),
          {
            skipPreflight: true,
            maxRetries: 0,
          }
        );

        if (sendTxResult !== signature) {
          throw new Error(
            `Receive invalid signature from sendRawTransaction: ${sendTxResult}, expected ${signature}`
          );
        }

        let confirmedTransaction = null;

        while (!confirmedTransaction) {
          const resultPromise = connection.confirmTransaction(
            {
              signature,
              blockhash: tx.recentBlockhash,
              lastValidBlockHeight: tx.lastValidBlockHeight,
            },
            COMMITMENT_LEVEL
          );

          confirmedTransaction = await Promise.race([
            resultPromise,
            new Promise((resolve) =>
              setTimeout(() => {
                resolve(null);
              }, TX_RETRY_INTERVAL)
            ),
          ]);
          if (confirmedTransaction) {
            break;
          }

          console.log(
            `${new Date().toISOString()} Tx not confirmed after ${
              TX_RETRY_INTERVAL * txSendAttempts++
            }ms, resending`
          );

          await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: true,
            maxRetries: 0,
          });
        }

        if (confirmedTransaction.value.err) {
          throw new Error(
            `Transaction ${signature} failed (${JSON.stringify(
              confirmedTransaction.value
            )})`
          );
        }
      } catch (e) {
        // Log and loop if we get a bad blockhash.
        if (e.message.includes("Blockhash not found")) {
          console.log(`${new Date().toISOString()} ERROR: Blockhash not found`);
          continue;
        }

        // If the transaction expired on the chain
        if (e.name === "TransactionExpiredBlockheightExceededError") {
          console.log(
            `${new Date().toISOString()} ERROR: Blockhash expired/block height exceeded. TX failure sent to VA.`
          );
        } else {
          console.log(`${new Date().toISOString()} ERROR: ${e.name}`);
          console.log(e.message);
          console.log(e);
          console.log(JSON.stringify(e));
          continue;
        }

        signature = FAKE_SIGNATURE;
      }

      const txEnd = Date.now();
      // Sleep a little here to ensure the signature is on an RPC node.
      await sleep(SLEEP_MS_RPC);
      if (signature !== FAKE_SIGNATURE) {
        // Capture the slotLanded
        let txLanded = await connection.getTransaction(signature, {
          commitment: COMMITMENT_LEVEL,
          maxSupportedTransactionVersion: 255,
        });
        if (txLanded === null) {
          console.log(
            signature,
            `${new Date().toISOString()} ERROR: tx is not found on RPC within ${SLEEP_MS_RPC}ms. Not sending to VA.`
          );
          continue;
        }
        slotLanded = txLanded.slot;
        ++successfulTxsCount;
      } else {
        ++failedTxsCount;
      }

      // Don't consider if the slot latency is negative
      if (slotLanded < slotSent) {
        console.log(
          signature,
          `${new Date().toISOString()} ERROR: Slot ${slotLanded} < ${slotSent}. Not sending to VA.`
        );
        continue;
      }

      const resultPayload = {
        time: txEnd - txStart,
        signature,
        transaction_type: "transfer",
        success: signature !== FAKE_SIGNATURE,
        application: "web3",
        commitment_level: COMMITMENT_LEVEL,
        slot_sent: slotSent,
        slot_landed: slotLanded,
        priorityFees: priorityFeeMicroLamports,
      };

      pingResults.push(resultPayload);

      // Reset the try counter
      tryCount = 0;
    } catch (e) {
      console.log(`${new Date().toISOString()} ERROR: ${e.name}`);
      console.log(`${new Date().toISOString()} ERROR: ${e.message}`);
      if (++tryCount === MAX_PING_ATTEMPTS) throw e;
    }
  }

  const times = pingResults.map((r) => r.time);
  const slotSentList = pingResults.map((r) => r.slot_sent);
  const slotLandedList = pingResults.map((r) => r.slot_landed);

  const latencies = calculateLatencies(slotSentList, slotLandedList);
  const {
    medianLatency: medianSlotLatency,
    averageLatency: averageSlotLatency,
  } = calculateMedianAndAverageLatency(latencies);

  const { median: medianLatency, p90: p90Latency } = calculateStatistics(times);

  const timeStamp = new Date().toISOString();

  const output = {
    timeStamp,
    endpoint: cliParams.rpc,
    market: marketToWatchForPriorityFees,
    marketLabel: cliParams.marketLabel,
    feesPercentile: percentile,
    iterations: cliParams.iterations,
    medianTxLatency: medianLatency,
    p90TxLatency: p90Latency,
    medianSlotLatency,
    averageSlotLatency,
    successfulTxsCount,
    failedTxsCount,
    verboseLog:
      cliParams.verboseOutput && cliParams.verboseOutput === "true"
        ? pingResults
        : null,
  };

  // console.log(output);

  const fileName =
    cliParams.resultFileName && cliParams.resultFileName.length > 0
      ? cliParams.resultFileName
      : `${timeStamp}.json`;

  await writeFile(fileName, JSON.stringify(output));

  console.log(`Result saved to file ${fileName}`);

  process.exit(0);
}

function calculateStatistics(times) {
  times.sort((a, b) => a - b);

  const median =
    times.length % 2 === 0
      ? (times[times.length / 2 - 1] + times[times.length / 2]) / 2
      : times[Math.floor(times.length / 2)];

  const p90Index = Math.ceil(0.9 * times.length) - 1;
  const p90 = times[p90Index];

  return { median: Math.floor(median), p90: Math.floor(p90) };
}

console.log(`${new Date().toISOString()} Starting script`);
await Promise.all([
  watchBlockhash(gBlockhash, connection),
  watchSlotSent(gSlotSent, connection),
  watchGrpf(gPriorityFees, marketToWatchForPriorityFees, percentile),
  pingThing(),
]);
