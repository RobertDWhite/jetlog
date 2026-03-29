import React, { useState, useRef, useEffect, useCallback } from 'react';
import API from '../api';
import { Button } from './Elements';

interface ParsedBoardingPass {
    passengerName: string;
    pnr: string;
    origin: string;
    destination: string;
    originIata: string;
    destinationIata: string;
    carrier: string;
    carrierIcao: string | null;
    flightNumber: string;
    date: string;
    ticketClass: string;
    compartmentCode: string;
    seatNumber: string;
    seatType: string | null;
}

interface MultiLegResult {
    legs: ParsedBoardingPass[];
    numLegs: number;
}

type ParseResult = ParsedBoardingPass | MultiLegResult;

function isMultiLeg(result: ParseResult): result is MultiLegResult {
    return 'legs' in result;
}

interface BoardingPassScannerProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (params: URLSearchParams) => void;
}

type ScanMode = 'choose' | 'camera' | 'upload' | 'paste';

declare global {
    interface Window {
        BarcodeDetector?: new (options?: { formats: string[] }) => {
            detect(source: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>;
        };
    }
}

const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

export default function BoardingPassScanner({ isOpen, onClose, onImport }: BoardingPassScannerProps) {
    const [mode, setMode] = useState<ScanMode>('choose');
    const [error, setError] = useState('');
    const [parsing, setParsing] = useState(false);
    const [result, setResult] = useState<ParseResult | null>(null);
    const [pasteText, setPasteText] = useState('');

    // Camera refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanIntervalRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cleanup camera on unmount or close
    const stopCamera = useCallback(() => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    useEffect(() => {
        if (!isOpen) {
            stopCamera();
            setMode('choose');
            setError('');
            setResult(null);
            setPasteText('');
            setParsing(false);
        }
    }, [isOpen, stopCamera]);

    useEffect(() => {
        return () => stopCamera();
    }, [stopCamera]);

    const parseBCBP = async (raw: string) => {
        setError('');
        setParsing(true);
        try {
            const data = await API.post('/boarding-pass/parse', { raw });
            setResult(data);
        } catch (err: any) {
            const detail = err?.response?.data?.detail || 'Failed to parse boarding pass data';
            setError(detail);
        } finally {
            setParsing(false);
        }
    };

    const startCamera = async () => {
        setMode('camera');
        setError('');

        if (!hasBarcodeDetector) {
            setError('BarcodeDetector API is not available in this browser. Try Chrome/Edge 83+ or use the text paste option.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            const detector = new window.BarcodeDetector!({ formats: ['pdf417', 'qr_code', 'aztec'] });

            scanIntervalRef.current = window.setInterval(async () => {
                if (!videoRef.current || videoRef.current.readyState < 2) return;

                try {
                    const barcodes = await detector.detect(videoRef.current);
                    if (barcodes.length > 0) {
                        const raw = barcodes[0].rawValue;
                        if (raw && raw.length >= 58 && raw[0] === 'M') {
                            stopCamera();
                            parseBCBP(raw);
                        }
                    }
                } catch {
                    // Detection errors are expected when nothing is visible
                }
            }, 500);
        } catch (err: any) {
            setError(`Camera error: ${err.message || err}`);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError('');

        if (!hasBarcodeDetector) {
            setError('BarcodeDetector API is not available in this browser. Try Chrome/Edge 83+ or use the text paste option.');
            return;
        }

        try {
            const bitmap = await createImageBitmap(file);
            const detector = new window.BarcodeDetector!({ formats: ['pdf417', 'qr_code', 'aztec'] });
            const barcodes = await detector.detect(bitmap);

            if (barcodes.length === 0) {
                setError('No barcode found in image. Try a clearer photo or paste the barcode data manually.');
                return;
            }

            const raw = barcodes[0].rawValue;
            if (!raw || raw.length < 58) {
                setError(`Barcode found but data too short (${raw?.length || 0} chars). This may not be a boarding pass barcode.`);
                return;
            }

            parseBCBP(raw);
        } catch (err: any) {
            setError(`Failed to read image: ${err.message || err}`);
        }

        // Reset the file input so the same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePasteSubmit = () => {
        const trimmed = pasteText.trim();
        if (!trimmed) {
            setError('Please paste boarding pass barcode data');
            return;
        }
        parseBCBP(trimmed);
    };

    const buildQueryParams = (leg: ParsedBoardingPass): URLSearchParams => {
        const params = new URLSearchParams();
        if (leg.origin) params.set('origin', leg.origin);
        if (leg.destination) params.set('destination', leg.destination);
        if (leg.date) params.set('date', leg.date);
        if (leg.flightNumber) params.set('flightNumber', leg.flightNumber);
        if (leg.ticketClass) params.set('ticketClass', leg.ticketClass);
        if (leg.seatType) params.set('seat', leg.seatType);
        if (leg.seatNumber) params.set('seatNumber', leg.seatNumber);
        if (leg.carrierIcao) params.set('airline', leg.carrierIcao);
        return params;
    };

    const handleImportSingle = (leg: ParsedBoardingPass) => {
        const params = buildQueryParams(leg);
        onClose();
        onImport(params);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
                 onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-bold dark:text-gray-100">Scan Boarding Pass</h2>
                    <button onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none">
                        {'\u00D7'}
                    </button>
                </div>

                {/* Body */}
                <div className="p-4">
                    {/* Result view */}
                    {result && !parsing && (
                        <ResultView result={result} onImport={handleImportSingle} onReset={() => { setResult(null); setMode('choose'); }} />
                    )}

                    {/* Error display */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Loading */}
                    {parsing && (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-8 h-8 border-4 border-gray-300 border-t-primary-400 rounded-full animate-spin"></div>
                            <span className="ml-3 text-gray-600 dark:text-gray-300">Parsing boarding pass...</span>
                        </div>
                    )}

                    {/* Mode selection */}
                    {!result && !parsing && mode === 'choose' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                Scan a PDF417, QR, or Aztec barcode from a boarding pass to auto-fill flight details.
                            </p>

                            {hasBarcodeDetector && (
                                <button onClick={startCamera}
                                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                    <span className="text-2xl">{'\uD83D\uDCF7'}</span>
                                    <div className="text-left">
                                        <div className="font-medium dark:text-gray-100">Scan with Camera</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">Point your camera at a boarding pass barcode</div>
                                    </div>
                                </button>
                            )}

                            <button onClick={() => { setMode('upload'); }}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <span className="text-2xl">{'\uD83D\uDCC1'}</span>
                                <div className="text-left">
                                    <div className="font-medium dark:text-gray-100">Upload Image</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                        {hasBarcodeDetector
                                            ? 'Upload a photo or screenshot of a boarding pass'
                                            : 'Requires Chrome/Edge 83+ for barcode detection'}
                                    </div>
                                </div>
                            </button>

                            <button onClick={() => setMode('paste')}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <span className="text-2xl">{'\uD83D\uDCCB'}</span>
                                <div className="text-left">
                                    <div className="font-medium dark:text-gray-100">Paste Barcode Data</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">Paste raw BCBP text from a barcode reader app</div>
                                </div>
                            </button>

                            {!hasBarcodeDetector && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                    Camera and image scanning require the BarcodeDetector API (Chrome/Edge 83+).
                                    You can still paste barcode data directly.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Camera view */}
                    {!result && !parsing && mode === 'camera' && (
                        <div className="space-y-3">
                            <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3]">
                                <video ref={videoRef}
                                       className="w-full h-full object-cover"
                                       playsInline
                                       muted />
                                {/* Scanning overlay */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-3/4 h-1/2 border-2 border-white/50 rounded-lg relative">
                                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary-400 animate-scan-line"></div>
                                    </div>
                                </div>
                                <div className="absolute bottom-2 left-0 right-0 text-center text-white text-sm bg-black/40 py-1">
                                    Point at boarding pass barcode
                                </div>
                            </div>
                            <Button text="Back" onClick={() => { stopCamera(); setMode('choose'); }} />
                        </div>
                    )}

                    {/* Upload view */}
                    {!result && !parsing && mode === 'upload' && (
                        <div className="space-y-3">
                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                                <input ref={fileInputRef}
                                       type="file"
                                       accept="image/*"
                                       capture="environment"
                                       onChange={handleFileUpload}
                                       className="hidden"
                                       id="bp-file-input" />
                                <label htmlFor="bp-file-input"
                                       className="cursor-pointer">
                                    <span className="block text-4xl mb-2">{'\uD83D\uDCF7'}</span>
                                    <span className="text-gray-600 dark:text-gray-300 font-medium">
                                        Tap to take a photo or choose an image
                                    </span>
                                    <span className="block text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        JPG, PNG, or other image formats
                                    </span>
                                </label>
                            </div>
                            <Button text="Back" onClick={() => setMode('choose')} />
                        </div>
                    )}

                    {/* Paste view */}
                    {!result && !parsing && mode === 'paste' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Paste the raw BCBP string decoded from a boarding pass barcode.
                                It starts with 'M' and is at least 58 characters.
                            </p>
                            <textarea
                                className="w-full h-32 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg
                                           font-mono text-sm dark:text-gray-100 resize-none outline-none focus:border-primary-400"
                                placeholder="M1DOE/JOHN            EABC123 JFKLHR AA 0100 123Y014C0001 100"
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <Button text="Back" onClick={() => { setMode('choose'); setPasteText(''); }} />
                                <Button text="Parse" level="success" onClick={handlePasteSubmit} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ResultView({ result, onImport, onReset }: {
    result: ParseResult;
    onImport: (leg: ParsedBoardingPass) => void;
    onReset: () => void;
}) {
    const legs = isMultiLeg(result) ? result.legs : [result as ParsedBoardingPass];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-green-500 text-xl">{'\u2713'}</span>
                <span className="font-medium dark:text-gray-100">Boarding pass parsed successfully</span>
            </div>

            {legs.map((leg, i) => (
                <LegCard key={i} leg={leg} legIndex={legs.length > 1 ? i + 1 : undefined} onImport={() => onImport(leg)} />
            ))}

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <Button text="Scan Another" onClick={onReset} />
            </div>
        </div>
    );
}

function LegCard({ leg, legIndex, onImport }: {
    leg: ParsedBoardingPass;
    legIndex?: number;
    onImport: () => void;
}) {
    const classLabels: Record<string, string> = {
        'first': 'First',
        'business': 'Business',
        'economy+': 'Economy+',
        'economy': 'Economy',
        'private': 'Private',
    };

    return (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            {legIndex !== undefined && (
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Leg {legIndex}</div>
            )}

            {/* Route */}
            <div className="flex items-center justify-between mb-3">
                <div className="text-center">
                    <div className="text-2xl font-bold dark:text-gray-100">{leg.originIata || leg.origin}</div>
                </div>
                <div className="flex-1 mx-4 flex flex-col items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{leg.flightNumber}</div>
                    <div className="w-full border-t border-gray-300 dark:border-gray-600 relative my-1">
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400 text-xs">
                            {'\u2708'}
                        </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{leg.date}</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold dark:text-gray-100">{leg.destinationIata || leg.destination}</div>
                </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-3">
                {leg.passengerName && (
                    <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Passenger</div>
                        <div className="font-medium dark:text-gray-200">{leg.passengerName.replace('/', ' ')}</div>
                    </div>
                )}
                {leg.ticketClass && (
                    <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Class</div>
                        <div className="font-medium dark:text-gray-200">{classLabels[leg.ticketClass] || leg.ticketClass}</div>
                    </div>
                )}
                {leg.seatNumber && (
                    <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Seat</div>
                        <div className="font-medium dark:text-gray-200">{leg.seatNumber}{leg.seatType ? ` (${leg.seatType})` : ''}</div>
                    </div>
                )}
                {leg.pnr && (
                    <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">PNR</div>
                        <div className="font-medium dark:text-gray-200">{leg.pnr}</div>
                    </div>
                )}
            </div>

            <Button text="Add Flight" level="success" onClick={onImport} />
        </div>
    );
}
