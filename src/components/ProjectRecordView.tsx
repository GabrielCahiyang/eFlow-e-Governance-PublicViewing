import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  History,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { verifyCertificateOnAmoy } from "../services/amoyProof";
import {
  downloadVerifiedFile,
  loadProjectCertificateVersions,
  loadPublicArchive,
  loadPublicCertificate,
  saveBlob,
} from "../services/publicRecordService";
import type { AmoyProofReport, ArchiveManifest, PublicCertificate } from "../types";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  peso,
  polygonScanAddressUrl,
  polygonScanBlockUrl,
  polygonScanTxUrl,
  sectionLabel,
  shortenHash,
} from "../utils/formatters";

type DetailTab = "tasks" | "overview" | "finances" | "files" | "audit";

type RowRecord = Record<string, unknown>;

function asArray(records: Record<string, unknown>, key: string): RowRecord[] {
  const val = records[key];
  return Array.isArray(val) ? (val as RowRecord[]) : [];
}

function asObject(records: Record<string, unknown>, key: string): RowRecord {
  const val = records[key];
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as RowRecord)
    : {};
}

function money(value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? peso.format(num) : "—";
}

function textVal(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function ProjectRecordView({
  certificateId,
  onBack,
  onOpenCertificate,
}: {
  certificateId: string;
  onBack: () => void;
  onOpenCertificate: (id: string) => void;
}) {
  const [certificate, setCertificate] = useState<PublicCertificate | null>(null);
  const [versions, setVersions] = useState<PublicCertificate[]>([]);
  const [archive, setArchive] = useState<{
    manifest: ArchiveManifest;
    text: string;
    url: string;
  } | null>(null);
  const [proof, setProof] = useState<AmoyProofReport | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("tasks");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setFileError("");
    setProof(null);
    setProofOpen(false);
    setArchive(null);
    setCertificate(null);

    void loadPublicCertificate(certificateId)
      .then(async (cert) => {
        if (!active) return;
        setCertificate(cert);
        void loadProjectCertificateVersions(cert.project_id).then((list) => {
          if (active) setVersions(list);
        });

        setVerifying(true);
        void verifyCertificateOnAmoy(cert)
          .then((report) => {
            if (active) setProof(report);
          })
          .finally(() => {
            if (active) setVerifying(false);
          });

        const loadedArchive = await loadPublicArchive(cert);
        if (active) setArchive(loadedArchive);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load public record.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [certificateId]);

  const rerunAmoyVerification = () => {
    if (!certificate || verifying) return;
    setVerifying(true);
    void verifyCertificateOnAmoy(certificate)
      .then((report) => setProof(report))
      .finally(() => setVerifying(false));
  };

  const records = useMemo(() => archive?.manifest.records ?? {}, [archive]);
  const project = useMemo(() => asObject(records, "project"), [records]);
  const office = useMemo(() => asObject(records, "office"), [records]);
  const offices = useMemo(() => asArray(records, "offices"), [records]);
  const members = useMemo(() => asArray(records, "members"), [records]);
  const milestones = useMemo(() => asArray(records, "milestones"), [records]);
  const tasks = useMemo(() => asArray(records, "tasks"), [records]);
  const subtasks = useMemo(() => asArray(records, "subtasks"), [records]);
  const funding = useMemo(() => asArray(records, "funding"), [records]);
  const allocations = useMemo(() => asArray(records, "allocations"), [records]);
  const cashRequests = useMemo(() => asArray(records, "cash_requests"), [records]);
  const cashReleases = useMemo(() => asArray(records, "cash_releases"), [records]);
  const liquidations = useMemo(() => asArray(records, "liquidations"), [records]);
  const receipts = useMemo(() => asArray(records, "receipts"), [records]);
  const auditEvents = useMemo(() => asArray(records, "audit"), [records]);

  const totalFunded = useMemo(
    () =>
      funding.reduce((sum, item) => {
        const val = Number(item.amount ?? item.allocated_amount ?? 0);
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0),
    [funding],
  );

  const totalReleased = useMemo(
    () =>
      cashReleases.reduce((sum, item) => {
        const val = Number(item.amount ?? 0);
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0),
    [cashReleases],
  );

  const totalLiquidated = useMemo(
    () =>
      receipts.reduce((sum, item) => {
        const val = Number(item.total_amount ?? item.amount ?? 0);
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0),
    [receipts],
  );

  const resolveOfficeLabel = (row: RowRecord): string => {
    const named = row.office_name ?? row.name;
    if (typeof named === "string" && named.trim()) return named;
    if (row.office_id && row.office_id === office.id && typeof office.name === "string") {
      return office.name;
    }
    return textVal(office.name ?? row.office_id);
  };

  return (
    <div className="record-shell">
      <div className="record-topbar">
        <button type="button" className="record-back-btn" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>All projects</span>
        </button>

        {versions.length > 1 && (
          <div className="record-versions">
            <span>
              <History size={13} aria-hidden="true" />
              Versions
            </span>
            {versions.map((ver) => (
              <button
                key={ver.id}
                type="button"
                className={`record-version-btn tabular-nums ${
                  ver.id === certificate?.id ? "is-current" : ""
                }`}
                onClick={() => onOpenCertificate(ver.id)}
              >
                v{ver.version}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="surface-card empty-state" role="status">
          <LoaderCircle size={24} className="spin-icon" />
          <p>Loading sealed project record…</p>
        </div>
      )}

      {error && (
        <div className="alert-box is-danger" role="alert">
          <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <strong>Could not load record</strong>
            <div>{error}</div>
          </div>
        </div>
      )}

      {certificate && (
        <section className="surface-card workspace-record-card">
          <header className="workspace-record-header">
            <div className="workspace-record-main">
              {archive && (
                <span className="workspace-office-label">
                  {textVal(office.name)}
                </span>
              )}

              <h1>{certificate.title}</h1>

              <div className="workspace-status-row">
                {verifying ? (
                  <span className="status-tag">Checking authenticity…</span>
                ) : error || (proof && !proof.verified) ? (
                  <span className="status-tag status-tag--danger">
                    Modified · Mismatch
                  </span>
                ) : proof?.verified && archive ? (
                  <span className="status-tag status-tag--positive">
                    Original · Unchanged
                  </span>
                ) : (
                  <span className="status-tag status-tag--teal">Public Record</span>
                )}
                <span className="status-tag tabular-nums">v{certificate.version}</span>
                {archive && (
                  <span className="status-tag">
                    {sectionLabel(textVal(project.status))}
                  </span>
                )}
              </div>

              <p className="workspace-record-meta tabular-nums">
                Sealed {formatDateTime(certificate.sealed_at)}
                {archive
                  ? ` · ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} · Funding ${money(totalFunded)}`
                  : ""}
              </p>
            </div>

            <div className="record-header-actions">
              <a
                className="btn btn-sm btn-primary"
                href={polygonScanTxUrl(certificate.tx_hash)}
                target="_blank"
                rel="noopener noreferrer"
              >
                PolygonScan
                <ExternalLink size={13} aria-hidden="true" />
              </a>

              {archive && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    saveBlob(
                      new Blob([archive.text], { type: "application/json" }),
                      `eflow-project-v${certificate.version}-${certificate.id.slice(0, 8)}.json`,
                    )
                  }
                >
                  <Download size={13} aria-hidden="true" />
                  JSON
                </button>
              )}

              <button
                type="button"
                className="btn btn-sm"
                aria-expanded={proofOpen}
                onClick={() => setProofOpen((prev) => !prev)}
              >
                <ShieldCheck size={13} aria-hidden="true" />
                <span>Proof</span>
                {proofOpen ? (
                  <ChevronUp size={13} aria-hidden="true" />
                ) : (
                  <ChevronDown size={13} aria-hidden="true" />
                )}
              </button>
            </div>
          </header>

          {archive?.manifest.correction_note && (
            <div className="alert-box is-warning" style={{ margin: "16px 24px 0" }}>
              <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>Correction Notice (Version {certificate.version})</strong>
                <div>{archive.manifest.correction_note}</div>
              </div>
            </div>
          )}

          {proofOpen && (
            <section className="record-proof-drawer" aria-label="On-chain cryptographic proof">
              <div className="proof-drawer-meta">
                <div>
                  <small>Transaction Hash</small>
                  <a
                    className="chain-link mono"
                    href={polygonScanTxUrl(certificate.tx_hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {shortenHash(certificate.tx_hash, 12, 10)}
                  </a>
                </div>
                <div>
                  <small>Finalized Block</small>
                  <a
                    className="chain-link mono tabular-nums"
                    href={polygonScanBlockUrl(certificate.block_number)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    #{certificate.block_number.toLocaleString()}
                  </a>
                </div>
                <div>
                  <small>Manifest SHA-256</small>
                  <code className="mono" title={certificate.manifest_hash}>
                    {shortenHash(certificate.manifest_hash, 12, 10)}
                  </code>
                </div>
                <div>
                  <small>Registry Contract</small>
                  <a
                    className="chain-link mono"
                    href={polygonScanAddressUrl(certificate.contract_address)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {shortenHash(certificate.contract_address, 10, 8)}
                  </a>
                </div>
                <div className="proof-drawer-reverify">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={verifying}
                    onClick={rerunAmoyVerification}
                  >
                    <RefreshCw size={12} className={verifying ? "spin-icon" : ""} aria-hidden="true" />
                    {verifying ? "Checking…" : "Re-verify"}
                  </button>
                </div>
              </div>

              {proof?.error && (
                <div className="alert-box is-danger" role="alert">
                  <span>{proof.error}</span>
                </div>
              )}

              <div className="proof-inline-checks">
                {archive ? (
                  <div className="proof-inline-row">
                    <span>
                      <strong>Manifest SHA-256</strong> matches archived JSON digest{" "}
                      <code className="mono">{shortenHash(certificate.manifest_hash, 8, 6)}</code>
                    </span>
                  </div>
                ) : error ? (
                  <div className="proof-inline-row">
                    <span>
                      <strong>Manifest SHA-256 Failed</strong> — {error}
                    </span>
                  </div>
                ) : null}
                {proof?.steps.map((step) => (
                  <div key={step.id} className="proof-inline-row">
                    <span>
                      <strong>{step.label}</strong> — {step.detail}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {archive && (
            <>
              <div className="section-tabs" role="tablist" aria-label="Sealed project sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "tasks"}
                  className={`section-tab ${activeTab === "tasks" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("tasks")}
                >
                  Main table ({tasks.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "overview"}
                  className={`section-tab ${activeTab === "overview" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("overview")}
                >
                  Overview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "finances"}
                  className={`section-tab ${activeTab === "finances" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("finances")}
                >
                  Finances
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "files"}
                  className={`section-tab ${activeTab === "files" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("files")}
                >
                  Files ({archive.manifest.files.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "audit"}
                  className={`section-tab ${activeTab === "audit" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("audit")}
                >
                  Audit Trail ({auditEvents.length})
                </button>
              </div>

              <div className="record-tab-body">
                {activeTab === "tasks" && (
                  <div className="record-tab-stack">
                    {tasks.length === 0 ? (
                      <p className="record-empty-note">
                        No tasks recorded in this sealed snapshot.
                      </p>
                    ) : (
                      <div className="ledger-table-wrap">
                        <table className="ledger-table">
                          <thead>
                            <tr>
                              <th>Task</th>
                              <th>Owner</th>
                              <th>Status</th>
                              <th>Priority</th>
                              <th>Due date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tasks.map((task, idx) => (
                              <tr key={String(task.id ?? idx)}>
                                <td>
                                  <strong className="ledger-project-title">
                                    {textVal(task.title)}
                                  </strong>
                                  {typeof task.description === "string" &&
                                    task.description.trim() && (
                                      <div className="table-subnote">
                                        {task.description}
                                      </div>
                                    )}
                                </td>
                                <td>{textVal(task.assignee_name)}</td>
                                <td>
                                  <span className="status-tag">
                                    {sectionLabel(textVal(task.status))}
                                  </span>
                                </td>
                                <td>{sectionLabel(textVal(task.priority))}</td>
                                <td className="tabular-nums">
                                  {formatDate((task.due_date ?? task.deadline) as string)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {subtasks.length > 0 && (
                      <div className="record-subtable">
                        <h3>Subtasks ({subtasks.length})</h3>
                        <div className="ledger-table-wrap">
                          <table className="ledger-table">
                            <thead>
                              <tr>
                                <th>Subtask</th>
                                <th>Assigned Member</th>
                                <th>Status</th>
                                <th style={{ textAlign: "right" }}>Budget Cap</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subtasks.map((sub, idx) => (
                                <tr key={String(sub.id ?? idx)}>
                                  <td>{textVal(sub.title)}</td>
                                  <td>{textVal(sub.assignee_name)}</td>
                                  <td>{sectionLabel(textVal(sub.status))}</td>
                                  <td
                                    className="tabular-nums"
                                    style={{ textAlign: "right" }}
                                  >
                                    {sub.budget_cap != null
                                      ? money(sub.budget_cap)
                                      : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "overview" && (
                  <div className="record-tab-stack">
                    <div className="ledger-table-wrap">
                      <table className="ledger-table">
                        <tbody>
                          <tr>
                            <th style={{ width: "220px" }}>Lead Office</th>
                            <td>{textVal(office.name)}</td>
                          </tr>
                          <tr>
                            <th>Status at Seal</th>
                            <td>{sectionLabel(textVal(project.status))}</td>
                          </tr>
                          <tr>
                            <th>Timeline</th>
                            <td className="tabular-nums">
                              {formatDate(project.start_date as string)} →{" "}
                              {formatDate(project.due_date as string)}
                            </td>
                          </tr>
                          <tr>
                            <th>Completed At</th>
                            <td className="tabular-nums">
                              {formatDateTime(project.completed_at as string)}
                            </td>
                          </tr>
                          {typeof project.description === "string" &&
                            project.description.trim() && (
                              <tr>
                                <th>Scope / Description</th>
                                <td>{project.description}</td>
                              </tr>
                            )}
                          <tr>
                            <th>Participating Offices</th>
                            <td>
                              {offices.length === 0
                                ? textVal(office.name)
                                : offices.map(resolveOfficeLabel).join(", ")}
                            </td>
                          </tr>
                          <tr>
                            <th>Project Roster ({members.length})</th>
                            <td>
                              {members.length === 0
                                ? "No member records"
                                : members
                                    .map(
                                      (m) =>
                                        `${textVal(m.full_name)} (${sectionLabel(
                                          textVal(m.role),
                                        )})`,
                                    )
                                    .join(" · ")}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {milestones.length > 0 && (
                      <div className="record-subtable">
                        <h3>Milestones ({milestones.length})</h3>
                        <div className="ledger-table-wrap">
                          <table className="ledger-table">
                            <thead>
                              <tr>
                                <th>Milestone</th>
                                <th>Target Date</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {milestones.map((m, idx) => (
                                <tr key={String(m.id ?? idx)}>
                                  <td>{textVal(m.title)}</td>
                                  <td className="tabular-nums">
                                    {formatDate(
                                      (m.due_date ?? m.target_date) as string,
                                    )}
                                  </td>
                                  <td>{sectionLabel(textVal(m.status))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "finances" && (
                  <div className="record-tab-stack">
                    <div className="record-finance-strip">
                      <div>
                        <small>Committed Funding</small>
                        <strong className="tabular-nums">{money(totalFunded)}</strong>
                      </div>
                      <div>
                        <small>Cash Released ({cashReleases.length})</small>
                        <strong className="tabular-nums">{money(totalReleased)}</strong>
                      </div>
                      <div>
                        <small>Liquidated ({receipts.length})</small>
                        <strong className="tabular-nums">{money(totalLiquidated)}</strong>
                      </div>
                      <div>
                        <small>Task Allocations</small>
                        <strong className="tabular-nums">{allocations.length}</strong>
                      </div>
                    </div>

                    {funding.length > 0 && (
                      <div className="record-subtable">
                        <h3>Budget Accounts ({funding.length})</h3>
                        <div className="ledger-table-wrap">
                          <table className="ledger-table">
                            <thead>
                              <tr>
                                <th>Account</th>
                                <th style={{ textAlign: "right" }}>Amount</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {funding.map((f, idx) => (
                                <tr key={String(f.id ?? idx)}>
                                  <td>
                                    {textVal(
                                      f.account_name ??
                                        f.section_name ??
                                        f.partition_id,
                                    )}
                                  </td>
                                  <td
                                    className="tabular-nums"
                                    style={{ textAlign: "right" }}
                                  >
                                    {money(f.amount ?? f.allocated_amount)}
                                  </td>
                                  <td>
                                    {sectionLabel(textVal(f.status ?? "active"))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {cashRequests.length > 0 && (
                      <div className="record-subtable">
                        <h3>
                          Cash Requests &amp; Liquidations ({cashRequests.length} ·{" "}
                          {liquidations.length})
                        </h3>
                        <div className="ledger-table-wrap">
                          <table className="ledger-table">
                            <thead>
                              <tr>
                                <th>Request</th>
                                <th>Purpose</th>
                                <th style={{ textAlign: "right" }}>Amount</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cashRequests.map((req, idx) => (
                                <tr key={String(req.id ?? idx)}>
                                  <td className="mono">
                                    {textVal(req.request_number ?? req.id)}
                                  </td>
                                  <td>{textVal(req.purpose)}</td>
                                  <td
                                    className="tabular-nums"
                                    style={{ textAlign: "right" }}
                                  >
                                    {money(req.amount)}
                                  </td>
                                  <td>{sectionLabel(textVal(req.status))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {receipts.length > 0 && (
                      <div className="record-subtable">
                        <h3>Verified Receipts ({receipts.length})</h3>
                        <div className="ledger-table-wrap">
                          <table className="ledger-table">
                            <thead>
                              <tr>
                                <th>Receipt No.</th>
                                <th>Vendor / Store</th>
                                <th>Date</th>
                                <th style={{ textAlign: "right" }}>Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {receipts.map((rec, idx) => (
                                <tr key={String(rec.id ?? idx)}>
                                  <td className="mono">
                                    {textVal(rec.receipt_number ?? rec.or_number)}
                                  </td>
                                  <td>
                                    {textVal(rec.vendor_name ?? rec.store_name)}
                                  </td>
                                  <td className="tabular-nums">
                                    {formatDate(
                                      (rec.receipt_date ??
                                        rec.created_at) as string,
                                    )}
                                  </td>
                                  <td
                                    className="tabular-nums"
                                    style={{ textAlign: "right" }}
                                  >
                                    {money(rec.total_amount ?? rec.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "files" && (
                  <div className="record-tab-stack">
                    {fileError && (
                      <div className="alert-box is-danger" style={{ margin: "16px" }} role="alert">
                        {fileError}
                      </div>
                    )}
                    {archive.manifest.files.length === 0 ? (
                      <p className="record-empty-note">
                        No public files or evidence attachments were included in
                        this archive.
                      </p>
                    ) : (
                      <div className="ledger-table-wrap">
                        <table className="ledger-table">
                          <thead>
                            <tr>
                              <th>File Name</th>
                              <th>Section</th>
                              <th>Size</th>
                              <th>SHA-256 Digest</th>
                              <th style={{ textAlign: "right" }}>Download</th>
                            </tr>
                          </thead>
                          <tbody>
                            {archive.manifest.files.map((file, idx) => (
                              <tr key={`${file.sha256}-${idx}`}>
                                <td>
                                  <div className="file-row-name">
                                    <FileText
                                      size={14}
                                      color="var(--brand-primary)"
                                      aria-hidden="true"
                                    />
                                    <strong>{file.name}</strong>
                                  </div>
                                  {file.publication_copy_note && (
                                    <div className="table-subnote">
                                      {file.publication_copy_note}
                                    </div>
                                  )}
                                </td>
                                <td>{sectionLabel(file.section)}</td>
                                <td className="tabular-nums">
                                  {formatBytes(file.size)}
                                </td>
                                <td
                                  className="mono"
                                  style={{ fontSize: "12px" }}
                                  title={file.sha256}
                                >
                                  {shortenHash(file.sha256, 10, 8)}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    disabled={downloadingPath === file.path}
                                    onClick={() => {
                                      setFileError("");
                                      setDownloadingPath(file.path);
                                      void downloadVerifiedFile(
                                        archive.url,
                                        file.path,
                                        file.sha256,
                                        file.name,
                                        file.mime_type,
                                      )
                                        .catch((err: unknown) =>
                                          setFileError(
                                            err instanceof Error
                                              ? err.message
                                              : "Could not download file.",
                                          ),
                                        )
                                        .finally(() => setDownloadingPath(null));
                                    }}
                                  >
                                    <Download size={12} aria-hidden="true" />
                                    {downloadingPath === file.path
                                      ? "Verifying…"
                                      : "Verify & Save"}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "audit" && (
                  <div className="record-tab-stack">
                    {auditEvents.length === 0 ? (
                      <p className="record-empty-note">
                        No audit events recorded in this snapshot.
                      </p>
                    ) : (
                      <div className="ledger-table-wrap">
                        <table className="ledger-table">
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>Action</th>
                              <th>Entity</th>
                              <th>Detail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditEvents.map((ev, idx) => (
                              <tr key={String(ev.id ?? idx)}>
                                <td
                                  className="tabular-nums"
                                  style={{ whiteSpace: "nowrap" }}
                                >
                                  {formatDateTime(ev.created_at as string)}
                                </td>
                                <td>
                                  <span className="status-tag">
                                    {textVal(ev.action)}
                                  </span>
                                </td>
                                <td>{sectionLabel(textVal(ev.entity_type))}</td>
                                <td>
                                  <div>{textVal(ev.reason)}</div>
                                  {typeof ev.actor_name === "string" &&
                                    ev.actor_name && (
                                      <div className="table-subnote">
                                        By {ev.actor_name}
                                      </div>
                                    )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
