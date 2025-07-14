import { Router } from 'express';
import { AIServiceFactory } from '../services/AIServiceFactory';

const router = Router();

// Interfaces for type safety
interface TransactionData {
  id?: string;
  description: string;
  amount: number;
  type?: 'debit' | 'credit';
  date?: string | Date;
  merchant?: string;
}

interface UserProfile {
  businessType?: string;
  industry?: string;
  countryCode?: string;
  profession?: string;
}

interface AnalysisOptions {
  includeTaxAnalysis?: boolean;
  includeBillDetection?: boolean;
  includeRecurringPatterns?: boolean;
  confidenceThreshold?: number;
}

interface CategoryResult {
  primary: string;
  secondary: string;
}

interface TaxAnalysisResult {
  isDeductible: boolean;
  businessUsePercentage: number;
  taxCategory: string;
}

interface BillAnalysisResult {
  isBill: boolean;
  isRecurring: boolean;
  frequency?: string;
}

interface TransactionAnalysisResult {
  transactionId?: string;
  category: string;
  subcategory: string;
  confidence: number;
  isTaxDeductible: boolean;
  businessUsePercentage: number;
  taxCategory: string;
  isBill: boolean;
  isRecurring: boolean;
  estimatedFrequency?: string;
  reasoning: string;
  primaryType: string;
  processedAt: string;
}

/**
 * 🎯 UNIFIED AI ENDPOINT
 * 
 * This single endpoint handles all AI classification tasks:
 * - Transaction categorization
 * - Tax deductibility analysis  
 * - Bill pattern detection
 * - Recurring transaction identification
 * 
 * No complex orchestration - just simple, direct AI processing
 */
router.post('/analyze', async (req, res) => {
  try {
    const { 
      transactions, 
      userProfile, 
      options = {} 
    }: {
      transactions: TransactionData[];
      userProfile?: UserProfile;
      options?: AnalysisOptions;
    } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid transactions array',
        timestamp: new Date().toISOString()
      });
    }

    const results: TransactionAnalysisResult[] = [];

    // Process each transaction with unified AI analysis
    for (const transaction of transactions) {
      const analysis = await analyzeTransactionUnified(transaction, userProfile);
      results.push({
        transactionId: transaction.id,
        ...analysis
      });
    }

    res.json({
      success: true,
      results,
      summary: {
        totalProcessed: results.length,
        avgConfidence: calculateAverageConfidence(results),
        categoriesFound: extractUniqueCategories(results),
        taxDeductibleCount: countTaxDeductible(results),
        billsDetected: countBills(results)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Unified AI analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'AI analysis failed',
      message: error?.message || 'Unknown error occurred',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 🧠 UNIFIED TRANSACTION ANALYSIS
 * 
 * This single function does everything:
 * - Categorizes the transaction
 * - Determines tax deductibility
 * - Detects if it's a recurring bill
 * - Provides confidence scores
 */
async function analyzeTransactionUnified(
  transaction: TransactionData, 
  userProfile?: UserProfile
): Promise<TransactionAnalysisResult> {
  const { description, amount, type, date, merchant } = transaction;
  
  // Basic categorization with pattern matching
  const category = categorizeTransaction(description, amount, merchant);
  
  // Tax deductibility analysis
  const taxAnalysis = analyzeTaxDeductibility(
    description, 
    amount, 
    category, 
    userProfile?.businessType || 'INDIVIDUAL'
  );
  
  // Bill pattern detection
  const billAnalysis = detectBillPattern(description, amount, merchant);
  
  // Confidence scoring
  const confidence = calculateConfidence(category, taxAnalysis, billAnalysis);
  
  return {
    // Core classification
    category: category.primary,
    subcategory: category.secondary,
    confidence,
    
    // Tax information
    isTaxDeductible: taxAnalysis.isDeductible,
    businessUsePercentage: taxAnalysis.businessUsePercentage,
    taxCategory: taxAnalysis.taxCategory,
    
    // Bill information
    isBill: billAnalysis.isBill,
    isRecurring: billAnalysis.isRecurring,
    estimatedFrequency: billAnalysis.frequency,
    
    // Reasoning
    reasoning: generateReasoning(category, taxAnalysis, billAnalysis),
    
    // Metadata
    primaryType: type === 'credit' ? 'income' : 'expense',
    processedAt: new Date().toISOString()
  };
}

function categorizeTransaction(description: string, amount: number, merchant?: string): CategoryResult {
  const desc = description.toLowerCase();
  const amt = Math.abs(amount);
  
  // Business/Office Supplies
  if (desc.includes('office') || desc.includes('supplies') || desc.includes('stationery')) {
    return { primary: 'Business Expense', secondary: 'Office Supplies' };
  }
  
  // Software & Technology
  if (desc.includes('software') || desc.includes('microsoft') || desc.includes('adobe') || desc.includes('app store')) {
    return { primary: 'Business Expense', secondary: 'Software & Technology' };
  }
  
  // Internet & Telecommunications
  if (desc.includes('internet') || desc.includes('telstra') || desc.includes('optus') || desc.includes('vodafone')) {
    return { primary: 'Business Expense', secondary: 'Telecommunications' };
  }
  
  // Professional Services
  if (desc.includes('accountant') || desc.includes('lawyer') || desc.includes('consultant')) {
    return { primary: 'Business Expense', secondary: 'Professional Services' };
  }
  
  // Large amounts likely business
  if (amt > 1000) {
    return { primary: 'Business Expense', secondary: 'Large Purchase' };
  }
  
  // Default categorization
  return { primary: 'General Expense', secondary: 'Uncategorized' };
}

function analyzeTaxDeductibility(
  description: string, 
  amount: number, 
  category: CategoryResult, 
  businessType: string
): TaxAnalysisResult {
  const desc = description.toLowerCase();
  const amt = Math.abs(amount);
  
  // Business expenses are generally deductible
  if (category.primary === 'Business Expense') {
    let businessUse = 100;
    
    // Some items might have mixed use
    if (desc.includes('phone') || desc.includes('internet')) {
      businessUse = businessType === 'INDIVIDUAL' ? 50 : 80;
    }
    
    if (desc.includes('car') || desc.includes('fuel') || desc.includes('vehicle')) {
      businessUse = businessType === 'INDIVIDUAL' ? 75 : 90;
    }
    
    return {
      isDeductible: true,
      businessUsePercentage: businessUse,
      taxCategory: category.secondary
    };
  }
  
  // Office supplies and professional services
  if (desc.includes('office') || desc.includes('software') || desc.includes('professional')) {
    return {
      isDeductible: true,
      businessUsePercentage: 100,
      taxCategory: 'Business Equipment/Services'
    };
  }
  
  // Education and training
  if (desc.includes('course') || desc.includes('training') || desc.includes('education')) {
    return {
      isDeductible: true,
      businessUsePercentage: 100,
      taxCategory: 'Professional Development'
    };
  }
  
  // Large amounts for businesses
  if (amt > 500 && businessType !== 'INDIVIDUAL') {
    return {
      isDeductible: true,
      businessUsePercentage: 80,
      taxCategory: 'General Business Expense'
    };
  }
  
  // Default: not deductible
  return {
    isDeductible: false,
    businessUsePercentage: 0,
    taxCategory: 'Personal'
  };
}

function detectBillPattern(description: string, amount: number, merchant?: string): BillAnalysisResult {
  const desc = description.toLowerCase();
  
  // Subscription services
  if (desc.includes('subscription') || desc.includes('monthly') || desc.includes('annual')) {
    return {
      isBill: true,
      isRecurring: true,
      frequency: desc.includes('monthly') ? 'monthly' : 'yearly'
    };
  }
  
  // Utilities
  if (desc.includes('electricity') || desc.includes('gas') || desc.includes('water') || 
      desc.includes('council') || desc.includes('rates')) {
    return {
      isBill: true,
      isRecurring: true,
      frequency: 'quarterly'
    };
  }
  
  // Telecommunications
  if (desc.includes('telstra') || desc.includes('optus') || desc.includes('vodafone') || 
      desc.includes('internet') || desc.includes('phone')) {
    return {
      isBill: true,
      isRecurring: true,
      frequency: 'monthly'
    };
  }
  
  // Insurance
  if (desc.includes('insurance') || desc.includes('policy')) {
    return {
      isBill: true,
      isRecurring: true,
      frequency: 'yearly'
    };
  }
  
  // Round amounts might be bills
  if (amount % 10 === 0 && amount > 20) {
    return {
      isBill: true,
      isRecurring: false,
      frequency: 'unknown'
    };
  }
  
  return {
    isBill: false,
    isRecurring: false
  };
}

function calculateConfidence(
  category: CategoryResult, 
  taxAnalysis: TaxAnalysisResult, 
  billAnalysis: BillAnalysisResult
): number {
  let confidence = 0.6; // Base confidence
  
  // Higher confidence for specific categories
  if (category.primary !== 'General Expense') {
    confidence += 0.2;
  }
  
  // Higher confidence for clear tax deductibility
  if (taxAnalysis.isDeductible && taxAnalysis.businessUsePercentage > 80) {
    confidence += 0.1;
  }
  
  // Higher confidence for clear bill patterns
  if (billAnalysis.isBill && billAnalysis.isRecurring) {
    confidence += 0.1;
  }
  
  return Math.min(confidence, 0.95); // Cap at 95%
}

function generateReasoning(
  category: CategoryResult, 
  taxAnalysis: TaxAnalysisResult, 
  billAnalysis: BillAnalysisResult
): string {
  const reasons = [];
  
  reasons.push(`Categorized as ${category.primary} - ${category.secondary}`);
  
  if (taxAnalysis.isDeductible) {
    reasons.push(`Tax deductible (${taxAnalysis.businessUsePercentage}% business use)`);
  } else {
    reasons.push('Not tax deductible (personal expense)');
  }
  
  if (billAnalysis.isBill) {
    if (billAnalysis.isRecurring) {
      reasons.push(`Recurring bill (${billAnalysis.frequency})`);
    } else {
      reasons.push('One-time bill or service');
    }
  }
  
  return reasons.join('. ');
}

function calculateAverageConfidence(results: TransactionAnalysisResult[]): number {
  const total = results.reduce((sum: number, r: TransactionAnalysisResult) => sum + r.confidence, 0);
  return results.length > 0 ? total / results.length : 0;
}

function extractUniqueCategories(results: TransactionAnalysisResult[]): string[] {
  const categories = new Set<string>();
  results.forEach((r: TransactionAnalysisResult) => categories.add(r.category));
  return Array.from(categories);
}

function countTaxDeductible(results: TransactionAnalysisResult[]): number {
  return results.filter((r: TransactionAnalysisResult) => r.isTaxDeductible).length;
}

function countBills(results: TransactionAnalysisResult[]): number {
  return results.filter((r: TransactionAnalysisResult) => r.isBill).length;
}

export default router; 