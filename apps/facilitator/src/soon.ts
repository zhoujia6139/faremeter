import { logger } from "./logger";

import { createFacilitatorHandler as createSolanaHandler } from "@faremeter/x-solana-settlement/facilitator";
import { createFacilitatorHandler as createFacilitatorHandlerExact } from "@faremeter/payment-solana/exact";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createSolanaRpc } from "@solana/kit";
import { isKnownCluster, lookupKnownSPLToken } from "@faremeter/info/soon";
import fs from "fs";
import type { FacilitatorHandler } from "@faremeter/types/facilitator";

export function createHandlers(network: string, keypairPath: string) {
  if (!isKnownCluster(network)) {
    logger.error(`Solana network '${network}' is invalid`);
    process.exit(1);
  }

  const handlers: FacilitatorHandler[] = [];
  const adminKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8"))),
  );
  // print admin pubkey
  console.log("admin pubkey:", adminKeypair.publicKey.toBase58());
  // Support custom RPC URL via environment variable, fallback to default cluster API
  let apiUrl: string;

  if (network === "soon-mainnet") {
    apiUrl = process.env.SOON_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta");
  } else {
    apiUrl = process.env.SOON_DEVNET_RPC_URL || clusterApiUrl("devnet");
  }
  console.log("Soon apiUrl for network:", network, apiUrl);
  const connection = new Connection(apiUrl, "processed");
  const rpc = createSolanaRpc(apiUrl);

  const usdcInfo = lookupKnownSPLToken(network, "USDC");
  if (!usdcInfo) {
    throw new Error(`Couldn't look up the USDC SPL Token on ${network}`);
  }

  const mint = new PublicKey(usdcInfo.address);

  // Add Solana handlers
  handlers.push(
    // SOL
    createSolanaHandler(network, connection, adminKeypair),
    // SPL Token
    createSolanaHandler(network, connection, adminKeypair, mint),
    // SPL Token with exact scheme
    createFacilitatorHandlerExact(network, rpc, adminKeypair, mint),
  );

  logger.info(`Soon handlers configured for ${network}`);
  return handlers;
}
