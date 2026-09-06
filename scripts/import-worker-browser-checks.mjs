import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = spawn('python3', ['-u', '-c', [
  'from runpy import run_path', "globals().update(run_path('scripts/serve-diagnostic.py'))",
  'class FaultHandler(DiagnosticHandler):',
  '    def do_GET(self):',
  '        query = urlsplit(self.path).query',
  "        if urlsplit(self.path).path == '/experiments/photo-import/worker.mjs' and query in ['error', 'timeout']:",
  '            self.send_response(200)',
  "            self.send_header('Content-Type', 'text/javascript')",
  '            self.end_headers()',
  '            self.wfile.write(b\'throw new Error("synthetic worker failure")\' if query == "error" else b"self.onmessage = () => {}")',
  '            return',
  '        super().do_GET()',
  "server = ThreadingHTTPServer(('127.0.0.1', 0), partial(FaultHandler, directory=str(ROOT)))",
  "print('http://127.0.0.1:' + str(server.server_port), flush=True)",
  'server.serve_forever()',
].join('\n')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErrors = '';
server.stderr.on('data', chunk => { serverErrors = (serverErrors + chunk).slice(-2000); });
let browser;
try {
  const lines = createInterface({ input: server.stdout });
  const [origin] = await Promise.race([
    once(lines, 'line'),
    once(server, 'exit').then(([code]) => { throw new Error(`Server exited: ${code}: ${serverErrors}`); }),
    new Promise((_, reject) => { setTimeout(() => reject(new Error('Server startup timed out')), 10000).unref(); }),
  ]);
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  browser = await chromium.launch({ headless: true });
  const fixture = name => `${root}experiments/photo-import/fixtures/${name}`;
  const observations = [];
  for (const scenario of ['error', 'timeout', 'cancel', 'fixtures']) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(fault => {
      const NativeWorker = window.Worker;
      let count = 0;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          const target = new URL(url, location.href);
          if (fault !== 'fixtures' && target.pathname.endsWith('/photo-import/worker.mjs') && ++count === 1) target.search = fault;
          super(target, options);
        }
      };
    }, scenario === 'cancel' ? 'timeout' : scenario);
    const page = await context.newPage();
    const externalRequests = [];
    const writes = [];
    page.on('request', request => {
      if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
      if (request.method() !== 'GET') writes.push(request.method());
    });
    await page.goto(`${origin}/experiments/photo-import/index.html`);
    if (scenario === 'fixtures') await page.locator('#fixtures').click();
    else await page.locator('#files').setInputFiles([fixture('gps-dated.jpg'), fixture('gps-undated.jpg')]);
    if (scenario === 'cancel') {
      await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Reading 1 of'));
      await page.locator('#cancel').click();
      assert.match(await page.locator('#status').innerText(), /^Cancelled/);
      assert.equal(await page.locator('#results li').count(), 0);
      await page.locator('#files').setInputFiles(fixture('gps-undated.jpg'));
    }
    await page.waitForFunction(() => /inspected locally|fixture checks passed/.test(document.getElementById('status').textContent), null, { timeout: 25000 });
    const statuses = await page.locator('#results pre').evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent).status));
    const expected = scenario === 'fixtures'
      ? ['accepted', 'accepted', 'accepted', 'accepted', 'missing-gps', 'malformed-gps', 'malformed-gps', 'accepted', 'unsupported-format', 'malformed-file']
      : scenario === 'cancel' ? ['accepted'] : [scenario === 'error' ? 'worker-error' : 'parse-timeout', 'accepted'];
    console.log(JSON.stringify({ scenario, statuses }));
    assert.deepEqual(statuses, expected);
    if (scenario === 'fixtures') assert.match(await page.locator('#status').innerText(), /^10\/10/);
    assert.equal(await page.locator('#files').isEnabled(), true);
    assert.equal(await page.locator('#cancel').isDisabled(), true);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(writes, []);
    observations.push({ scenario, statuses });
    await context.close();
  }
  console.log(JSON.stringify({ browser: browser.version(), checks: observations, externalRequests: 0, writes: 0 }));
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await stopped;
  }
}
