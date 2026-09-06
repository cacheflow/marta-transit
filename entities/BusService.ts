import "dotenv/config";
import { defaultVal, timestamp } from "./bus-stop-event.ts";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { BusStopEvent, BusStopEventFilters, BusEventTypes } from "./bus-stop-event.ts";
export type { BusStopEvent, BusStopEventFilters } from "./bus-stop-event.ts";

const BUS_VEHICLE_POSITIONS_URL = (
  'https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb'
)
const BUS_TRIP_UPDATES_URL = (
  'https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb'
)

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


class BusService {
    readonly apiKey: string | undefined;

    constructor({apiKey}: {
        apiKey?: string
    }) {
        this.apiKey = apiKey;
    }

    async getBusTrips(filters: BusStopEventFilters): Promise<BusStopEvent[]> {
        return this.getBusStopEvents(BUS_TRIP_UPDATES_URL,filters);
    }

    async getBusVehiclePositions(): Promise<GtfsRealtimeBindings.transit_realtime.IFeedMessage> {
        return this.getGtfsData(BUS_VEHICLE_POSITIONS_URL);
    }
    
    async getGtfsData(url: string) {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(20000),
          headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
          }
        });

        if (!res.ok) {
          throw new Error(`MARTA GTFS request failed: ${res.status} ${res.statusText}`);
        }

        const buffer = await res.arrayBuffer();
        const gtfsRealtimeData = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
        return gtfsRealtimeData
    }

     private async getBusStopEvents(
        url: string,
        filters: BusStopEventFilters,
      ): Promise<BusStopEvent[]> {
        const stopId = filters?.stopId?.trim();

        if (!filters || (stopId && typeof stopId !== "string") || (stopId && !stopId)) {
            throw new TypeError("stopId must be a non-empty string");
        }

        const from = filters.from ?? new Date();

        if (!(from instanceof Date) || !Number.isFinite(from.getTime())) {
            throw new RangeError("from must be a valid Date");
        }  

        const thirtyMinutes = 30 * 60_000;
        // Default to 30 minutes after 'from' if 'to' is not provided
        const to = filters.to ?? new Date(from.getTime() + thirtyMinutes);

        if (!(to instanceof Date) || !Number.isFinite(to.getTime())) {
            throw new RangeError("to must be a valid Date");
        }

        if (from.getTime() >= to.getTime()) {
            throw new RangeError("from must be earlier than to");
        }

        const feed = await this.getGtfsData(url);
        const selectedBusEvents = this.selectBusStopEvents(feed, { ...filters, from, to });
        
        return selectedBusEvents;
    }

    private selectBusStopEvents(
        feed: GtfsRealtimeBindings.transit_realtime.IFeedMessage,
        filters: BusStopEventFilters & { from: Date; to: Date },
    ): BusStopEvent[] {
        const { TripDescriptor } = GtfsRealtimeBindings.transit_realtime;
        const tripStatus = TripDescriptor.ScheduleRelationship;
        const matchingBuses  = feed.entity?.filter((entity): entity is GtfsRealtimeBindings.transit_realtime.IFeedEntity & {
            tripUpdate: GtfsRealtimeBindings.transit_realtime.ITripUpdate;
        } => {
          const updatedTrip = entity?.tripUpdate;
          if (entity.isDeleted || !updatedTrip) {
              return false;
          }
          
          const trip = updatedTrip.trip;

          const canceledTrip = trip.scheduleRelationship === tripStatus.CANCELED || trip.scheduleRelationship === tripStatus.DELETED;

          if (canceledTrip) {
              return false;
          }

          const tripId = defaultVal(trip, 'tripId', undefined)
          const routeId = defaultVal(trip, 'routeId', undefined);
          const directionId = defaultVal(trip, 'directionId', undefined);
          const vehicleId = updatedTrip.vehicle ? defaultVal(updatedTrip.vehicle, "id", undefined) : undefined;
          const matchingTrip = filters.tripId == tripId
          const matchingRoute = filters.routeId == routeId
          const matchingVehicle = filters.vehicleId == vehicleId
          const matchingDirection = filters.directionId == directionId
          const busMatch = matchingTrip || matchingRoute || matchingVehicle || matchingDirection;

          return busMatch;
        }) || [];

        return matchingBuses.map((busEntity) => {
          return {
            entityId: busEntity.id,
            tripUpdate: busEntity.tripUpdate,
            trip: busEntity.tripUpdate.trip,
            tripId: defaultVal(busEntity.tripUpdate.trip, 'tripId', 'undefined'),
            routeId: defaultVal(busEntity.tripUpdate.trip, 'routeId', 'undefined'),
            vehicleId: busEntity.tripUpdate?.vehicle ? defaultVal(busEntity.tripUpdate.vehicle, "id", undefined) : undefined,
            directionId: defaultVal(busEntity.tripUpdate.trip, 'directionId', undefined),
            startDate: defaultVal(busEntity.tripUpdate.trip, "startDate", undefined),
            startTime: defaultVal(busEntity.tripUpdate.trip, "startTime", undefined),
            updatedAt: busEntity.tripUpdate?.timestamp ? timestamp(busEntity.tripUpdate.timestamp) : undefined,
            timestamp: feed.header?.timestamp ? timestamp(feed.header.timestamp) : undefined,
          }
        })
    }

}

export default BusService;