import BusService from "./entities/BusService.ts";
import TrainService from "./entities/TrainService.ts";

export { BusService, TrainService };
export type { TrainArrival } from "./entities/TrainService.ts";
export type { BusFeed } from "./entities/BusService.ts";

export interface MartaOptions {
  /** Required only for rail queries; defaults to MARTA_API_KEY. */
  apiKey?: string;
}

export class Marta {
  readonly apiKey: string | undefined;
  readonly buses: BusService;
  readonly trains: TrainService;

  constructor({ apiKey = process.env.MARTA_API_KEY }: MartaOptions = {}) {
    this.apiKey = apiKey;
    this.buses = new BusService();
    this.trains = new TrainService({ apiKey });
  }
}
