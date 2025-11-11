import "dotenv/config";
import { logger } from "./logger";
import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { serve } from "@hono/node-server";
import { createFacilitatorRoutes } from "@faremeter/facilitator";

import { argsFromEnv } from "./utils";
import * as solana from "./solana";
import * as soon from "./soon";
import { createFacilitatorHandler as createEVMHandler } from "@faremeter/payment-evm/exact";
import * as evmChains from "viem/chains";
import { http } from "viem";

import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["console"],
    },
    { category: "faremeter", lowestLevel: "info", sinks: ["console"] },
  ],
});

const soonTestnetHandlers =
  argsFromEnv(["ADMIN_KEYPAIR_PATH"], (...envVars) =>
    soon.createHandlers("soon-testnet", ...envVars),
  ) ?? [];

const soonMainnetHandlers =
  argsFromEnv(["ADMIN_KEYPAIR_PATH"], (...envVars) =>
    soon.createHandlers("soon-mainnet", ...envVars),
  ) ?? []; 

const solanaDevHandlers =
  argsFromEnv(["ADMIN_KEYPAIR_PATH"], (...envVars) =>
    solana.createHandlers("devnet", ...envVars),
  ) ?? [];

const solanaMainnetHandlers =
  argsFromEnv(["ADMIN_KEYPAIR_PATH"], (...envVars) =>
    solana.createHandlers("mainnet-beta", ...envVars),
  ) ?? [];  

const baseSepoliaHandlers =
  (await argsFromEnv(["BASE_SEPOLIA_PRIVATE_KEY"], async (privateKey) => {
    // Support custom RPC URL via environment variable
    const ethRpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
    console.log("ethRpcUrl for baseSepolia:", ethRpcUrl);
    return [
      await createEVMHandler(
        evmChains.baseSepolia,
        privateKey,
        "USDC",
        ethRpcUrl ? { transport: http(ethRpcUrl) } : {},
      ),
    ];
  })) ?? [];

const baseHandlers =
  (await argsFromEnv(["BASE_PRIVATE_KEY"], async (privateKey) => {
    // Support custom RPC URL via environment variable
    const ethRpcUrl = process.env.BASE_RPC_URL;
    console.log("ethRpcUrl for base:", ethRpcUrl);
    return [
      await createEVMHandler(
        evmChains.base,
        privateKey,
        "USDC",
        ethRpcUrl ? { transport: http(ethRpcUrl) } : {},
      ),
    ];
  })) ?? [];  

const handlers = [...solanaDevHandlers, ...solanaMainnetHandlers, ...baseSepoliaHandlers, ...baseHandlers];

if (handlers.length === 0) {
  logger.error(
    "ERROR: No payment handlers configured.\n" +
      "   Set ADMIN_KEYPAIR_PATH for Solana\n" +
      "   Set EVM_PRIVATE_KEY for EVM",
  );
  process.exit(1);
}

const listenPort = process.env.PORT ? parseInt(process.env.PORT) : 4000;

const app = new Hono();
app.use(
  honoLogger((message: string, ...rest: string[]) => {
    logger.info([message, ...rest].join(" "));
  }),
);

app.route(
  "/",
  createFacilitatorRoutes({
    handlers,
    timeout: {
      getRequirements: 5000,
    },
  }),
);

serve({ fetch: app.fetch, port: listenPort }, (info) => {
  logger.info(`Facilitator server listening on port ${info.port}`);
  logger.info(`Active payment handlers: ${handlers.length}`);
  if (soonTestnetHandlers.length > 0) {
    logger.info("   - Soon Testnet (Soon-ETH & SPL Token)");
  }
  if (soonMainnetHandlers.length > 0) {
    logger.info("   - Soon Mainnet (Soon-ETH & SPL Token)");
  }
  if (solanaDevHandlers.length > 0) {
    logger.info("   - Solana Devnet(SOL & SPL Token)");
  }
  if (solanaMainnetHandlers.length > 0) {
    logger.info("   - Solana Mainnet (SOL & SPL Token)");
  }
  if (baseSepoliaHandlers.length > 0) {
    logger.info("   - EVM (Base Sepolia)");
  }
  if (baseHandlers.length > 0) {
    logger.info("   - EVM (Base)");
  }
});
