export interface BusStopEventFilters {
    stopId?: string;
    routeId?: string;
    tripId?: string;
    vehicleId?: string;
    directionId?: 0 | 1;
    /** Absolute instant; defaults to now. */
    from?: Date;
    /** Exclusive bound; defaults to 30 minutes after from. */
    to?: Date;
}

export type BusEventTypes = 'scheduled' | 'added' | 'unscheduled' | 'canceled' | 'replacement' | 'duplicated' | 'deleted' | 'new';

export interface BusStopEvent {
    eventType?: BusEventTypes;
    entityId: string;
    tripId?: string;
    routeId?: string;
    vehicleId?: string;
    directionId?: number;
    startDate?: string;
    startTime?: string;
    stopId?: string;
    stopSequence?: number;
    time?: Date;
    delaySeconds?: number;
    uncertaintySeconds?: number;
    /** Trip update timestamp, when supplied. */
    updatedAt?: Date;
    /** Feed snapshot timestamp, when supplied. */
    feedTimestamp?: Date;
}

// Protobuf scalar defaults are inherited: check presence before reading them.

export function defaultVal<T extends object, K extends keyof T, U>(value: T, key: K, defaultValue?: U): NonNullable<T[K]> | U | undefined {
    const containsVal = Object.hasOwn(value, key);

    if (containsVal) {
        return value[key] ?? defaultValue;
    }

    return defaultValue;
}

export function timestamp(value: unknown): Date | undefined {
    if (value == null) return undefined;
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds)) return undefined;
    const date = new Date(seconds * 1000);
    return Number.isFinite(date.getTime()) ? date : undefined;
}