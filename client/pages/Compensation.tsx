import React from 'react';
import { Heading, Subheading, Whisper } from '../components/Elements';
import CompensationTracker from '../components/CompensationTracker';

export default function Compensation() {
    return (
        <>
            <Heading text="Flight Compensation Tracker" />
            <Whisper text="EU Regulation 261/2004 -- Know your passenger rights" />

            <div className="mt-4 mb-8">
                <CompensationTracker />
            </div>

            {/* FAQ Section */}
            <div className="max-w-3xl mt-8 space-y-6">
                <Subheading text="Frequently Asked Questions" />

                <details className="group border border-gray-200 dark:border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 font-medium dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg select-none">
                        What is EU261?
                    </summary>
                    <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-400 space-y-2">
                        <p>
                            EU Regulation 261/2004 is a European law that establishes common rules on compensation
                            and assistance to air passengers in the event of denied boarding, flight cancellation,
                            or long delays. It applies to all flights departing from an EU airport, and to flights
                            arriving at an EU airport operated by an EU carrier.
                        </p>
                        <p>
                            The regulation entitles passengers to fixed compensation amounts between {'\u20AC'}250
                            and {'\u20AC'}600 depending on the flight distance, regardless of what you paid for the ticket.
                        </p>
                    </div>
                </details>

                <details className="group border border-gray-200 dark:border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 font-medium dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg select-none">
                        Am I eligible for compensation?
                    </summary>
                    <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-400 space-y-2">
                        <p>You may be eligible if <strong>all</strong> of the following apply:</p>
                        <ul className="list-disc ml-5 space-y-1">
                            <li>Your flight departed from an EU/EEA airport, <strong>or</strong> arrived at one on an EU carrier</li>
                            <li>Your flight arrived 3+ hours late, was cancelled (with less than 14 days notice), or you were denied boarding</li>
                            <li>The disruption was <strong>not</strong> caused by extraordinary circumstances (severe weather, strikes, security threats, air traffic control restrictions)</li>
                            <li>The flight occurred within the last 3 years (claim window varies by country, but 3 years is typical)</li>
                        </ul>
                        <p className="mt-2">
                            <strong>Compensation tiers by distance:</strong>
                        </p>
                        <ul className="list-disc ml-5 space-y-1">
                            <li>{'\u20AC'}250 for flights up to 1,500 km</li>
                            <li>{'\u20AC'}400 for flights between 1,501 and 3,500 km</li>
                            <li>{'\u20AC'}600 for flights over 3,500 km</li>
                        </ul>
                    </div>
                </details>

                <details className="group border border-gray-200 dark:border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 font-medium dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg select-none">
                        How do I file a claim?
                    </summary>
                    <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-400 space-y-2">
                        <p>There are several ways to claim:</p>
                        <ol className="list-decimal ml-5 space-y-1">
                            <li><strong>Directly with the airline:</strong> Write to the airline's customer service with your booking reference, flight details, and the delay duration. Reference EU261/2004.</li>
                            <li><strong>Through a claim service:</strong> Services like AirHelp, Flightright, or ClaimCompass handle the process for you (typically taking 25-35% of the compensation as their fee).</li>
                            <li><strong>National enforcement body:</strong> If the airline refuses, you can escalate to the national enforcement body in the country of departure (e.g., the Civil Aviation Authority in the UK, BfJ in Germany).</li>
                        </ol>
                        <p className="mt-2">
                            <strong>Documents you will need:</strong> booking confirmation, boarding pass, proof of delay (screenshot of departure board, airline communication), and any receipts for expenses incurred.
                        </p>
                    </div>
                </details>

                <details className="group border border-gray-200 dark:border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 font-medium dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg select-none">
                        What is the claim deadline?
                    </summary>
                    <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-400 space-y-2">
                        <p>
                            The claim deadline varies by country and is based on the statute of limitations
                            for contractual claims in the country where you file:
                        </p>
                        <ul className="list-disc ml-5 space-y-1">
                            <li><strong>3 years:</strong> Germany, most common default</li>
                            <li><strong>5 years:</strong> France</li>
                            <li><strong>6 years:</strong> UK, Ireland</li>
                            <li><strong>2 years:</strong> Belgium, Netherlands</li>
                            <li><strong>1 year:</strong> Poland (for domestic carriers)</li>
                        </ul>
                        <p className="mt-2">
                            This tracker uses a conservative 3-year window. Your actual deadline may be
                            longer or shorter depending on the specific country and circumstances.
                            When in doubt, file sooner rather than later.
                        </p>
                    </div>
                </details>
            </div>
        </>
    );
}
