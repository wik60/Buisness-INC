// Static game data for Delusional Business Inc.
// All money is in USD. London is the 1.0 baseline; other cities scale prices, spending and wages.

export const CITIES = {
  warsaw: {
    id: 'warsaw', name: 'Warsaw', flag: '🇵🇱', cost: 0.45, spend: 0.55, wage: 0.5,
    districts: [
      { id: 'srodmiescie', name: 'Śródmieście', price: 1.8, traffic: 88, kinds: ['commercial', 'office'], streets: ['Marszałkowska', 'Nowy Świat', 'Chmielna', 'Złota'] },
      { id: 'mokotow', name: 'Mokotów', price: 1.3, traffic: 64, kinds: ['commercial', 'office'], streets: ['Puławska', 'Domaniewska', 'Woronicza'] },
      { id: 'wola', name: 'Wola', price: 1.25, traffic: 56, kinds: ['office', 'commercial'], streets: ['Prosta', 'Grzybowska', 'Wolska'] },
      { id: 'praga', name: 'Praga-Północ', price: 0.7, traffic: 46, kinds: ['commercial', 'warehouse'], streets: ['Ząbkowska', 'Targowa', 'Stalowa'] },
      { id: 'ursynow', name: 'Ursynów', price: 0.9, traffic: 50, kinds: ['commercial'], streets: ['KEN', 'Belgradzka', 'Rosoła'] },
      { id: 'bialoleka', name: 'Białołęka', price: 0.5, traffic: 22, kinds: ['warehouse', 'commercial'], streets: ['Modlińska', 'Marywilska', 'Annopol'] },
      { id: 'okecie', name: 'Okęcie (Airport)', price: 1.4, traffic: 84, kinds: ['commercial'], big: true, streets: ['Żwirki i Wigury', '17 Stycznia'] },
    ],
  },
  london: {
    id: 'london', name: 'London', flag: '🇬🇧', cost: 1.0, spend: 1.0, wage: 1.0,
    districts: [
      { id: 'westend', name: 'Soho & West End', price: 2.2, traffic: 96, kinds: ['commercial', 'office'], streets: ['Oxford St', 'Carnaby St', 'Regent St', 'Wardour St'] },
      { id: 'city', name: 'City of London', price: 2.0, traffic: 78, kinds: ['office', 'commercial'], streets: ['Bishopsgate', 'Cheapside', 'Moorgate'] },
      { id: 'canary', name: 'Canary Wharf', price: 1.7, traffic: 68, kinds: ['office', 'commercial'], streets: ['Canada Sq', 'Bank St', 'Westferry Rd'] },
      { id: 'shoreditch', name: 'Shoreditch', price: 1.2, traffic: 72, kinds: ['commercial', 'office'], streets: ['Brick Ln', 'Old St', 'Rivington St'] },
      { id: 'croydon', name: 'Croydon', price: 0.7, traffic: 50, kinds: ['commercial', 'office'], streets: ['North End', 'George St', 'Wellesley Rd'] },
      { id: 'barking', name: 'Barking & Dagenham', price: 0.5, traffic: 24, kinds: ['warehouse', 'commercial'], streets: ['River Rd', 'Thames Rd', 'Chequers Ln'] },
      { id: 'heathrow', name: 'Heathrow', price: 1.5, traffic: 86, kinds: ['commercial'], big: true, streets: ['Bath Rd', 'Northern Perimeter Rd'] },
    ],
  },
  nyc: {
    id: 'nyc', name: 'New York', flag: '🇺🇸', cost: 1.15, spend: 1.1, wage: 1.1,
    districts: [
      { id: 'midtown', name: 'Midtown Manhattan', price: 2.3, traffic: 100, kinds: ['commercial', 'office'], streets: ['5th Ave', 'Broadway', 'Madison Ave', 'W 34th St'] },
      { id: 'soho', name: 'SoHo', price: 2.0, traffic: 90, kinds: ['commercial'], streets: ['Spring St', 'Prince St', 'Greene St'] },
      { id: 'fidi', name: 'Financial District', price: 2.1, traffic: 74, kinds: ['office', 'commercial'], streets: ['Wall St', 'Water St', 'Broad St'] },
      { id: 'williamsburg', name: 'Williamsburg, Brooklyn', price: 1.2, traffic: 70, kinds: ['commercial', 'office'], streets: ['Bedford Ave', 'Grand St', 'Kent Ave'] },
      { id: 'lic', name: 'Long Island City, Queens', price: 0.9, traffic: 50, kinds: ['office', 'warehouse', 'commercial'], streets: ['Jackson Ave', 'Vernon Blvd', '21st St'] },
      { id: 'huntspoint', name: 'Hunts Point, Bronx', price: 0.5, traffic: 24, kinds: ['warehouse'], streets: ['Food Center Dr', 'Halleck St', 'Oak Point Ave'] },
      { id: 'jfk', name: 'JFK Airport, Queens', price: 1.6, traffic: 88, kinds: ['commercial'], big: true, streets: ['Van Wyck Expy', 'Rockaway Blvd'] },
    ],
  },
};

export const KINDS = {
  commercial: { name: 'Commercial Parcel', short: 'Commercial', img: 'assets/ui/commercial.svg' },
  office: { name: 'Office', short: 'Office', img: 'assets/ui/office.svg' },
  warehouse: { name: 'Warehouse', short: 'Warehouse', img: 'assets/ui/warehouse.svg' },
};

// Size → base staff capacity and base London price (USD)
export const SIZES = {
  S: { label: 'Small', cap: 4, price: { commercial: 120000, office: 100000, warehouse: 80000 } },
  M: { label: 'Medium', cap: 12, price: { commercial: 380000, office: 320000, warehouse: 240000 } },
  L: { label: 'Large', cap: 30, price: { commercial: 1100000, office: 900000, warehouse: 650000 } },
  XL: { label: 'Huge', cap: 80, price: { commercial: 3600000, office: 2600000, warehouse: 1800000 } },
};
export const SIZE_ORDER = ['S', 'M', 'L', 'XL'];

// Business types.
// serve: customers one average (skill 50) worker handles per day
// ticket: revenue per customer (London prices)
// cogs: share of revenue spent on goods/materials
// wage: daily wage of an average worker (London)
// traffic: how much customer flow of the parcel matters (0 = B2B, 1 = pure walk-in)
// skillImpact: how strongly skill affects productivity
// premises: allowed kinds for the main location
export const BUSINESS_TYPES = [
  { id: 'clothing', name: 'Clothing Brand', role: 'Sales Associate', license: 4000, minSize: 'S', warehouse: true, serve: 12, ticket: 48, cogs: 0.42, wage: 85, traffic: 0.75, skillImpact: 1, premises: ['commercial'], blurb: 'Design drops, sell hype. Stock lives in a warehouse, so you need one plus warehouse staff.' },
  { id: 'coffee', name: 'Coffee Shop', role: 'Barista', license: 1200, minSize: 'S', serve: 72, ticket: 5.2, cogs: 0.3, wage: 72, traffic: 0.9, skillImpact: 1, premises: ['commercial'], blurb: 'Cheapest way in. Lives and dies by foot traffic.' },
  { id: 'bakery', name: 'Bakery', role: 'Baker', license: 1800, minSize: 'S', serve: 62, ticket: 7, cogs: 0.36, wage: 76, traffic: 0.85, skillImpact: 1, premises: ['commercial'], blurb: 'Early mornings, steady margins.' },
  { id: 'law', name: 'Law Firm', role: 'Lawyer', license: 35000, minSize: 'S', serve: 1.4, ticket: 650, cogs: 0.06, wage: 360, traffic: 0.15, skillImpact: 1.6, premises: ['office', 'commercial'], blurb: 'Billable hours. Skill matters a lot, location barely.' },
  { id: 'realestate', name: 'Real Estate Agency', role: 'Agent', license: 12000, minSize: 'S', serve: 0.07, ticket: 9000, cogs: 0.12, wage: 170, traffic: 0.45, skillImpact: 1.3, premises: ['commercial', 'office'], blurb: 'Few deals, fat commissions. Lumpy income.' },
  { id: 'cars', name: 'Car Dealership', role: 'Car Salesperson', license: 60000, minSize: 'L', serve: 0.32, ticket: 28000, cogs: 0.9, wage: 150, traffic: 0.55, skillImpact: 1.2, premises: ['commercial'], blurb: 'Huge tickets, thin margins. Needs a large lot.' },
  { id: 'tech', name: 'Tech Startup', role: 'Engineer', license: 25000, minSize: 'S', serve: 34, ticket: 22, cogs: 0.1, wage: 340, traffic: 0.05, skillImpact: 1.8, premises: ['office', 'commercial'], blurb: 'Hire great engineers or burn cash. Skill is everything.' },
  { id: 'restaurant', name: 'Restaurant', role: 'Chef / Waiter', license: 9000, minSize: 'M', serve: 26, ticket: 34, cogs: 0.36, wage: 86, traffic: 0.8, skillImpact: 1.1, premises: ['commercial'], blurb: 'Great food, great reviews, great chaos.' },
  { id: 'gym', name: 'Gym', role: 'Trainer', license: 14000, minSize: 'M', serve: 80, ticket: 8.5, cogs: 0.12, wage: 92, traffic: 0.6, skillImpact: 1, premises: ['commercial'], blurb: 'Memberships and protein shakes. Needs space.' },
  { id: 'hotel', name: 'Hotel', role: 'Hotel Staff', license: 150000, minSize: 'L', serve: 7, ticket: 170, cogs: 0.24, wage: 96, traffic: 0.6, skillImpact: 1, premises: ['commercial'], blurb: 'Rooms, reviews, and a large building.' },
  { id: 'marketing', name: 'Marketing Agency', role: 'Marketer', license: 9000, minSize: 'S', serve: 1.9, ticket: 520, cogs: 0.16, wage: 220, traffic: 0.15, skillImpact: 1.4, premises: ['office', 'commercial'], blurb: 'Sell vibes to other businesses.' },
  { id: 'construction', name: 'Construction Company', role: 'Builder', license: 45000, minSize: 'M', warehouse: true, serve: 0.035, ticket: 42000, cogs: 0.58, wage: 165, traffic: 0.05, skillImpact: 1.2, premises: ['office', 'commercial'], blurb: 'Big contracts. Equipment lives in a warehouse.' },
  { id: 'gaming', name: 'Gaming Studio', role: 'Game Developer', license: 30000, minSize: 'S', serve: 22, ticket: 32, cogs: 0.18, wage: 280, traffic: 0.02, skillImpact: 1.8, premises: ['office', 'commercial'], blurb: 'Ship a hit or crunch forever.' },
  { id: 'airline', name: 'Airline', role: 'Pilot & Crew', license: 2500000, minSize: 'XL', serve: 18, ticket: 240, cogs: 0.6, wage: 240, traffic: 0.35, skillImpact: 1.1, premises: ['commercial'], airport: true, blurb: 'The ultimate delusion. Needs a huge airport parcel.' },
  { id: 'supermarket', name: 'Supermarket', role: 'Cashier', license: 50000, minSize: 'L', warehouse: true, serve: 130, ticket: 29, cogs: 0.74, wage: 70, traffic: 0.85, skillImpact: 0.8, premises: ['commercial'], blurb: 'Volume game. Needs a large store and a warehouse.' },
  { id: 'jewelry', name: 'Jewelry Store', role: 'Jeweler', license: 40000, minSize: 'S', serve: 1.3, ticket: 1100, cogs: 0.56, wage: 140, traffic: 0.8, skillImpact: 1.2, premises: ['commercial'], blurb: 'Rich foot traffic is everything.' },
  { id: 'furniture', name: 'Furniture Company', role: 'Craftsperson', license: 25000, minSize: 'M', warehouse: true, serve: 1.6, ticket: 820, cogs: 0.48, wage: 110, traffic: 0.5, skillImpact: 1.1, premises: ['commercial'], blurb: 'Showroom up front, warehouse out back.' },
  { id: 'cosmetics', name: 'Cosmetics Brand', role: 'Beauty Advisor', license: 15000, minSize: 'S', warehouse: true, serve: 14, ticket: 38, cogs: 0.34, wage: 98, traffic: 0.65, skillImpact: 1, premises: ['commercial'], blurb: 'Glow up the margins. Stock needs a warehouse.' },
  { id: 'security', name: 'Security Agency', role: 'Security Guard', license: 12000, minSize: 'S', serve: 1, ticket: 330, cogs: 0.08, wage: 125, traffic: 0.05, skillImpact: 1, premises: ['office', 'commercial'], blurb: 'Contracts per guard. Reliable, unglamorous.' },
  { id: 'delivery', name: 'Delivery Company', role: 'Courier', license: 20000, minSize: 'M', warehouse: true, serve: 55, ticket: 8.5, cogs: 0.26, wage: 86, traffic: 0.1, skillImpact: 1, premises: ['office', 'commercial'], blurb: 'Parcels in, parcels out. Sorting happens in the warehouse.' },
];
export const BT = Object.fromEntries(BUSINESS_TYPES.map(b => [b.id, b]));

// Positions an employee can hold
export const POSITIONS = {
  floor: { name: 'Floor staff', where: 'main' },
  warehouse: { name: 'Warehouse Worker', where: 'warehouse', wage: 78 },
  recruiter: { name: 'Recruiter', where: 'office', wage: 210, desc: 'Unlocks skilled candidates, up to 100 hires/day. Better recruiters find better people.' },
  hr: { name: 'HR Manager', where: 'office', wage: 190, desc: 'Trains staff faster. Each one keeps 40 employees happy (needed above 15 staff).' },
  accountant: { name: 'Accountant', where: 'office', wage: 230, desc: 'Cuts your income tax bill (up to −30%).' },
  marketing: { name: 'Marketing Manager', where: 'office', wage: 220, desc: 'Boosts customer demand for this business.' },
  cleaner: { name: 'Cleaner', where: 'support', wage: 58, desc: 'Every business needs at least one. Each keeps about 10 staff worth of space clean — too few and customers get unhappy.' },
  security: { name: 'Security Guard', where: 'support', wage: 110, desc: 'Required for high-value businesses. Each covers about 15 staff — too few and you lose stock to theft.' },
};
export const SUPPORT_ROLES = ['cleaner', 'security'];
export const CLEANER_RATIO = 10;
export const SECURITY_RATIO = 15;
export const SECURITY_REQUIRED = ['jewelry', 'cars', 'hotel', 'supermarket', 'airline', 'clothing', 'cosmetics'];

// Equipment: every unit lets `staff` people work. Floor staff need the type's own kit,
// warehouse workers need racking, office staff need desks.
export const EQUIPMENT = {
  clothing: { name: 'Checkout counter & register', cost: 2400, staff: 2 },
  coffee: { name: 'Espresso machine & register', cost: 900, staff: 2 },
  bakery: { name: 'Oven & cash register', cost: 1100, staff: 2 },
  law: { name: 'Lawyer desk & legal database', cost: 3000, staff: 1 },
  realestate: { name: 'Agent desk & CRM license', cost: 1500, staff: 1 },
  cars: { name: 'Sales desk & demo car lift', cost: 12000, staff: 2 },
  tech: { name: 'Dev workstation', cost: 2800, staff: 1 },
  restaurant: { name: 'Kitchen station & POS terminal', cost: 4500, staff: 3 },
  gym: { name: 'Gym equipment set', cost: 9000, staff: 4 },
  hotel: { name: 'Front desk & housekeeping carts', cost: 6000, staff: 3 },
  marketing: { name: 'Creative workstation', cost: 2600, staff: 1 },
  construction: { name: 'Excavator & tool set', cost: 30000, staff: 3 },
  gaming: { name: 'Dev & art workstation', cost: 3500, staff: 1 },
  airline: { name: 'Leased aircraft', cost: 400000, staff: 10 },
  supermarket: { name: 'Checkout lane', cost: 5000, staff: 3 },
  jewelry: { name: 'Display vault & register', cost: 15000, staff: 2 },
  furniture: { name: 'Workshop bench & tools', cost: 6000, staff: 2 },
  cosmetics: { name: 'Beauty counter & register', cost: 4000, staff: 2 },
  security: { name: 'Radio & patrol kit', cost: 900, staff: 1 },
  delivery: { name: 'Delivery van', cost: 28000, staff: 2 },
};
export const WAREHOUSE_EQUIPMENT = { name: 'Racking & forklift', cost: 8000, staff: 4 };
export const OFFICE_EQUIPMENT = { name: 'Desk & computer', cost: 1200, staff: 1 };
export const EQUIP_RESALE = 0.5;
export const OFFICE_ROLES = ['recruiter', 'hr', 'accountant', 'marketing'];

// Day job ladder
export const JOB_LADDER = [
  { title: 'Junior Office Clerk', pay: 150 },
  { title: 'Office Clerk', pay: 175 },
  { title: 'Senior Clerk', pay: 205 },
  { title: 'Team Lead', pay: 245 },
  { title: 'Assistant Manager', pay: 290 },
  { title: 'Middle Manager', pay: 345 },
  { title: 'Regional Manager', pay: 410 },
];
export const DAYS_PER_PROMOTION = 25;

// Progressive income tax per 50-day period
export const TAX_PERIOD = 50;
export const TAX_BRACKETS = [
  { upTo: 10000, rate: 0.10 },
  { upTo: 50000, rate: 0.18 },
  { upTo: 250000, rate: 0.26 },
  { upTo: 1000000, rate: 0.34 },
  { upTo: Infinity, rate: 0.42 },
];

export const RANKS = [
  { min: -Infinity, title: 'Delusional Dreamer' },
  { min: 25000, title: 'Side Hustler' },
  { min: 100000, title: 'Small Business Owner' },
  { min: 500000, title: 'Local Legend' },
  { min: 2000000, title: 'Mogul' },
  { min: 10000000, title: 'Tycoon' },
  { min: 100000000, title: 'Delusional Billionaire (in progress)' },
  { min: 1000000000, title: 'Actually a Billionaire' },
];

export const FIRST = ['Anna', 'Jan', 'Olivia', 'Piotr', 'Maja', 'Kacper', 'Zofia', 'Jakub', 'Emma', 'Liam', 'Noah', 'Ava', 'Mia', 'Lucas', 'Amelia', 'Oliver', 'Isla', 'Harry', 'George', 'Freya', 'Mason', 'Sofia', 'Ethan', 'Chloe', 'Aiden', 'Priya', 'Arjun', 'Mohammed', 'Fatima', 'Wei', 'Mei', 'Diego', 'Lucia', 'Mateo', 'Hana', 'Kenji', 'Tomasz', 'Ola', 'Kuba', 'Nina', 'Leo', 'Ruby', 'Jack', 'Grace', 'Daniel', 'Zoe', 'Malik', 'Aisha', 'Oskar', 'Wiktoria'];
export const LAST = ['Nowak', 'Kowalski', 'Wiśniewska', 'Wójcik', 'Lewandowski', 'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Patel', 'Khan', 'Garcia', 'Martinez', 'Johnson', 'Lee', 'Chen', 'Kim', 'Nguyen', 'Rossi', 'Müller', 'Silva', 'Okafor', 'Murphy', "O'Brien", 'Cohen', 'Ivanova', 'Kaminski', 'Zieliński', 'Dąbrowska', 'Walker', 'Hughes', 'Rivera', 'Brooks', 'Ali'];
