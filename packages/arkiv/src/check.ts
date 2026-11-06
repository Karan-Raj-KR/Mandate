import { arkivPublicClient, arkivWriterAccount } from "./client.js";

// Connectivity and funding check. Prints the writer address, never the key.
const client = arkivPublicClient();
console.log("block number:", await client.getBlockNumber());
const writer = arkivWriterAccount();
console.log("writer:", writer.address);
console.log("writer balance (wei):", (await client.getBalance({ address: writer.address })).toString());
