# MARTA TypeScript client

A Node.js client for MARTA bus GTFS Realtime feeds and rail arrivals.
Independent community project; not an official MARTA SDK.

Requires **Node.js 24+**. Ships ESM JavaScript and TypeScript declarations.

## Install

```sh
npm install marta
```

## Usage

```ts
import { Marta } from 'marta';

const marta = new Marta();

// Bus feeds do not require an API key.
const positions = await marta.buses.getBusVehiclePositions();
for (const entity of positions.entity) {
    if (!entity.vehicle) continue;
    console.log(entity.vehicle.trip?.routeId, entity.vehicle.position);
}

const trips = await marta.buses.getBusTrips();
for (const entity of trips.entity) {
    if (!entity.tripUpdate) continue;
    console.log(entity.tripUpdate.trip.tripId, entity.tripUpdate.stopTimeUpdate);
}

// Rail queries require a key; this can also come from MARTA_API_KEY.
const authenticated = new Marta({ apiKey: process.env.MARTA_API_KEY });
const trains = await authenticated.trains.get();
for (const train of trains) {
    console.log(train.STATION, train.DESTINATION, train.WAITING_SECONDS);
}
```

Importing the library and constructing clients perform no requests. The library
reads `MARTA_API_KEY` at construction but does not load `.env` files. Applications
can use Node's `--env-file=.env` option themselves.

Get a rail key through [MARTA's developer resources](https://itsmarta.com/app-developer-resources.aspx).
Rail requests use the documented `apiKey` query parameter. Bus requests send no key.

## API

| Method | Return | Timeout |
| --- | --- | --- |
| `marta.buses.getBusVehiclePositions()` | `Promise<BusFeed>` | 20 seconds |
| `marta.buses.getBusTrips()` | `Promise<BusFeed>` | 20 seconds |
| `marta.trains.getTrainArrivals()` | `Promise<TrainArrival[]>` | 5 seconds |

`BusFeed` is the decoded `FeedMessage` from `gtfs-realtime-bindings`. The full
snapshot is retained, including its header, trip relationships, and stop updates.
No cancellations are filtered out. Protobuf 64-bit timestamps may be `Long`
objects; use `Number(value)` when converting supported timestamps to Unix seconds.
Optional protobuf fields can have inherited defaults; check field presence before
interpreting a missing field as zero or an empty string.

`TrainArrival` preserves MARTA's original uppercase field names and string values:
`DESTINATION`, `DIRECTION`, `EVENT_TIME`, `LINE`, `NEXT_ARR`, `STATION`, `TRAIN_ID`,
`WAITING_SECONDS`, and `WAITING_TIME`. Optional `IS_REALTIME`, `DELAY`, `LATITUDE`,
and `LONGITUDE` fields are typed as strings when supplied. Additional fields are
preserved as `unknown`. Empty arrays are valid. Invalid response shapes reject.

Services and types are exported from the package root:

```ts
import { BusService, TrainService } from 'marta';
import type { BusFeed, TrainArrival, MartaOptions } from 'marta';

const buses = new BusService();
const trains = new TrainService({ apiKey: process.env.MARTA_API_KEY });

const busStops = await buses.getTrips()
const busPostions = await buses.getPositions()
const trainArrivals = await trains.getArrivals();
```

Every call gets a fresh timeout. Non-2xx HTTP responses, malformed responses,
network failures, and timeouts reject the promise. Missing rail credentials reject
before a request is made. There are no automatic retries or caches.

## Release scope

Version 1.0.0 provides current feed snapshots. It does not provide historical data,
static schedules, stop-time windows, route-name lookups, or normalized bus arrivals
and departures. Filter feed entities in your application. Browser use and CommonJS
are not supported by this release.

## Development

```sh
npm ci
npm run check
```

`check` runs type validation, mocked transport tests, and the production build.
Tests require no network or API key. Build output goes to `dist/`.

After building, run `node examples/basic.mjs` for live bus checks, or
`node --env-file=.env examples/basic.mjs` to include rail arrivals.

## Publishing

**Release preparation:** the current name `marta` is already registered to another
maintainer. Set a package name you own (and update these examples and the lockfile)
before publishing. Then:

```sh
npm run check
npm run test:package
npm pack --dry-run
npm pack
# Install the tarball in a separate project and check its imports before publishing.
npm publish --access public
```

`prepack` builds the package; `prepublishOnly` runs the complete check. Only build
output, this README, and the ISC license are distributed. The package contains no
example execution, credentials, tests, or prototype source files.

## License

ISC. See [LICENSE](./LICENSE).
