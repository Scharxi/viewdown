import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

// ES Module equivalent von __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    // Lese package.json
    const packageJsonPath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const version = packageJson.version;

    console.log(`📦 Syncing version to ${version}...`);

    // Lese Cargo.toml
    const cargoTomlPath = path.join(__dirname, '../src-tauri/Cargo.toml');
    let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');

    // Update Version in Cargo.toml
    cargoToml = cargoToml.replace(
        /^version = ".*"$/m,
        `version = "${version}"`
    );

    // Schreibe Cargo.toml
    fs.writeFileSync(cargoTomlPath, cargoToml);

    console.log('Version synced successfully!');
    console.log(`   package.json: ${version}`);
    console.log(`   Cargo.toml: ${version}`);
} catch (error) {
    console.error('Error syncing version:', error);
    process.exit(1);
}
