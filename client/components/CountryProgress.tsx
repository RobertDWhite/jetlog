import React, { useMemo } from 'react';

interface CountryProgressProps {
    visitedCountries: string[];
}

// Flag emoji helper: convert 2-letter ISO code to flag emoji
function countryFlag(iso: string): string {
    if (!iso || iso.length !== 2) return '';
    const codePoints = iso
        .toUpperCase()
        .split('')
        .map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
}

interface ContinentData {
    name: string;
    countries: { name: string; iso: string }[];
}

const CONTINENTS: ContinentData[] = [
    {
        name: 'Europe',
        countries: [
            { name: 'Albania', iso: 'AL' }, { name: 'Andorra', iso: 'AD' }, { name: 'Austria', iso: 'AT' },
            { name: 'Belarus', iso: 'BY' }, { name: 'Belgium', iso: 'BE' }, { name: 'Bosnia and Herzegovina', iso: 'BA' },
            { name: 'Bulgaria', iso: 'BG' }, { name: 'Croatia', iso: 'HR' }, { name: 'Cyprus', iso: 'CY' },
            { name: 'Czech Republic', iso: 'CZ' }, { name: 'Denmark', iso: 'DK' }, { name: 'Estonia', iso: 'EE' },
            { name: 'Finland', iso: 'FI' }, { name: 'France', iso: 'FR' }, { name: 'Germany', iso: 'DE' },
            { name: 'Greece', iso: 'GR' }, { name: 'Hungary', iso: 'HU' }, { name: 'Iceland', iso: 'IS' },
            { name: 'Ireland', iso: 'IE' }, { name: 'Italy', iso: 'IT' }, { name: 'Kosovo', iso: 'XK' },
            { name: 'Latvia', iso: 'LV' }, { name: 'Liechtenstein', iso: 'LI' }, { name: 'Lithuania', iso: 'LT' },
            { name: 'Luxembourg', iso: 'LU' }, { name: 'Malta', iso: 'MT' }, { name: 'Moldova', iso: 'MD' },
            { name: 'Monaco', iso: 'MC' }, { name: 'Montenegro', iso: 'ME' }, { name: 'Netherlands', iso: 'NL' },
            { name: 'North Macedonia', iso: 'MK' }, { name: 'Norway', iso: 'NO' }, { name: 'Poland', iso: 'PL' },
            { name: 'Portugal', iso: 'PT' }, { name: 'Romania', iso: 'RO' }, { name: 'Russia', iso: 'RU' },
            { name: 'San Marino', iso: 'SM' }, { name: 'Serbia', iso: 'RS' }, { name: 'Slovakia', iso: 'SK' },
            { name: 'Slovenia', iso: 'SI' }, { name: 'Spain', iso: 'ES' }, { name: 'Sweden', iso: 'SE' },
            { name: 'Switzerland', iso: 'CH' }, { name: 'United Kingdom', iso: 'GB' },
        ],
    },
    {
        name: 'Asia',
        countries: [
            { name: 'Afghanistan', iso: 'AF' }, { name: 'Armenia', iso: 'AM' }, { name: 'Azerbaijan', iso: 'AZ' },
            { name: 'Bahrain', iso: 'BH' }, { name: 'Bangladesh', iso: 'BD' }, { name: 'Bhutan', iso: 'BT' },
            { name: 'Brunei', iso: 'BN' }, { name: 'Cambodia', iso: 'KH' }, { name: 'China', iso: 'CN' },
            { name: 'Georgia', iso: 'GE' }, { name: 'India', iso: 'IN' }, { name: 'Indonesia', iso: 'ID' },
            { name: 'Iran', iso: 'IR' }, { name: 'Iraq', iso: 'IQ' }, { name: 'Israel', iso: 'IL' },
            { name: 'Japan', iso: 'JP' }, { name: 'Jordan', iso: 'JO' }, { name: 'Kazakhstan', iso: 'KZ' },
            { name: 'Kuwait', iso: 'KW' }, { name: 'Kyrgyzstan', iso: 'KG' }, { name: 'Laos', iso: 'LA' },
            { name: 'Lebanon', iso: 'LB' }, { name: 'Malaysia', iso: 'MY' }, { name: 'Maldives', iso: 'MV' },
            { name: 'Mongolia', iso: 'MN' }, { name: 'Myanmar', iso: 'MM' }, { name: 'Nepal', iso: 'NP' },
            { name: 'North Korea', iso: 'KP' }, { name: 'Oman', iso: 'OM' }, { name: 'Pakistan', iso: 'PK' },
            { name: 'Palestine', iso: 'PS' }, { name: 'Philippines', iso: 'PH' }, { name: 'Qatar', iso: 'QA' },
            { name: 'Saudi Arabia', iso: 'SA' }, { name: 'Singapore', iso: 'SG' }, { name: 'South Korea', iso: 'KR' },
            { name: 'Sri Lanka', iso: 'LK' }, { name: 'Syria', iso: 'SY' }, { name: 'Taiwan', iso: 'TW' },
            { name: 'Tajikistan', iso: 'TJ' }, { name: 'Thailand', iso: 'TH' }, { name: 'Timor-Leste', iso: 'TL' },
            { name: 'Turkey', iso: 'TR' }, { name: 'Turkmenistan', iso: 'TM' }, { name: 'UAE', iso: 'AE' },
            { name: 'Uzbekistan', iso: 'UZ' }, { name: 'Vietnam', iso: 'VN' },
        ],
    },
    {
        name: 'North America',
        countries: [
            { name: 'Antigua and Barbuda', iso: 'AG' }, { name: 'Bahamas', iso: 'BS' }, { name: 'Barbados', iso: 'BB' },
            { name: 'Belize', iso: 'BZ' }, { name: 'Canada', iso: 'CA' }, { name: 'Costa Rica', iso: 'CR' },
            { name: 'Cuba', iso: 'CU' }, { name: 'Dominica', iso: 'DM' }, { name: 'Dominican Republic', iso: 'DO' },
            { name: 'El Salvador', iso: 'SV' }, { name: 'Grenada', iso: 'GD' }, { name: 'Guatemala', iso: 'GT' },
            { name: 'Haiti', iso: 'HT' }, { name: 'Honduras', iso: 'HN' }, { name: 'Jamaica', iso: 'JM' },
            { name: 'Mexico', iso: 'MX' }, { name: 'Nicaragua', iso: 'NI' }, { name: 'Panama', iso: 'PA' },
            { name: 'Saint Kitts and Nevis', iso: 'KN' }, { name: 'Saint Lucia', iso: 'LC' },
            { name: 'Saint Vincent', iso: 'VC' }, { name: 'Trinidad and Tobago', iso: 'TT' },
            { name: 'United States', iso: 'US' },
        ],
    },
    {
        name: 'South America',
        countries: [
            { name: 'Argentina', iso: 'AR' }, { name: 'Bolivia', iso: 'BO' }, { name: 'Brazil', iso: 'BR' },
            { name: 'Chile', iso: 'CL' }, { name: 'Colombia', iso: 'CO' }, { name: 'Ecuador', iso: 'EC' },
            { name: 'Guyana', iso: 'GY' }, { name: 'Paraguay', iso: 'PY' }, { name: 'Peru', iso: 'PE' },
            { name: 'Suriname', iso: 'SR' }, { name: 'Uruguay', iso: 'UY' }, { name: 'Venezuela', iso: 'VE' },
        ],
    },
    {
        name: 'Africa',
        countries: [
            { name: 'Algeria', iso: 'DZ' }, { name: 'Angola', iso: 'AO' }, { name: 'Benin', iso: 'BJ' },
            { name: 'Botswana', iso: 'BW' }, { name: 'Burkina Faso', iso: 'BF' }, { name: 'Burundi', iso: 'BI' },
            { name: 'Cabo Verde', iso: 'CV' }, { name: 'Cameroon', iso: 'CM' }, { name: 'Central African Republic', iso: 'CF' },
            { name: 'Chad', iso: 'TD' }, { name: 'Comoros', iso: 'KM' }, { name: 'Congo', iso: 'CG' },
            { name: 'DR Congo', iso: 'CD' }, { name: 'Djibouti', iso: 'DJ' }, { name: 'Egypt', iso: 'EG' },
            { name: 'Equatorial Guinea', iso: 'GQ' }, { name: 'Eritrea', iso: 'ER' }, { name: 'Eswatini', iso: 'SZ' },
            { name: 'Ethiopia', iso: 'ET' }, { name: 'Gabon', iso: 'GA' }, { name: 'Gambia', iso: 'GM' },
            { name: 'Ghana', iso: 'GH' }, { name: 'Guinea', iso: 'GN' }, { name: 'Guinea-Bissau', iso: 'GW' },
            { name: 'Ivory Coast', iso: 'CI' }, { name: 'Kenya', iso: 'KE' }, { name: 'Lesotho', iso: 'LS' },
            { name: 'Liberia', iso: 'LR' }, { name: 'Libya', iso: 'LY' }, { name: 'Madagascar', iso: 'MG' },
            { name: 'Malawi', iso: 'MW' }, { name: 'Mali', iso: 'ML' }, { name: 'Mauritania', iso: 'MR' },
            { name: 'Mauritius', iso: 'MU' }, { name: 'Morocco', iso: 'MA' }, { name: 'Mozambique', iso: 'MZ' },
            { name: 'Namibia', iso: 'NA' }, { name: 'Niger', iso: 'NE' }, { name: 'Nigeria', iso: 'NG' },
            { name: 'Rwanda', iso: 'RW' }, { name: 'Sao Tome and Principe', iso: 'ST' }, { name: 'Senegal', iso: 'SN' },
            { name: 'Seychelles', iso: 'SC' }, { name: 'Sierra Leone', iso: 'SL' }, { name: 'Somalia', iso: 'SO' },
            { name: 'South Africa', iso: 'ZA' }, { name: 'South Sudan', iso: 'SS' }, { name: 'Sudan', iso: 'SD' },
            { name: 'Tanzania', iso: 'TZ' }, { name: 'Togo', iso: 'TG' }, { name: 'Tunisia', iso: 'TN' },
            { name: 'Uganda', iso: 'UG' }, { name: 'Zambia', iso: 'ZM' }, { name: 'Zimbabwe', iso: 'ZW' },
        ],
    },
    {
        name: 'Oceania',
        countries: [
            { name: 'Australia', iso: 'AU' }, { name: 'Fiji', iso: 'FJ' }, { name: 'Kiribati', iso: 'KI' },
            { name: 'Marshall Islands', iso: 'MH' }, { name: 'Micronesia', iso: 'FM' }, { name: 'Nauru', iso: 'NR' },
            { name: 'New Zealand', iso: 'NZ' }, { name: 'Palau', iso: 'PW' }, { name: 'Papua New Guinea', iso: 'PG' },
            { name: 'Samoa', iso: 'WS' }, { name: 'Solomon Islands', iso: 'SB' }, { name: 'Tonga', iso: 'TO' },
            { name: 'Tuvalu', iso: 'TV' }, { name: 'Vanuatu', iso: 'VU' },
        ],
    },
];

function DonutChart({ visited, total, size = 80 }: { visited: number; total: number; size?: number }) {
    const radius = (size - 8) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;
    const pct = total > 0 ? visited / total : 0;
    const strokeDashoffset = circumference * (1 - pct);

    return (
        <svg width={size} height={size} className="block mx-auto">
            {/* Background ring */}
            <circle
                cx={center} cy={center} r={radius}
                fill="none"
                strokeWidth={6}
                className="stroke-gray-200 dark:stroke-gray-700"
            />
            {/* Progress ring */}
            <circle
                cx={center} cy={center} r={radius}
                fill="none"
                strokeWidth={6}
                strokeLinecap="round"
                className="stroke-primary-500"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
            {/* Center text */}
            <text
                x={center} y={center - 4}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="14"
                fontWeight="700"
                className="fill-gray-800 dark:fill-gray-200"
            >
                {Math.round(pct * 100)}%
            </text>
            <text
                x={center} y={center + 12}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="9"
                className="fill-gray-500 dark:fill-gray-400"
            >
                {visited}/{total}
            </text>
        </svg>
    );
}

export default function CountryProgress({ visitedCountries }: CountryProgressProps) {
    // Normalize visited country names to lowercase for matching
    const visitedSet = useMemo(() => {
        const set = new Set<string>();
        visitedCountries.forEach(c => set.add(c.toLowerCase().trim()));
        return set;
    }, [visitedCountries]);

    // Check if a country is visited (fuzzy matching on name)
    const isVisited = (country: { name: string; iso: string }): boolean => {
        const nameLower = country.name.toLowerCase();
        // Direct match
        if (visitedSet.has(nameLower)) return true;
        // Check if any visited country contains or is contained by this name
        for (const v of visitedSet) {
            if (v.includes(nameLower) || nameLower.includes(v)) return true;
            // Common aliases
            if (nameLower === 'united states' && (v === 'usa' || v === 'us' || v === 'united states of america')) return true;
            if (nameLower === 'united kingdom' && (v === 'uk' || v === 'england' || v === 'great britain')) return true;
            if (nameLower === 'uae' && (v === 'united arab emirates')) return true;
            if (nameLower === 'czech republic' && (v === 'czechia')) return true;
            if (nameLower === 'dr congo' && (v === 'democratic republic of the congo' || v === 'congo (kinshasa)')) return true;
            if (nameLower === 'ivory coast' && (v === "cote d'ivoire" || v === "cote d'ivoire")) return true;
            if (nameLower === 'cabo verde' && (v === 'cape verde')) return true;
            if (nameLower === 'eswatini' && (v === 'swaziland')) return true;
            if (nameLower === 'timor-leste' && (v === 'east timor')) return true;
            if (nameLower === 'north macedonia' && (v === 'macedonia')) return true;
        }
        return false;
    };

    const continentStats = useMemo(() => {
        return CONTINENTS.map(continent => {
            const countries = continent.countries.map(c => ({
                ...c,
                visited: isVisited(c),
            }));
            const visitedCount = countries.filter(c => c.visited).length;
            return {
                name: continent.name,
                countries,
                visited: visitedCount,
                total: countries.length,
            };
        });
    }, [visitedSet]);

    const totalVisited = continentStats.reduce((sum, c) => sum + c.visited, 0);
    const totalCountries = continentStats.reduce((sum, c) => sum + c.total, 0);

    return (
        <div>
            <div className="text-center mb-4">
                <span className="text-2xl font-bold">{totalVisited}</span>
                <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">of {totalCountries} countries</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {continentStats.map(continent => (
                    <div key={continent.name} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex items-center gap-3 mb-2">
                            <DonutChart visited={continent.visited} total={continent.total} size={64} />
                            <div>
                                <h4 className="font-semibold text-sm">{continent.name}</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {continent.visited} of {continent.total} countries
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                            {continent.countries.map(country => (
                                <span
                                    key={country.iso}
                                    className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded ${
                                        country.visited
                                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                                            : 'bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500'
                                    }`}
                                    title={country.name}
                                >
                                    {countryFlag(country.iso)} {country.name}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
