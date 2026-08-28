// Single source of truth for airline names -> IATA codes.
// Used for the AddFlight airline picker, flight-number auto-detect,
// and the AirlineLogo lookups in Dashboard/MyFlights.
export const AIRLINE_CODES = {
  'Emirates': 'EK', 'Qatar Airways': 'QR', 'Etihad Airways': 'EY',
  'Lufthansa': 'LH', 'British Airways': 'BA', 'Air France': 'AF',
  'Turkish Airlines': 'TK', 'Flydubai': 'FZ', 'Air Arabia': 'G9',
  'Air Arabia Abu Dhabi': '3L', 'Singapore Airlines': 'SQ',
  'Cathay Pacific': 'CX', 'Qantas': 'QF', 'American Airlines': 'AA',
  'United Airlines': 'UA', 'Delta Air Lines': 'DL',
  'Southwest Airlines': 'WN', 'Ryanair': 'FR', 'easyJet': 'U2',
  'KLM': 'KL', 'Swiss': 'LX', 'Austrian Airlines': 'OS',
  'Finnair': 'AY', 'SAS': 'SK', 'Iberia': 'IB', 'EgyptAir': 'MS',
  'Ethiopian Airlines': 'ET', 'Kenya Airways': 'KQ', 'Saudia': 'SV',
  'Gulf Air': 'GF', 'Oman Air': 'WY', 'Air India': 'AI',
  'Japan Airlines': 'JL', 'Korean Air': 'KE', 'ANA': 'NH',
  'Thai Airways': 'TG', 'Malaysia Airlines': 'MH', 'LATAM': 'LA',
  'Avianca': 'AV', 'Air Canada': 'AC', 'IndiGo': '6E', 'SpiceJet': 'SG',
  'flynas': 'XY', 'flyadeal': 'F3', 'Jazeera Airways': 'J9',
  'Pegasus Airlines': 'PC', 'Royal Jordanian': 'RJ',
  'Middle East Airlines': 'ME', 'WizzAir': 'W6', 'Vueling': 'VY',
  'TAP Air Portugal': 'TP', 'Aer Lingus': 'EI', 'Norwegian': 'DY',
  'TUI Airways': 'BY', 'Air Asia': 'AK', 'Garuda Indonesia': 'GA',
  'Philippine Airlines': 'PR', 'Vietnam Airlines': 'VN',
  'China Eastern': 'MU', 'China Southern': 'CZ', 'Air China': 'CA',
  'Hainan Airlines': 'HU', 'SunExpress': 'XQ',
};

export const AIRLINES = Object.keys(AIRLINE_CODES);
