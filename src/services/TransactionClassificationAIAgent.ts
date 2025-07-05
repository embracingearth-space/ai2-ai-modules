import { BaseAIService, AIConfig, AIAgentTask, AIDataContext, AIAgentCapability } from './BaseAIService';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();

export interface TransactionClassificationAnalysis {
  // Legacy fields (backward compatibility)
  classification: 'bill' | 'expense';
  
  // Enhanced classification system
  transactionNature: 'BILL' | 'ONE_TIME_EXPENSE' | 'CAPITAL_EXPENSE' | 'INCOME' | 'TRANSFER' | 'UNKNOWN';
  
  // Enhanced confidence and metadata
  confidence: number; // 0-1 classification confidence
  classificationSource: 'ai' | 'pattern' | 'rule' | 'user';
  reasoning: string;
  
  // Enhanced recurrence information
  recurring: boolean;
  recurrencePattern?: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ADHOC';
  nextDueDate?: Date;
  
  // Legacy recurring pattern (for compatibility)
  recurringPattern: {
    isRecurring: boolean;
    frequency?: 'weekly' | 'monthly' | 'quarterly' | 'annually';
    nextExpectedDate?: Date;
    averageAmount?: number;
    variation?: number;
  };
  
  merchantInfo: {
    isKnownBiller: boolean;
    billerType?: string;
    servicePeriod?: string;
    vendorCategory?: 'telecom' | 'utility' | 'subscription' | 'insurance' | 'rent' | 'finance' | 'retail' | 'other';
  };
  characteristics: {
    amountPattern: 'fixed' | 'variable' | 'increasing' | 'seasonal';
    timePattern: 'regular' | 'irregular' | 'one-time';
    categoryPattern: string;
  };
}

export interface BulkClassificationResult {
  classified: Array<{
    transactionId: string;
    classification: 'bill' | 'expense';
    confidence: number;
    recurringPattern?: any;
  }>;
  recurringBillsDetected: Array<{
    merchantName: string;
    frequency: string;
    averageAmount: number;
    nextDueDate: Date;
    transactionIds: string[];
  }>;
  summary: {
    totalProcessed: number;
    billsDetected: number;
    expensesDetected: number;
    recurringPatternsFound: number;
    averageConfidence: number;
  };
}

export interface EnhancedTransactionClassification {
  primaryType: 'expense' | 'income' | 'transfer';
  secondaryType?: 'bill' | 'one-time expense' | 'capital expense';
  recurring: boolean;
  recurrencePattern?: 'weekly' | 'monthly' | 'quarterly' | 'adhoc';
  nextDueDate?: Date;
  confidence: number;
  reasoning: string;
}

export class TransactionClassificationAIAgent extends BaseAIService {
  private openai: OpenAI;

  constructor(config: AIConfig) {
    super(config);
    this.validateConfig();
    this.openai = new OpenAI({ apiKey: config.apiKey });
    
    this.capabilities = [
      {
        name: 'classifyTransaction',
        description: 'Classify a single transaction as bill or expense',
        inputSchema: {
          description: 'string',
          amount: 'number',
          merchant: 'string?',
          date: 'Date',
          historicalTransactions: 'Array<Transaction>?'
        },
        outputSchema: {
          classification: 'bill|expense',
          confidence: 'number',
          reasoning: 'string',
          recurringPattern: 'object'
        },
        costEstimate: 0.015
      },
      {
        name: 'bulkClassifyTransactions',
        description: 'Classify multiple transactions and detect recurring patterns',
        inputSchema: {
          transactions: 'Array<Transaction>'
        },
        outputSchema: {
          classified: 'Array<ClassificationAnalysis>',
          recurringBills: 'Array<RecurringBill>'
        },
        costEstimate: 0.03
      },
      {
        name: 'detectRecurringPatterns',
        description: 'Analyze transaction history to detect recurring bill patterns',
        inputSchema: {
          transactions: 'Array<Transaction>',
          timeframe: 'string'
        },
        outputSchema: {
          recurringBills: 'Array<RecurringBill>',
          patterns: 'Array<Pattern>'
        },
        costEstimate: 0.08
      }
    ];
  }

  async executeTask(task: AIAgentTask, context: AIDataContext): Promise<any> {
    const startTime = Date.now();
    let success = false;
    let cost = 0;

    try {
      let result;
      
      switch (task.taskType) {
        case 'classifyTransaction':
          result = await this.classifyTransaction(task.data, context);
          break;
        case 'bulkClassifyTransactions':
          result = await this.bulkClassifyTransactions(task.data.transactions, context);
          break;
        case 'detectRecurringPatterns':
          result = await this.detectRecurringPatterns(task.data.transactions, task.data.timeframe, context);
          break;
        default:
          throw new Error(`Unknown task type: ${task.taskType}`);
      }

      success = true;
      cost = await this.estimateTaskCost(task.taskType, task.data);
      return result;

    } catch (error) {
      throw error;
    } finally {
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, success, cost);
    }
  }

  async batchExecuteTasks(tasks: AIAgentTask[], context: AIDataContext): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    // Optimize by combining similar tasks
    const optimizedTasks = await this.optimizeForCost(tasks);
    
    for (const task of optimizedTasks) {
      try {
        const result = await this.executeTask(task, context);
        results.set(task.id, result);
      } catch (error) {
        results.set(task.id, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    return results;
  }

  async estimateTaskCost(taskType: string, data: any): Promise<number> {
    const capability = this.capabilities.find(c => c.name === taskType);
    if (!capability) return 0;

    switch (taskType) {
      case 'classifyTransaction':
        return capability.costEstimate;
      case 'bulkClassifyTransactions':
        return capability.costEstimate * Math.ceil((data.transactions?.length || 1) / 10); // Batch optimization
      case 'detectRecurringPatterns':
        return capability.costEstimate * Math.min(Math.ceil((data.transactions?.length || 1) / 50), 10); // Analysis scales with data
      default:
        return 0;
    }
  }

  async optimizeForCost(tasks: AIAgentTask[]): Promise<AIAgentTask[]> {
    const optimized = [...tasks];
    
    // Combine bulk classification tasks
    const bulkTasks = optimized.filter(t => t.taskType === 'bulkClassifyTransactions');
    if (bulkTasks.length > 1) {
      const combinedData = {
        transactions: bulkTasks.flatMap(t => t.data.transactions)
      };
      
      // Remove individual tasks and add combined one
      bulkTasks.forEach(task => {
        const index = optimized.indexOf(task);
        if (index > -1) optimized.splice(index, 1);
      });

      optimized.push({
        id: `combined-classification-${Date.now()}`,
        agentType: 'TransactionClassificationAI',
        taskType: 'bulkClassifyTransactions',
        priority: Math.max(...bulkTasks.map(t => t.priority)),
        data: combinedData,
        status: 'pending',
        createdAt: new Date()
      });
    }

    return optimized.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Enhanced classification with new system
   */
  static classifyTransaction(
    description: string,
    amount: number,
    type: 'debit' | 'credit',
    merchant?: string,
    category?: string
  ): EnhancedTransactionClassification {
    
    // Determine Primary Type
    let primaryType: 'expense' | 'income' | 'transfer';
    if (type === 'credit' || amount > 0) {
      // Detect transfers vs income
      if (this.isTransfer(description, merchant)) {
        primaryType = 'transfer';
      } else {
        primaryType = 'income';
      }
    } else {
      // Detect transfers for debits (e.g., credit card payments, savings transfers)
      if (this.isTransfer(description, merchant)) {
        primaryType = 'transfer';
      } else {
        primaryType = 'expense';
      }
    }

    // Determine Secondary Type (only for expenses)
    let secondaryType: 'bill' | 'one-time expense' | 'capital expense' | undefined;
    let recurring = false;
    let recurrencePattern: 'weekly' | 'monthly' | 'quarterly' | 'adhoc' | undefined;
    let nextDueDate: Date | undefined;

    if (primaryType === 'expense') {
      const classification = this.classifyExpenseType(description, amount, merchant, category);
      secondaryType = classification.secondaryType;
      recurring = classification.recurring;
      recurrencePattern = classification.recurrencePattern;
      nextDueDate = classification.nextDueDate;
    }

    return {
      primaryType,
      secondaryType: secondaryType || 'one-time expense',
      recurring,
      recurrencePattern: recurrencePattern || 'adhoc',
      nextDueDate: nextDueDate || new Date(),
      confidence: 0.85,
      reasoning: this.generateReasoning(primaryType, secondaryType, recurring, description)
    };
  }

  // Detect if transaction is a transfer
  private static isTransfer(description: string, merchant?: string): boolean {
    const desc = description.toLowerCase();
    const transferKeywords = [
      'transfer', 'payment to', 'credit card payment', 'savings', 'loan payment',
      'mortgage payment', 'card payment', 'internal transfer', 'account transfer',
      'visa payment', 'mastercard payment', 'amex payment'
    ];

    return transferKeywords.some(keyword => desc.includes(keyword));
  }

  // Classify expense types with recurrence detection
  private static classifyExpenseType(
    description: string, 
    amount: number, 
    merchant?: string, 
    category?: string
  ): {
    secondaryType: 'bill' | 'one-time expense' | 'capital expense';
    recurring: boolean;
    recurrencePattern?: 'weekly' | 'monthly' | 'quarterly' | 'adhoc';
    nextDueDate?: Date;
  } {
    const desc = description.toLowerCase();
    
    // Bill patterns (usually recurring)
    const billKeywords = [
      'electricity', 'gas', 'water', 'internet', 'phone', 'mobile',
      'insurance', 'rent', 'mortgage', 'subscription', 'netflix', 'spotify',
      'utilities', 'council', 'rates', 'gym membership'
    ];

    // Capital expense patterns
    const capitalKeywords = [
      'equipment', 'computer', 'laptop', 'furniture', 'vehicle', 'car',
      'machinery', 'tools', 'software license', 'property', 'building'
    ];

    // Check for bills
    if (billKeywords.some(keyword => desc.includes(keyword))) {
      return {
        secondaryType: 'bill',
        recurring: true,
        recurrencePattern: this.detectRecurrencePattern(description, merchant),
        nextDueDate: this.calculateNextDueDate('monthly') // Default to monthly for bills
      };
    }

    // Check for capital expenses (usually high amounts)
    if (capitalKeywords.some(keyword => desc.includes(keyword)) || Math.abs(amount) > 1000) {
      return {
        secondaryType: 'capital expense',
        recurring: false
      };
    }

    // Default to one-time expense
    return {
      secondaryType: 'one-time expense',
      recurring: false
    };
  }

  // Detect recurrence patterns from description
  private static detectRecurrencePattern(description: string, merchant?: string): 'weekly' | 'monthly' | 'quarterly' | 'adhoc' {
    const desc = description.toLowerCase();
    
    if (desc.includes('weekly') || desc.includes('week')) return 'weekly';
    if (desc.includes('quarterly') || desc.includes('quarter')) return 'quarterly';
    if (desc.includes('monthly') || desc.includes('month')) return 'monthly';
    
    // Default patterns based on merchant type
    const weeklyMerchants = ['grocery', 'petrol', 'fuel'];
    const monthlyMerchants = ['utilities', 'rent', 'insurance', 'subscription'];
    
    if (weeklyMerchants.some(m => desc.includes(m))) return 'weekly';
    if (monthlyMerchants.some(m => desc.includes(m))) return 'monthly';
    
    return 'monthly'; // Default for bills
  }

  // Calculate next due date based on pattern
  private static calculateNextDueDate(pattern: 'weekly' | 'monthly' | 'quarterly' | 'adhoc'): Date {
    const now = new Date();
    const nextDue = new Date(now);

    switch (pattern) {
      case 'weekly':
        nextDue.setDate(now.getDate() + 7);
        break;
      case 'monthly':
        nextDue.setMonth(now.getMonth() + 1);
        break;
      case 'quarterly':
        nextDue.setMonth(now.getMonth() + 3);
        break;
      default:
        nextDue.setMonth(now.getMonth() + 1); // Default to monthly
    }

    return nextDue;
  }

  // Generate reasoning for classification
  private static generateReasoning(
    primaryType: string, 
    secondaryType?: string, 
    recurring?: boolean, 
    description?: string
  ): string {
    let reasoning = `Classified as ${primaryType}`;
    
    if (secondaryType) {
      reasoning += ` - ${secondaryType}`;
    }
    
    if (recurring) {
      reasoning += ` (recurring)`;
    }
    
    reasoning += ` based on description patterns and amount analysis.`;
    
    return reasoning;
  }

  // Bulk classification method for multiple transactions
  static async classifyTransactions(transactions: any[]): Promise<Map<string, EnhancedTransactionClassification>> {
    const results = new Map<string, EnhancedTransactionClassification>();

    for (const transaction of transactions) {
      const classification = this.classifyTransaction(
        transaction.description,
        transaction.amount,
        transaction.type,
        transaction.merchant,
        transaction.category
      );

      results.set(transaction.id, classification);
    }

    return results;
  }

  /**
   * Enhanced classification with rule-based vendor detection
   */
  private classifyByRules(description: string, merchant?: string, amount?: number): Partial<TransactionClassificationAnalysis> | null {
    const text = `${description} ${merchant || ''}`.toLowerCase();
    
    // Known bill vendors with high confidence
    const knownBillers = {
      telecom: ['telstra', 'optus', 'vodafone', 'tpg', 'iinet', 'aussie broadband', 'belong'],
      utility: ['origin', 'agl', 'energyaustralia', 'synergy', 'simply energy', 'red energy', 'powershop'],
      streaming: ['netflix', 'stan', 'disney plus', 'spotify', 'apple music', 'youtube premium', 'amazon prime'],
      insurance: ['allianz', 'suncorp', 'aami', 'budget direct', 'youi', 'rac insurance'],
      rent: ['rent', 'rental', 'property management', 'real estate'],
      subscription: ['subscription', 'monthly', 'annual', 'premium', 'pro plan'],
      finance: ['loan payment', 'mortgage', 'credit card', 'insurance premium', 'superannuation']
    };

    // Known one-time expense patterns
    const oneTimePatterns = [
      'uber', 'taxi', 'restaurant', 'cafe', 'coffee', 'grocery', 'supermarket', 'petrol',
      'fuel', 'parking', 'toll', 'shopping', 'retail', 'amazon', 'ebay', 'pharmacy'
    ];

    // Capital expense indicators
    const capitalExpensePatterns = [
      'computer', 'laptop', 'equipment', 'furniture', 'machinery', 'vehicle', 'car',
      'office setup', 'tools', 'printer', 'hardware', 'software license'
    ];

    // Check for known billers
    for (const [category, vendors] of Object.entries(knownBillers)) {
      if (vendors.some(vendor => text.includes(vendor))) {
        return {
          transactionNature: 'BILL',
          classification: 'bill',
          confidence: 0.9,
          classificationSource: 'rule',
          recurring: true,
          recurrencePattern: 'MONTHLY',
          merchantInfo: {
            isKnownBiller: true,
            billerType: category,
            vendorCategory: category as any
          },
          reasoning: `Identified as known ${category} biller: ${vendors.find(v => text.includes(v))}`
        };
      }
    }

    // Check for capital expenses
    if (capitalExpensePatterns.some(pattern => text.includes(pattern)) && amount && amount > 500) {
      return {
        transactionNature: 'CAPITAL_EXPENSE',
        classification: 'expense',
        confidence: 0.8,
        classificationSource: 'rule',
        recurring: false,
        reasoning: `Identified as capital expense based on description and amount ($${amount})`
      };
    }

    // Check for one-time expenses
    if (oneTimePatterns.some(pattern => text.includes(pattern))) {
      return {
        transactionNature: 'ONE_TIME_EXPENSE',
        classification: 'expense',
        confidence: 0.7,
        classificationSource: 'rule',
        recurring: false,
        reasoning: `Identified as one-time expense pattern: ${oneTimePatterns.find(p => text.includes(p))}`
      };
    }

    return null;
  }

  /**
   * Detect transaction nature for credit transactions
   */
  private classifyCreditTransaction(description: string, merchant?: string, amount?: number): Partial<TransactionClassificationAnalysis> {
    const text = `${description} ${merchant || ''}`.toLowerCase();
    
    // Income indicators
    const incomePatterns = ['salary', 'wage', 'pay', 'payment', 'income', 'dividend', 'interest', 'refund'];
    
    // Transfer indicators
    const transferPatterns = ['transfer', 'atm', 'withdrawal', 'deposit', 'account transfer'];

    if (incomePatterns.some(pattern => text.includes(pattern))) {
      return {
        transactionNature: 'INCOME',
        classification: 'expense', // Legacy compatibility
        confidence: 0.8,
        classificationSource: 'rule',
        recurring: text.includes('salary') || text.includes('wage'),
        recurrencePattern: text.includes('salary') || text.includes('wage') ? 'FORTNIGHTLY' : 'ADHOC',
        reasoning: `Identified as income: ${incomePatterns.find(p => text.includes(p))}`
      };
    }

    if (transferPatterns.some(pattern => text.includes(pattern))) {
      return {
        transactionNature: 'TRANSFER',
        classification: 'expense', // Legacy compatibility
        confidence: 0.9,
        classificationSource: 'rule',
        recurring: false,
        reasoning: `Identified as account transfer: ${transferPatterns.find(p => text.includes(p))}`
      };
    }

    return {
      transactionNature: 'INCOME',
      classification: 'expense',
      confidence: 0.6,
      classificationSource: 'rule',
      recurring: false,
      reasoning: 'Credit transaction - assumed income'
    };
  }

  /**
   * Calculate next due date based on recurrence pattern
   */
  private calculateNextDueDate(lastDate: Date, pattern: string): Date | undefined {
    const date = new Date(lastDate);
    
    switch (pattern) {
      case 'WEEKLY':
        date.setDate(date.getDate() + 7);
        break;
      case 'FORTNIGHTLY':
        date.setDate(date.getDate() + 14);
        break;
      case 'MONTHLY':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'QUARTERLY':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'YEARLY':
        date.setFullYear(date.getFullYear() + 1);
        break;
      default:
        return undefined;
    }
    
    return date;
  }

  /**
   * Classify a single transaction as bill or expense
   */
  async classifyTransaction(
    transaction: {
      description: string;
      amount: number;
      merchant?: string;
      date: Date;
      historicalTransactions?: any[];
    },
    context: AIDataContext
  ): Promise<TransactionClassificationAnalysis> {
    // Check if this is a credit transaction (money in)
    if (transaction.amount > 0) {
      const creditClassification = this.classifyCreditTransaction(
        transaction.description, 
        transaction.merchant, 
        transaction.amount
      );
      
      return {
        ...creditClassification,
        recurringPattern: {
          isRecurring: creditClassification.recurring || false,
          frequency: creditClassification.recurrencePattern?.toLowerCase() as any,
          nextExpectedDate: creditClassification.nextDueDate,
          averageAmount: transaction.amount,
          variation: 0
        },
        merchantInfo: {
          isKnownBiller: false,
          ...(creditClassification.merchantInfo || {})
        },
        characteristics: {
          amountPattern: 'variable',
          timePattern: creditClassification.recurring ? 'regular' : 'irregular',
          categoryPattern: 'income'
        }
      } as TransactionClassificationAnalysis;
    }

    // Try rule-based classification first for debits
    const ruleClassification = this.classifyByRules(
      transaction.description, 
      transaction.merchant, 
      Math.abs(transaction.amount)
    );

    if (ruleClassification && ruleClassification.confidence && ruleClassification.confidence > 0.7) {
      // High confidence rule match - use it directly
      const nextDueDate = ruleClassification.recurrencePattern 
        ? this.calculateNextDueDate(transaction.date, ruleClassification.recurrencePattern)
        : undefined;

      return {
        ...ruleClassification,
        nextDueDate,
        recurringPattern: {
          isRecurring: ruleClassification.recurring || false,
          frequency: ruleClassification.recurrencePattern?.toLowerCase() as any,
          nextExpectedDate: nextDueDate,
          averageAmount: Math.abs(transaction.amount),
          variation: 5 // Default 5% for rule-based
        },
        merchantInfo: {
          isKnownBiller: ruleClassification.merchantInfo?.isKnownBiller || false,
          ...(ruleClassification.merchantInfo || {})
        },
        characteristics: {
          amountPattern: ruleClassification.recurring ? 'fixed' : 'variable',
          timePattern: ruleClassification.recurring ? 'regular' : 'one-time',
          categoryPattern: ruleClassification.transactionNature?.toLowerCase() || 'unknown'
        }
      } as TransactionClassificationAnalysis;
    }

    // Get historical transactions for AI analysis
    const historicalTransactions = transaction.historicalTransactions || 
      await this.getHistoricalTransactions(context.userId, transaction.merchant);

    const prompt = this.formatPrompt(`
You are an expert financial analyst specializing in transaction classification. Classify this debit transaction using the enhanced classification system.

User Profile:
- Business Type: {{businessType}}
- Industry: {{industry}}

Transaction Details:
- Description: {{description}}
- Amount: {{amount}} (negative = debit/money out)
- Merchant: {{merchant}}
- Date: {{date}}

Historical Context ({{historicalCount}} transactions):
{{historicalTransactions}}

Enhanced Classification System:
1. **Transaction Nature** (primary classification):
   - **BILL**: Recurring/expected liabilities (rent, utilities, subscriptions, insurance, loan payments)
   - **ONE_TIME_EXPENSE**: Non-recurring purchases (groceries, fuel, dining, entertainment, ad-hoc purchases)
   - **CAPITAL_EXPENSE**: Equipment/asset purchases over $500 (computers, furniture, machinery, vehicles)

2. **Recurrence Information**:
   - **recurring**: true/false
   - **recurrencePattern**: WEEKLY|FORTNIGHTLY|MONTHLY|QUARTERLY|YEARLY|ADHOC
   - **nextDueDate**: Predicted next occurrence

3. **Classification Confidence**: 0-1 score based on:
   - Historical pattern strength
   - Merchant recognition
   - Amount consistency
   - Description clarity

Analysis Criteria:
- **Recurring Pattern**: Regular merchant/amount/timing patterns
- **Amount Stability**: Consistent vs variable amounts
- **Merchant Type**: Known service providers vs retailers
- **Description Analysis**: Service keywords vs purchase keywords

Respond in JSON format:
{
  "classification": "bill|expense",
  "transactionNature": "BILL|ONE_TIME_EXPENSE|CAPITAL_EXPENSE",
  "confidence": number,
  "classificationSource": "ai",
  "reasoning": "detailed explanation",
  "recurring": boolean,
  "recurrencePattern": "WEEKLY|FORTNIGHTLY|MONTHLY|QUARTERLY|YEARLY|ADHOC",
  "nextDueDate": "ISO date or null",
  "recurringPattern": {
    "isRecurring": boolean,
    "frequency": "weekly|monthly|quarterly|annually",
    "nextExpectedDate": "ISO date",
    "averageAmount": number,
    "variation": number
  },
  "merchantInfo": {
    "isKnownBiller": boolean,
    "billerType": "utility|subscription|insurance|rent|finance|other",
    "servicePeriod": "description",
    "vendorCategory": "telecom|utility|subscription|insurance|rent|finance|retail|other"
  },
  "characteristics": {
    "amountPattern": "fixed|variable|increasing|seasonal",
    "timePattern": "regular|irregular|one-time",
    "categoryPattern": "description"
  }
}
`, {
      businessType: context.userProfile.businessType,
      industry: context.userProfile.industry,
      description: transaction.description,
      amount: transaction.amount,
      merchant: transaction.merchant || 'Unknown',
      date: transaction.date.toISOString(),
      historicalCount: historicalTransactions.length,
      historicalTransactions: JSON.stringify(historicalTransactions.slice(-20), null, 2)
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a financial expert specializing in transaction pattern analysis. Provide accurate classification based on historical patterns and merchant characteristics.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: this.config.maxTokens,
        temperature: 0.1, // Very low temperature for consistent classification
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      try {
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse AI response: ${content}`);
      }
    });

    return response as TransactionClassificationAnalysis;
  }

  /**
   * Bulk classify multiple transactions
   */
  async bulkClassifyTransactions(
    transactions: any[],
    context: AIDataContext
  ): Promise<BulkClassificationResult> {
    const results: BulkClassificationResult = {
      classified: [],
      recurringBillsDetected: [],
      summary: {
        totalProcessed: transactions.length,
        billsDetected: 0,
        expensesDetected: 0,
        recurringPatternsFound: 0,
        averageConfidence: 0
      }
    };

    // Group transactions by merchant for pattern analysis
    const merchantGroups = new Map<string, any[]>();
    transactions.forEach(transaction => {
      const merchant = transaction.merchant || transaction.description.split(' ')[0];
      if (!merchantGroups.has(merchant)) {
        merchantGroups.set(merchant, []);
      }
      merchantGroups.get(merchant)!.push(transaction);
    });

    let totalConfidence = 0;
    const recurringBills = new Map<string, any>();

    // Process each merchant group
    for (const [merchant, merchantTransactions] of merchantGroups) {
      // Analyze for recurring patterns first
      const patternAnalysis = await this.analyzeRecurringPattern(merchantTransactions);
      
      for (const transaction of merchantTransactions) {
        try {
          const analysis = await this.classifyTransaction({
            ...transaction,
            historicalTransactions: merchantTransactions
          }, context);

          results.classified.push({
            transactionId: transaction.id,
            classification: analysis.classification,
            confidence: analysis.confidence,
            recurringPattern: analysis.recurringPattern
          });

          totalConfidence += analysis.confidence;

          if (analysis.classification === 'bill') {
            results.summary.billsDetected++;
            
            // Track recurring bills
            if (analysis.recurringPattern.isRecurring) {
              if (!recurringBills.has(merchant)) {
                recurringBills.set(merchant, {
                  merchantName: merchant,
                  frequency: analysis.recurringPattern.frequency,
                  averageAmount: analysis.recurringPattern.averageAmount,
                  nextDueDate: new Date(analysis.recurringPattern.nextExpectedDate || Date.now()),
                  transactionIds: []
                });
              }
              recurringBills.get(merchant)!.transactionIds.push(transaction.id);
            }
          } else {
            results.summary.expensesDetected++;
          }

        } catch (error) {
          console.error(`Error classifying transaction ${transaction.id}:`, error);
          // Default to expense if classification fails
          results.classified.push({
            transactionId: transaction.id,
            classification: 'expense',
            confidence: 0.3
          });
          results.summary.expensesDetected++;
        }
      }

      // Add small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    results.recurringBillsDetected = Array.from(recurringBills.values());
    results.summary.recurringPatternsFound = results.recurringBillsDetected.length;
    results.summary.averageConfidence = results.classified.length > 0 
      ? totalConfidence / results.classified.length 
      : 0;

    return results;
  }

  /**
   * Detect recurring patterns in transaction history
   */
  async detectRecurringPatterns(
    transactions: any[],
    timeframe: string,
    context: AIDataContext
  ): Promise<{
    recurringBills: any[];
    patterns: any[];
    insights: string[];
  }> {
    const prompt = this.formatPrompt(`
You are an expert in financial pattern recognition. Analyze these transactions to detect recurring bill patterns.

Timeframe: {{timeframe}}
Transaction Count: {{transactionCount}}

Transaction Data:
{{transactionData}}

Analyze for:
1. **Recurring Bills**: Regular payments with predictable patterns
2. **Frequency Patterns**: Weekly, monthly, quarterly, annual cycles
3. **Amount Stability**: How consistent are the amounts?
4. **Seasonal Variations**: Do amounts vary by season/month?
5. **New vs Established**: Recently started vs long-running bills

Provide:
1. **Detected Recurring Bills** with frequency and next due dates
2. **Pattern Analysis** including trends and anomalies
3. **Insights** about spending patterns and recommendations

Respond in JSON format:
{
  "recurringBills": [
    {
      "merchantName": "merchant",
      "frequency": "monthly|quarterly|annually",
      "averageAmount": number,
      "amountVariation": number,
      "lastPayment": "ISO date",
      "nextDueDate": "ISO date",
      "confidence": number,
      "pattern": "description",
      "transactionIds": ["id1", "id2"]
    }
  ],
  "patterns": [
    {
      "type": "trend|seasonal|anomaly",
      "description": "pattern description",
      "frequency": "pattern frequency",
      "impact": "high|medium|low",
      "recommendation": "action recommendation"
    }
  ],
  "insights": [
    "insight about spending patterns",
    "recommendation for optimization"
  ]
}
`, {
      timeframe,
      transactionCount: transactions.length,
      transactionData: JSON.stringify(transactions.slice(-100), null, 2) // Last 100 transactions
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: 0.2,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      try {
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse AI response: ${content}`);
      }
    });

    return response;
  }

  /**
   * Analyze recurring pattern for a group of transactions from same merchant
   */
  private async analyzeRecurringPattern(transactions: any[]): Promise<{
    isRecurring: boolean;
    frequency?: string;
    averageAmount?: number;
    variation?: number;
  }> {
    if (transactions.length < 2) {
      return { isRecurring: false };
    }

    // Sort by date
    const sorted = transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Calculate day intervals
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.round((new Date(sorted[i].date).getTime() - new Date(sorted[i-1].date).getTime()) / (1000 * 60 * 60 * 24));
      intervals.push(days);
    }

    // Analyze intervals for patterns
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    // Determine if recurring based on consistency
    const isRecurring = stdDev < avgInterval * 0.3; // Less than 30% variation
    
    if (!isRecurring) {
      return { isRecurring: false };
    }

    // Determine frequency
    let frequency = 'monthly';
    if (avgInterval <= 10) frequency = 'weekly';
    else if (avgInterval <= 35) frequency = 'monthly';
    else if (avgInterval <= 100) frequency = 'quarterly';
    else frequency = 'annually';

    // Calculate amount statistics
    const amounts = transactions.map(t => Math.abs(t.amount));
    const avgAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const amountVariance = amounts.reduce((sum, amount) => sum + Math.pow(amount - avgAmount, 2), 0) / amounts.length;
    const amountVariation = Math.sqrt(amountVariance) / avgAmount;

    return {
      isRecurring: true,
      frequency,
      averageAmount: avgAmount,
      variation: amountVariation
    };
  }

  /**
   * Get historical transactions for a specific merchant
   */
  private async getHistoricalTransactions(userId: string, merchant?: string): Promise<any[]> {
    if (!merchant) return [];

    return await prisma.bankTransaction.findMany({
      where: {
        userId,
        OR: [
          { merchant: { contains: merchant } },
          { description: { contains: merchant } }
        ]
      },
      orderBy: { date: 'desc' },
      take: 50
    });
  }

  // Required implementations from BaseAIService
  async analyzeTransaction(): Promise<any> {
    throw new Error('Use classifyTransaction instead');
  }

  async analyzeCSVFormat(): Promise<any> {
    throw new Error('Not implemented in TransactionClassificationAIAgent');
  }

  async queryTransactions(): Promise<any> {
    throw new Error('Not implemented in TransactionClassificationAIAgent');
  }

  async generateUserProfile(): Promise<any> {
    throw new Error('Not implemented in TransactionClassificationAIAgent');
  }

  async learnFromFeedback(): Promise<void> {
    // Implementation for learning from user corrections
  }

  async getInsights(): Promise<any> {
    throw new Error('Use detectRecurringPatterns instead');
  }

  async exportAIData(): Promise<any> {
    return {
      userProfile: {},
      learningData: [],
      insights: [],
      capabilities: this.capabilities,
      metrics: this.metrics
    };
  }
} 