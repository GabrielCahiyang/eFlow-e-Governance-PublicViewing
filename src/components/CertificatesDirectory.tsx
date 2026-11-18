import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
} from "lucide-react";
import { verifyCertificateOnAmoy } from "../services/amoyProof";
import { loadPublicArchive } from "../services/publicRecordService";
import type { PublicCertificate } from "../types";
import {
  formatDateTime,
  polygonScanTxUrl,
  shortenHash,
} from "../utils/formatters";

const PAGE_SIZE = 8;

type RecordIntegrity = "checking" | "authentic" | "altered" | "unavailable";

async function checkCertificateAuthenticity(
  cert: PublicCertificate,
): Promise<RecordIntegrity> {
  try {
    const [, proof] = await Promise.all([
      loadPublicArchive(cert),
      verifyCertificateOnAmoy(cert),
    ]);
    if (proof.verified) return "authentic";
    const hasFailedStep = proof.steps.some((step) => step.status === "failed");
    if (hasFailedStep || cert.chain_id !== 80002) return "altered";
    return "unavailable";
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/fingerprint|metadata does not match|does not match|integrity/i.test(message)) {
      return "altered";
    }
    return "unavailable";
  }
}

function pageRange(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) pages.push("ellipsis");
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < totalPages - 1) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

export function CertificatesDirectory({
  certificates,
  loading,
  error,
  onSelectCertificate,
}: {
  certificates: PublicCertificate[];
  loading: boolean;
  error: string;
  onSelectCertificate: (certificateId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [integrityById, setIntegrityById] = useState<
    Record<string, RecordIntegrity>
  >({});
  const checkedKeysRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const latestByProject = useMemo(() => {
    const map = new Map<string, PublicCertificate>();
    for (const cert of certificates) {
      const existing = map.get(cert.project_id);
      if (!existing || cert.version > existing.version) {
        map.set(cert.project_id, cert);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.sealed_at).getTime() - new Date(a.sealed_at).getTime(),
    );
  }, [certificates]);

  const visibleCertificates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return latestByProject;
    return latestByProject.filter((cert) =>
      [
        cert.title,
        cert.id,
        cert.tx_hash,
        cert.manifest_hash,
        String(cert.block_number),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [latestByProject, query]);

  const totalPages = Math.max(1, Math.ceil(visibleCertificates.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedCertificates = visibleCertificates.slice(
    startIndex,
    startIndex + PAGE_SIZE,
  );
  const showingFrom = visibleCertificates.length === 0 ? 0 : startIndex + 1;
  const showingTo = startIndex + pagedCertificates.length;

  useEffect(() => {
    const pending = pagedCertificates.filter((cert) => {
      const key = `${cert.id}:${cert.manifest_hash}:${cert.tx_hash}`;
      if (checkedKeysRef.current.has(key)) return false;
      checkedKeysRef.current.add(key);
      return true;
    });
    if (pending.length === 0) return;

    setIntegrityById((prev) => {
      const next = { ...prev };
      for (const cert of pending) {
        next[cert.id] = "checking";
      }
      return next;
    });

    for (const cert of pending) {
      void checkCertificateAuthenticity(cert).then((status) => {
        if (!mountedRef.current) return;
        setIntegrityById((prev) => ({ ...prev, [cert.id]: status }));
      });
    }
  }, [pagedCertificates]);

  return (
    <section
      id="registry"
      className="registry-section"
      aria-labelledby="registry-heading"
    >
      <div className="surface-card registry-card">
        <div className="workspace-card-header">
          <div>
            <span className="workspace-office-label">LGU Ormoc City</span>
            <h1 id="registry-heading">Sealed Project Registry</h1>
          </div>
          <span className="toolbar-count tabular-nums">
            {visibleCertificates.length}{" "}
            {visibleCertificates.length === 1 ? "record" : "records"}
          </span>
        </div>

        <div className="toolbar-row">
          <div className="search-box">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              className="search-input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search sealed projects, blocks, or transaction hashes…"
              aria-label="Search sealed projects"
            />
          </div>
        </div>

        {error && (
          <div className="alert-box is-danger" style={{ margin: "16px" }} role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="empty-state" role="status">
            <p>Loading sealed projects…</p>
          </div>
        ) : visibleCertificates.length === 0 ? (
          <div className="empty-state">
            <h3>
              {certificates.length === 0
                ? "No sealed projects yet"
                : "No matching projects"}
            </h3>
            <p>
              {certificates.length === 0
                ? "Projects sealed onto the Blockchain appear here."
                : "Try a different project title, block number, or transaction hash."}
            </p>
          </div>
        ) : (
          <>
            <div className="ledger-table-wrap">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Authenticity</th>
                    <th>Sealed</th>
                    <th>Transaction</th>
                    <th style={{ textAlign: "right" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCertificates.map((cert) => {
                    const integrity = integrityById[cert.id] ?? "checking";
                    return (
                      <tr key={cert.id}>
                        <td>
                          <strong className="ledger-project-title">
                            {cert.title}
                          </strong>
                        </td>
                        <td>
                          {integrity === "authentic" ? (
                            <span
                              className="status-tag status-tag--positive"
                              title="Matches the original sealed record with no changes detected"
                            >
                              <CheckCircle2 size={13} aria-hidden="true" />
                              Original · Unchanged
                            </span>
                          ) : integrity === "altered" ? (
                            <span
                              className="status-tag status-tag--danger"
                              title="Record contents or proof no longer match the original sealed record"
                            >
                              <AlertTriangle size={13} aria-hidden="true" />
                              Modified · Mismatch
                            </span>
                          ) : integrity === "unavailable" ? (
                            <span
                              className="status-tag"
                              title="Live verification check could not connect right now"
                            >
                              Check unavailable
                            </span>
                          ) : (
                            <span className="status-tag">Checking…</span>
                          )}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {formatDateTime(cert.sealed_at)}
                        </td>
                        <td>
                          <a
                            className="chain-link mono"
                            href={polygonScanTxUrl(cert.tx_hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "12px" }}
                          >
                            {shortenHash(cert.tx_hash, 10, 8)}
                            <ExternalLink size={11} aria-hidden="true" />
                          </a>
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => onSelectCertificate(cert.id)}
                          >
                            View
                            <ArrowRight size={14} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <nav className="pager-bar" aria-label="Registry pagination">
              <span className="pager-summary tabular-nums">
                Showing {showingFrom}–{showingTo} of{" "}
                {visibleCertificates.length} sealed{" "}
                {visibleCertificates.length === 1 ? "project" : "projects"}
              </span>

              <div className="pager-controls">
                <button
                  type="button"
                  className="pager-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} aria-hidden="true" />
                  <span>Previous</span>
                </button>

                <div className="pager-pages">
                  {pageRange(currentPage, totalPages).map((item, idx) =>
                    item === "ellipsis" ? (
                      <span key={`e-${idx}`} className="pager-ellipsis">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={`pager-page-btn tabular-nums ${
                          item === currentPage ? "is-current" : ""
                        }`}
                        aria-current={item === currentPage ? "page" : undefined}
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>

                <button
                  type="button"
                  className="pager-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  aria-label="Next page"
                >
                  <span>Next</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            </nav>
          </>
        )}
      </div>
    </section>
  );
}
