const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const extDir = path.join(rootDir, 'apps', 'extension');
const tempZip = path.join(__dirname, 'temp_extension.zip');
const versionPath = path.join(rootDir, 'apps', 'web', 'src', 'lib', 'extension', 'version.ts');
const outPath = path.join(rootDir, 'apps', 'web', 'src', 'lib', 'extension', 'packageBinary.ts');

function getLatestMtime(dir) {
  let latest = new Date(0);
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      const d = getLatestMtime(full);
      if (d > latest) latest = d;
    } else {
      const s = fs.statSync(full);
      if (s.mtime > latest) latest = s.mtime;
    }
  }
  return latest;
}

try {
  // 1. Atualiza content_script.js para garantir que use a versão do manifest
  const contentScriptPath = path.join(extDir, 'content_script.js');
  let csContent = fs.readFileSync(contentScriptPath, 'utf-8');
  if (csContent.includes('detail: { version: "1.0.0"')) {
    csContent = csContent.replace(
      'detail: { version: "1.0.0"',
      'detail: { version: (typeof chrome !== "undefined" && chrome.runtime?.getManifest?.()?.version) || "1.1.0"'
    );
    fs.writeFileSync(contentScriptPath, csContent, 'utf-8');
    console.log('[pack-extension] content_script.js atualizado com versão dinâmica');
  }

  if (fs.existsSync(tempZip)) {
    fs.unlinkSync(tempZip);
  }

  // 2. Comprime o diretório apps/extension/*
  const psCmd = `powershell -Command "Compress-Archive -Path '${extDir}/*' -DestinationPath '${tempZip}' -Force"`;
  execSync(psCmd, { stdio: 'inherit' });

  const zipBuffer = fs.readFileSync(tempZip);
  const base64Data = zipBuffer.toString('base64');

  // 3. Lê manifest para obter a versão atualizada
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'));
  const version = manifest.version || '1.1.0';

  const lastMtime = getLatestMtime(extDir);
  const dateFormatted = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(lastMtime);

  // Gera version.ts leve para componentes React (sem os 44KB da base64)
  const versionContent = `// Informações e metadados de versão da extensão Chrome do ERP
export const EXTENSION_VERSION = "${version}";
export const EXTENSION_UPDATED_AT = "${dateFormatted}";
export const EXTENSION_UPDATED_AT_ISO = "${lastMtime.toISOString()}";
export const EXTENSION_FILENAME = "erp-marketplaces-extension.zip";
`;
  fs.writeFileSync(versionPath, versionContent, 'utf-8');

  // Gera packageBinary.ts completo para o Route Handler da API
  const binaryContent = `// Arquivo gerado automaticamente contendo o pacote ZIP da extensão Chrome para download autenticado
export * from "./version";
export const EXTENSION_ZIP_BASE64 = "${base64Data}";
`;
  fs.writeFileSync(outPath, binaryContent, 'utf-8');

  console.log(`[pack-extension] Sucesso: v${version} (${dateFormatted}), base64: ${base64Data.length} bytes`);
} catch (err) {
  console.error('[pack-extension] Erro:', err);
  process.exit(1);
} finally {
  if (fs.existsSync(tempZip)) {
    fs.unlinkSync(tempZip);
  }
}
