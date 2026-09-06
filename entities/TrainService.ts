const TRAIN_URL =
  "https://developerservices.itsmarta.com:18096/itsmarta/railrealtimearrivals/developerservices/traindata";

/** Original MARTA rail fields. Timestamps and waiting seconds remain strings. */
export interface TrainArrival {
  DESTINATION: string;
  DIRECTION: string;
  EVENT_TIME: string;
  LINE: string;
  NEXT_ARR: string;
  STATION: string;
  TRAIN_ID: string;
  WAITING_SECONDS: string;
  WAITING_TIME: string;
  IS_REALTIME?: string;
  DELAY?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
  [field: string]: unknown;
}

const fields = [
  "DESTINATION",
  "DIRECTION",
  "EVENT_TIME",
  "LINE",
  "NEXT_ARR",
  "STATION",
  "TRAIN_ID",
  "WAITING_SECONDS",
  "WAITING_TIME",
] as const satisfies readonly (keyof TrainArrival)[];

function isTrainArrival(value: unknown): value is TrainArrival {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const optional = ["IS_REALTIME", "DELAY", "LATITUDE", "LONGITUDE"] as const;
  return (
    fields.every(
      (field) =>
        field in value && typeof Reflect.get(value, field) === "string",
    ) &&
    optional.every(
      (field) =>
        !(field in value) || typeof Reflect.get(value, field) === "string",
    )
  );
}

export default class TrainService {
  readonly apiKey: string | undefined;

  constructor({
    apiKey = process.env.MARTA_API_KEY,
  }: { apiKey?: string } = {}) {
    this.apiKey = apiKey;
  }

  async getArrivals(): Promise<TrainArrival[]> {
    if (!this.apiKey?.trim()) {
      throw new Error("A MARTA API key is required for train arrivals");
    }
    
    const url = new URL(TRAIN_URL);
    url.searchParams.set("apiKey", this.apiKey);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`MARTA train request failed (HTTP ${response.status})`);
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every(isTrainArrival)) {
      throw new TypeError(
        "MARTA train response must be an array of rail arrival records with string fields",
      );
    }
    return data;
  }
}
