#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");

const MIN_JAVA_MAJOR = 21;
const FIREBASE_PROJECT_ID = "code-fusion-backoffice";
const FIREBASE_ARGS = [
  "emulators:start",
  "--project",
  FIREBASE_PROJECT_ID,
  "--only",
  "hosting,functions,firestore",
];

function getFirebaseCommand() {
  return process.platform === "win32" ? "firebase.cmd" : "firebase";
}

function parseJavaMajor(versionString) {
  if (!versionString) {
    return null;
  }

  const normalized = versionString.trim();

  if (normalized.startsWith("1.")) {
    const legacyMajor = Number.parseInt(normalized.split(".")[1], 10);
    return Number.isNaN(legacyMajor) ? null : legacyMajor;
  }

  const major = Number.parseInt(normalized.split(/[.-]/)[0], 10);
  return Number.isNaN(major) ? null : major;
}

function readJavaVersion() {
  const result = spawnSync("java", ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    return {
      ok: false,
      output: "",
      reason: result.error.code === "ENOENT" ? "missing" : "error",
    };
  }

  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const match = output.match(/version "([^"]+)"/);
  const version = match ? match[1] : null;
  const major = parseJavaMajor(version);

  return {
    ok: result.status === 0,
    output,
    version,
    major,
    reason: result.status === 0 ? "ok" : "error",
  };
}

function printJavaHelp(details) {
  const versionSummary = details.version
    ? `Detected Java ${details.version}.`
    : "Could not determine the installed Java version.";

  console.error("Firebase emulators now require JDK 21 or newer.");
  console.error(versionSummary);
  console.error("Update your PATH and JAVA_HOME to a JDK 21+ installation, then run `npm run serve` again.");
  console.error("macOS example:");
  console.error("  brew install openjdk@21");
  console.error("  export JAVA_HOME=\"/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home\"");
  console.error("  export PATH=\"/opt/homebrew/opt/openjdk@21/bin:$PATH\"");

  if (details.output) {
    console.error("");
    console.error("`java -version` output:");
    console.error(details.output);
  }
}

function ensureJavaVersion() {
  const details = readJavaVersion();

  if (!details.ok || !details.major || details.major < MIN_JAVA_MAJOR) {
    printJavaHelp(details);
    process.exit(1);
  }
}

function startEmulators() {
  const child = spawn(getFirebaseCommand(), FIREBASE_ARGS, {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(`Failed to start Firebase emulators: ${error.message}`);
    process.exit(1);
  });
}

ensureJavaVersion();
startEmulators();
