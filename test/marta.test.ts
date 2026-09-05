import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import type { Mock } from 'node:test';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { Bus, Marta } from '../app.ts';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
let originalKey: string | undefined;
let fetchMock: Mock<typeof fetch>;
let timeoutMock: Mock<typeof AbortSignal.timeout>;
let signal: AbortSignal;

beforeEach(() => {
  originalKey = process.env.MARTA_API_KEY;
  process.env.MARTA_API_KEY = 'test-api-key';
  signal = new AbortController().signal;
  timeoutMock = mock.method(AbortSignal, 'timeout', () => signal);
  fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected request: configure a mock response');
  });
});

afterEach(() => {
  mock.restoreAll();
  if (originalKey === undefined) delete process.env.MARTA_API_KEY;
  else process.env.MARTA_API_KEY = originalKey;
});

function assertRequest(url: string) {
  assert.equal(fetchMock.mock.callCount(), 1);
  const [actualUrl, options] = fetchMock.mock.calls[0].arguments;
  const headers = options?.headers as Record<string, string> | undefined;
  assert.equal(actualUrl, url);
  assert.equal(headers?.Authorization, 'Bearer test-api-key');
  assert.equal(options?.signal, signal);
  assert.deepEqual(timeoutMock.mock.calls.map(call => call.arguments), [[5000]]);
}

function respondWithFeed(entity: GtfsRealtimeBindings.transit_realtime.IFeedEntity[]) {
  const bytes = FeedMessage.encode(FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0' }, entity,
  })).finish();
  fetchMock.mock.mockImplementation(async () => new Response(bytes));
}

test('constructor captures the API key from the environment', () => {
  const client = new Marta();
  process.env.MARTA_API_KEY = 'changed-key';
  assert.equal(client.api_key, 'test-api-key');
});

test('getTrains returns the original JSON fields and sends an authenticated, timed request', async () => {
  const trains = [{ TRAIN_ID: '102026', LINE: 'BLUE', WAITING_TIME: 'Boarding' }];
  fetchMock.mock.mockImplementation(async () => Response.json(trains));
  assert.deepEqual(await new Marta().getTrains(), trains);
  assertRequest('https://developerservices.itsmarta.com:18096/itsmarta/railrealtimearrivals/developerservices/traindata');
});

test('getBuses decodes real protobuf bytes and returns every vehicle in feed order', async () => {
  respondWithFeed([
    { id: 'first', vehicle: {
      trip: { tripId: 'trip-1', startDate: '20260904', routeId: '3', directionId: 0 },
      position: { latitude: 33.75, longitude: -84.5, bearing: 90 },
      timestamp: 1788560400,
      vehicle: { id: '2417' },
    } },
    { id: 'second', vehicle: {
      trip: { tripId: 'trip-2', routeId: '5', directionId: 1 },
      position: { latitude: 33.5, longitude: -84.25 },
    } },
  ]);
  const buses = await new Marta().getBuses();
  assert.equal(buses.length, 2);
  assert.ok(buses.every(bus => bus instanceof Bus));
  assert.deepEqual(buses.map(bus => bus.tripId), ['trip-1', 'trip-2']);
  const bus = buses[0];
  assert.equal(bus.startDate, '20260904');
  assert.equal(bus.routeId, '3');
  assert.equal(bus.directionId, 0);
  assert.equal(bus.latitude, 33.75);
  assert.equal(bus.longitude, -84.5);
  assert.equal(bus.bearing, 90);
  assert.equal(Number(bus.timestamp), 1788560400);
  assert.equal(bus.rawData.vehicle.id, '2417');
  assert.equal(bus.trip, bus.rawData.trip);
  assert.equal(bus.position, bus.rawData.position);
  assertRequest('https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb');
});

test('getBuses returns an empty array for an empty feed', async () => {
  respondWithFeed([]);
  assert.deepEqual(await new Marta().getBuses(), []);
});

test('Bus tolerates absent vehicle data', () => {
  const bus = new Bus(undefined);
  const fields = ['trip', 'position', 'tripId', 'startDate', 'routeId', 'directionId',
    'latitude', 'longitude', 'bearing', 'timestamp', 'rawData'] as const satisfies readonly (keyof Bus)[];
  for (const field of fields) {
    assert.equal(bus[field], undefined, field);
  }
});

for (const method of ['getTrains', 'getBuses'] as const) {
  for (const error of [new TypeError('Network failure'), new DOMException('Timed out', 'TimeoutError')]) {
    test(`${method} propagates ${error.name}`, async () => {
      fetchMock.mock.mockImplementation(async () => { throw error; });
      await assert.rejects(new Marta()[method](), actual => actual === error);
    });
  }
}

test('getTrains rejects malformed JSON', async () => {
  fetchMock.mock.mockImplementation(async () => new Response('{invalid'));
  await assert.rejects(new Marta().getTrains(), SyntaxError);
});

test('getBuses rejects a truncated protobuf message', async () => {
  fetchMock.mock.mockImplementation(async () => new Response(new Uint8Array([0x0a, 0x05, 0x01])));
  await assert.rejects(new Marta().getBuses());
});
