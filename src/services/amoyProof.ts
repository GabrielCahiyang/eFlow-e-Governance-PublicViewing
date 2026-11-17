import type {
  AmoyNetworkStatus,
  AmoyProofReport,
  DecodedChainSealEvent,
  ProofCheckStep,
  PublicCertificate,
} from "../types";
import { sha256 } from "./publicRecordService";

const SEAL_EVENT_TOPIC =
  "0x5fdffb7c82b7d0a0334dc40c9941aec08662d1587984669015c494adce3a4911";

const DEFAULT_RPC_URLS = Array.from(
  new Set(
    [
      (import.meta.env.VITE_AMOY_RPC_URL as string | undefined)?.trim(),
      "https://rpc-amoy.polygon.technology",
      "https://polygon-amoy-bor-rpc.publicnode.com",
      "https://polygon-amoy.drpc.org",
    ].filter((u): u is string => Boolean(u)),
  ),
);

const TRUSTED_REGISTRY =
  (import.meta.env.VITE_PROJECT_SEAL_REGISTRY as string | undefined)?.trim() || "";

interface RpcReceipt {
  status: string;
  to: string | null;
  from: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logs: { address: string; topics: string[]; data: string }[];
}

function word(data: string, index: number): string {
  return data.slice(2 + index * 64, 2 + (index + 1) * 64);
}

function decodeEventUri(data: string): string {
  const offset = Number(BigInt(`0x${word(data, 1)}`)) * 2;
  const length = Number(BigInt(`0x${data.slice(2 + offset, 2 + offset + 64)}`));
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 512
  ) {
    throw new Error("Invalid certificate event URI payload.");
  }
  const hex = data.slice(2 + offset + 64, 2 + offset + 64 + length * 2);
  return new TextDecoder().decode(
    new Uint8Array(hex.match(/.{2}/g)?.map((part) => parseInt(part, 16)) || []),
  );
}

export async function rpcCall(
  method: string,
  params: unknown[],
  rpcUrls = DEFAULT_RPC_URLS,
): Promise<unknown> {
  let lastError: Error | null = null;
  for (const rpcUrl of rpcUrls) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        lastError = new Error(`Polygon Amoy RPC HTTP ${response.status}`);
        continue;
      }
      const payload = (await response.json()) as {
        result?: unknown;
        error?: { message?: string };
      };
      if (payload.error) {
        lastError = new Error(payload.error.message || "Polygon Amoy RPC error");
        continue;
      }
      return payload.result;
    } catch (err) {
      lastError =
        err instanceof Error ? err : new Error("Polygon Amoy RPC connection failed");
    }
  }
  throw lastError ?? new Error("All Polygon Amoy RPC endpoints failed.");
}

export async function inspectAmoyNetwork(): Promise<AmoyNetworkStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const [chainHex, latestBlockObj, finalizedBlockObj, contractCode] = (await Promise.all([
      rpcCall("eth_chainId", []),
      rpcCall("eth_getBlockByNumber", ["latest", false]),
      rpcCall("eth_getBlockByNumber", ["finalized", false]),
      TRUSTED_REGISTRY
        ? rpcCall("eth_getCode", [TRUSTED_REGISTRY, "latest"])
        : Promise.resolve("0x"),
    ])) as [
      string,
      { number: string } | null,
      { number: string } | null,
      string,
    ];

    const chainIdDecimal = Number.parseInt(chainHex, 16);
    const latestBlock = latestBlockObj?.number
      ? Number(BigInt(latestBlockObj.number))
      : null;
    const finalizedBlock = finalizedBlockObj?.number
      ? Number(BigInt(finalizedBlockObj.number))
      : null;

    return {
      online: chainIdDecimal === 80002,
      chainIdHex: chainHex,
      chainIdDecimal: Number.isNaN(chainIdDecimal) ? null : chainIdDecimal,
      latestBlock,
      finalizedBlock,
      registryAddress: TRUSTED_REGISTRY,
      registryDeployed: typeof contractCode === "string" && contractCode.length > 2,
      rpcUrl: DEFAULT_RPC_URLS[0] ?? "",
      checkedAt,
    };
  } catch (error) {
    return {
      online: false,
      chainIdHex: "",
      chainIdDecimal: null,
      latestBlock: null,
      finalizedBlock: null,
      registryAddress: TRUSTED_REGISTRY,
      registryDeployed: false,
      rpcUrl: DEFAULT_RPC_URLS[0] ?? "",
      checkedAt,
      error: error instanceof Error ? error.message : "Could not reach Polygon Amoy RPC.",
    };
  }
}

export async function verifyCertificateOnAmoy(
  certificate: PublicCertificate,
  trustedRegistry = TRUSTED_REGISTRY,
): Promise<AmoyProofReport> {
  const steps: ProofCheckStep[] = [];
  const checkedAt = new Date().toISOString();

  try {
    if (certificate.chain_id !== 80002) {
      steps.push({
        id: "network",
        label: "Network identity (Polygon Amoy 80002)",
        status: "failed",
        detail: `Certificate specifies chain ${certificate.chain_id} instead of 80002.`,
      });
      return {
        verified: false,
        checkedAt,
        finalizedBlockNumber: null,
        txBlockNumber: null,
        confirmations: null,
        steps,
        error: "This certificate is not anchored on Polygon Amoy (Chain ID 80002).",
      };
    }

    if (!trustedRegistry) {
      throw new Error("Trusted Amoy registry contract address is not configured.");
    }

    const registryMatches =
      trustedRegistry.toLowerCase() === certificate.contract_address.toLowerCase();
    steps.push({
      id: "registry",
      label: "Trusted eFlow Registry Contract",
      status: registryMatches ? "passed" : "failed",
      detail: registryMatches
        ? `Matches verified registry ${trustedRegistry}.`
        : `Expected ${trustedRegistry}, received ${certificate.contract_address}.`,
    });
    if (!registryMatches) {
      return {
        verified: false,
        checkedAt,
        finalizedBlockNumber: null,
        txBlockNumber: null,
        confirmations: null,
        steps,
        error: "Certificate contract address does not match the trusted eFlow registry.",
      };
    }

    const [chainHex, receipt, finalizedBlock] = (await Promise.all([
      rpcCall("eth_chainId", []),
      rpcCall("eth_getTransactionReceipt", [certificate.tx_hash]),
      rpcCall("eth_getBlockByNumber", ["finalized", false]),
    ])) as [string, RpcReceipt | null, { number: string } | null];

    const rpcChainOk = chainHex.toLowerCase() === "0x13882";
    steps.push({
      id: "network",
      label: "Live Polygon Amoy RPC Chain ID",
      status: rpcChainOk ? "passed" : "failed",
      detail: rpcChainOk
        ? "RPC confirmed Chain ID 80002 (0x13882)."
        : `RPC returned unexpected chain ID ${chainHex}.`,
    });
    if (!rpcChainOk) {
      return {
        verified: false,
        checkedAt,
        finalizedBlockNumber: null,
        txBlockNumber: null,
        confirmations: null,
        steps,
        error: "The RPC node returned an unexpected chain ID.",
      };
    }

    const finalizedNum = finalizedBlock?.number
      ? Number(BigInt(finalizedBlock.number))
      : null;
    const txBlockNum = receipt?.blockNumber
      ? Number(BigInt(receipt.blockNumber))
      : null;

    if (!receipt || txBlockNum === null || finalizedNum === null) {
      steps.push({
        id: "receipt",
        label: "On-Chain Transaction Receipt",
        status: "failed",
        detail: "Transaction receipt was not found on Polygon Amoy.",
      });
      return {
        verified: false,
        checkedAt,
        finalizedBlockNumber: finalizedNum,
        txBlockNumber: txBlockNum,
        confirmations: null,
        steps,
        error: "Transaction receipt could not be found on Polygon Amoy.",
      };
    }

    const isFinal = BigInt(finalizedNum) >= BigInt(txBlockNum);
    const confirmations = Math.max(0, finalizedNum - txBlockNum);
    const block = (await rpcCall("eth_getBlockByNumber", [
      receipt.blockNumber,
      false,
    ])) as { hash: string } | null;

    const receiptMatches =
      receipt.status === "0x1" &&
      (receipt.to ?? "").toLowerCase() === certificate.contract_address.toLowerCase() &&
      receipt.from.toLowerCase() === certificate.publisher.toLowerCase() &&
      receipt.blockHash.toLowerCase() === certificate.block_hash.toLowerCase() &&
      (block?.hash ?? "").toLowerCase() === certificate.block_hash.toLowerCase() &&
      txBlockNum === certificate.block_number;

    steps.push({
      id: "receipt",
      label: "Transaction Execution & Block Hash",
      status: receiptMatches ? "passed" : "failed",
      detail: receiptMatches
        ? `Confirmed at Block #${txBlockNum.toLocaleString()} (${certificate.block_hash.slice(0, 14)}…).`
        : "Transaction receipt status, publisher, or block hash disagrees with the certificate.",
    });

    steps.push({
      id: "finality",
      label: "Polygon PoS Block Finality",
      status: isFinal ? "passed" : "failed",
      detail: isFinal
        ? `Block #${txBlockNum.toLocaleString()} is finalized (finalized head #${finalizedNum.toLocaleString()}).`
        : `Block #${txBlockNum.toLocaleString()} has not passed finalized head #${finalizedNum.toLocaleString()} yet.`,
    });

    if (!receiptMatches || !isFinal) {
      return {
        verified: false,
        checkedAt,
        finalizedBlockNumber: finalizedNum,
        txBlockNumber: txBlockNum,
        confirmations,
        steps,
        error: !isFinal
          ? "The transaction is not finalized on Polygon Amoy yet."
          : "On-chain receipt does not match this certificate.",
      };
    }

    const expectedCertTopic =
      "0x" +
      (await sha256(new TextEncoder().encode(`eflow-certificate:${certificate.id}`)));
    const expectedProjectTopic =
      "0x" +
      (await sha256(new TextEncoder().encode(`eflow-project:${certificate.project_id}`)));
    const expectedPrevious = certificate.previous_id
      ? await sha256(
          new TextEncoder().encode(`eflow-certificate:${certificate.previous_id}`),
        )
      : "0".repeat(64);

    const matchingLogs = receipt.logs.filter((log) => {
      if (log.address.toLowerCase() !== certificate.contract_address.toLowerCase()) {
        return false;
      }
      if (log.topics[0]?.toLowerCase() !== SEAL_EVENT_TOPIC) return false;
      if (log.topics[1]?.toLowerCase() !== expectedCertTopic) return false;
      if (log.topics[2]?.toLowerCase() !== expectedProjectTopic) return false;
      if (word(log.data, 0).toLowerCase() !== certificate.manifest_hash.toLowerCase()) {
        return false;
      }
      if (word(log.data, 2).toLowerCase() !== expectedPrevious.toLowerCase()) {
        return false;
      }
      if (
        `0x${word(log.data, 3).slice(24)}`.toLowerCase() !==
        certificate.publisher.toLowerCase()
      ) {
        return false;
      }
      try {
        return decodeEventUri(log.data) === certificate.archive_uri;
      } catch {
        return false;
      }
    });

    const eventOk = matchingLogs.length === 1;
    steps.push({
      id: "event",
      label: "Smart Contract Seal Event & Manifest SHA-256",
      status: eventOk ? "passed" : "failed",
      detail: eventOk
        ? "On-chain event topics, archive URI, publisher, and manifest SHA-256 match 100%."
        : "Smart contract event log did not match the certificate manifest hash and IDs.",
    });

    return {
      verified: eventOk,
      checkedAt,
      finalizedBlockNumber: finalizedNum,
      txBlockNumber: txBlockNum,
      confirmations,
      steps,
      error: eventOk
        ? undefined
        : "On-chain contract event does not match this project record.",
    };
  } catch (error) {
    return {
      verified: false,
      checkedAt,
      finalizedBlockNumber: null,
      txBlockNumber: null,
      confirmations: null,
      steps,
      error:
        error instanceof Error
          ? error.message
          : "Polygon Amoy verification could not complete.",
    };
  }
}

export async function lookupAmoyTransaction(
  txHash: string,
): Promise<DecodedChainSealEvent> {
  const normalized = txHash.trim();
  if (!/^0x[a-f0-9]{64}$/i.test(normalized)) {
    throw new Error("Enter a valid 66-character Polygon Amoy transaction hash (0x...).");
  }

  const [receipt, finalizedBlock] = (await Promise.all([
    rpcCall("eth_getTransactionReceipt", [normalized]),
    rpcCall("eth_getBlockByNumber", ["finalized", false]),
  ])) as [RpcReceipt | null, { number: string } | null];

  if (!receipt) {
    throw new Error("No transaction receipt found on Polygon Amoy for that hash.");
  }

  const blockNumber = Number(BigInt(receipt.blockNumber));
  const finalizedNumber = finalizedBlock?.number
    ? Number(BigInt(finalizedBlock.number))
    : 0;

  const contractMatch =
    Boolean(TRUSTED_REGISTRY) &&
    (receipt.to ?? "").toLowerCase() === TRUSTED_REGISTRY.toLowerCase();

  const sealLog = receipt.logs.find(
    (log) => log.topics[0]?.toLowerCase() === SEAL_EVENT_TOPIC,
  );

  let archiveUri: string | undefined;
  if (sealLog) {
    try {
      archiveUri = decodeEventUri(sealLog.data);
    } catch {
      archiveUri = undefined;
    }
  }

  return {
    txHash: receipt.transactionHash,
    blockNumber,
    blockHash: receipt.blockHash,
    from: receipt.from,
    to: receipt.to ?? "",
    statusSuccess: receipt.status === "0x1",
    isFinalized: BigInt(finalizedNumber) >= BigInt(blockNumber),
    contractMatch,
    certificateHashTopic: sealLog?.topics[1],
    projectHashTopic: sealLog?.topics[2],
    manifestHash: sealLog ? word(sealLog.data, 0) : undefined,
    previousCertificateHash: sealLog ? word(sealLog.data, 2) : undefined,
    publisherAddress: sealLog ? `0x${word(sealLog.data, 3).slice(24)}` : undefined,
    archiveUri,
  };
}
