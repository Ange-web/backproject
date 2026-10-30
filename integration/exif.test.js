const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { createExif } = require('../src/exif');
// PNG 1x1 valide, construit avec de vrais CRC (le fixture précédent avait un CRC IDAT faux).
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function validPng() {
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0]))), chunk('IEND', Buffer.alloc(0))]);
}
test('real ExifTool reads, edits and strips a PNG', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nspy-exif-'));
  const file = path.join(root, 'image.png');
  const exif = createExif();
  try {
    await fs.writeFile(file, validPng());
    const read = await exif.read(file); assert.equal(read.FileType, 'PNG');
    await exif.write(file, { Artist: 'NSPY test' }, ['-overwrite_original']);
    assert.equal((await exif.read(file)).Artist, 'NSPY test');
    await exif.write(file, { All: '' }, ['-all=', '-overwrite_original']);
    assert.equal((await exif.read(file)).Artist, undefined);
  } finally { await exif.end(); await fs.rm(root, { recursive: true, force: true }); }
});
