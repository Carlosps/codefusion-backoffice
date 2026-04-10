#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".firebase",
  "functions/node_modules",
]);

const TEXT_FILE_EXT = new Set([
  ".js",
  ".ts",
  ".json",
  ".yml",
  ".yaml",
  ".md",
  ".env",
  ".txt",
]);

const PATTERNS = [
  { id: "private-key-block", re: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { id: "gcp-service-account-json", re: /"type"\s*:\s*"service_account"/ },
  { id: "gcp-private-key", re: /"private_key"\s*:\s*"/ },
  { id: "gcp-client-email", re: /"client_email"\s*:\s*".+?\.gserviceaccount\.com"/ },
  { id: "github-pat", re: /\bghp_[0-9A-Za-z]{20,}\b/ },
  { id: "slack-token", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { id: "google-oauth", re: /\bya29\.[0-9A-Za-z_-]{10,}\b/ },
  { id: "stripe-secret", re: /\bsk_(?:live|test)_[0-9a-zA-Z]{10,}\b/ },
  { id: "revenuecat-secret", re: /\brc_(?:live|test)_[0-9a-zA-Z]{10,}\b/ },
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "aws-secret-key", re: /\baws_secret_access_key\b/i },
];

function shouldSkipPath(p) {
  const rel = path.relative(ROOT, p);
  if (!rel || rel.startsWith("..")) return true;
  const parts = rel.split(path.sep);
  return parts.some((part) => SKIP_DIRS.has(part));
}

function isTextCandidate(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_FILE_EXT.has(ext)) return true;
  if (path.basename(filePath).startsWith(".env")) return true;
  return false;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (shouldSkipPath(full)) {
      continue;
    }
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && isTextCandidate(full)) {
      out.push(full);
    }
  }
}

function scanFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  // Ignore examples/tests that intentionally include fake keys
  const allowlist = [
    "web/config.example.js",
    "functions/.env.example",
    "README.md",
    "functions/test/",
  ];
  if (allowlist.some((p) => rel === p || rel.startsWith(p))) {
    return [];
  }

  const hits = [];
  for (const pattern of PATTERNS) {
    const match = content.match(pattern.re);
    if (match) {
      const index = match.index ?? 0;
      const line = content.slice(0, index).split("\n").length;
      hits.push({ id: pattern.id, rel, line });
    }
  }
  return hits;
}

function main() {
  const files = [];
  walk(ROOT, files);

  const findings = [];
  for (const file of files) {
    findings.push(...scanFile(file));
  }

  if (!findings.length) {
    process.stdout.write("Secret scan: OK\n");
    return;
  }

  process.stderr.write("Secret scan: FAILED\n");
  for (const hit of findings) {
    process.stderr.write(`- ${hit.id}: ${hit.rel}:${hit.line}\n`);
  }
  process.stderr.write(
    "\nIf this is a false positive, adjust allowlist/patterns in scripts/scan-secrets.js.\n",
  );
  process.exitCode = 1;
}

main();

