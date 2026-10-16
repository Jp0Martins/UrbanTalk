import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { badRequest } from './errors.js';

export const PHOTO_NAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

// confere a assinatura real do arquivo, não só a extensão informada
function detectImageType(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  return null;
}

// valida, reduz e regrava como JPEG; a regravação descarta metadados (EXIF, modelo do celular etc.)
export async function storePhoto(uploadDir: string, file: Buffer) {
  if (!detectImageType(file)) {
    throw badRequest('Envie uma foto em JPG, PNG ou WebP.', { photo: 'Formato de imagem não aceito.' });
  }
  let output: Buffer;
  try {
    output = await sharp(file, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw badRequest('Não foi possível ler esta imagem. Tente outra foto.', { photo: 'Imagem corrompida ou ilegível.' });
  }
  await fs.mkdir(uploadDir, { recursive: true });
  const name = `${crypto.randomUUID()}.jpg`;
  await fs.writeFile(path.join(uploadDir, name), output);
  return name;
}

export async function removePhoto(uploadDir: string, name: string | null | undefined) {
  if (!name || !PHOTO_NAME_RE.test(name)) return;
  await fs.rm(path.join(uploadDir, name), { force: true });
}
