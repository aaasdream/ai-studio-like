export interface CostRecord {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

const STORAGE_KEY = 'gemini_cost_history';

export const getCostHistory = (): CostRecord[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const saveCostRecord = (record: Omit<CostRecord, 'id' | 'timestamp'>) => {
  const history = getCostHistory();
  const newRecord: CostRecord = {
    ...record,
    id: Date.now().toString(),
    timestamp: Date.now()
  };
  history.push(newRecord);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  return newRecord;
};

export const getDailyCost = (dateStr: string): number => {
  const history = getCostHistory();
  return history
    .filter(r => r.date === dateStr)
    .reduce((sum, r) => sum + r.cost, 0);
};

export const getMonthlyCost = (year: number, month: number): number => {
  // month is 0-indexed (0 = Jan)
  const history = getCostHistory();
  const prefix = `${year}-${(month + 1).toString().padStart(2, '0')}`;
  return history
    .filter(r => r.date.startsWith(prefix))
    .reduce((sum, r) => sum + r.cost, 0);
};
