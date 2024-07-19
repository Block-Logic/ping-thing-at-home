# Ping Thing at Home
Measure transaction landing latency on Solana from Home.

This is a subset of the [ping thing](https://github.com/rpcpool/ping-thing-client) repository which is used to measure Solana transaction latencies on the [Ping Thing](https://www.validators.app/ping-thing?locale=en&network=mainnet)

### CLI Options
1. `rpc`: RPC endpoint
2. `iterations`: Max iters to do, default 100
3. `resultFileName`: Result file name, default timestamp
4. `verboseOutput`: Include tx details in output
5. `privateKey`: Wallet private key

### Output
```
{
  timeStamp: '2024-07-19T17:11:45.244Z',
  endpoint: 'https://api.mainnet-beta.solana.com',
  iterations: '2',
  median: 2689,
  p90: 3001,
  successfulTxsCount: 2,
  failedTxsCount: 0,
  verboseLog: [
    {
      time: 3001,
      signature: 'XnPrrN4Rn88kxenYYRz78NSmrPY3rfVaUNCAYeX7HZuRHX16e7iwnmDAQS4o3BNkWJVigt4FCB7UZ1skt8uAEJG',
      transaction_type: 'transfer',
      success: true,
      application: 'web3',
      commitment_level: 'confirmed',
      slot_sent: 278476919,
      slot_landed: 278476924
    },
    {
      time: 2377,
      signature: '4iv4Gn6v5531TDs2RcyqAj7yNFFG46A7eDHEhGDzrRJ543AznVrZUhsTXp5sh5vZs5sT88VGebeg1SFyJK6GgqhM',
      transaction_type: 'transfer',
      success: true,
      application: 'web3',
      commitment_level: 'confirmed',
      slot_sent: 278476948,
      slot_landed: 278476952
    }
  ]
}
```