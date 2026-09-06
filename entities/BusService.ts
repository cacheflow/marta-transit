import GtfsRealtimeBindings from "gtfs-realtime-bindings";

/** A decoded GTFS Realtime snapshot, with protobuf fields preserved. */
export type BusFeed = GtfsRealtimeBindings.transit_realtime.FeedMessage;

const BUS_VEHICLE_POSITIONS_URL =
  "https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb";
const BUS_TRIP_UPDATES_URL =
  "https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb";

export default class BusService {
  /** Returns the complete trip-update snapshot, including cancellations. */
  async getTrips(): Promise<BusFeed> {
    return this.getGtfsData(BUS_TRIP_UPDATES_URL);
  }

  /** Returns the complete vehicle-position snapshot. No API key is needed. */
  async getPositions(): Promise<BusFeed> {
    return this.getGtfsData(BUS_VEHICLE_POSITIONS_URL);
  }

  private async getGtfsData(url: string): Promise<BusFeed> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept:
          "application/protobuf, application/protocol-buffer, application/octet-stream",
      },
    });
    
    if (!response.ok) {
      throw new Error(`MARTA bus request failed (HTTP ${response.status})`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
    const error = GtfsRealtimeBindings.transit_realtime.FeedMessage.verify(feed);

    if (error) {
      throw new TypeError(`Invalid MARTA bus feed: ${error}`);
    }

    return feed;
  }
}
