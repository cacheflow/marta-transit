import "dotenv/config";
import BusService from "./entities/BusService.ts";
import TrainService from "./entities/TrainService.ts";
export type { BusStopEvent, BusStopEventFilters } from "./entities/bus-stop-event.ts";

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

const marta = new Marta({apiKey: process.env.MARTA_API_KEY});

// marta.buses.getBusTrips({}).then(console.log).catch(console.error);
marta.buses.getBusVehiclePositions({}).then(console.log).catch(console.error);