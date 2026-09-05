import "dotenv/config";
import BusService from "./entities/BusService.ts";
import TrainService from "./entities/TrainService.ts";
export type { BusStopEvent, BusStopEventFilters } from "./entities/bus-stop-event.ts";

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


export class Marta {
    apiKey: string | undefined;
    readonly buses: BusService;
    readonly trains: TrainService;

    constructor({apiKey}: {
        apiKey?: string
    }) {
        this.apiKey = apiKey;
        this.buses = new BusService({apiKey: this.apiKey});
        this.trains = new TrainService({apiKey: this.apiKey});
    }
}