import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../dist/', import.meta.url));
mkdirSync(output, { recursive: true });
for (const entry of readdirSync(output)) {
    rmSync(join(output, entry), { recursive: true, force: true });
}
