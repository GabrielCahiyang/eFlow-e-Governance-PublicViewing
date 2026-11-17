import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  History,
  LoaderCircle,
  ShieldAlert,
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

type DetailTab = "overview" | "tasks" | "finances" | "files" | "audit";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setFileError("");
    setProof(null);
    setArchive(null);
    setCertificate(null);

    void loadPublicCertificate(certificateId)
      .then(async (cert) => {
        if (!active) return;
        setCertificate(cert);
        void loadProjectCertificateVersions(cert.project_id).then((list) => {
          if (active) setVersions(list);
        });

        // Automatically run live Polygon Amoy cryptographic verification alongside archive load
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

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <button type="button" className="btn" onClick={onBack}>
          <ArrowLeft size={14} />
          Back to Sealed Registry
        </button>

        {versions.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>
              <History size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
              Sealed versions:
            </span>
            {versions.map((ver) => (
              <button
                key={ver.id}
                type="button"
                className={`btn ${ver.id === certificate?.id ? "btn-primary" : ""}`}
                style={{ height: "30px", padding: "0 10px", fontSize: "12px" }}
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
          <LoaderCircle size={28} />
          <p>Fetching certificate, verifying archive SHA-256, and querying Polygon Amoy…</p>
        </div>
      )}

      {error && (
        <div className="alert-box is-danger" role="alert">
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <strong>Certificate / Archive Verification Issue</strong>
            <div>{error}</div>
          </div>
        </div>
      )}

      {certificate && (
        <>
          <section className="surface-card" style={{ padding: "22px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "16px",
                flexWrap: "wrap",
                marginBottom: "18px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span className="tag tag-teal">
                    <ShieldCheck size={13} />
                    Polygon Amoy · Chain {certificate.chain_id}
                  </span>
                  <span className="tag">Version {certificate.version}</span>
                  {proof && (
                    <span className={`tag ${proof.verified ? "tag-success" : "tag-danger"}`}>
                      {proof.verified ? "On-Chain Proof Verified" : "Chain Verification Failed"}
                    </span>
                  )}
                </div>
                <h1 style={{ margin: "10px 0 4px", fontSize: "24px", letterSpacing: "-0.02em" }}>
                  {certificate.title}
                </h1>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
                  Sealed {formatDateTime(certificate.sealed_at)} · Public Archive Version{" "}
                  {certificate.version}
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <a
                  className="btn btn-teal"
                  href={polygonScanTxUrl(certificate.tx_hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on PolygonScan
                  <ExternalLink size={14} />
                </a>
                {archive && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      saveBlob(
                        new Blob([archive.text], { type: "application/json" }),
                        `eflow-project-v${certificate.version}-${certificate.id.slice(0, 8)}.json`,
                      )
                    }
                  >
                    <Download size={14} />
                    Download JSON Record
                  </button>
                )}
              </div>
            </div>

            {archive?.manifest.correction_note && (
              <div className="alert-box is-warning" style={{ marginBottom: "18px" }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>Correction Notice (Version {certificate.version})</strong>
                  <div>{archive.manifest.correction_note}</div>
                </div>
              </div>
            )}

            <div className="detail-grid">
              <div className="meta-cell">
                <small>Transaction Hash</small>
                <a
                  className="chain-link mono"
                  href={polygonScanTxUrl(certificate.tx_hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shortenHash(certificate.tx_hash, 14, 12)}
                </a>
              </div>
              <div className="meta-cell">
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
              <div className="meta-cell">
                <small>Manifest SHA-256</small>
                <code title={certificate.manifest_hash}>
                  {shortenHash(certificate.manifest_hash, 14, 12)}
                </code>
              </div>
              <div className="meta-cell">
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
            </div>
          </section>

          <section className="surface-card" style={{ padding: "20px 22px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "14px",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                  Live Polygon Amoy Cryptographic Verification
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
                  Verified directly in your browser against{" "}
                  <span className="mono">https://polygon-amoy.drpc.org</span> and browser SHA-256.
                </p>
              </div>
              <button
                type="button"
                className="btn"
                disabled={verifying}
                onClick={rerunAmoyVerification}
              >
                {verifying ? "Checking Polygon Amoy…" : "Re-verify On-Chain Proof"}
              </button>
            </div>

            {proof?.error && (
              <div className="alert-box is-danger" role="alert" style={{ marginBottom: "12px" }}>
                <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>Proof verification error:</strong> {proof.error}
                </div>
              </div>
            )}

            <div className="proof-checklist">
              {archive && (
                <div className="proof-step">
                  <CheckCircle2 size={18} color="var(--success)" style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Public Archive JSON SHA-256 Integrity</strong>
                    <span>
                      Computed browser SHA-256 matches certificate manifest hash{" "}
                      <code className="mono">{shortenHash(certificate.manifest_hash, 12, 10)}</code>.
                    </span>
                  </div>
                </div>
              )}

              {proof?.steps.map((step) => (
                <div key={step.id} className="proof-step">
                  {step.status === "passed" ? (
                    <CheckCircle2 size={18} color="var(--success)" style={{ flexShrink: 0 }} />
                  ) : (
                    <ShieldAlert size={18} color="var(--danger)" style={{ flexShrink: 0 }} />
                  )}
                  <div>
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {archive && (
            <section className="surface-card">
              <div className="section-tabs" role="tablist" aria-label="Sealed project sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "overview"}
                  className={`section-tab ${activeTab === "overview" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("overview")}
                >
                  Overview &amp; Offices
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "tasks"}
                  className={`section-tab ${activeTab === "tasks" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("tasks")}
                >
                  Tasks &amp; Subtasks ({tasks.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "finances"}
                  className={`section-tab ${activeTab === "finances" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("finances")}
                >
                  Finances &amp; Receipts
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "files"}
                  className={`section-tab ${activeTab === "files" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("files")}
                >
                  Evidence &amp; Files ({archive.manifest.files.length})
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

              <div style={{ padding: "22px" }}>
                {activeTab === "overview" && (
                  <div style={{ display: "grid", gap: "20px" }}>
                    <div className="detail-grid">
                      <div className="meta-cell">
                        <small>Lead Office</small>
                        <strong>{textVal(office.name)}</strong>
                      </div>
                      <div className="meta-cell">
                        <small>Project Status at Seal</small>
                        <strong>{sectionLabel(textVal(project.status))}</strong>
                      </div>
                      <div className="meta-cell">
                        <small>Timeline</small>
                        <strong>
                          {formatDate(project.start_date as string)} →{" "}
                          {formatDate(project.due_date as string)}
                        </strong>
                      </div>
                      <div className="meta-cell">
                        <small>Completed At</small>
                        <strong>{formatDateTime(project.completed_at as string)}</strong>
                      </div>
                    </div>

                    {typeof project.description === "string" && project.description.trim() && (
                      <div className="meta-cell">
                        <small>Project Scope / Description</small>
                        <p style={{ margin: "6px 0 0", fontSize: "13px", lineHeight: 1.6 }}>
                          {project.description}
                        </p>
                      </div>
                    )}

                    {milestones.length > 0 && (
                      <div>
                        <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>Milestones</h3>
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
                                    {formatDate((m.due_date ?? m.target_date) as string)}
                                  </td>
                                  <td>{sectionLabel(textVal(m.status))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {(offices.length > 0 || members.length > 0) && (
                      <div className="detail-grid">
                        <div className="meta-cell">
                          <small>Offices Involved ({offices.length})</small>
                          <div style={{ marginTop: "8px", display: "grid", gap: "6px", fontSize: "13px" }}>
                            {offices.length === 0
                              ? textVal(office.name)
                              : offices.map((o, idx) => (
                                  <div key={String(o.id ?? idx)}>
                                    {textVal(o.office_name ?? o.name ?? o.office_id)}
                                  </div>
                                ))}
                          </div>
                        </div>
                        <div className="meta-cell">
                          <small>Project Roster ({members.length})</small>
                          <div style={{ marginTop: "8px", display: "grid", gap: "6px", fontSize: "13px" }}>
                            {members.length === 0
                              ? "No member records"
                              : members.map((m, idx) => (
                                  <div key={String(m.user_id ?? idx)}>
                                    {textVal(m.full_name)} ·{" "}
                                    <span style={{ color: "var(--text-muted)" }}>
                                      {sectionLabel(textVal(m.role))}
                                    </span>
                                  </div>
                                ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "tasks" && (
                  <div style={{ display: "grid", gap: "20px" }}>
                    <div>
                      <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>
                        Project Tasks ({tasks.length})
                      </h3>
                      {tasks.length === 0 ? (
                        <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                          No tasks recorded in this sealed snapshot.
                        </p>
                      ) : (
                        <div className="ledger-table-wrap">
                          <table className="ledger-table">
                            <thead>
                              <tr>
                                <th>Task</th>
                                <th>Task Lead</th>
                                <th>Status</th>
                                <th>Priority</th>
                                <th>Due Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tasks.map((task, idx) => (
                                <tr key={String(task.id ?? idx)}>
                                  <td>
                                    <strong>{textVal(task.title)}</strong>
                                    {typeof task.description === "string" && task.description && (
                                      <div
                                        style={{
                                          fontSize: "12px",
                                          color: "var(--text-secondary)",
                                          marginTop: "3px",
                                        }}
                                      >
                                        {task.description}
                                      </div>
                                    )}
                                  </td>
                                  <td>{textVal(task.assignee_name)}</td>
                                  <td>{sectionLabel(textVal(task.status))}</td>
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
                    </div>

                    {subtasks.length > 0 && (
                      <div>
                        <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>
                          Subtasks ({subtasks.length})
                        </h3>
                        <div className="ledger-table-wrap">
                          <table className="ledger-table">
                            <thead>
                              <tr>
                                <th>Subtask</th>
                                <th>Assigned Member</th>
                                <th>Status</th>
                                <th>Budget Cap</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subtasks.map((sub, idx) => (
                                <tr key={String(sub.id ?? idx)}>
                                  <td>{textVal(sub.title)}</td>
                                  <td>{textVal(sub.assignee_name)}</td>
                                  <td>{sectionLabel(textVal(sub.status))}</td>
                                  <td className="tabular-nums">
                                    {sub.budget_cap != null ? money(sub.budget_cap) : "—"}
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

                {activeTab === "finances" && (
                  <div style={{ display: "grid", gap: "22px" }}>
                    <div className="detail-grid">
                      <div className="meta-cell">
                        <small>Total Committed Funding</small>
                        <strong className="tabular-nums" style={{ fontSize: "18px" }}>
                          {money(totalFunded)}
                        </strong>
                      </div>
                      <div className="meta-cell">
                        <small>Cash Released ({cashReleases.length})</small>
                        <strong className="tabular-nums" style={{ fontSize: "18px" }}>
                          {money(totalReleased)}
                        </strong>
                      </div>
                      <div className="meta-cell">
                        <small>Liquidated Receipts ({receipts.length})</small>
                        <strong className="tabular-nums" style={{ fontSize: "18px" }}>
                          {money(totalLiquidated)}
                        </strong>
                      </div>
                      <div className="meta-cell">
                        <small>Task Budget Allocations</small>
                        <strong className="tabular-nums" style={{ fontSize: "18px" }}>
                          {allocations.length}
                        </strong>
                      </div>
                    </div>

                    {funding.length > 0 && (
                      <div>
                        <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>
                          Budget Account Funding ({funding.length})
                        </h3>
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
                                  <td>{textVal(f.account_name ?? f.section_name ?? f.partition_id)}</td>
                                  <td className="tabular-nums" style={{ textAlign: "right" }}>
                                    {money(f.amount ?? f.allocated_amount)}
                                  </td>
                                  <td>{sectionLabel(textVal(f.status ?? "active"))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {cashRequests.length > 0 && (
                      <div>
                        <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>
                          Cash Requests &amp; Liquidations ({cashRequests.length} requests ·{" "}
                          {liquidations.length} liquidations)
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
                                  <td className="mono">{textVal(req.request_number ?? req.id)}</td>
                                  <td>{textVal(req.purpose)}</td>
                                  <td className="tabular-nums" style={{ textAlign: "right" }}>
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
                      <div>
                        <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>
                          Verified Receipts ({receipts.length})
                        </h3>
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
                                  <td>{textVal(rec.vendor_name ?? rec.store_name)}</td>
                                  <td className="tabular-nums">
                                    {formatDate((rec.receipt_date ?? rec.created_at) as string)}
                                  </td>
                                  <td className="tabular-nums" style={{ textAlign: "right" }}>
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
                  <div style={{ display: "grid", gap: "14px" }}>
                    {fileError && (
                      <div className="alert-box is-danger" role="alert">
                        {fileError}
                      </div>
                    )}
                    {archive.manifest.files.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                        No public files or evidence attachments were included in this archive.
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
                              <th style={{ textAlign: "right" }}>Verify &amp; Save</th>
                            </tr>
                          </thead>
                          <tbody>
                            {archive.manifest.files.map((file, idx) => (
                              <tr key={`${file.sha256}-${idx}`}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                                    <FileText size={15} color="var(--brand-primary)" />
                                    <strong>{file.name}</strong>
                                  </div>
                                  {file.publication_copy_note && (
                                    <div
                                      style={{
                                        marginTop: "4px",
                                        fontSize: "12px",
                                        color: "var(--text-secondary)",
                                      }}
                                    >
                                      Publication note: {file.publication_copy_note}
                                    </div>
                                  )}
                                </td>
                                <td>{sectionLabel(file.section)}</td>
                                <td className="tabular-nums">{formatBytes(file.size)}</td>
                                <td className="mono" style={{ fontSize: "12px" }} title={file.sha256}>
                                  {shortenHash(file.sha256, 12, 10)}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    type="button"
                                    className="btn"
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
                                    <Download size={13} />
                                    {downloadingPath === file.path
                                      ? "Verifying SHA-256…"
                                      : "Verify & Download"}
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
                  <div>
                    <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>
                      Sealed Audit Events ({auditEvents.length})
                    </h3>
                    {auditEvents.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
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
                              <th>Reason / Actor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditEvents.map((ev, idx) => (
                              <tr key={String(ev.id ?? idx)}>
                                <td className="tabular-nums" style={{ whiteSpace: "nowrap" }}>
                                  {formatDateTime(ev.created_at as string)}
                                </td>
                                <td>
                                  <span className="tag">{textVal(ev.action)}</span>
                                </td>
                                <td>{sectionLabel(textVal(ev.entity_type))}</td>
                                <td>
                                  <div>{textVal(ev.reason)}</div>
                                  {typeof ev.actor_name === "string" && ev.actor_name && (
                                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
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
            </section>
          )}
        </>
      )}
    </div>
  );
}
