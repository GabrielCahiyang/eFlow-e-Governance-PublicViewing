import { createClient } from "@supabase/supabase-js";
import type { ArchiveManifest, PublicCertificate } from "../types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Read-only sessionless client for public transparency endpoints. */
const publicReader = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeFileSha256(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  return sha256(bytes);
}

export async function listPublicCertificates(): Promise<PublicCertificate[]> {
  const { data, error } = await publicReader
    .from("project_seal_certificates")
    .select("*")
    .order("sealed_at", { ascending: false })
    .order("version", { ascending: false });

  if (error) {
    throw new Error("Could not load public blockchain certificates.");
  }
  return (data ?? []) as PublicCertificate[];
}

export function subscribeToPublicCertificates(onChange: () => void): () => void {
  const channel = publicReader
    .channel("eflow-public-certificates")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "project_seal_certificates",
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void publicReader.removeChannel(channel);
  };
}

export async function loadPublicCertificate(id: string): Promise<PublicCertificate> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("This certificate link is invalid.");
  }
  const { data, error } = await publicReader
    .from("project_seal_certificates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Public project records are temporarily unavailable.");
  if (!data) throw new Error("No confirmed public certificate exists at this address.");
  return data as PublicCertificate;
}

export async function loadProjectCertificateVersions(
  projectId: string,
): Promise<PublicCertificate[]> {
  const { data, error } = await publicReader
    .from("project_seal_certificates")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false });

  if (error) return [];
  return (data ?? []) as PublicCertificate[];
}

export function archiveAddress(uri: string): string {
  if (/^ipfs:\/\/[a-zA-Z0-9]+\/manifest\.json$/.test(uri)) {
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  }
  const url = new URL(uri);
  const source = new URL(SUPABASE_URL);
  if (
    url.origin !== source.origin ||
    !/^\/storage\/v1\/object\/public\/project-seal-public\/[a-f0-9]{64}\/manifest\.json$/.test(
      url.pathname,
    ) ||
    url.search ||
    url.hash
  ) {
    throw new Error("The archive storage address is invalid.");
  }
  return url.href;
}

export async function loadPublicArchive(
  certificate: PublicCertificate,
): Promise<{ manifest: ArchiveManifest; text: string; url: string }> {
  const url = archiveAddress(certificate.archive_uri);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(
      "The public archive could not be loaded. Its blockchain fingerprint remains recorded.",
    );
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 20 * 1024 * 1024) {
    throw new Error("The public archive exceeds the 20 MB browser limit.");
  }
  if ((await sha256(bytes)) !== certificate.manifest_hash) {
    throw new Error(
      "The archive does not match its published SHA-256 fingerprint. Do not rely on this copy.",
    );
  }
  const text = new TextDecoder().decode(bytes);
  const manifest = JSON.parse(text) as ArchiveManifest;
  if (
    manifest.schema_version !== 1 ||
    manifest.snapshot_id !== certificate.id ||
    manifest.project_id !== certificate.project_id ||
    !Array.isArray(manifest.files) ||
    !manifest.records
  ) {
    throw new Error("The archive metadata does not match this certificate.");
  }
  return { manifest, text, url };
}

export async function downloadVerifiedFile(
  archiveUrl: string,
  path: string,
  expectedSha256: string,
  fileName: string,
  mimeType = "application/octet-stream",
): Promise<void> {
  if (!/^files\/[a-f0-9]{64}$/.test(path) || path !== `files/${expectedSha256}`) {
    throw new Error("This evidence file path is invalid.");
  }
  const response = await fetch(new URL(path, archiveUrl), {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error("This project evidence file is unavailable.");
  }
  const bytes = await response.arrayBuffer();
  const actualHash = await sha256(bytes);
  if (actualHash !== expectedSha256) {
    throw new Error(
      "Integrity check failed: downloaded bytes do not match the published SHA-256 hash.",
    );
  }
  saveBlob(new Blob([bytes], { type: mimeType || "application/octet-stream" }), fileName);
}

export function saveBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}
