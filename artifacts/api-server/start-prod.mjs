import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = join(__dirname, "../../scripts/start-prod.sh");
const proc = spawn("bash", [script], { stdio: "inherit" });
proc.on("close", (code) => process.exit(code ?? 1));
