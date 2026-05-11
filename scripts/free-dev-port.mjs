import { execFileSync } from "node:child_process";

const port = "5173";
const projectPath = process.cwd();

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

const pids = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
  .split("\n")
  .map((pid) => pid.trim())
  .filter(Boolean);

for (const pid of pids) {
  const command = run("ps", ["-p", pid, "-o", "command="]).trim();
  const cwd = run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"])
    .split("\n")
    .find((line) => line.startsWith("n"))
    ?.slice(1);

  if (cwd === projectPath && command.includes("vite")) {
    process.kill(Number(pid), "SIGTERM");
  }
}
