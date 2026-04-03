// lib/types.ts
// Shared TypeScript interfaces for the CK Expense Automator extension.

export interface ExpenseRule {
  id: string;
  name: string;
  matchPattern: string;
  matchFlags?: string;
  nominalId: string;
  description: string;
  purchasedFrom: string;
  hasVat: boolean;
  vatAmount: number | null;
  vatPercentage: number | null;
  enabled: boolean;
  createdAt: string;
  lastUsed?: string;
  matchCount?: number;
}

export interface RulesConfig {
  rules: ExpenseRule[];
  version: number;
}

export interface RuleStats {
  matchCount: number;
  lastUsed: string | null;
}

export interface SuspenseItem {
  id: string;
  date: string;      // dd/mm/yyyy from DataTable
  isoDate: string;   // yyyy-mm-dd derived
  description: string;
  amount: number;
}

export interface ExpenseSubmission {
  claimId: string;
  suspenseItemId: string;
  date: string;        // dd/mm/yyyy
  isoDate: string;     // yyyy-mm-dd
  nominalId: string;
  description: string;
  purchasedFrom: string;
  grossAmount: number;
  hasVat: boolean;
  vatAmount: number | null;
  previousPage: string;
}

export interface MatchResult {
  matched: Array<{ item: SuspenseItem; rule: ExpenseRule }>;
  unmatched: SuspenseItem[];
}
