import forge from 'node-forge';
import fs from 'node:fs';
import path from 'node:path';

function createRootMojokertoCA() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  
  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setFullYear(notBefore.getFullYear() + 10);
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  const attrs = [
    { name: 'commonName', value: 'Pemerintah Kota Mojokerto' },
    { name: 'organizationName', value: 'Pemerintah Kota Mojokerto' },
    { name: 'countryName', value: 'ID' }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // Self-sign root CA certificate
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  const certPath = path.resolve(process.cwd(), 'certificates/rootmojokerto.crt');
  const keyPath = path.resolve(process.cwd(), 'certificates/rootmojokerto.key');

  fs.writeFileSync(certPath, certPem);
  fs.writeFileSync(keyPath, keyPem);
  console.log('[CA] Recreated rootmojokerto.crt and rootmojokerto.key successfully.');
}

createRootMojokertoCA();
