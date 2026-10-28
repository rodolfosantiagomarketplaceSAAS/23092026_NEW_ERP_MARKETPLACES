const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const extDir = path.join(rootDir, 'apps', 'extension');
const tempZip = path.join(__dirname, 'temp_extension.zip');
const outPath = path.join(rootDir, 'apps', 'web', 'src', 'lib', 'extension', 'packageBinary.ts');

try {
  if (fs.existsSync(tempZip)) {
    fs.unlinkSync(tempZip);
  }

  // Comprime o diretório apps/extension/*
  const psCmd = `powershell -Command "Compress-Archive -Path '${extDir}/*' -DestinationPath '${tempZip}' -Force"`;
  execSync(psCmd, { stdio: 'inherit' });

  const zipBuffer = fs.readFileSync(tempZip);
  const base64Data = zipBuffer.toString('base64');

  // Lê manifest para obter a versão atualizada
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'));
  const version = manifest.version || '1.1.0';

  const fileContent = `// Arquivo gerado automaticamente contendo o pacote ZIP da extensão Chrome para download autenticado
export const EXTENSION_VERSION = "${version}";
export const EXTENSION_FILENAME = "erp-marketplaces-extension.zip";
export const EXTENSION_ZIP_BASE64 = "${base64Data}";
`;

  fs.writeFileSync(outPath, fileContent, 'utf-8');
  console.log(`[pack-extension] Sucesso: v${version}, base64 length: ${base64Data.length}`);
} catch (err) {
  console.error('[pack-extension] Erro:', err);
  process.exit(1);
} finally {
  if (fs.existsSync(tempZip)) {
    fs.unlinkSync(tempZip);
  }
}
