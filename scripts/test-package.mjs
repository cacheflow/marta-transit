import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const temporary = mkdtempSync(join(tmpdir(), 'marta-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
try {
    const cache = join(temporary, 'cache');
    execFileSync(npm, ['pack', '--pack-destination', temporary, '--cache', cache], { cwd: root, stdio: 'pipe' });
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const filename = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
    const consumer = join(temporary, 'consumer');
    mkdirSync(consumer);
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    execFileSync(npm, ['install', join(temporary, filename), '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache], { cwd: consumer, stdio: 'pipe' });
    const packageName = JSON.stringify(manifest.name);
    writeFileSync(join(consumer, 'smoke.mjs'), `
        import assert from 'node:assert/strict';
        globalThis.fetch = () => { throw new Error('Import must not fetch'); };
        const { Marta, BusService, TrainService } = await import(${packageName});
        const client = new Marta({apiKey:'fixture-key'});
        assert.ok(client.buses instanceof BusService);
        assert.ok(client.trains instanceof TrainService);
        // Encoded FeedMessage with a GTFS 2.0 header and no entities.
        globalThis.fetch = async () => new Response(new Uint8Array([10,5,10,3,50,46,48]));
        assert.equal((await client.buses.getBusVehiclePositions()).entity.length, 0);
        assert.equal((await client.buses.getBusTrips()).header.gtfsRealtimeVersion, '2.0');
        globalThis.fetch = async () => Response.json([]);
        assert.deepEqual(await client.trains.get(), []);
    `);
    execFileSync(process.execPath, ['smoke.mjs'], { cwd: consumer, stdio: 'inherit' });
    writeFileSync(join(consumer, 'consumer.mts'), `
        import { Marta } from ${packageName};
        import type { BusFeed, TrainArrival, MartaOptions } from ${packageName};
        const options: MartaOptions = {};
        const client = new Marta(options);
        const feed: BusFeed = await client.buses.getBusTrips();
        const trains: TrainArrival[] = await client.trains.get();
        const station: string | undefined = trains[0]?.STATION;
        console.log(feed.entity, station);
    `);
    execFileSync(process.execPath, [join(dirname(require.resolve('typescript/package.json')), 'bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'nodenext', '--target', 'es2022', 'consumer.mts'], { cwd: consumer, stdio: 'inherit' });
    const files = execFileSync('tar', ['-tzf', join(temporary, filename)], { encoding: 'utf8' }).trim().split('\n');
    assert.ok(files.every(file => /^package\/(dist\/|package.json$|README.md$|LICENSE$)/.test(file)), files.join('\n'));
    console.log('Tarball verified: clean install, runtime imports, bus/rail calls, consumer types, and file allowlist.');
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
