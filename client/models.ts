export class User {
    id: number;
    username: string;
    isAdmin: boolean;
    publicProfile: boolean;
    lastLogin: string;
    createdOn: string;
}

export class Flight {
    id: number;
    username: string;
    date: string;
    origin: Airport;
    destination: Airport;
    departureTime: string;
    arrivalTime: string;
    arrivalDate: string;
    seat: string;
    seatNumber: string;
    aircraftSide: string;
    ticketClass: string;
    purpose: string;
    duration: number;
    distance: number;
    airplane: string;
    airline: Airline;
    tailNumber: string;
    flightNumber: string;
    notes: string;
    cost: number;
    currency: string;
    rating: number;
    connection: number;

    toString(): string {
        if (this === null) return "N/A";

        if (this.origin.country == this.destination.country) {
            return this.origin.region + " to " + this.destination.region + ", " + this.date
        }

        return this.origin.country + " to " + this.destination.country + ", " + this.date
    }
}

export class Airport {
    icao: string;
    iata: string;
    type: string;
    name: string;
    municipality: string;
    region: string;
    country: string;
    continent: string;
    latitude: number;
    longitude: number;
    timezone: string;

    toString(): string {
        if (this === null) return "N/A";

        return (this.iata || this.icao) + " - " + this.municipality + "/" + this.country;
    }
}

export class Airline {
    icao: string;
    iata: string;
    name: string;

    toString(): string {
        if (this === null) return "N/A";

        return (this.iata || this.icao) + " - " + this.name;
    }
}

export class Statistics {
    totalFlights: number;
    totalDuration: number;
    totalDistance: number;
    totalUniqueAirports: number;
    daysRange: number;
    visitedCountries: number;
    mostVisitedAirports: object;
    mostCommonCountries: object;
    seatFrequency: object;
    ticketClassFrequency: object;
    mostCommonAirlines: object;
    flightsByMonth: { month: string; count: number }[];
    distanceByMonth: { month: string; distance: number }[];
    topRoutes: { origin: string; destination: string; count: number }[];
    topAircraft: { airplane: string; count: number }[];
    records: {
        longestDistance?: { origin: string; destination: string; distance: number; date: string };
        shortestDistance?: { origin: string; destination: string; distance: number; date: string };
        longestDuration?: { origin: string; destination: string; duration: number; date: string };
        mostFlightsInDay?: { date: string; count: number };
        busiestMonth?: { month: string; count: number };
    };
    totalCost: { [currency: string]: number };
    costPerKm: { [currency: string]: number };
    avgCostByClass: { class: string; currency: string; avg: number }[];
    totalCo2Kg: number;
    avgSpeedKmh: number;
    uniqueTimezones: number;
    continentCompletion: { continent: string; visited: number; total: number }[];
    flightsByDay: { date: string; count: number }[];
    avgRating: number;
    ratedFlights: number;
    ratingByAirline: { airline: string; avg: number; count: number }[];
    ratingDistribution: { [key: string]: number };
    sideFrequency: { [key: string]: number };
    layoverStats: {
        avgMinutes?: number;
        shortest?: { hub: string; minutes: number };
        longest?: { hub: string; minutes: number };
        count?: number;
        busiestHub?: { icao: string; count: number };
    };
    redeyeCount: number;
}

export class Coord {
    latitude: number;
    longitude: number;
    frequency: number;
    icao?: string;
    iata?: string;
    name?: string;
}

export class Trajectory {
    first: Coord;
    second: Coord;
    frequency: number;
    originIcao?: string;
    destIcao?: string;
}
