import { readFileSync, writeFileSync } from 'fs';

// Invoked by `npm version` via the "version" script.
// Syncs the new package.json version into manifest.json and versions.json,
// keeping minAppVersion as the source of truth from manifest.json.
const targetVersion = process.env.npm_package_version;

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[targetVersion] = minAppVersion;
writeFileSync('versions.json', JSON.stringify(versions, null, 2) + '\n');
