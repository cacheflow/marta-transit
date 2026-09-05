import "dotenv/config";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";


const BASE_URL = 'https://developer.itsmarta.com'
const TRAIN_URL = (
    'https://developerservices.itsmarta.com:18096/itsmarta/railrealtimearrivals/developerservices/traindata'
)
const BUS_VEHICLE_POSITIONS_URL = (
    'https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb'
)
const BUS_TRIP_UPDATES_URL = (
    'https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb' 
)

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

class Bus {
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

    constructor(vehicle: any) {
        this.trip = vehicle?.trip
        this.position = vehicle?.position

        this.tripId = this.trip?.tripId
        this.startDate = this.trip?.startDate
        this.routeId = this.trip?.routeId
        this.directionId = this.trip?.directionId

        this.latitude = this.position?.latitude
        this.longitude = this.position?.longitude
        this.bearing = this.position?.bearing
        this.timestamp = vehicle?.timestamp
        this.rawData = vehicle
    }
}


class Marta {
    api_key: string

    constructor() {
        this.api_key = process.env.MARTA_API_KEY;
    }

    async getTrains() {
        const res = await fetch(TRAIN_URL, {
            signal: AbortSignal.timeout(5000),
            headers: {
                'Authorization': `Bearer ${this.api_key}`,
                'Content-Type': 'application/json'
            }
        })
        const json = await res.json()
        return json;
    }

    toBus = (vehicle: any) => new Bus(vehicle)

    async getBuses() {
        const res = await fetch(BUS_VEHICLE_POSITIONS_URL, {
            signal: AbortSignal.timeout(5000),
            headers: {
                'Authorization': `Bearer ${this.api_key}`,
                'Content-Type': 'application/json'
            }
        });
        const buffer = await res.arrayBuffer();
        const busPositions = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
        const entity = busPositions.entity
        const buses = entity.map(e => this.toBus(e.vehicle));
        return buses[0]

    }
}