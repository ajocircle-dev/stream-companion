/** Starts a mock server and feeder, then stops both when the feed completes. */
import { spawn } from 'node:child_process';

const port = process.env.PORT ?? '3000';
const server = spawn('npx', ['tsx', 'src/index.ts'], {
  stdio: 'inherit',
  env: { ...process.env, MODE: 'mock' },
});
let feeder;

function stopProcesses() {
  feeder?.kill('SIGTERM');
  server.kill('SIGTERM');
}

process.on('SIGINT', stopProcesses);
process.on('SIGTERM', stopProcesses);

for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    const response = await fetch(`http://localhost:${port}/state`);
    if (response.ok) {
      break;
    }
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

feeder = spawn('npx', ['tsx', 'scripts/feeder.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, MODE: 'mock' },
});
feeder.on('exit', (code) => {
  if (code) {
    process.exitCode = code;
  }
  stopProcesses();
});
server.on('exit', () => process.exit());
