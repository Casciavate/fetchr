import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Plane, Search, MapPin, Calendar, Weight, DollarSign,
  CheckCircle, AlertCircle, ChevronDown, ShoppingBag, Info
} from 'lucide-react';

const CATEGORIES = [
  'Electronics', 'Clothing & Fashion', 'Cosmetics & Beauty',
  'Food & Beverages', 'Books & Stationery', 'Toys & Games',
  'Medical & Pharmacy', 'Jewelry & Accessories', 'Sports & Fitness',
  'Home & Living', 'Documents', 'Other'
];

const AIRLINES = [
  'Emirates', 'Qatar Airways', 'Etihad Airways', 'Lufthansa',
  'British Airways', 'Air France', 'Turkish Airlines', 'Flydubai',
  'Air Arabia', 'Singapore Airlines', 'Cathay Pacific', 'Qantas',
  'American Airlines', 'United Airlines', 'Delta Air Lines',
  'Southwest Airlines', 'Ryanair', 'easyJet', 'KLM', 'Swiss',
  'Austrian Airlines', 'Finnair', 'SAS', 'Iberia', 'EgyptAir',
  'Ethiopian Airlines', 'Kenya Airways', 'Saudia', 'Gulf Air',
  'Oman Air', 'Air India', 'Japan Airlines', 'Korean Air',
  'ANA', 'Thai Airways', 'Malaysia Airlines', 'LATAM', 'Avianca',
  'Air Canada', 'IndiGo', 'SpiceJet', 'flynas', 'Jazeera Airways',
  'Pegasus Airlines', 'Royal Jordanian', 'Middle East Airlines',
  'flyadeal', 'Air Arabia Abu Dhabi', 'WizzAir', 'Vueling',
  'TAP Air Portugal', 'Aer Lingus', 'Norwegian', 'TUI Airways',
  'Air Asia', 'Garuda Indonesia', 'Philippine Airlines',
  'Vietnam Airlines', 'China Eastern', 'China Southern', 'Air China',
  'Hainan Airlines', 'SunExpress',
];

const AIRLINE_CODES = {
  'Emirates': 'EK', 'Qatar Airways': 'QR', 'Etihad Airways': 'EY',
  'Lufthansa': 'LH', 'British Airways': 'BA', 'Air France': 'AF',
  'Turkish Airlines': 'TK', 'Flydubai': 'FZ', 'Air Arabia': 'G9',
  'Singapore Airlines': 'SQ', 'Cathay Pacific': 'CX', 'Qantas': 'QF',
  'American Airlines': 'AA', 'United Airlines': 'UA', 'Delta Air Lines': 'DL',
  'Southwest Airlines': 'WN', 'Ryanair': 'FR', 'easyJet': 'U2',
  'KLM': 'KL', 'Swiss': 'LX', 'Austrian Airlines': 'OS',
  'Finnair': 'AY', 'SAS': 'SK', 'Iberia': 'IB',
  'EgyptAir': 'MS', 'Ethiopian Airlines': 'ET', 'Kenya Airways': 'KQ',
  'Saudia': 'SV', 'Gulf Air': 'GF', 'Oman Air': 'WY',
  'Air India': 'AI', 'Japan Airlines': 'JL', 'Korean Air': 'KE',
  'ANA': 'NH', 'Thai Airways': 'TG', 'Malaysia Airlines': 'MH',
  'LATAM': 'LA', 'Avianca': 'AV', 'Air Canada': 'AC',
  'IndiGo': '6E', 'SpiceJet': 'SG', 'flynas': 'XY',
  'Jazeera Airways': 'J9', 'Pegasus Airlines': 'PC',
};

const AIRPORTS = [
  { code: 'DXB', city: 'Dubai', name: 'Dubai International', country: 'UAE' },
  { code: 'DWC', city: 'Dubai', name: 'Al Maktoum International', country: 'UAE' },
  { code: 'AUH', city: 'Abu Dhabi', name: 'Zayed International', country: 'UAE' },
  { code: 'SHJ', city: 'Sharjah', name: 'Sharjah International', country: 'UAE' },
  { code: 'RKT', city: 'Ras Al Khaimah', name: 'RAK International', country: 'UAE' },
  { code: 'FJR', city: 'Fujairah', name: 'Fujairah International', country: 'UAE' },
  { code: 'DOH', city: 'Doha', name: 'Hamad International', country: 'Qatar' },
  { code: 'KWI', city: 'Kuwait City', name: 'Kuwait International', country: 'Kuwait' },
  { code: 'BAH', city: 'Manama', name: 'Bahrain International', country: 'Bahrain' },
  { code: 'RUH', city: 'Riyadh', name: 'King Khalid International', country: 'Saudi Arabia' },
  { code: 'JED', city: 'Jeddah', name: 'King Abdulaziz International', country: 'Saudi Arabia' },
  { code: 'DMM', city: 'Dammam', name: 'King Fahd International', country: 'Saudi Arabia' },
  { code: 'MED', city: 'Medina', name: 'Prince Mohammad Bin Abdulaziz', country: 'Saudi Arabia' },
  { code: 'MCT', city: 'Muscat', name: 'Muscat International', country: 'Oman' },
  { code: 'SLL', city: 'Salalah', name: 'Salalah Airport', country: 'Oman' },
  { code: 'BEY', city: 'Beirut', name: 'Rafic Hariri International', country: 'Lebanon' },
  { code: 'AMM', city: 'Amman', name: 'Queen Alia International', country: 'Jordan' },
  { code: 'CAI', city: 'Cairo', name: 'Cairo International', country: 'Egypt' },
  { code: 'HRG', city: 'Hurghada', name: 'Hurghada International', country: 'Egypt' },
  { code: 'SSH', city: 'Sharm El Sheikh', name: 'Sharm El Sheikh International', country: 'Egypt' },
  { code: 'LXR', city: 'Luxor', name: 'Luxor International', country: 'Egypt' },
  { code: 'TLV', city: 'Tel Aviv', name: 'Ben Gurion International', country: 'Israel' },
  { code: 'BGW', city: 'Baghdad', name: 'Baghdad International', country: 'Iraq' },
  { code: 'EBL', city: 'Erbil', name: 'Erbil International', country: 'Iraq' },
  { code: 'THR', city: 'Tehran', name: 'Imam Khomeini International', country: 'Iran' },
  { code: 'GYD', city: 'Baku', name: 'Heydar Aliyev International', country: 'Azerbaijan' },
  { code: 'TBS', city: 'Tbilisi', name: 'Shota Rustaveli International', country: 'Georgia' },
  { code: 'EVN', city: 'Yerevan', name: 'Zvartnots International', country: 'Armenia' },
  { code: 'LHR', city: 'London', name: 'Heathrow', country: 'UK' },
  { code: 'LGW', city: 'London', name: 'Gatwick', country: 'UK' },
  { code: 'STN', city: 'London', name: 'Stansted', country: 'UK' },
  { code: 'LTN', city: 'London', name: 'Luton', country: 'UK' },
  { code: 'LCY', city: 'London', name: 'City Airport', country: 'UK' },
  { code: 'MAN', city: 'Manchester', name: 'Manchester Airport', country: 'UK' },
  { code: 'BHX', city: 'Birmingham', name: 'Birmingham Airport', country: 'UK' },
  { code: 'EDI', city: 'Edinburgh', name: 'Edinburgh Airport', country: 'UK' },
  { code: 'GLA', city: 'Glasgow', name: 'Glasgow Airport', country: 'UK' },
  { code: 'BRS', city: 'Bristol', name: 'Bristol Airport', country: 'UK' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle', country: 'France' },
  { code: 'ORY', city: 'Paris', name: 'Orly', country: 'France' },
  { code: 'NCE', city: 'Nice', name: 'Nice Cote d Azur', country: 'France' },
  { code: 'LYS', city: 'Lyon', name: 'Saint-Exupery', country: 'France' },
  { code: 'MRS', city: 'Marseille', name: 'Marseille Provence', country: 'France' },
  { code: 'TLS', city: 'Toulouse', name: 'Toulouse-Blagnac', country: 'France' },
  { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt Airport', country: 'Germany' },
  { code: 'MUC', city: 'Munich', name: 'Munich Airport', country: 'Germany' },
  { code: 'BER', city: 'Berlin', name: 'Brandenburg Airport', country: 'Germany' },
  { code: 'HAM', city: 'Hamburg', name: 'Hamburg Airport', country: 'Germany' },
  { code: 'DUS', city: 'Dusseldorf', name: 'Dusseldorf Airport', country: 'Germany' },
  { code: 'CGN', city: 'Cologne', name: 'Cologne Bonn Airport', country: 'Germany' },
  { code: 'STR', city: 'Stuttgart', name: 'Stuttgart Airport', country: 'Germany' },
  { code: 'ZRH', city: 'Zurich', name: 'Zurich Airport', country: 'Switzerland' },
  { code: 'GVA', city: 'Geneva', name: 'Geneva Airport', country: 'Switzerland' },
  { code: 'BSL', city: 'Basel', name: 'EuroAirport Basel-Mulhouse', country: 'Switzerland' },
  { code: 'AMS', city: 'Amsterdam', name: 'Schiphol', country: 'Netherlands' },
  { code: 'EIN', city: 'Eindhoven', name: 'Eindhoven Airport', country: 'Netherlands' },
  { code: 'MAD', city: 'Madrid', name: 'Adolfo Suarez Barajas', country: 'Spain' },
  { code: 'BCN', city: 'Barcelona', name: 'El Prat', country: 'Spain' },
  { code: 'AGP', city: 'Malaga', name: 'Malaga Airport', country: 'Spain' },
  { code: 'ALC', city: 'Alicante', name: 'Alicante Airport', country: 'Spain' },
  { code: 'PMI', city: 'Palma', name: 'Palma de Mallorca', country: 'Spain' },
  { code: 'VLC', city: 'Valencia', name: 'Valencia Airport', country: 'Spain' },
  { code: 'SVQ', city: 'Seville', name: 'San Pablo Airport', country: 'Spain' },
  { code: 'TFS', city: 'Tenerife', name: 'Tenerife South', country: 'Spain' },
  { code: 'LPA', city: 'Gran Canaria', name: 'Gran Canaria Airport', country: 'Spain' },
  { code: 'FCO', city: 'Rome', name: 'Fiumicino', country: 'Italy' },
  { code: 'CIA', city: 'Rome', name: 'Ciampino', country: 'Italy' },
  { code: 'MXP', city: 'Milan', name: 'Malpensa', country: 'Italy' },
  { code: 'LIN', city: 'Milan', name: 'Linate', country: 'Italy' },
  { code: 'BGY', city: 'Milan', name: 'Bergamo Orio al Serio', country: 'Italy' },
  { code: 'VCE', city: 'Venice', name: 'Marco Polo', country: 'Italy' },
  { code: 'NAP', city: 'Naples', name: 'Naples International', country: 'Italy' },
  { code: 'CTA', city: 'Catania', name: 'Fontanarossa', country: 'Italy' },
  { code: 'BRI', city: 'Bari', name: 'Karol Wojtyla', country: 'Italy' },
  { code: 'PSA', city: 'Pisa', name: 'Galileo Galilei', country: 'Italy' },
  { code: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Turkey' },
  { code: 'SAW', city: 'Istanbul', name: 'Sabiha Gokcen', country: 'Turkey' },
  { code: 'AYT', city: 'Antalya', name: 'Antalya Airport', country: 'Turkey' },
  { code: 'ADB', city: 'Izmir', name: 'Adnan Menderes', country: 'Turkey' },
  { code: 'ESB', city: 'Ankara', name: 'Esenboga Airport', country: 'Turkey' },
  { code: 'DLM', city: 'Dalaman', name: 'Dalaman Airport', country: 'Turkey' },
  { code: 'BJV', city: 'Bodrum', name: 'Milas-Bodrum Airport', country: 'Turkey' },
  { code: 'ATH', city: 'Athens', name: 'Eleftherios Venizelos', country: 'Greece' },
  { code: 'SKG', city: 'Thessaloniki', name: 'Macedonia Airport', country: 'Greece' },
  { code: 'HER', city: 'Heraklion', name: 'Nikos Kazantzakis', country: 'Greece' },
  { code: 'RHO', city: 'Rhodes', name: 'Diagoras Airport', country: 'Greece' },
  { code: 'CFU', city: 'Corfu', name: 'Ioannis Kapodistrias', country: 'Greece' },
  { code: 'CPH', city: 'Copenhagen', name: 'Kastrup', country: 'Denmark' },
  { code: 'ARN', city: 'Stockholm', name: 'Arlanda', country: 'Sweden' },
  { code: 'GOT', city: 'Gothenburg', name: 'Landvetter', country: 'Sweden' },
  { code: 'HEL', city: 'Helsinki', name: 'Helsinki-Vantaa', country: 'Finland' },
  { code: 'OSL', city: 'Oslo', name: 'Gardermoen', country: 'Norway' },
  { code: 'BGO', city: 'Bergen', name: 'Flesland', country: 'Norway' },
  { code: 'WAW', city: 'Warsaw', name: 'Chopin Airport', country: 'Poland' },
  { code: 'KRK', city: 'Krakow', name: 'John Paul II', country: 'Poland' },
  { code: 'PRG', city: 'Prague', name: 'Vaclav Havel', country: 'Czech Republic' },
  { code: 'BUD', city: 'Budapest', name: 'Ferenc Liszt', country: 'Hungary' },
  { code: 'OTP', city: 'Bucharest', name: 'Henri Coanda', country: 'Romania' },
  { code: 'SOF', city: 'Sofia', name: 'Sofia Airport', country: 'Bulgaria' },
  { code: 'ZAG', city: 'Zagreb', name: 'Franjo Tudman', country: 'Croatia' },
  { code: 'DBV', city: 'Dubrovnik', name: 'Dubrovnik Airport', country: 'Croatia' },
  { code: 'BEG', city: 'Belgrade', name: 'Nikola Tesla', country: 'Serbia' },
  { code: 'TIA', city: 'Tirana', name: 'Mother Teresa', country: 'Albania' },
  { code: 'KBP', city: 'Kyiv', name: 'Boryspil International', country: 'Ukraine' },
  { code: 'SVO', city: 'Moscow', name: 'Sheremetyevo', country: 'Russia' },
  { code: 'DME', city: 'Moscow', name: 'Domodedovo', country: 'Russia' },
  { code: 'LED', city: 'St Petersburg', name: 'Pulkovo', country: 'Russia' },
  { code: 'VIE', city: 'Vienna', name: 'Vienna International', country: 'Austria' },
  { code: 'BRU', city: 'Brussels', name: 'Brussels Airport', country: 'Belgium' },
  { code: 'CRL', city: 'Brussels', name: 'Brussels South Charleroi', country: 'Belgium' },
  { code: 'LIS', city: 'Lisbon', name: 'Humberto Delgado', country: 'Portugal' },
  { code: 'OPO', city: 'Porto', name: 'Francisco Sa Carneiro', country: 'Portugal' },
  { code: 'FAO', city: 'Faro', name: 'Faro Airport', country: 'Portugal' },
  { code: 'DUB', city: 'Dublin', name: 'Dublin Airport', country: 'Ireland' },
  { code: 'RIX', city: 'Riga', name: 'Riga International', country: 'Latvia' },
  { code: 'TLL', city: 'Tallinn', name: 'Lennart Meri', country: 'Estonia' },
  { code: 'VNO', city: 'Vilnius', name: 'Vilnius Airport', country: 'Lithuania' },
  { code: 'LUX', city: 'Luxembourg', name: 'Luxembourg Findel', country: 'Luxembourg' },
  { code: 'MLA', city: 'Malta', name: 'Malta International', country: 'Malta' },
  { code: 'LCA', city: 'Larnaca', name: 'Larnaca International', country: 'Cyprus' },
  { code: 'JFK', city: 'New York', name: 'John F Kennedy', country: 'USA' },
  { code: 'LGA', city: 'New York', name: 'LaGuardia', country: 'USA' },
  { code: 'EWR', city: 'New York', name: 'Newark Liberty', country: 'USA' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', country: 'USA' },
  { code: 'BUR', city: 'Los Angeles', name: 'Burbank Airport', country: 'USA' },
  { code: 'ORD', city: 'Chicago', name: 'O Hare International', country: 'USA' },
  { code: 'MDW', city: 'Chicago', name: 'Midway International', country: 'USA' },
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield-Jackson', country: 'USA' },
  { code: 'DFW', city: 'Dallas', name: 'Dallas Fort Worth', country: 'USA' },
  { code: 'DAL', city: 'Dallas', name: 'Love Field', country: 'USA' },
  { code: 'MIA', city: 'Miami', name: 'Miami International', country: 'USA' },
  { code: 'FLL', city: 'Fort Lauderdale', name: 'Fort Lauderdale-Hollywood', country: 'USA' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco International', country: 'USA' },
  { code: 'OAK', city: 'Oakland', name: 'Oakland International', country: 'USA' },
  { code: 'SJC', city: 'San Jose', name: 'Norman Y. Mineta', country: 'USA' },
  { code: 'BOS', city: 'Boston', name: 'Logan International', country: 'USA' },
  { code: 'IAD', city: 'Washington DC', name: 'Dulles International', country: 'USA' },
  { code: 'DCA', city: 'Washington DC', name: 'Ronald Reagan', country: 'USA' },
  { code: 'IAH', city: 'Houston', name: 'George Bush Intercontinental', country: 'USA' },
  { code: 'HOU', city: 'Houston', name: 'William P. Hobby', country: 'USA' },
  { code: 'PHX', city: 'Phoenix', name: 'Sky Harbor International', country: 'USA' },
  { code: 'LAS', city: 'Las Vegas', name: 'Harry Reid International', country: 'USA' },
  { code: 'DEN', city: 'Denver', name: 'Denver International', country: 'USA' },
  { code: 'SEA', city: 'Seattle', name: 'Seattle-Tacoma', country: 'USA' },
  { code: 'MSP', city: 'Minneapolis', name: 'Minneapolis-Saint Paul', country: 'USA' },
  { code: 'DTW', city: 'Detroit', name: 'Detroit Metropolitan', country: 'USA' },
  { code: 'PHL', city: 'Philadelphia', name: 'Philadelphia International', country: 'USA' },
  { code: 'CLT', city: 'Charlotte', name: 'Charlotte Douglas', country: 'USA' },
  { code: 'MCO', city: 'Orlando', name: 'Orlando International', country: 'USA' },
  { code: 'TPA', city: 'Tampa', name: 'Tampa International', country: 'USA' },
  { code: 'PDX', city: 'Portland', name: 'Portland International', country: 'USA' },
  { code: 'SAN', city: 'San Diego', name: 'San Diego International', country: 'USA' },
  { code: 'SLC', city: 'Salt Lake City', name: 'Salt Lake City International', country: 'USA' },
  { code: 'AUS', city: 'Austin', name: 'Austin-Bergstrom', country: 'USA' },
  { code: 'YYZ', city: 'Toronto', name: 'Pearson International', country: 'Canada' },
  { code: 'YYC', city: 'Calgary', name: 'Calgary International', country: 'Canada' },
  { code: 'YVR', city: 'Vancouver', name: 'Vancouver International', country: 'Canada' },
  { code: 'YUL', city: 'Montreal', name: 'Pierre Elliott Trudeau', country: 'Canada' },
  { code: 'MEX', city: 'Mexico City', name: 'Benito Juarez International', country: 'Mexico' },
  { code: 'CUN', city: 'Cancun', name: 'Cancun International', country: 'Mexico' },
  { code: 'GDL', city: 'Guadalajara', name: 'Miguel Hidalgo', country: 'Mexico' },
  { code: 'GRU', city: 'Sao Paulo', name: 'Guarulhos International', country: 'Brazil' },
  { code: 'CGH', city: 'Sao Paulo', name: 'Congonhas Airport', country: 'Brazil' },
  { code: 'GIG', city: 'Rio de Janeiro', name: 'Galeao International', country: 'Brazil' },
  { code: 'BSB', city: 'Brasilia', name: 'Presidente Juscelino Kubitschek', country: 'Brazil' },
  { code: 'EZE', city: 'Buenos Aires', name: 'Ministro Pistarini', country: 'Argentina' },
  { code: 'SCL', city: 'Santiago', name: 'Arturo Merino Benitez', country: 'Chile' },
  { code: 'LIM', city: 'Lima', name: 'Jorge Chavez International', country: 'Peru' },
  { code: 'BOG', city: 'Bogota', name: 'El Dorado International', country: 'Colombia' },
  { code: 'UIO', city: 'Quito', name: 'Mariscal Sucre', country: 'Ecuador' },
  { code: 'SIN', city: 'Singapore', name: 'Changi Airport', country: 'Singapore' },
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi', country: 'Thailand' },
  { code: 'DMK', city: 'Bangkok', name: 'Don Mueang', country: 'Thailand' },
  { code: 'HKT', city: 'Phuket', name: 'Phuket International', country: 'Thailand' },
  { code: 'CNX', city: 'Chiang Mai', name: 'Chiang Mai International', country: 'Thailand' },
  { code: 'KUL', city: 'Kuala Lumpur', name: 'KLIA', country: 'Malaysia' },
  { code: 'PEN', city: 'Penang', name: 'Penang International', country: 'Malaysia' },
  { code: 'CGK', city: 'Jakarta', name: 'Soekarno-Hatta', country: 'Indonesia' },
  { code: 'DPS', city: 'Bali', name: 'Ngurah Rai International', country: 'Indonesia' },
  { code: 'SUB', city: 'Surabaya', name: 'Juanda International', country: 'Indonesia' },
  { code: 'MNL', city: 'Manila', name: 'Ninoy Aquino International', country: 'Philippines' },
  { code: 'CEB', city: 'Cebu', name: 'Mactan-Cebu International', country: 'Philippines' },
  { code: 'SGN', city: 'Ho Chi Minh City', name: 'Tan Son Nhat International', country: 'Vietnam' },
  { code: 'HAN', city: 'Hanoi', name: 'Noi Bai International', country: 'Vietnam' },
  { code: 'DAD', city: 'Da Nang', name: 'Da Nang International', country: 'Vietnam' },
  { code: 'PNH', city: 'Phnom Penh', name: 'Phnom Penh International', country: 'Cambodia' },
  { code: 'REP', city: 'Siem Reap', name: 'Siem Reap International', country: 'Cambodia' },
  { code: 'RGN', city: 'Yangon', name: 'Yangon International', country: 'Myanmar' },
  { code: 'DAC', city: 'Dhaka', name: 'Hazrat Shahjalal International', country: 'Bangladesh' },
  { code: 'CMB', city: 'Colombo', name: 'Bandaranaike International', country: 'Sri Lanka' },
  { code: 'KTM', city: 'Kathmandu', name: 'Tribhuvan International', country: 'Nepal' },
  { code: 'DEL', city: 'New Delhi', name: 'Indira Gandhi International', country: 'India' },
  { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj', country: 'India' },
  { code: 'BLR', city: 'Bangalore', name: 'Kempegowda International', country: 'India' },
  { code: 'MAA', city: 'Chennai', name: 'Chennai International', country: 'India' },
  { code: 'CCU', city: 'Kolkata', name: 'Netaji Subhash Chandra Bose', country: 'India' },
  { code: 'HYD', city: 'Hyderabad', name: 'Rajiv Gandhi International', country: 'India' },
  { code: 'AMD', city: 'Ahmedabad', name: 'Sardar Vallabhbhai Patel', country: 'India' },
  { code: 'PNQ', city: 'Pune', name: 'Pune Airport', country: 'India' },
  { code: 'COK', city: 'Kochi', name: 'Cochin International', country: 'India' },
  { code: 'GOI', city: 'Goa', name: 'Dabolim Airport', country: 'India' },
  { code: 'JAI', city: 'Jaipur', name: 'Jaipur International', country: 'India' },
  { code: 'ATQ', city: 'Amritsar', name: 'Sri Guru Ram Dass Jee', country: 'India' },
  { code: 'PVG', city: 'Shanghai', name: 'Pudong International', country: 'China' },
  { code: 'SHA', city: 'Shanghai', name: 'Hongqiao International', country: 'China' },
  { code: 'PEK', city: 'Beijing', name: 'Capital International', country: 'China' },
  { code: 'PKX', city: 'Beijing', name: 'Daxing International', country: 'China' },
  { code: 'CAN', city: 'Guangzhou', name: 'Baiyun International', country: 'China' },
  { code: 'SZX', city: 'Shenzhen', name: 'Bao an International', country: 'China' },
  { code: 'CTU', city: 'Chengdu', name: 'Tianfu International', country: 'China' },
  { code: 'WUH', city: 'Wuhan', name: 'Tianhe International', country: 'China' },
  { code: 'XIY', city: 'Xian', name: 'Xianyang International', country: 'China' },
  { code: 'KMG', city: 'Kunming', name: 'Changshui International', country: 'China' },
  { code: 'XMN', city: 'Xiamen', name: 'Gaoqi International', country: 'China' },
  { code: 'HGH', city: 'Hangzhou', name: 'Xiaoshan International', country: 'China' },
  { code: 'NKG', city: 'Nanjing', name: 'Lukou International', country: 'China' },
  { code: 'HAK', city: 'Haikou', name: 'Meilan International', country: 'China' },
  { code: 'NRT', city: 'Tokyo', name: 'Narita International', country: 'Japan' },
  { code: 'HND', city: 'Tokyo', name: 'Haneda', country: 'Japan' },
  { code: 'KIX', city: 'Osaka', name: 'Kansai International', country: 'Japan' },
  { code: 'ITM', city: 'Osaka', name: 'Itami Airport', country: 'Japan' },
  { code: 'NGO', city: 'Nagoya', name: 'Chubu Centrair', country: 'Japan' },
  { code: 'FUK', city: 'Fukuoka', name: 'Fukuoka Airport', country: 'Japan' },
  { code: 'CTS', city: 'Sapporo', name: 'New Chitose Airport', country: 'Japan' },
  { code: 'ICN', city: 'Seoul', name: 'Incheon International', country: 'South Korea' },
  { code: 'GMP', city: 'Seoul', name: 'Gimpo International', country: 'South Korea' },
  { code: 'PUS', city: 'Busan', name: 'Gimhae International', country: 'South Korea' },
  { code: 'CJU', city: 'Jeju', name: 'Jeju International', country: 'South Korea' },
  { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong International', country: 'Hong Kong' },
  { code: 'TPE', city: 'Taipei', name: 'Taiwan Taoyuan International', country: 'Taiwan' },
  { code: 'TSA', city: 'Taipei', name: 'Taipei Songshan', country: 'Taiwan' },
  { code: 'SYD', city: 'Sydney', name: 'Kingsford Smith', country: 'Australia' },
  { code: 'MEL', city: 'Melbourne', name: 'Melbourne Airport', country: 'Australia' },
  { code: 'BNE', city: 'Brisbane', name: 'Brisbane Airport', country: 'Australia' },
  { code: 'PER', city: 'Perth', name: 'Perth Airport', country: 'Australia' },
  { code: 'ADL', city: 'Adelaide', name: 'Adelaide Airport', country: 'Australia' },
  { code: 'OOL', city: 'Gold Coast', name: 'Gold Coast Airport', country: 'Australia' },
  { code: 'AKL', city: 'Auckland', name: 'Auckland Airport', country: 'New Zealand' },
  { code: 'WLG', city: 'Wellington', name: 'Wellington Airport', country: 'New Zealand' },
  { code: 'CHC', city: 'Christchurch', name: 'Christchurch Airport', country: 'New Zealand' },
  { code: 'JNB', city: 'Johannesburg', name: 'OR Tambo International', country: 'South Africa' },
  { code: 'CPT', city: 'Cape Town', name: 'Cape Town International', country: 'South Africa' },
  { code: 'DUR', city: 'Durban', name: 'King Shaka International', country: 'South Africa' },
  { code: 'NBO', city: 'Nairobi', name: 'Jomo Kenyatta International', country: 'Kenya' },
  { code: 'MBA', city: 'Mombasa', name: 'Moi International', country: 'Kenya' },
  { code: 'ADD', city: 'Addis Ababa', name: 'Bole International', country: 'Ethiopia' },
  { code: 'LOS', city: 'Lagos', name: 'Murtala Muhammed', country: 'Nigeria' },
  { code: 'ABV', city: 'Abuja', name: 'Nnamdi Azikiwe International', country: 'Nigeria' },
  { code: 'ACC', city: 'Accra', name: 'Kotoka International', country: 'Ghana' },
  { code: 'DKR', city: 'Dakar', name: 'Leopold Sedar Senghor', country: 'Senegal' },
  { code: 'CMN', city: 'Casablanca', name: 'Mohammed V International', country: 'Morocco' },
  { code: 'RAK', city: 'Marrakech', name: 'Menara Airport', country: 'Morocco' },
  { code: 'TNG', city: 'Tangier', name: 'Ibn Battouta Airport', country: 'Morocco' },
  { code: 'TUN', city: 'Tunis', name: 'Carthage International', country: 'Tunisia' },
  { code: 'ALG', city: 'Algiers', name: 'Houari Boumediene', country: 'Algeria' },
  { code: 'DAR', city: 'Dar es Salaam', name: 'Julius Nyerere International', country: 'Tanzania' },
  { code: 'ZNZ', city: 'Zanzibar', name: 'Zanzibar Airport', country: 'Tanzania' },
  { code: 'EBB', city: 'Kampala', name: 'Entebbe International', country: 'Uganda' },
  { code: 'KGL', city: 'Kigali', name: 'Kigali International', country: 'Rwanda' },
  { code: 'MRU', city: 'Mauritius', name: 'Sir Seewoosagur Ramgoolam', country: 'Mauritius' },
  { code: 'SEZ', city: 'Seychelles', name: 'Seychelles International', country: 'Seychelles' },
  { code: 'ALA', city: 'Almaty', name: 'Almaty International', country: 'Kazakhstan' },
  { code: 'NQZ', city: 'Astana', name: 'Nursultan Nazarbayev', country: 'Kazakhstan' },
  { code: 'TAS', city: 'Tashkent', name: 'Islam Karimov International', country: 'Uzbekistan' },
  { code: 'ISB', city: 'Islamabad', name: 'New Islamabad International', country: 'Pakistan' },
  { code: 'LHE', city: 'Lahore', name: 'Allama Iqbal International', country: 'Pakistan' },
  { code: 'KHI', city: 'Karachi', name: 'Jinnah International', country: 'Pakistan' },
];

const AirportSearch = ({ label, value, onChange, placeholder }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  React.useEffect(() => {
    if (value && value.code && !query) {
      setQuery(value.city + ' (' + value.code + ')');
    }
  }, [value]);

  React.useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearch = (q) => {
    setQuery(q);
    if (q.length < 1) { setResults([]); setOpen(false); return; }
    const filtered = AIRPORTS.filter(a =>
      a.city.toLowerCase().includes(q.toLowerCase()) ||
      a.code.toLowerCase().includes(q.toLowerCase()) ||
      a.name.toLowerCase().includes(q.toLowerCase()) ||
      a.country.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 7);
    setResults(filtered);
    setOpen(true);
  };

  const handleSelect = (airport) => {
    setQuery(airport.city + ' (' + airport.code + ')');
    setOpen(false);
    setResults([]);
    onChange(airport);
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <MapPin size={16} className="absolute left-3 top-3.5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => query.length > 0 && results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {results.map(airport => (
            <button
              key={airport.code}
              type="button"
              onClick={() => handleSelect(airport)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 text-left transition border-b border-gray-50 last:border-0"
            >
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-purple-600">{airport.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{airport.city}</p>
                <p className="text-xs text-gray-400 truncate">{airport.name} - {airport.country}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AddFlight = ({ session }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    from_city: '', from_code: '',
    to_city: '', to_code: '',
    flight_date: '', flight_number: '', airline: '',
    available_kg: '', price_per_kg: '',
    categories: [], notes: '',
    delivery_type: 'handover',
    shop_and_ship_fee: '',
    handover_location_departure: '',
    handover_location_arrival: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [flightNumberSearch, setFlightNumberSearch] = useState('');
  const [searching, setSearching] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const searchByFlightNumber = () => {
    if (!flightNumberSearch.trim()) return;
    setSearching(true);
    const upper = flightNumberSearch.toUpperCase().trim();
    const airlineCode = upper.replace(/[0-9\s]/g, '');
    const found = Object.entries(AIRLINE_CODES).find(function(entry) { return entry[1] === airlineCode; });
    const airline = found ? found[0] : null;
    if (airline) {
      setForm(function(prev) { return Object.assign({}, prev, { airline: airline, flight_number: upper }); });
      setError('');
    } else {
      setError('Airline not detected. Please select it manually below.');
      setForm(function(prev) { return Object.assign({}, prev, { flight_number: upper }); });
    }
    setSearching(false);
  };

  const toggleCategory = (cat) => {
    setForm(function(prev) {
      return Object.assign({}, prev, {
        categories: prev.categories.includes(cat)
          ? prev.categories.filter(function(c) { return c !== cat; })
          : prev.categories.concat([cat])
      });
    });
  };

  const validateStep1 = () => {
    if (!form.from_code) { setError('Please select departure airport.'); return false; }
    if (!form.to_code) { setError('Please select arrival airport.'); return false; }
    if (form.from_code === form.to_code) { setError('Departure and arrival cannot be the same.'); return false; }
    if (!form.flight_date) { setError('Please select flight date.'); return false; }
    if (form.flight_date < today) { setError('Flight date cannot be in the past.'); return false; }
    if (!form.airline) { setError('Please select your airline.'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!form.available_kg || parseFloat(form.available_kg) <= 0) {
      setError('Please enter available weight.'); return false;
    }
    if (parseFloat(form.available_kg) > 50) {
      setError('Maximum 50kg per listing.'); return false;
    }
    if (!form.price_per_kg || parseFloat(form.price_per_kg) <= 0) {
      setError('Please enter your price per kg.'); return false;
    }
    if (form.categories.length === 0) {
      setError('Please select at least one category.'); return false;
    }
    return true;
  };

  const handleNext = () => {
    setError('');
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const saveFlight = async () => {
    setLoading(true);
    setError('');
    const result = await supabase.from('flights').insert([{
      user_id: session.user.id,
      from_city: form.from_city,
      from_code: form.from_code,
      to_city: form.to_city,
      to_code: form.to_code,
      flight_date: form.flight_date,
      flight_number: form.flight_number,
      airline: form.airline,
      available_kg: parseFloat(form.available_kg),
      price_per_kg: parseFloat(form.price_per_kg),
      categories: form.categories,
      notes: form.notes,
      status: 'active',
      delivery_type: form.delivery_type,
      shop_and_ship_fee: parseFloat(form.shop_and_ship_fee) || 0,
      handover_location_departure: form.handover_location_departure,
      handover_location_arrival: form.handover_location_arrival,
    }]);
    if (result.error) {
      setError(result.error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setSuccess(false);
    setStep(1);
    setForm({
      from_city: '', from_code: '', to_city: '', to_code: '',
      flight_date: '', flight_number: '', airline: '',
      available_kg: '', price_per_kg: '', categories: [], notes: '',
      delivery_type: 'handover', shop_and_ship_fee: '',
      handover_location_departure: '', handover_location_arrival: '',
    });
  };

  const grossEarnings = form.available_kg && form.price_per_kg
    ? parseFloat(form.available_kg) * parseFloat(form.price_per_kg) : 0;
  const netShippingEarnings = grossEarnings * 0.90;
  const shopFeeGross = parseFloat(form.shop_and_ship_fee) || 0;
  const shopFeeNet = shopFeeGross * 0.90;
  const netWithShop = (netShippingEarnings + shopFeeNet).toFixed(2);

  if (success) {
    return (
      <div className="max-w-xl mx-auto py-16 px-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={40} className="text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Flight Listed!</h2>
        <p className="text-gray-400 mb-6">
          Your flight from {form.from_city} to {form.to_city} is now live.
        </p>
        <div className="bg-purple-50 rounded-2xl p-4 mb-6 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Route</span>
            <span className="font-semibold">{form.from_code} to {form.to_code}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Date</span>
            <span className="font-semibold">{new Date(form.flight_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Capacity</span>
            <span className="font-semibold">{form.available_kg}kg at ${form.price_per_kg}/kg</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Max net earnings</span>
            <span className="font-semibold text-green-600">${netWithShop} after Fetchr 10%</span>
          </div>
        </div>
        <button onClick={resetForm}
          className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition">
          Add Another Flight
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">List Your Flight</h1>
        <p className="text-gray-400 text-sm mt-1">Earn money by delivering items on your next trip</p>
      </div>

      <div className="flex items-center gap-2 mb-8">
        {[{ n: 1, label: 'Flight Info' }, { n: 2, label: 'Capacity' }, { n: 3, label: 'Delivery' }].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-2">
              <div className={'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ' + (step > s.n ? 'bg-green-500 text-white' : step === s.n ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400')}>
                {step > s.n ? <CheckCircle size={16} /> : s.n}
              </div>
              <span className={'text-xs font-medium hidden sm:block ' + (step === s.n ? 'text-purple-600' : 'text-gray-400')}>
                {s.label}
              </span>
            </div>
            {i < 2 && <div className={'flex-1 h-0.5 ' + (step > s.n ? 'bg-green-400' : 'bg-gray-200')} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
            <p className="text-sm font-semibold text-purple-700 mb-1">Quick Fill - Flight Number</p>
            <p className="text-xs text-gray-500 mb-2">Auto-detects your airline. Select airports and date below.</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. EK203, QR542..."
                value={flightNumberSearch}
                onChange={e => setFlightNumberSearch(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') searchByFlightNumber(); }}
                className="flex-1 border border-purple-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
              />
              <button type="button" onClick={searchByFlightNumber} disabled={searching}
                className="bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2">
                <Search size={15} />
                Fill
              </button>
            </div>
            {form.airline && (
              <p className="text-xs text-green-600 font-semibold mt-2">Airline detected: {form.airline}</p>
            )}
          </div>

          <AirportSearch
            label="Departure Airport *"
            value={{ city: form.from_city, code: form.from_code }}
            onChange={airport => setForm(prev => Object.assign({}, prev, { from_city: airport.city, from_code: airport.code }))}
            placeholder="Search city, airport or code..."
          />

          <AirportSearch
            label="Arrival Airport *"
            value={{ city: form.to_city, code: form.to_code }}
            onChange={airport => setForm(prev => Object.assign({}, prev, { to_city: airport.city, to_code: airport.code }))}
            placeholder="Search city, airport or code..."
          />

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Flight Date *</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input type="date" min={today} value={form.flight_date}
                onChange={e => setForm(Object.assign({}, form, { flight_date: e.target.value }))}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Airline *</label>
            <div className="relative">
              <Plane size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <select value={form.airline} onChange={e => setForm(Object.assign({}, form, { airline: e.target.value }))}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 appearance-none text-gray-700">
                <option value="">Select airline...</option>
                {AIRLINES.sort().map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Flight Number</label>
            <input type="text" placeholder="e.g. EK203"
              value={form.flight_number}
              onChange={e => setForm(Object.assign({}, form, { flight_number: e.target.value.toUpperCase() }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
          </div>

          <button onClick={handleNext}
            className="w-full bg-purple-600 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-purple-700 transition">
            Continue to Capacity
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2 text-sm">
            <Plane size={15} className="text-purple-600" />
            <span className="font-semibold">{form.from_city} ({form.from_code})</span>
            <span className="text-gray-400">to</span>
            <span className="font-semibold">{form.to_city} ({form.to_code})</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Available kg *</label>
              <div className="relative">
                <Weight size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="number" placeholder="e.g. 10" min="0.5" max="50" step="0.5"
                  value={form.available_kg}
                  onChange={e => setForm(Object.assign({}, form, { available_kg: e.target.value }))}
                  className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Price per kg ($) *</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="number" placeholder="e.g. 10" min="1" step="0.5"
                  value={form.price_per_kg}
                  onChange={e => setForm(Object.assign({}, form, { price_per_kg: e.target.value }))}
                  className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
              </div>
            </div>
          </div>

          {grossEarnings > 0 && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-700 mb-2">Earnings Estimate (if fully booked)</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Gross ({form.available_kg}kg x ${form.price_per_kg})</span>
                  <span>${grossEarnings.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Fetchr commission (10%)</span>
                  <span>-${(grossEarnings * 0.10).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-green-700 border-t border-green-200 pt-1">
                  <span>Your net shipping earnings</span>
                  <span>${netShippingEarnings.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">What items can you carry? *</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                  className={'px-3 py-1.5 rounded-full text-xs font-medium border transition ' + (form.categories.includes(cat) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300')}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea placeholder="Any special conditions..."
              value={form.notes} onChange={e => setForm(Object.assign({}, form, { notes: e.target.value }))}
              rows={2} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition">
              Back
            </button>
            <button onClick={handleNext}
              className="flex-1 bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition">
              Continue to Delivery
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Route</span>
              <span className="font-semibold">{form.from_code} to {form.to_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Capacity</span>
              <span className="font-semibold">{form.available_kg}kg at ${form.price_per_kg}/kg</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Delivery service *</label>
            <div className="space-y-2">
              {[
                { value: 'handover', icon: '🤝', label: 'Handover Only', desc: 'Shipper hands item to you at departure. You hand it to recipient at arrival.' },
                { value: 'both', icon: '🛍️', label: 'Handover + Shop and Ship', desc: 'You can also purchase items at the destination for an additional fee.' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(Object.assign({}, form, { delivery_type: opt.value }))}
                  className={'w-full flex items-start gap-3 p-4 rounded-xl border-2 transition text-left ' + (form.delivery_type === opt.value ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-200 bg-white')}>
                  <span className="text-2xl flex-shrink-0">{opt.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-800">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Departure Handover Location</label>
            <p className="text-xs text-gray-400 mb-1.5">Where should the shipper hand the item to you before departure?</p>
            <input type="text" placeholder="e.g. Dubai Airport Terminal 3 departures..."
              value={form.handover_location_departure}
              onChange={e => setForm(Object.assign({}, form, { handover_location_departure: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Arrival Handover Location</label>
            <p className="text-xs text-gray-400 mb-1.5">Where will you hand the item to the recipient at the destination?</p>
            <input type="text" placeholder="e.g. Heathrow arrivals hall..."
              value={form.handover_location_arrival}
              onChange={e => setForm(Object.assign({}, form, { handover_location_arrival: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
          </div>

          {form.delivery_type === 'both' && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ShoppingBag size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-700">Shop and Ship Service Fee</p>
                  <p className="text-xs text-blue-600 mt-0.5">Your fee for going to the store. Item purchase price added separately by shipper.</p>
                </div>
              </div>
              <div className="relative">
                <DollarSign size={15} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="number" placeholder="e.g. 15.00" min="0" step="0.5"
                  value={form.shop_and_ship_fee}
                  onChange={e => setForm(Object.assign({}, form, { shop_and_ship_fee: e.target.value }))}
                  className="w-full pl-8 border border-blue-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
              </div>
              {grossEarnings > 0 && (
                <div className="bg-white rounded-xl p-3 space-y-1 text-xs">
                  <p className="font-semibold text-gray-700 mb-1">Your potential earnings</p>
                  <div className="flex justify-between text-gray-500">
                    <span>Net shipping (after 10%)</span>
                    <span>${netShippingEarnings.toFixed(2)}</span>
                  </div>
                  {shopFeeGross > 0 && (
                    <div>
                      <div className="flex justify-between text-gray-500">
                        <span>Shop and Ship fee (gross)</span>
                        <span>${shopFeeGross.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-red-400">
                        <span>Fetchr commission (10%)</span>
                        <span>-${(shopFeeGross * 0.10).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-green-700 border-t border-gray-100 pt-1">
                    <span>Total net per booking</span>
                    <span>${netWithShop}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition">
              Back
            </button>
            <button onClick={saveFlight} disabled={loading}
              className="flex-1 bg-purple-600 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? 'Publishing...' : 'Publish Flight'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddFlight;
