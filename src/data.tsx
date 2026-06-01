export const samplePacking = [
  { id: 'p1', name: 'Passport', category: 'Documents', checked: true },
  { id: 'p2', name: 'Health Insurance Card', category: 'Documents', checked: false },
  { id: 'p3', name: 'Phone + Charger', category: 'Electronics', checked: true },
  { id: 'p4', name: 'Power Adapter (UAE)', category: 'Electronics', checked: false },
  { id: 'p5', name: 'Light Jacket', category: 'Clothing', checked: false },
  { id: 'p6', name: 'Comfortable Shoes', category: 'Clothing', checked: true },
  { id: 'p7', name: 'Formal Work Clothes', category: 'Clothing', checked: false }, //Allow for user to edit and add what they need
  { id: 'p8', name: 'Sunscreen', category: 'Toiletries', checked: false },
  { id: 'p9', name: 'Toothbrush + Toothpaste', category: 'Toiletries', checked: true },
  { id: 'p10', name: 'Medications', category: 'Health', checked: false },
];

export function getMedicationDropdownOptions() {
  return [
    { id: 'med-1', label: 'Daily Prescription' },
    { id: 'med-2', label: 'Pain Relief' },
    { id: 'med-3', label: 'Allergy Medication' },
    { id: 'med-4', label: 'Digestive Support' },
    { id: 'med-5', label: 'First Aid Essentials' },
    { id: 'med-6', label: 'Vitamins & Supplements' },
  ];
}

export const sampleMilestones = [
  { id: 'm1', title: 'Book flights', done: true, dueISO: null },
  { id: 'm2', title: 'Apply for visa', done: true, dueISO: null },
  { id: 'm3', title: 'Schedule medical check', done: false, dueISO: null },
];

export const sampleBudget = {
  salary: { monthlyAED: 8800, currency: 'AED', exchangeToZAR: 5.08 }, //Conversion to home currency for better usage of funds
  rent: { monthlyAED: 0 }, // paid by SABIS 
  groceries: { monthlyAED: 800 }, // allow user to change this based on their preferences (e.g., eating out more often vs cooking at home)
  dining: { monthlyAED: 400 }, // add this to entertainment
  transport: { monthlyAED: 0 }, // provided by SABIS 
  entertainment: { monthlyAED: 200 }, // allow user to change this based on their preferences (e.g., going out more often vs staying in)
  wifi : { monthlyAED: 293 }, // allow user to change this based on their preferences (e.g., using more or less data) also might need a split between roomate and her
};

export const countries = [
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', flag: '🇦🇪' },
  { code: 'IN', name: 'India', currency: 'INR', flag: '🇮🇳' },
  { code: 'US', name: 'United States', currency: 'USD', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', flag: '🇬🇧' },
  { code: 'SA', name: 'South Africa', currency: 'ZAR', flag: '🇿🇦' },
];
