import "dotenv/config";
import { selectBusStopEvents } from "./bus-stop-event.ts";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { BusStopEvent, BusStopEventFilters, BusEventTypes } from "./bus-stop-event.ts";
export type { BusStopEvent, BusStopEventFilters } from "./bus-stop-event.ts";

const BUS_VEHICLE_POSITIONS_URL = (
    'https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb'
)
const BUS_TRIP_UPDATES_URL = (
    'https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb'
)

class BusService {
    trip: any;
    position: any;

    tripId: string;
    startDate: string;
    routeId: string;
    directionId: string;

    latitude: number;
    longitude: number;
    bearing: number;
    timestamp: number;
    rawData: any;

    apiKey: string | undefined;

    constructor({apiKey}: {
        apiKey?: string
    }) {
        this.apiKey = apiKey;
    }


    async getCanceled(filters: BusStopEventFilters): Promise<BusStopEvent[]> {
        return this.getBusStopEvents("canceled", filters);
    }

    async getScheduled(filters: BusStopEventFilters): Promise<BusStopEvent[]> {
        return this.getBusStopEvents("scheduled", filters);
    }

    async getArrivals(filters: BusStopEventFilters): Promise<BusStopEvent[]> {
        return this.getBusStopEvents("scheduled", filters);
    }

    async getDepartues(filters: BusStopEventFilters): Promise<BusStopEvent[]> {
        return this.getBusStopEvents("scheduled", filters);
    }

    
    async getGtfsData(url: string) {
         const res = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) throw new Error(`MARTA GTFS request failed: ${res.status} ${res.statusText}`);
        const buffer = await res.arrayBuffer();
        const gtfsRealtimeData = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
        return gtfsRealtimeData
    }

     private async getBusStopEvents(
            eventType: BusEventTypes,
            filters: BusStopEventFilters,
        ): Promise<BusStopEvent[]> {
        if (!filters || typeof filters.stopId !== "string" || !filters.stopId.trim()) {
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

        const feed = await this.getGtfsData(BUS_TRIP_UPDATES_URL);
        let newFilters = {}
        Object.keys(filters).filter(key => key !== 'stopId').forEach(key => newFilters[key] = filters[key]);   
        const selectedBusEvents = selectBusStopEvents(feed, eventType, { ...newFilters, from, to });
        
        return selectedBusEvents;
    }

}

export default BusService;