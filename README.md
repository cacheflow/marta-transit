# marta-js
[MARTA logo](./MARTA.png)

A TypeScript client for MARTA real-time train arrivals and bus vehicle positions, inspired by `marta-python`.

The initial implementation lives in `app.ts`. The client is still taking shape: classes are not exported yet, and package build and publishing setup are pending.

## Implemented

- Read `MARTA_API_KEY` from the environment, with `.env` support through `dotenv`.
- Fetch train arrival data with `getTrains()` and return the API's JSON response.
- Fetch and decode the GTFS-Realtime bus vehicle positions feed with `getBuses()` using `gtfs-realtime-bindings`.
- Map feed entities into an array of `Bus` objects, preserving the decoded vehicle data.
- Apply a five-second timeout to both requests.

## Local setup

Install dependencies from the repository root:

```sh
npm install
```

Create a `.env` file in the repository root:

```dotenv
MARTA_API_KEY=your_api_key_here
```

You can also supply `MARTA_API_KEY` through your shell environment. Keep your API key out of version control.

The implementation uses Node.js globals `fetch` and `AbortSignal.timeout`. A TypeScript runner or build configuration is not included yet.

## Usage

For now, place this example **at the bottom of `app.ts`**, after the class definitions. There is no package import available yet.

```ts
async function main() {
  const marta = new Marta();

  const trains = await marta.getTrains();
  console.log(trains);

  const buses = await marta.getBuses();
  for (const bus of buses) {
    console.log(bus.routeId, bus.latitude, bus.longitude);
  }
}

main().catch(console.error);
```

Run `app.ts` with a TypeScript runner of your choice. The file currently only defines classes; it does not make requests until you add a call such as the example above.

## Current API

### `new Marta()`

Reads `process.env.MARTA_API_KEY` when the client is constructed. Both request methods send it as a bearer token. Constructor options and API key validation are not implemented yet.

### `await marta.getTrains()`

Returns the parsed JSON from MARTA's rail arrival endpoint unchanged. There is no `Train` model, response validation, or filtering yet.

### `await marta.getBuses()`

Decodes MARTA's GTFS-Realtime vehicle positions feed and returns an array of `Bus` objects, one per feed entity. An empty feed returns an empty array.

Each `Bus` exposes:

| Property | Source |
| --- | --- |
| `tripId` | `vehicle.trip.tripId` |
| `startDate` | `vehicle.trip.startDate` |
| `routeId` | `vehicle.trip.routeId` |
| `directionId` | `vehicle.trip.directionId` |
| `latitude` | `vehicle.position.latitude` |
| `longitude` | `vehicle.position.longitude` |
| `bearing` | `vehicle.position.bearing` |
| `timestamp` | `vehicle.timestamp` |
| `trip` | Decoded trip descriptor |
| `position` | Decoded position |
| `rawData` | Complete decoded vehicle object |

Values are copied directly from the decoded feed without normalization. Missing fields can be `undefined`; entities without vehicle data are not currently skipped. Type declarations are still preliminary and do not fully describe the decoded values.

## Roadmap

Next steps toward a reusable library:

- [ ] Export the client and models; configure the package entry point and TypeScript build.
- [ ] Replace `any` with accurate feed and response types, including optional fields.
- [ ] Validate configuration, HTTP responses, and feed entities.
- [ ] Enforce response size limits; `MAX_RESPONSE_BYTES` is currently declared but unused.
- [ ] Add bus trip updates; the endpoint constant exists, but no method uses it yet.
- [ ] Add bus and train filtering.
- [ ] Define a consistent train model and timestamp handling.
- [ ] Add configurable request timeouts and caching.
- [ ] Add automated tests and package usage examples.

## Testing

There are no automated tests yet. `npm test` currently runs the default placeholder script and exits with an error.

## License

ISC, as declared in `package.json`.
