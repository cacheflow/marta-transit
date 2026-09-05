import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { Marta } from '../app.ts';
const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
const start = 1788600000;
const from = new Date(start * 1000);
const filters = { stopId: 'S', from, to: new Date((start + 1800) * 1000) };
type Entity = GtfsRealtimeBindings.transit_realtime.IFeedEntity;
function respond(entity: Entity[]) {
    const bytes = FeedMessage.encode({ header: { gtfsRealtimeVersion: '2.0', timestamp: start - 10 }, entity }).finish();
    return mock.method(globalThis, 'fetch', async (_url: Parameters<typeof fetch>[0], _options?: RequestInit) => new Response(Uint8Array.from(bytes)));
}
function trip(stopTimeUpdate: GtfsRealtimeBindings.transit_realtime.TripUpdate.IStopTimeUpdate[]): Entity {
    return { id: 'e', tripUpdate: { trip: { tripId: 'T', routeId: '15', directionId: 0 }, vehicle: { id: 'V' }, timestamp: start - 20, stopTimeUpdate } };
}
afterEach(() => { mock.restoreAll(); mock.timers.reset(); });
for (const [method, eventType] of [['getBusArrivals', 'arrival'], ['getBusDepartures', 'departure']] as const) {
    test(`${method}: AND filters, sorted loop visits, inclusive start and exclusive end`, async () => {
        const other = trip([{ stopId: 'S', [eventType]: { time: start + 1 } }]);
        other.tripUpdate!.trip.routeId = '99';
        respond([trip([
            { stopId: 'S', stopSequence: 9, [eventType]: { time: start + 100 } },
            { stopId: 'S', stopSequence: 2, [eventType]: { time: start, delay: 0, uncertainty: 0 } },
            { stopId: 'S', [eventType]: { time: start - 1 } },
            { stopId: 'S', [eventType]: { time: start + 1800 } },
            { stopId: 'other', [eventType]: { time: start + 10 } },
        ]), other]);
        const events = await new Marta()[method]({ ...filters, routeId: '15', tripId: 'T', vehicleId: 'V', directionId: 0 });
        assert.deepEqual(events.map(e => e.stopSequence), [2, 9]);
        assert.equal(events[0].eventType, eventType);
        assert.equal(events[0].time.getTime(), from.getTime());
        assert.equal(events[0].delaySeconds, 0);
        assert.equal(events[0].uncertaintySeconds, 0);
        assert.equal(events[1].delaySeconds, undefined);
        assert.equal(events[0].updatedAt?.getTime(), (start - 20) * 1000);
        assert.equal(events[0].feedTimestamp?.getTime(), (start - 10) * 1000);
    });
    test(`${method}: excludes missing times, skipped/no-data stops, canceled/deleted trips`, async () => {
        const canceled = trip([{ stopId: 'S', [eventType]: { time: start } }]);
        canceled.tripUpdate!.trip.scheduleRelationship = 3;
        const deleted = trip([{ stopId: 'S', [eventType]: { time: start } }]);
        deleted.tripUpdate!.trip.scheduleRelationship = 7;
        const tombstone = trip([{ stopId: 'S', [eventType]: { time: start } }]);
        tombstone.isDeleted = true;
        respond([canceled, deleted, tombstone, { id: 'empty' }, trip([
            { stopId: 'S', [eventType]: { delay: 60 } },
            { stopId: 'S', scheduleRelationship: 1, [eventType]: { time: start } },
            { stopId: 'S', scheduleRelationship: 2, [eventType]: { time: start } },
            { stopId: 'S' },
        ])]);
        assert.deepEqual(await new Marta()[method](filters), []);
    });
}
test('arrival and departure use their own timestamps', async () => {
    respond([trip([{ stopId: 'S', arrival: { time: start + 10 }, departure: { time: start + 40 } }])]);
    const client = new Marta();
    assert.equal((await client.getBusArrivals(filters))[0].time.getTime(), (start + 10) * 1000);
    assert.equal((await client.getBusDepartures(filters))[0].time.getTime(), (start + 40) * 1000);
});
test('default window is thirty minutes from now; timeout is fresh per request', async () => {
    mock.timers.enable({ apis: ['Date'], now: from.getTime() });
    const timeout = mock.method(AbortSignal, 'timeout', () => new AbortController().signal);
    const request = respond([trip([{ stopId: 'S', arrival: { time: start + 1799 } }, { stopId: 'S', arrival: { time: start + 1800 } }])]);
    const client = new Marta();
    assert.equal(timeout.mock.callCount(), 0);
    assert.equal((await client.getBusArrivals({ stopId: 'S' })).length, 1);
    await client.getBusDepartures({ stopId: 'S' });
    assert.equal(timeout.mock.callCount(), 2);
    assert.match(String(request.mock.calls[0].arguments[0]), /tripupdate\/tripupdates.pb$/);
});
test('absent protobuf direction does not match zero; assigned stop ID is honored', async () => {
    const entry = trip([{ stopId: 'old', stopTimeProperties: { assignedStopId: 'S' }, arrival: { time: start } }]);
    delete entry.tripUpdate!.trip.directionId;
    respond([entry]);
    const client = new Marta();
    assert.deepEqual(await client.getBusArrivals({ ...filters, directionId: 0 }), []);
    const results = await client.getBusArrivals(filters);
    assert.equal(results[0].stopId, 'S');
    assert.equal(results[0].directionId, undefined);
});
test('validates inputs before fetching', async () => {
    const fetchMock = respond([]);
    const client = new Marta();
    await assert.rejects(client.getBusArrivals({ ...filters, stopId: '' }), TypeError);
    await assert.rejects(client.getBusDepartures({ ...filters, to: from }), RangeError);
    await assert.rejects(client.getBusArrivals({ ...filters, from: new Date(NaN) }), RangeError);
    assert.equal(fetchMock.mock.callCount(), 0);
});
test('HTTP failures propagate', async () => {
    mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
    await assert.rejects(new Marta().getBusArrivals(filters), /503/);
});
