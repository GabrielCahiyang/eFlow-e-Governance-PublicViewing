import { useMemo, useState } from "react";
import { ArrowRight, ExternalLink, Search } from "lucide-react";
import type { PublicCertificate } from "../types";
import {
  formatDateTime,
  polygonScanTxUrl,
  shortenHash,
} from "../utils/formatters";

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

  const visibleCertificates = useMemo(() => {
    const latestByProject = new Map<string, PublicCertificate>();
    for (const cert of certificates) {
      const existing = latestByProject.get(cert.project_id);
      if (!existing || cert.version > existing.version) {
        latestByProject.set(cert.project_id, cert);
      }
    }

    const list = Array.from(latestByProject.values()).sort(
      (a, b) =>
        new Date(b.sealed_at).getTime() - new Date(a.sealed_at).getTime(),
    );

    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((cert) =>
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
  }, [certificates, query]);

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1>Blockchain-Sealed Projects</h1>
          <p>Archived LGU projects verified and published on Polygon Amoy.</p>
        </div>
      </div>

      {error && (
        <div className="alert-box is-danger" role="alert">
          {error}
        </div>
      )}

      <section className="surface-card">
        <div className="toolbar-row">
          <div className="search-box" style={{ maxWidth: "100%" }}>
            <Search size={15} />
            <input
              type="search"
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sealed projects or transaction hashes…"
              aria-label="Search sealed projects"
            />
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <p>Loading projects…</p>
          </div>
        ) : visibleCertificates.length === 0 ? (
          <div className="empty-state">
            <h2>
              {certificates.length === 0
                ? "No sealed projects yet"
                : "No matching projects"}
            </h2>
            <p>
              {certificates.length === 0
                ? "Projects sealed onto the Blockchain appear here."
                : "Try another search term."}
            </p>
          </div>
        ) : (
          <div className="ledger-table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Version</th>
                  <th>Sealed</th>
                  <th>Transaction</th>
                  <th style={{ textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleCertificates.map((cert) => (
                  <tr key={cert.id}>
                    <td>
                      <strong style={{ display: "block", fontSize: "14px" }}>
                        {cert.title}
                      </strong>
                    </td>
                    <td className="tabular-nums">v{cert.version}</td>
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
                        <ExternalLink size={11} />
                      </a>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => onSelectCertificate(cert.id)}
                      >
                        View
                        <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
