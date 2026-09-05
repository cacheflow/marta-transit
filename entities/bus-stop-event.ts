import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export interface BusStopEventFilters {
    stopId: string;
    routeId?: string;
    tripId?: string;
    vehicleId?: string;
    directionId?: 0 | 1;
    /** Absolute instant; defaults to now. */
    from?: Date;
    /** Exclusive bound; defaults to 30 minutes after from. */
    to?: Date;
}

export type BusEventTypes = 'scheduled' | 'added' | 'unscheduled' | 'canceled' | 'replacement' | 'duplicated' | 'deleted' | 'new';

const busEventTypesMap: Record<BusEventTypes, number> = {
    scheduled: 0,
    added: 1,
    unscheduled: 2,
    canceled: 3,
    replacement: 5,
    duplicated: 6,
    deleted: 7,
    new: 8,
}

export interface BusStopEvent {
    eventType: BusEventTypes;
    entityId: string;
    tripId?: string;
    routeId?: string;
    vehicleId?: string;
    directionId?: number;
    startDate?: string;
    startTime?: string;
    stopId: string;
    stopSequence?: number;
    time: Date;
    delaySeconds?: number;
    uncertaintySeconds?: number;
    /** Trip update timestamp, when supplied. */
    updatedAt?: Date;
    /** Feed snapshot timestamp, when supplied. */
    feedTimestamp?: Date;
}

// Protobuf scalar defaults are inherited: check presence before reading them.
function optionalField<T extends object, K extends keyof T>(value: T, key: K): NonNullable<T[K]> | undefined {
    return Object.hasOwn(value, key) ? value[key] ?? undefined : undefined;
}

function timestamp(value: unknown): Date | undefined {
    if (value == null) return undefined;
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds)) return undefined;
    const date = new Date(seconds * 1000);
    return Number.isFinite(date.getTime()) ? date : undefined;
}

export function selectBusStopEvents(
    feed: GtfsRealtimeBindings.transit_realtime.IFeedMessage,
    eventType: BusEventTypes,
    filters: BusStopEventFilters & { from: Date; to: Date },
): BusStopEvent[] {
    const results: BusStopEvent[] = [];
    const { TripDescriptor, TripUpdate } = GtfsRealtimeBindings.transit_realtime;
    const tripStatus = TripDescriptor.ScheduleRelationship;
    const stopStatus = TripUpdate.StopTimeUpdate.ScheduleRelationship;
    const feedTimestamp = timestamp(optionalField(feed.header, "timestamp"));

    for (const entity of feed.entity ?? []) {
        const update = entity.tripUpdate;
        if (entity.isDeleted || !update) continue;
        const trip = update.trip;
        const canceledTrip = trip.scheduleRelationship === tripStatus.CANCELED || trip.scheduleRelationship === tripStatus.DELETED;
        if (canceledTrip) continue;
        const tripId = optionalField(trip, "tripId");
        const routeId = optionalField(trip, "routeId");
        const directionId = optionalField(trip, "directionId");
        const vehicleId = update.vehicle ? optionalField(update.vehicle, "id") : undefined;
        if ((filters?.tripId && filters.tripId !== tripId) ||
            (filters?.routeId && filters.routeId !== routeId) ||
            (filters?.vehicleId && filters.vehicleId !== vehicleId) ||
            (filters?.directionId && filters.directionId !== directionId)) continue;

        
        for (const stop of update.stopTimeUpdate ?? []) {
            const stopId = stop.stopTimeProperties?.assignedStopId || stop.stopId;
            const skippedStop = stop.scheduleRelationship === stopStatus.SKIPPED;
            if (skippedStop) {
                continue;
            }
            const missingStop = stop.scheduleRelationship === stopStatus.NO_DATA;
            console.log('missingStop is ', missingStop)
            const noFilteredStop = filters?.stopId && stopId !== filters.stopId;
            console.log('noFilteredStop is ', noFilteredStop)

            if (noFilteredStop || missingStop) {
                console.log('failing')
                continue
            }
            const eventKey = busEventTypesMap[eventType as string];
            console.log('stop is ', stop);
            const event = stop[eventKey];
            console.log('event is ', event)
            if (!event) continue;
            const time = timestamp(optionalField(event, "time"));
            // Delay-only updates need static GTFS; never invent an arrival/departure.
            if (!time || time.getTime() < filters.from.getTime() ||
                time.getTime() >= filters.to.getTime()) continue;
            console.log('results ', results)
            results.push({
                eventType, 
                entityId: entity.id, tripId, routeId, vehicleId, directionId,
                startDate: optionalField(trip, "startDate"),
                startTime: optionalField(trip, "startTime"),
                stopId, stopSequence: optionalField(stop, "stopSequence"), time,
                delaySeconds: optionalField(event, "delay"),
                uncertaintySeconds: optionalField(event, "uncertainty"),
                updatedAt: timestamp(optionalField(update, "timestamp")),
                feedTimestamp,
            });
        }
    }
    return results.sort((a, b) => a.time.getTime() - b.time.getTime());
}
