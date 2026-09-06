import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { spawnSync } from "node:child_process";
import type { Mock } from "node:test";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { Marta, BusService, TrainService } from "../app.ts";
import type { TrainArrival } from "../app.ts";

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
let originalKey: string | undefined;
let fetchMock: Mock<typeof fetch>;

beforeEach(() => {
  originalKey = process.env.MARTA_API_KEY;
  process.env.MARTA_API_KEY = "test-key";
  fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected request");
  });
});

afterEach(() => {
  mock.restoreAll();
  if (originalKey === undefined) delete process.env.MARTA_API_KEY;
  else process.env.MARTA_API_KEY = originalKey;
});

const train: TrainArrival = {
  DESTINATION: "Airport",
  DIRECTION: "S",
  EVENT_TIME: "01/23/2025 11:50:06 AM",
  LINE: "RED",
  NEXT_ARR: "11:52:49 AM",
  STATION: "AIRPORT STATION",
  TRAIN_ID: "401",
  WAITING_SECONDS: "107",
  WAITING_TIME: "1 min",
  IS_REALTIME: "true",
  DELAY: "T582S",
};
function respondWithFeed(
  entity: GtfsRealtimeBindings.transit_realtime.IFeedEntity[],
) {
  const bytes = FeedMessage.encode({
    header: { gtfsRealtimeVersion: "2.0" },
    entity,
  }).finish();
  fetchMock.mock.mockImplementation(
    async () => new Response(Uint8Array.from(bytes)),
  );
}

test("importing the entry point performs no requests or dotenv loading", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        globalThis.fetch = () => { throw new Error('Import made a request'); };
        const before = JSON.stringify(process.env);
        await import(${JSON.stringify(new URL("../app.ts", import.meta.url).href)});
        if (before !== JSON.stringify(process.env)) throw new Error('Import changed environment');
    `,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});
test("constructor captures the environment key, supports overrides, and never fetches", () => {
  const client = new Marta();
  process.env.MARTA_API_KEY = "changed";
  assert.equal(client.apiKey, "test-key");
  assert.equal(client.trains.apiKey, "test-key");
  assert.equal(new Marta({ apiKey: "override" }).trains.apiKey, "override");
  assert.ok(client.buses instanceof BusService);
  assert.ok(client.trains instanceof TrainService);
  assert.equal(fetchMock.mock.callCount(), 0);
});
test("bus positions decode real protobuf bytes and preserve fields and feed order", async () => {
  delete process.env.MARTA_API_KEY;
  respondWithFeed([
    {
      id: "first",
      vehicle: {
        trip: { tripId: "T1", routeId: "3", directionId: 0 },
        position: { latitude: 33.75, longitude: -84.5, bearing: 90 },
        timestamp: 1788560400,
        vehicle: { id: "2417" },
      },
    },
    {
      id: "second",
      vehicle: {
        trip: { tripId: "T2" },
        position: { latitude: 33.5, longitude: -84.25 },
      },
    },
  ]);
  const feed = await new Marta().buses.getPositions();
  assert.ok(feed instanceof FeedMessage);
  assert.deepEqual(
    feed.entity.map((e) => e.id),
    ["first", "second"],
  );
  assert.equal(feed.entity[0].vehicle?.trip?.directionId, 0);
  assert.equal(feed.entity[0].vehicle?.position?.latitude, 33.75);
  assert.equal(Number(feed.entity[0].vehicle?.timestamp), 1788560400);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.match(String(url), /vehicle\/vehiclepositions.pb$/);
  assert.equal(new Headers(options?.headers).has("Authorization"), false);
});

test("trip snapshots preserve canceled trips and original stop events", async () => {
  respondWithFeed([
    {
      id: "cancel",
      tripUpdate: { trip: { tripId: "T1", scheduleRelationship: 3 } },
    },
    {
      id: "active",
      tripUpdate: {
        trip: { tripId: "T2" },
        stopTimeUpdate: [
          {
            stopId: "S",
            stopSequence: 1,
            arrival: { time: 1788560400 },
            departure: { time: 1788560410 },
          },
        ],
      },
    },
  ]);
  const feed = await new BusService().getTrips  ();
  assert.equal(feed.entity.length, 2);
  assert.equal(feed.entity[0].tripUpdate?.trip.scheduleRelationship, 3);
  assert.equal(
    Number(feed.entity[1].tripUpdate?.stopTimeUpdate?.[0].departure?.time),
    1788560410,
  );
  assert.match(
    String(fetchMock.mock.calls[0].arguments[0]),
    /tripupdate\/tripupdates.pb$/,
  );
});
for (const method of ["getTrips ", "getPositions"] as const) {
  test(`${method} returns an empty feed without inventing entities`, async () => {
    respondWithFeed([]);
    assert.deepEqual((await new BusService()[method]()).entity, []);
  });
  test(`${method} rejects malformed protobuf`, async () => {
    fetchMock.mock.mockImplementation(
      async () => new Response(new Uint8Array([0x0a, 0x05, 0x01])),
    );
    await assert.rejects(new BusService()[method]());
  });
}

test("train arrivals retain original strings and extra fields and use documented authentication", async () => {
  fetchMock.mock.mockImplementation(async () => Response.json([train]));
  const key = "key&with?characters";
  assert.deepEqual(await new Marta({ apiKey: key }).trains.getArrivals(), [train]);
  const [input, options] = fetchMock.mock.calls[0].arguments;
  const url = new URL(String(input));
  assert.equal(url.protocol, "https:");
  assert.equal(url.searchParams.get("apiKey"), key);
  assert.equal(url.searchParams.size, 1);
  assert.equal(new Headers(options?.headers).get("Accept"), "application/json");
});

test("train queries require a key, while bus-only clients do not", async () => {
  delete process.env.MARTA_API_KEY;
  await assert.rejects(new Marta().trains.getArrivals(), /API key is required/);
  await assert.rejects(
    new TrainService({ apiKey: "  " }).getArrivals(),
    /API key is required/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("empty rail response is valid", async () => {
  fetchMock.mock.mockImplementation(async () => Response.json([]));
  assert.deepEqual(await new TrainService().getArrivals(), []);
});
for (const payload of [
  { error: "bad key" },
  [null],
  [{ ...train, TRAIN_ID: 401 }],
  [{}],
]) {
  test(`rejects invalid rail response: ${JSON.stringify(payload)}`, async () => {
    fetchMock.mock.mockImplementation(async () => Response.json(payload));
    await assert.rejects(new TrainService().getArrivals(), TypeError);
  });
}

test("malformed rail JSON is rejected", async () => {
  fetchMock.mock.mockImplementation(async () => new Response("{invalid"));
  await assert.rejects(new TrainService().getArrivals(), SyntaxError);
});

for (const [name, query, duration] of [
  ["trains", (m: Marta) => m.trains.getArrivals(), 5000],
  ["positions", (m: Marta) => m.buses.getPositions(), 20000],
  ["trips", (m: Marta) => m.buses.getTrips  (), 20000],
] as const) {
  test(`${name} creates a new timeout per request`, async () => {
    const timeout = mock.method(
      AbortSignal,
      "timeout",
      () => new AbortController().signal,
    );
    if (name === "trains")
      fetchMock.mock.mockImplementation(async () => Response.json([]));
    else respondWithFeed([]);
    const client = new Marta();
    assert.equal(timeout.mock.callCount(), 0);
    await query(client);
    await query(client);
    assert.deepEqual(
      timeout.mock.calls.map((c) => c.arguments),
      [[duration], [duration]],
    );
    assert.notEqual(
      fetchMock.mock.calls[0].arguments[1]?.signal,
      fetchMock.mock.calls[1].arguments[1]?.signal,
    );
  });
  test(`${name} rejects non-success responses without echoing response bodies`, async () => {
    fetchMock.mock.mockImplementation(
      async () => new Response("test-key", { status: 503 }),
    );
    await assert.rejects(
      query(new Marta()),
      (error) =>
        error instanceof Error &&
        /503/.test(error.message) &&
        !error.message.includes("test-key"),
    );
  });
  for (const error of [
    new TypeError("Network failure"),
    new DOMException("Timed out", "TimeoutError"),
  ]) {
    test(`${name} propagates ${error.name}`, async () => {
      fetchMock.mock.mockImplementation(async () => {
        throw error;
      });
      await assert.rejects(query(new Marta()), (actual) => actual === error);
    });
  }
}
