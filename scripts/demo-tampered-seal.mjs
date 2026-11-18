import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEMO_ID = "99999999-9999-4999-8999-999999999001";
const DEMO_PROJECT_ID = "99999999-9999-4999-8999-999999999002";
const CONTRACT = "0xFF690376c2CA42ce7D64a83b00Cd60723abf470B";
const PUBLISHER = "0x26AF046FE056BB05a35C6913D292b2bdb7FD6203";

function readEnvFile(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    map[key] = val;
  }
  return map;
}

const publicEnv = readEnvFile(path.resolve("C:/Users/gabri/OneDrive/Desktop/EflowPublic/.env"));
const webEnv = readEnvFile(path.resolve("C:/Users/gabri/OneDrive/Desktop/EflowWeb/.env"));

const supabaseUrl = publicEnv.VITE_SUPABASE_URL || webEnv.VITE_SUPABASE_URL;
const serviceRoleKey = webEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env files.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const originalManifest = {
  schema_version: 1,
  snapshot_id: DEMO_ID,
  project_id: DEMO_PROJECT_ID,
  version: 1,
  prepared_at: "2026-11-18T02:00:00.000Z",
  source_hash: "0".repeat(64),
  previous_certificate: null,
  records: {
    project: {
      id: DEMO_PROJECT_ID,
      title: "Ormoc Public Market Drainage Rehab",
      status: "archived",
      start_date: "2026-10-01",
      due_date: "2026-11-10",
      completed_at: "2026-11-10T08:00:00Z",
      description: "Clean and rehabilitate main drainage culverts around Ormoc Public Market.",
    },
    office: { id: "demo-office", name: "City Engineering Office" },
    offices: [{ id: "demo-office", office_name: "City Engineering Office" }],
    members: [{ user_id: "demo-lead", full_name: "Juan Dela Cruz", role: "owner" }],
    milestones: [],
    tasks: [
      {
        id: "demo-task-1",
        title: "Culvert clearing & pipe replacement",
        assignee_name: "Juan Dela Cruz",
        status: "completed",
        priority: "high",
        due_date: "2026-11-10",
      },
    ],
    subtasks: [],
    funding: [{ id: "demo-fund-1", account_name: "Drainage Maintenance Fund", amount: 250000, status: "active" }],
    allocations: [],
    cash_requests: [],
    cash_releases: [],
    liquidations: [],
    receipts: [],
    audit: [],
  },
  files: [],
};

const originalBytes = Buffer.from(JSON.stringify(originalManifest, null, 2), "utf8");
const originalHash = crypto.createHash("sha256").update(originalBytes).digest("hex");
const storagePath = `${originalHash}/manifest.json`;
const archiveUri = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/project-seal-public/${storagePath}`;

const mode = process.argv.includes("--revert") ? "revert" : "apply";

if (mode === "revert") {
  const { error: delCertErr } = await admin
    .from("project_seal_certificates")
    .delete()
    .eq("id", DEMO_ID);
  if (delCertErr) {
    console.warn("Note: run in SQL editor to delete certificate row:", `delete from public.project_seal_certificates where id = '${DEMO_ID}';`);
  }

  const { error: delFileErr } = await admin.storage
    .from("project-seal-public")
    .remove([storagePath]);
  if (delFileErr) console.warn("Storage cleanup note:", delFileErr.message);

  console.log(JSON.stringify({ reverted: true, id: DEMO_ID }));
  process.exit(0);
}

// Create a silently altered archive (funding amount inflated from 250,000 to 985,000 after seal)
const tamperedManifest = structuredClone(originalManifest);
tamperedManifest.records.funding[0].amount = 985000;
const tamperedBytes = Buffer.from(JSON.stringify(tamperedManifest, null, 2), "utf8");
const tamperedHash = crypto.createHash("sha256").update(tamperedBytes).digest("hex");

const { error: uploadErr } = await admin.storage
  .from("project-seal-public")
  .upload(storagePath, tamperedBytes, {
    contentType: "application/json",
    upsert: true,
  });
if (uploadErr) throw uploadErr;

const { error: upsertErr } = await admin
  .from("project_seal_certificates")
  .upsert(
    {
      id: DEMO_ID,
      project_id: DEMO_PROJECT_ID,
      version: 1,
      title: "Ormoc Public Market Drainage Rehab (Tamper Demo)",
      manifest_hash: originalHash,
      archive_uri: archiveUri,
      storage_kind: "supabase",
      chain_id: 80002,
      contract_address: CONTRACT,
      tx_hash: "0x" + originalHash.slice(0, 64),
      block_number: 53085411,
      block_hash: "0x" + tamperedHash.slice(0, 64),
      publisher: PUBLISHER,
      sealed_at: new Date().toISOString(),
      previous_id: null,
    },
    { onConflict: "id" },
  );
if (upsertErr) throw upsertErr;

console.log(
  JSON.stringify({
    applied: true,
    id: DEMO_ID,
    title: "Ormoc Public Market Drainage Rehab (Tamper Demo)",
    expected_sha256: originalHash,
    stored_tampered_sha256: tamperedHash,
  }),
);
