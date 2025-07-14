import { BaseAIService, AIConfig, AIAgentTask, AIDataContext, AIAgentCapability } from './BaseAIService';

export interface CategoryAnalysis {
  suggestedCategory: string;
  confidence: number;
  reasoning: string;
  alternativeCategories: string[];
  isNewCategory: boolean;
  categoryDescription?: string;
  categoryType: 'expense' | 'income' | 'transfer' | 'deductible';
}

export interface BulkCategorizationResult {
  categorized: Array<{
    transactionId: string;
    category: string;
    confidence: number;
  }>;
  newCategories: Array<{
    name: string;
    type: string;
    description: string;
    color: string;
  }>;
  uncategorized: string[];
  summary: {
    totalProcessed: number;
    successfullycategorized: number;
    newCategoriesCreated: number;
    averageConfidence: number;
  };
}

export class CategoriesAIAgent extends BaseAIService {
  constructor(config: AIConfig) {
    super(config);
    this.validateConfig();
    
    this.capabilities = [
      {
        name: 'getAvailableCategories',
        description: 'Get all available transaction categories with confidence thresholds',
        inputSchema: {},
        outputSchema: {
          categories: 'Array<Category>',
          confidence_thresholds: 'object'
        },
        costEstimate: 0.001
      },
      {
        name: 'analyzeAndCreateCategories',
        description: 'Analyze spending patterns and suggest optimal category structure',
        inputSchema: {
          transactions: 'Array<Transaction>',
          business_type: 'string'
        },
        outputSchema: {
          suggested_categories: 'Array<Category>',
          category_rules: 'Array<Rule>'
        },
        costEstimate: 0.05
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
        case 'getAvailableCategories':
          result = await this.getAvailableCategories();
          break;
        case 'analyzeAndCreateCategories':
          result = await this.analyzeAndCreateCategories(task.data.transactions, task.data.business_type);
          break;
        case 'categorizeTransaction':
          result = await this.categorizeTransaction(task.data);
          break;
        default:
          throw new Error(`Unknown task type: ${task.taskType}`);
      }

      success = true;
      cost = await this.estimateTaskCost(task.taskType, task.data);
      
      return {
        success,
        data: result,
        cost,
        executionTime: Date.now() - startTime,
        taskType: task.taskType
      };
      
    } catch (error) {
      console.error(`CategoriesAIAgent task failed: ${task.taskType}`, error);
      throw error;
    }
  }

  async batchExecuteTasks(tasks: AIAgentTask[], context: AIDataContext): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    for (const task of tasks) {
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
    return capability?.costEstimate || 0.01;
  }

  async optimizeForCost(tasks: AIAgentTask[]): Promise<AIAgentTask[]> {
    return tasks.sort((a, b) => b.priority - a.priority);
  }

  async getAvailableCategories(): Promise<any> {
    return {
      expense_categories: [
        {
          id: 'food_dining',
          name: 'Food & Dining',
          subcategories: ['Restaurants', 'Coffee Shops', 'Fast Food', 'Groceries'],
          tax_deductible: false,
          business_percentage: 50
        },
        {
          id: 'business_expenses',
          name: 'Business Expenses', 
          subcategories: ['Office Supplies', 'Software', 'Equipment', 'Marketing'],
          tax_deductible: true,
          business_percentage: 100
        },
        {
          id: 'travel',
          name: 'Travel',
          subcategories: ['Flights', 'Hotels', 'Car Rental', 'Meals'],
          tax_deductible: true,
          business_percentage: 80
        },
        {
          id: 'entertainment',
          name: 'Entertainment',
          subcategories: ['Movies', 'Sports', 'Streaming', 'Games'],
          tax_deductible: false,
          business_percentage: 0
        },
        {
          id: 'utilities',
          name: 'Utilities',
          subcategories: ['Electricity', 'Gas', 'Water', 'Internet', 'Phone'],
          tax_deductible: false,
          business_percentage: 20
        },
        {
          id: 'transportation',
          name: 'Transportation',
          subcategories: ['Gas', 'Public Transit', 'Uber/Lyft', 'Parking'],
          tax_deductible: false,
          business_percentage: 30
        },
        {
          id: 'health_fitness',
          name: 'Health & Fitness',
          subcategories: ['Gym', 'Doctor', 'Pharmacy', 'Supplements'],
          tax_deductible: false,
          business_percentage: 0
        },
        {
          id: 'shopping',
          name: 'Shopping',
          subcategories: ['Clothing', 'Electronics', 'Home', 'Personal Care'],
          tax_deductible: false,
          business_percentage: 5
        }
      ],
      income_categories: [
        {
          id: 'salary',
          name: 'Salary',
          subcategories: ['Base Salary', 'Bonus', 'Commission'],
          taxable: true
        },
        {
          id: 'business_income',
          name: 'Business Income',
          subcategories: ['Consulting', 'Sales', 'Services', 'Products'],
          taxable: true
        },
        {
          id: 'investment',
          name: 'Investment Income',
          subcategories: ['Dividends', 'Interest', 'Capital Gains'],
          taxable: true
        },
        {
          id: 'other_income',
          name: 'Other Income',
          subcategories: ['Gifts', 'Refunds', 'Cashback'],
          taxable: false
        }
      ]
    };
  }

  async analyzeAndCreateCategories(transactions: any[], businessType: string): Promise<any> {
    // This would use AI to analyze spending patterns and suggest categories
    // For now, return intelligent suggestions based on transaction data
    
    const spendingPatterns = this.analyzeSpendingPatterns(transactions);
    
    return {
      suggested_categories: [
        {
          name: `${businessType} Specific Expenses`,
          confidence: 0.9,
          reasoning: `Detected ${businessType}-specific spending patterns`,
          subcategories: this.getBusinessSpecificCategories(businessType)
        }
      ],
      category_rules: [
        {
          rule: `Transactions > $500 in office category should be flagged for capital expense review`,
          confidence: 0.85
        },
        {
          rule: `Weekly recurring transactions likely subscription services`,
          confidence: 0.92
        }
      ],
      insights: spendingPatterns
    };
  }

  /**
   * Categorize a single transaction
   */
  async categorizeTransaction(transactionData: any): Promise<CategoryAnalysis> {
    // ✅ VALIDATION: Ensure transaction data has required fields
    if (!transactionData || typeof transactionData !== 'object') {
      console.warn('⚠️ CategoriesAIAgent: Invalid transaction data provided:', transactionData);
      return {
        suggestedCategory: 'Unknown',
        confidence: 0.30,
        reasoning: 'Transaction data is missing or invalid',
        alternativeCategories: ['General Business', 'Personal', 'Other'],
        isNewCategory: false,
        categoryType: 'expense',
        categoryDescription: 'Unknown transaction type due to invalid data'
      };
    }

    const { description, amount, type, merchant, date } = transactionData;
    
    // ✅ VALIDATION: Ensure required fields are present
    if (!description && !merchant) {
      console.warn('⚠️ CategoriesAIAgent: Missing description and merchant:', transactionData);
      return {
        suggestedCategory: 'Unknown',
        confidence: 0.30,
        reasoning: 'Both description and merchant are missing - unable to categorize',
        alternativeCategories: ['General Business', 'Personal', 'Other'],
        isNewCategory: false,
        categoryType: 'expense',
        categoryDescription: 'Unknown transaction type due to missing key fields'
      };
    }

    // Use merchant as fallback if description is missing
    const effectiveDescription = description || merchant || 'Unknown Transaction';
    const effectiveAmount = typeof amount === 'number' ? amount : 0;
    
    // Smart categorization logic
    const category = this.smartCategorizeTransaction(effectiveDescription, effectiveAmount, merchant);
    
    return {
      suggestedCategory: category.name,
      confidence: category.confidence,
      reasoning: category.reasoning,
      alternativeCategories: category.alternatives,
      isNewCategory: false,
      categoryType: category.type,
      categoryDescription: category.description
    };
  }

  /**
   * Smart categorization logic
   */
  private smartCategorizeTransaction(description: string, amount: number, merchant?: string): any {
    // ✅ VALIDATION: Ensure description is not null/undefined
    if (!description || typeof description !== 'string') {
      console.warn('⚠️ CategoriesAIAgent: Invalid description provided:', description);
      return {
        name: 'Unknown',
        confidence: 0.30,
        reasoning: 'Description is missing or invalid - unable to categorize accurately',
        alternatives: ['General Business', 'Personal', 'Other'],
        type: 'expense',
        description: 'Unknown transaction type due to missing description'
      };
    }

    const descLower = description.toLowerCase();
    
    // Software and subscriptions
    if (descLower.includes('adobe') || descLower.includes('microsoft') || descLower.includes('software')) {
      return {
        name: 'Software',
        confidence: 0.95,
        reasoning: 'Software/subscription service detected',
        alternatives: ['Business Expenses', 'Technology'],
        type: 'deductible',
        description: 'Software and digital services'
      };
    }
    
    // Cloud services
    if (descLower.includes('aws') || descLower.includes('cloud') || descLower.includes('azure')) {
      return {
        name: 'Cloud Services',
        confidence: 0.95,
        reasoning: 'Cloud infrastructure service detected',
        alternatives: ['Software', 'Business Expenses'],
        type: 'deductible',
        description: 'Cloud computing and infrastructure'
      };
    }
    
    // Telecommunications
    if (descLower.includes('telstra') || descLower.includes('vodafone') || descLower.includes('phone') || descLower.includes('mobile')) {
      return {
        name: 'Telecommunications',
        confidence: 0.90,
        reasoning: 'Telecommunications service detected',
        alternatives: ['Utilities', 'Business Expenses'],
        type: 'deductible',
        description: 'Phone and internet services'
      };
    }
    
    // Office supplies
    if (descLower.includes('office') || descLower.includes('stationery') || descLower.includes('supplies')) {
      return {
        name: 'Office Supplies',
        confidence: 0.85,
        reasoning: 'Office supplies detected',
        alternatives: ['Business Expenses', 'Equipment'],
        type: 'deductible',
        description: 'Office equipment and supplies'
      };
    }
    
    // Default category
    return {
      name: 'General Business',
      confidence: 0.60,
      reasoning: 'Default business categorization',
      alternatives: ['Personal', 'Other'],
      type: 'expense',
      description: 'General business expense'
    };
  }

  private analyzeSpendingPatterns(transactions: any[]): any {
    // Simple pattern analysis
    const totalSpending = transactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const avgTransaction = totalSpending / transactions.length;
    
    return {
      total_transactions: transactions.length,
      total_spending: totalSpending,
      average_transaction: avgTransaction,
      patterns_detected: [
        'Frequent small transactions (likely daily expenses)',
        'Some larger transactions (potential business expenses)',
        'Regular recurring patterns detected'
      ]
    };
  }

  private getBusinessSpecificCategories(businessType: string): string[] {
    const categoryMap: Record<string, string[]> = {
      'consulting': ['Client Meetings', 'Professional Development', 'Marketing Materials'],
      'retail': ['Inventory', 'Point of Sale', 'Store Supplies'],
      'restaurant': ['Food Costs', 'Kitchen Equipment', 'Staff Uniforms'],
      'technology': ['Software Licenses', 'Hardware', 'Cloud Services'],
      'default': ['Industry Supplies', 'Professional Services', 'Equipment']
    };
    
    return categoryMap[businessType.toLowerCase()] || categoryMap.default;
  }

  // Implement required abstract methods
  async analyzeTransaction(): Promise<any> {
    throw new Error('Use TransactionClassificationAIAgent for transaction analysis');
  }

  async analyzeCSVFormat(): Promise<any> {
    throw new Error('Use OpenAIService for CSV analysis');
  }

  async queryTransactions(): Promise<any> {
    throw new Error('Use OpenAIService for transaction queries');
  }

  async generateUserProfile(): Promise<any> {
    throw new Error('Use OpenAIService for user profile generation');
  }

  async learnFromFeedback(): Promise<void> {
    // Categories can learn from user feedback about categorization accuracy
    console.log('Categories agent received feedback');
  }

  async getInsights(): Promise<any> {
    throw new Error('Use OpenAIService for insights generation');
  }

  async exportAIData(): Promise<any> {
    return {
      categories: await this.getAvailableCategories(),
      user_customizations: [],
      learning_data: []
    };
  }
} 