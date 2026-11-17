export interface ArchiveFile {
  section: string;
  record_id: string;
  name: string;
  mime_type: string;
  sha256: string;
  size: number;
  path: string;
  publication_copy_of?: string;
  publication_copy_note?: string;
}

export interface ArchiveManifest {
  schema_version: 1;
  snapshot_id: string;
  project_id: string;
  version: number;
  prepared_at: string;
  source_hash: string;
  previous_certificate: string | null;
  correction_note?: string | null;
  records: Record<string, unknown>;
  files: ArchiveFile[];
}

export interface PublicCertificate {
  id: string;
  project_id: string;
  version: number;
  title: string;
  manifest_hash: string;
  archive_uri: string;
  storage_kind: string;
  chain_id: number;
  contract_address: string;
  tx_hash: string;
  block_number: number;
  block_hash: string;
  publisher: string;
  sealed_at: string;
  previous_id: string | null;
}

export interface ProofCheckStep {
  id: string;
  label: string;
  status: "passed" | "failed";
  detail: string;
}

export interface AmoyProofReport {
  verified: boolean;
  checkedAt: string;
  finalizedBlockNumber: number | null;
  txBlockNumber: number | null;
  confirmations: number | null;
  steps: ProofCheckStep[];
  error?: string;
}

export interface AmoyNetworkStatus {
  online: boolean;
  chainIdHex: string;
  chainIdDecimal: number | null;
  latestBlock: number | null;
  finalizedBlock: number | null;
  registryAddress: string;
  registryDeployed: boolean;
  rpcUrl: string;
  checkedAt: string;
  error?: string;
}

export interface DecodedChainSealEvent {
  txHash: string;
  blockNumber: number;
  blockHash: string;
  from: string;
  to: string;
  statusSuccess: boolean;
  isFinalized: boolean;
  contractMatch: boolean;
  certificateHashTopic?: string;
  projectHashTopic?: string;
  manifestHash?: string;
  previousCertificateHash?: string;
  publisherAddress?: string;
  archiveUri?: string;
}
