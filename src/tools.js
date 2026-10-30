const net = require('node:net');
const { execFile } = require('node:child_process');
const runFile = require('node:util').promisify(execFile);
function invalid(message) { const e = new Error(message); e.status = 400; throw e; }
function validatePorts(ports) {
  if (!Array.isArray(ports) || ports.length < 1 || ports.length > 32 ||
    ports.some(p => !Number.isInteger(p) || p < 1 || p > 65535)) invalid('De 1 à 32 ports entiers entre 1 et 65535 sont requis');
  return [...new Set(ports)];
}
function validateTarget(kind, raw, allowlist) {
  if (typeof raw !== 'string' || raw.length > 2048 || raw !== raw.trim() || /[\s\x00-\x1f]/.test(raw)) invalid('Cible invalide');
  if (kind === 'url') {
    let url; try { url = new URL(raw); } catch { invalid('URL invalide'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) invalid('URL HTTP(S) sans identifiants ni fragment requise');
    if (!allowlist.includes(url.href)) invalid('URL hors laboratoire autorisé');
    return url.href;
  }
  if (!net.isIP(raw) || !allowlist.includes(raw)) invalid('IP de laboratoire non autorisée');
  return raw;
}
function createRunner({ enabled = false, allowedUrls = [], allowedIps = [] } = {}) {
  return async function execute(kind, body) {
    if (!enabled) { const e = new Error('Analyses réseau désactivées : configurer un laboratoire autorisé.'); e.status = 503; throw e; }
    const started = Date.now();
    if (kind === 'url') {
      const target = validateTarget('url', body.url, allowedUrls);
      const { stdout } = await runFile('nuclei', ['-u', target, '-tags', 'xss,sqli,misconfig', '-type', 'http', '-jsonl', '-silent', '-no-color', '-no-interactsh', '-disable-redirects', '-disable-update-check', '-omit-raw', '-omit-template', '-rate-limit', '5', '-concurrency', '2', '-timeout', '5', '-retries', '0'],
        { shell: false, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
      const results = stdout.trim() ? stdout.trim().split(/\r?\n/).map(line => JSON.parse(line)) : [];
      const findings = results.map(r => ({
        title: r.info?.name || r['template-id'] || 'Observation',
        severity: ['info', 'low', 'medium', 'high', 'critical'].includes(r.info?.severity) ? r.info.severity : 'info',
        description: r.info?.description || '', evidence: r['matched-at'] || target,
      }));
      return { target, findings, duration_ms: Date.now() - started };
    }
    if (body.type !== 'public') invalid('Choisissez une IP de laboratoire ; le serveur ne scanne pas votre réseau local');
    const target = validateTarget('ip', body.ip, allowedIps), ports = validatePorts(body.ports);
    const { stdout } = await runFile('nmap', ['-sT', '-p', ports.join(','), target, '--open', '--host-timeout', '25s'],
      { shell: false, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
    const openPorts = [...stdout.matchAll(/^(\d+)\/tcp\s+open\b/gm)].map(m => Number(m[1]));
    return { target, duration_ms: Date.now() - started, findings: openPorts.map(p => ({
      title: 'Port TCP accessible : ' + p, severity: 'info',
      description: 'Un service accessible ne constitue pas à lui seul une vulnérabilité.',
      evidence: 'Port TCP ' + p + ' observé ouvert par Nmap',
    })) };
  };
}
module.exports = { validatePorts, validateTarget, createRunner };
