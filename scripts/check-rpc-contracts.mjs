import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

async function collectFiles(directory, extension) {
    const entries = await readdir(directory, { withFileTypes: true, recursive: true });
    return entries
        .filter(entry => entry.isFile() && entry.name.endsWith(extension))
        .map(entry => join(entry.parentPath || directory, entry.name));
}

const sourceFiles = await collectFiles(join(root, 'src'), '.ts');
const tsxFiles = await collectFiles(join(root, 'src'), '.tsx');
const source = (await Promise.all([...sourceFiles, ...tsxFiles].map(file => readFile(file, 'utf8')))).join('\n');
const migrationFiles = await collectFiles(join(root, 'supabase', 'migrations'), '.sql');
const migrations = (await Promise.all(migrationFiles.map(file => readFile(file, 'utf8')))).join('\n');
const generatedTypes = await readFile(join(root, 'src', 'database.types.ts'), 'utf8');

const calls = new Set([...source.matchAll(/\.rpc\(['"]([^'"]+)/g)].map(match => match[1]));
const declared = new Set([...migrations.matchAll(/CREATE OR REPLACE FUNCTION\s+(?:public\.)?([a-z0-9_]+)/gi)].map(match => match[1]));
const typed = new Set([...generatedTypes.matchAll(/^\s{6}(\w+): \{$/gm)].map(match => match[1]));
const missingDeclarations = [...calls].filter(name => !declared.has(name));
const missingTypes = [...calls].filter(name => !typed.has(name) && !generatedTypes.includes(`${name}:`));

if (missingDeclarations.length || missingTypes.length) {
    if (missingDeclarations.length) console.error(`RPC calls missing from migrations: ${missingDeclarations.join(', ')}`);
    if (missingTypes.length) console.error(`RPC calls missing from generated types: ${missingTypes.join(', ')}`);
    process.exit(1);
}

console.log(`RPC contract check passed (${calls.size} calls).`);
