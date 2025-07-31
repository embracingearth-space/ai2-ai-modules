import { BaseAIService, AIConfig } from './BaseAIService';
import { TaxLawFactory } from '../tax/TaxLawFactory';
import OpenAI from 'openai';
import { apiLogger } from './APILogger';

export interface TaxDeductionAnalysis {
  isTaxDeductible: boolean;
  confidence: number;
  reasoning: string;
  businessUsePercentage: number;
  category: string;
  taxCategory: string; // ATO category code
  documentationRequired: string[];
  warnings: string[];
  suggestions: string[];
  relatedRules: string[];
}

export interface UserTaxProfile {
  countryCode: string;
  occupation: string;
  businessType: string;
  industry: string;
  taxResidency: string;
  commonDeductions: string[];
  excludedCategories: string[];
}

export class TaxDeductionAIService extends BaseAIService {
  private openai: OpenAI;

  constructor(config: AIConfig) {
    super(config);
    this.validateConfig();
    this.openai = new OpenAI({
      apiKey: config.apiKey,
    });
    
    // Define capabilities for the tax deduction agent
    this.capabilities = [
      {
        name: 'analyzeTaxDeductibility',
        description: 'Analyze expense/bill for tax deductibility',
        inputSchema: {
          description: 'string',
          amount: 'number',
          date: 'Date',
          category: 'string',
          userProfile: 'UserTaxProfile',
          expenseType: 'expense|bill'
        },
        outputSchema: {
          isTaxDeductible: 'boolean',
          confidence: 'number',
          reasoning: 'string',
          businessUsePercentage: 'number',
          category: 'string',
          taxCategory: 'string',
          documentationRequired: 'Array<string>',
          warnings: 'Array<string>',
          suggestions: 'Array<string>',
          relatedRules: 'Array<string>'
        },
        costEstimate: 0.08
      },
      {
        name: 'batchAnalyzeTaxDeductibility',
        description: 'Batch analyze multiple expenses/bills for tax deductibility',
        inputSchema: {
          items: 'Array<Transaction>',
          userProfile: 'UserTaxProfile'
        },
        outputSchema: {
          results: 'Map<string, TaxDeductionAnalysis>'
        },
        costEstimate: 0.05
      },
      {
        name: 'getTaxOptimizationSuggestions',
        description: 'Get tax optimization suggestions for user',
        inputSchema: {
          expenses: 'Array<Transaction>',
          bills: 'Array<Transaction>',
          userProfile: 'UserTaxProfile'
        },
        outputSchema: {
          missedDeductions: 'Array<string>',
          optimizationTips: 'Array<string>',
          planningAdvice: 'Array<string>',
          riskWarnings: 'Array<string>'
        },
        costEstimate: 0.12
      }
    ];
  }

  /**
   * Analyze expense/bill for tax deductibility based on user profile and tax laws
   */
  async analyzeTaxDeductibility(
    description: string,
    amount: number,
    date: Date,
    category: string,
    userProfile: UserTaxProfile,
    expenseType: 'expense' | 'bill' = 'expense'
  ): Promise<TaxDeductionAnalysis> {
    const startTime = Date.now();
    const taxLaw = TaxLawFactory.getTaxLaw(userProfile.countryCode);
    const deductionRules = taxLaw.getDeductionRules();
    const occupationRules = taxLaw.getOccupationSpecificRules(userProfile.occupation);

    const prompt = this.formatPrompt(`
You are an expert tax advisor specializing in {{countryCode}} tax law. Analyze this {{expenseType}} for tax deductibility.

User Profile:
- Country: {{countryCode}}
- Occupation: {{occupation}}
- Business Type: {{businessType}}
- Industry: {{industry}}
- Tax Residency: {{taxResidency}}

{{expenseType}} Details:
- Description: {{description}}
- Amount: {{amount}}
- Date: {{date}}
- Category: {{category}}
- Type: {{expenseType}}

Tax Law Context:
{{deductionRules}}

Occupation-Specific Rules:
{{occupationRules}}

Please provide a comprehensive tax deductibility analysis:

1. **Tax Deductibility Assessment**:
   - Is this {{expenseType}} tax deductible? (true/false)
   - Confidence level (0-1)
   - Detailed reasoning

2. **Business Use Analysis**:
   - What percentage is for business use? (0-100)
   - Justification for percentage

3. **Categorization**:
   - Best tax category for this {{expenseType}}
   - ATO/Tax authority category code
   - Alternative categories if applicable

4. **Compliance Requirements**:
   - Documentation required
   - Record-keeping requirements
   - Any warnings or red flags

5. **Optimization Suggestions**:
   - Ways to maximize deductibility
   - Related deductions to consider
   - Timing considerations

6. **Risk Assessment**:
   - Audit risk level (low/medium/high)
   - Common mistakes to avoid
   - Professional advice needed?

Respond in JSON format:
{
  "isTaxDeductible": boolean,
  "confidence": number,
  "reasoning": "detailed explanation",
  "businessUsePercentage": number,
  "category": "expense category",
  "taxCategory": "tax authority category code",
  "documentationRequired": ["document1", "document2"],
  "warnings": ["warning1", "warning2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "relatedRules": ["rule1", "rule2"]
}
`, {
      countryCode: userProfile.countryCode,
      occupation: userProfile.occupation,
      businessType: userProfile.businessType,
      industry: userProfile.industry,
      taxResidency: userProfile.taxResidency,
      description,
      amount,
      date: this.dateToISOString(date),
      category,
      expenseType,
      deductionRules: JSON.stringify(deductionRules, null, 2),
      occupationRules: JSON.stringify(occupationRules, null, 2)
    });

    // 📝 Log the OpenAI API request
    const requestId = apiLogger.logRequest(
      'TaxDeductionAIService',
      'analyzeTaxDeductibility',
      prompt,
      this.config,
      {
        userId: 'tax-analysis',
        transactionCount: 1,
        costEstimate: 0.04,
        context: {
          description,
          amount,
          category,
          expenseType,
          countryCode: userProfile.countryCode,
          businessType: userProfile.businessType
        }
      }
    );

    try {
      const response = await this.retryWithBackoff(async () => {
        const completion = await this.openai.chat.completions.create({
          model: this.config.model,
          messages: [
            {
              role: 'system',
              content: `You are a professional tax advisor with expertise in ${userProfile.countryCode} tax law. Always provide accurate, conservative advice that errs on the side of compliance.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response from OpenAI');
        }

        try {
          const parsed = JSON.parse(content);
          
          // 📝 Log successful response
          const processingTime = Date.now() - startTime;
          apiLogger.logResponse(
            requestId,
            parsed,
            processingTime,
            completion.usage?.total_tokens
          );
          
          return parsed;
        } catch (parseError) {
          // 📝 Log parsing error
          apiLogger.logError(
            requestId,
            new Error(`Failed to parse AI response: ${content}`),
            Date.now() - startTime
          );
          throw new Error(`Failed to parse AI response: ${content}`);
        }
      });

      return response as TaxDeductionAnalysis;
    } catch (error) {
      // 📝 Log API error
      apiLogger.logError(
        requestId,
        error as Error,
        Date.now() - startTime
      );
      throw error;
    }
  }

  /**
   * 🚀 ENHANCED BATCH TAX ANALYSIS WITH SIMILARITY GROUPING
   * Process multiple expenses/bills efficiently with similarity grouping to reduce AI calls
   */
  async batchAnalyzeTaxDeductibility(
    items: Array<{
      id: string;
      description: string;
      amount: number;
      date: Date;
      category: string;
      type: 'expense' | 'bill';
    }>,
    userProfile: UserTaxProfile
  ): Promise<Map<string, TaxDeductionAnalysis>> {
    console.log(`🚀 Starting enhanced batch tax analysis for ${items.length} items...`);
    
    // Group similar items to reduce AI calls
    const { uniqueGroups, representativeItems } = this.groupSimilarTaxItems(items);
    
    console.log(`🚀 Processing ${representativeItems.length} representative items (instead of ${items.length})`);
    
    const representativeResults = new Map<string, TaxDeductionAnalysis>();
    
    // Process representative items in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < representativeItems.length; i += batchSize) {
      const batch = representativeItems.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (item) => {
        try {
          const analysis = await this.analyzeTaxDeductibility(
            item.description,
            item.amount,
            item.date,
            item.category,
            userProfile,
            item.type
          );
          return { id: item.id, analysis };
        } catch (error) {
          console.error(`Error analyzing ${item.id}:`, error);
          return {
            id: item.id,
            analysis: {
              isTaxDeductible: false,
              confidence: 0,
              reasoning: 'Analysis failed',
              businessUsePercentage: 0,
              category: item.category,
              taxCategory: 'Unknown',
              documentationRequired: [],
              warnings: ['Analysis failed - manual review required'],
              suggestions: [],
              relatedRules: []
            } as TaxDeductionAnalysis
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ id, analysis }) => {
        representativeResults.set(id, analysis);
      });

      // Add delay between batches to respect rate limits
      if (i + batchSize < representativeItems.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Apply results to all similar items
    const allResults = this.applyTaxResultsToSimilarItems(representativeResults, uniqueGroups);
    
    console.log(`✅ Enhanced batch tax analysis completed: ${allResults.size} items processed (${representativeItems.length} AI calls)`);
    
    return allResults;
  }

  /**
   * Get tax optimization suggestions for user
   */
  async getTaxOptimizationSuggestions(
    expenses: any[],
    bills: any[],
    userProfile: UserTaxProfile
  ): Promise<{
    missedDeductions: string[];
    optimizationTips: string[];
    planningAdvice: string[];
    riskWarnings: string[];
  }> {
    const prompt = this.formatPrompt(`
You are a tax optimization expert for {{countryCode}}. Analyze this user's expenses and bills to provide optimization suggestions.

User Profile:
{{userProfile}}

Recent Expenses ({{expenseCount}}):
{{expenses}}

Recent Bills ({{billCount}}):
{{bills}}

Please provide:
1. Missed deduction opportunities
2. Tax optimization tips
3. Financial planning advice
4. Risk warnings

Respond in JSON format:
{
  "missedDeductions": ["missed deduction 1", "missed deduction 2"],
  "optimizationTips": ["tip 1", "tip 2"],
  "planningAdvice": ["advice 1", "advice 2"],
  "riskWarnings": ["warning 1", "warning 2"]
}
`, {
      countryCode: userProfile.countryCode,
      userProfile: JSON.stringify(userProfile, null, 2),
      expenseCount: expenses.length,
      expenses: JSON.stringify(expenses.slice(0, 20), null, 2),
      billCount: bills.length,
      bills: JSON.stringify(bills.slice(0, 20), null, 2)
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
   * Validate existing tax decisions and suggest improvements
   */
  async validateTaxDecisions(
    items: Array<{
      description: string;
      amount: number;
      isTaxDeductible: boolean;
      taxDeductionReason?: string;
      businessUsePercentage: number;
    }>,
    userProfile: UserTaxProfile
  ): Promise<{
    validationResults: Array<{
      index: number;
      isValid: boolean;
      confidence: number;
      suggestions: string[];
      risks: string[];
    }>;
    overallScore: number;
    recommendations: string[];
  }> {
    const prompt = this.formatPrompt(`
You are a tax compliance auditor for {{countryCode}}. Review these tax deduction decisions for accuracy and compliance.

User Profile:
{{userProfile}}

Tax Decisions to Validate:
{{decisions}}

For each decision, assess:
1. Is the tax deductibility decision correct?
2. Is the business use percentage appropriate?
3. Are there compliance risks?
4. What improvements could be made?

Provide an overall compliance score (0-100) and recommendations.

Respond in JSON format:
{
  "validationResults": [
    {
      "index": number,
      "isValid": boolean,
      "confidence": number,
      "suggestions": ["suggestion1"],
      "risks": ["risk1"]
    }
  ],
  "overallScore": number,
  "recommendations": ["recommendation1", "recommendation2"]
}
`, {
      countryCode: userProfile.countryCode,
      userProfile: JSON.stringify(userProfile, null, 2),
      decisions: JSON.stringify(items, null, 2)
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: 0.1,
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

  // Required method implementations from BaseAIService
  async executeTask(task: any, context: any): Promise<any> {
    const startTime = Date.now();
    let success = false;
    let cost = 0;

    try {
      let result;
      
      switch (task.taskType) {
        case 'analyzeTaxDeductibility':
          result = await this.analyzeTaxDeductibility(
            task.data.description,
            task.data.amount,
            task.data.date,
            task.data.category,
            task.data.userProfile,
            task.data.expenseType
          );
          break;
        case 'batchAnalyzeTaxDeductibility':
          result = await this.batchAnalyzeTaxDeductibility(task.data.items, task.data.userProfile);
          break;
        case 'getTaxOptimizationSuggestions':
          result = await this.getTaxOptimizationSuggestions(task.data.expenses, task.data.bills, task.data.userProfile);
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

  async batchExecuteTasks(tasks: any[], context: any): Promise<Map<string, any>> {
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
    const baseCosts = {
      'analyzeTaxDeductibility': 0.08,
      'batchAnalyzeTaxDeductibility': 0.05,
      'getTaxOptimizationSuggestions': 0.12
    };

    const baseCost = baseCosts[taskType as keyof typeof baseCosts] || 0.08;
    
    // Adjust cost based on data complexity
    let complexity = 1;
    if (data.items && Array.isArray(data.items)) {
      complexity = Math.max(1, Math.log10(data.items.length + 1));
    }
    
    return baseCost * complexity;
  }

  async optimizeForCost(tasks: any[]): Promise<any[]> {
    return tasks.sort((a, b) => b.priority - a.priority);
  }

  async analyzeTransaction(
    description: string,
    amount: number,
    date: Date,
    context?: string
  ): Promise<any> {
    // Delegate to analyzeTaxDeductibility with default profile
    const defaultProfile = {
      countryCode: this.config.countryCode,
      occupation: 'General',
      businessType: 'Individual',
      industry: 'General',
      taxResidency: 'Resident',
      commonDeductions: [],
      excludedCategories: []
    };
    
    return await this.analyzeTaxDeductibility(description, amount, date, 'General', defaultProfile);
  }

  async analyzeCSVFormat(csvContent: string, sampleRows: number): Promise<any> {
    // Tax service doesn't handle CSV analysis
    return {
      format: 'unknown',
      confidence: 0,
      columns: {},
      sampleData: [],
      suggestions: ['Tax analysis service does not process CSV files']
    };
  }

  async queryTransactions(query: string, transactions: any[], context?: string): Promise<any> {
    // Tax service doesn't handle transaction queries
    return {
      answer: 'Tax analysis service does not process transaction queries',
      confidence: 0,
      sources: [],
      suggestions: ['Use OpenAI service for transaction queries'],
      relatedTransactions: []
    };
  }

  async generateUserProfile(transactions: any[], userPreferences?: any): Promise<any> {
    // Generate basic tax profile from transactions
    const expenseCategories = [...new Set(transactions.map(t => t.category).filter(Boolean))];
    const businessExpenses = transactions.filter(t => t.amount < 0 && t.category?.includes('Business'));
    
    return {
      businessType: businessExpenses.length > 10 ? 'Business' : 'Individual',
      industry: 'General',
      commonExpenses: expenseCategories,
      incomeSources: ['Salary'],
      taxPreferences: ['Standard Deduction'],
      learningPreferences: ['Tax Optimization']
    };
  }

  async learnFromFeedback(feedback: any): Promise<void> {
    // Implementation for learning from user corrections
    console.log('Tax service received feedback:', feedback);
  }

  async getInsights(transactions: any[], timeframe: string): Promise<any> {
    // Use getTaxOptimizationSuggestions for insights
    const expenses = transactions.filter(t => t.amount < 0);
    const bills = transactions.filter(t => t.recurring === true);
    
    const defaultProfile = {
      countryCode: this.config.countryCode,
      occupation: 'General',
      businessType: 'Individual',
      industry: 'General',
      taxResidency: 'Resident',
      commonDeductions: [],
      excludedCategories: []
    };
    
    const suggestions = await this.getTaxOptimizationSuggestions(expenses, bills, defaultProfile);
    
    return {
      spendingPatterns: ['Tax-focused analysis'],
      taxOpportunities: suggestions.missedDeductions,
      recommendations: suggestions.optimizationTips,
      anomalies: suggestions.riskWarnings
    };
  }

  async exportAIData(): Promise<any> {
    return {
      userProfile: {
        businessType: 'Individual',
        industry: 'General',
        commonExpenses: [],
        incomeSources: [],
        taxPreferences: [],
        learningPreferences: []
      },
      learningData: [],
      insights: []
    };
  }

  /**
   * 🔍 SIMILARITY DETECTION FOR TAX ANALYSIS GROUPING
   * Groups similar expenses/bills to reduce redundant AI calls for tax analysis
   */
  private groupSimilarTaxItems(
    items: Array<{
      id: string;
      description: string;
      amount: number;
      date: Date;
      category: string;
      type: 'expense' | 'bill';
    }>
  ): {
    uniqueGroups: Map<string, Array<{
      id: string;
      description: string;
      amount: number;
      date: Date;
      category: string;
      type: 'expense' | 'bill';
    }>>;
    representativeItems: Array<{
      id: string;
      description: string;
      amount: number;
      date: Date;
      category: string;
      type: 'expense' | 'bill';
    }>;
  } {
    const uniqueGroups = new Map<string, Array<{
      id: string;
      description: string;
      amount: number;
      date: Date;
      category: string;
      type: 'expense' | 'bill';
    }>>();
    const representativeItems: Array<{
      id: string;
      description: string;
      amount: number;
      date: Date;
      category: string;
      type: 'expense' | 'bill';
    }> = [];
    
    console.log(`🔍 Analyzing ${items.length} tax items for similarity grouping...`);
    
    for (const item of items) {
      const normalizedDescription = this.normalizeTaxDescription(item.description);
      const similarityKey = this.generateTaxSimilarityKey(normalizedDescription, item.amount, item.category, item.type);
      
      if (!uniqueGroups.has(similarityKey)) {
        uniqueGroups.set(similarityKey, []);
        representativeItems.push(item);
      }
      
      uniqueGroups.get(similarityKey)!.push(item);
    }
    
    // Log grouping results
    const totalGroups = uniqueGroups.size;
    const totalItems = items.length;
    const averageGroupSize = totalItems / totalGroups;
    const aiCallReduction = ((totalItems - totalGroups) / totalItems * 100).toFixed(1);
    
    console.log(`🔍 Tax similarity grouping results:`);
    console.log(`   Total items: ${totalItems}`);
    console.log(`   Unique groups: ${totalGroups}`);
    console.log(`   Average group size: ${averageGroupSize.toFixed(1)}`);
    console.log(`   AI call reduction: ${aiCallReduction}%`);
    
    // Log some example groups
    let groupCount = 0;
    for (const [key, group] of uniqueGroups.entries()) {
      if (group.length > 1 && groupCount < 5) {
        console.log(`   Group ${++groupCount}: "${group[0].description.substring(0, 40)}..." (${group.length} items)`);
      }
    }
    
    return { uniqueGroups, representativeItems };
  }

  /**
   * Normalize description for tax analysis similarity comparison
   */
  private normalizeTaxDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/[0-9\$\.\,\-\*#]+/g, '') // Remove numbers, symbols, and reference numbers
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 50); // Keep first 50 chars for comparison
  }

  /**
   * Generate similarity key for tax analysis based on description, amount, category, and type
   */
  private generateTaxSimilarityKey(
    normalizedDescription: string, 
    amount: number, 
    category: string, 
    type: 'expense' | 'bill'
  ): string {
    // Group by description, amount range (±10% tolerance), category, and type
    const amountRange = Math.round(Math.abs(amount) / 10) * 10; // Round to nearest 10
    return `${normalizedDescription}_${amountRange}_${category}_${type}`;
  }

  /**
   * Apply tax analysis results from representative items to all similar items
   */
  private applyTaxResultsToSimilarItems(
    representativeResults: Map<string, TaxDeductionAnalysis>,
    uniqueGroups: Map<string, Array<{
      id: string;
      description: string;
      amount: number;
      date: Date;
      category: string;
      type: 'expense' | 'bill';
    }>>
  ): Map<string, TaxDeductionAnalysis> {
    const allResults = new Map<string, TaxDeductionAnalysis>();
    
    for (const [similarityKey, group] of uniqueGroups.entries()) {
      const representativeItem = group[0];
      const normalizedDescription = this.normalizeTaxDescription(representativeItem.description);
      const amountRange = Math.round(Math.abs(representativeItem.amount) / 10) * 10;
      const key = `${normalizedDescription}_${amountRange}_${representativeItem.category}_${representativeItem.type}`;
      
      const representativeResult = representativeResults.get(representativeItem.id);
      
      if (representativeResult) {
        // Apply the same result to all items in this group
        for (const item of group) {
          allResults.set(item.id, {
            ...representativeResult,
            reasoning: `${representativeResult.reasoning} (applied to similar item: ${item.description.substring(0, 30)}...)`
          });
        }
      }
    }
    
    console.log(`✅ Applied tax analysis results to ${allResults.size} items from ${representativeResults.size} representative items`);
    return allResults;
  }
} 