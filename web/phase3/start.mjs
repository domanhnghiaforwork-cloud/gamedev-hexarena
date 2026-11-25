import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const localOnly = process.argv.includes('--local');

// 1. Load .env safely into process env (never hardcode secrets in code)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

const pvpPort = process.env.PVP_PORT || '3001';
const domain = process.env.NGROK_DOMAIN || 'hexarena.ngrok.app';
const hasNgrokToken =
  !!process.env.NGROK_AUTHTOKEN && process.env.NGROK_AUTHTOKEN !== 'your_ngrok_authtoken_here';

const C = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

const children = [];
let shuttingDown = false;

function logPrefixed(tag, color, chunk) {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length > 0) {
      process.stdout.write(`${color}[${tag}]${C.reset} ${line}\n`);
    }
  }
}

function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  try {
    if (isWin) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${C.yellow}Dang tat toan bo tien trinh Hex Arena...${C.reset}`);
  for (const child of children) {
    killTree(child);
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function launch(tag, color, command, args) {
  const child = spawn(command, args, {
    cwd: __dirname,
    env: process.env,
    shell: isWin,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);

  child.stdout?.on('data', (d) => logPrefixed(tag, color, d));
  child.stderr?.on('data', (d) => logPrefixed(tag, color, d));
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`${C.red}[${tag}] da dung (exit code ${code ?? 'null'}).${C.reset}`);
      if (tag === 'SERVER' || tag === 'WEB') {
        shutdown(code ?? 1);
      }
    }
  });
  return child;
}

console.log(`${C.cyan}=========================================================${C.reset}`);
console.log(`${C.cyan}  HEX ARENA — KHOI DONG TOAN BO HE THONG (1 LENH DUY NHAT)${C.reset}`);
console.log(`${C.cyan}=========================================================${C.reset}`);
console.log(`  - Web Local : ${C.green}http://localhost:5173${C.reset}`);
console.log(`  - PvP + DB  : ${C.green}ws://localhost:${pvpPort}/ws${C.reset}`);
if (!localOnly && hasNgrokToken) {
  console.log(`  - Public URL: ${C.magenta}https://${domain}${C.reset}`);
} else if (!localOnly) {
  console.log(`  - Public URL: ${C.yellow}Bo qua ngrok (chua co NGROK_AUTHTOKEN trong .env)${C.reset}`);
}
console.log(`  - Nhan ${C.yellow}Ctrl + C${C.reset} de tat tat ca.\n`);

// 2. Start Authoritative 60Hz PvP + SQLite Auth Server
launch('SERVER', C.green, 'npx', ['tsx', 'server/index.ts']);

// 3. Start Vite Dev Server (proxies /ws and /api -> localhost:3001)
launch('WEB', C.cyan, 'npx', ['vite', '--port', '5173', '--strictPort', '--host']);

// 4. Start ngrok Tunnel (reads NGROK_AUTHTOKEN from .env)
if (!localOnly && hasNgrokToken) {
  launch('NGROK', C.magenta, 'ngrok', ['http', `--url=${domain}`, '5173', '--log=stdout']);
}
