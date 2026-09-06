import { Marta } from '../dist/app.js';

const marta = new Marta();
const positions = await marta.buses.getBusVehiclePositions();
console.log(`Vehicle positions: ${positions.entity.length}`);
const trips = await marta.buses.getBusTrips();
console.log(`Trip updates: ${trips.entity.length}`);
if (marta.apiKey) {
    const trains = await marta.trains.get();
    console.log(`Train arrivals: ${trains.length}`);
}
