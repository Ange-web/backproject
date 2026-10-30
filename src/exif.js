const { execFile } = require('node:child_process');
const run = require('node:util').promisify(execFile);
function createExif() {
  const binary = process.env.EXIFTOOL_PATH || (process.platform === 'win32' ? require('exiftool-vendored.exe') : 'exiftool');
  let active = 0;
  async function execute(args) {
    if (active >= 2) { const e = new Error('Traitement d’images occupé, réessayez'); e.status = 429; throw e; }
    active++;
    try { return await run(binary, args, { shell: false, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 }); }
    finally { active--; }
  }
  return {
    async read(file) { const { stdout } = await execute(['-json', file]); return JSON.parse(stdout)[0]; },
    async write(file, tags, options = []) {
      // -m : ignore les avertissements mineurs (fréquents sur les photos de téléphone) sans masquer les vraies erreurs
      await execute(['-m', ...options, ...Object.entries(tags).map(([tag, value]) => '-' + tag + '=' + value), file]);
    },
    async end() {},
  };
}
module.exports = { createExif };
