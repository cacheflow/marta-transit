const TRAIN_URL = (
    'https://developerservices.itsmarta.com:18096/itsmarta/railrealtimearrivals/developerservices/traindata'
)
class TrainService {
    readonly apiKey: string | undefined;

    constructor({apiKey}: {apiKey?: string}) {
       this.apiKey = apiKey;
    }

    async get() {
        const res = await fetch(TRAIN_URL, {
            signal: AbortSignal.timeout(5000),
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        })
        const json = await res.json()
        return json;
    }
}

export default TrainService;