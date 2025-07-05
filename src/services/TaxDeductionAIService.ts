import { BaseAIService, AIConfig } from './BaseAIService';
import { TaxLawFactory } from '../tax/TaxLawFactory';
import OpenAI from 'openai';

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
      date: date.toISOString(),
      category,
      expenseType,
      deductionRules: JSON.stringify(deductionRules, null, 2),
      occupationRules: JSON.stringify(occupationRules, null, 2)
    });

    const response = await this.retryWithBackoff(async () => {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: `You are a professional tax advisor with expertise in ${userProfile.countryCode} tax law. Always provide accurate, conservative advice that errs on the side of compliance.`
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: this.config.maxTokens,
        temperature: 0.1, // Low temperature for consistent tax advice
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

    return response as TaxDeductionAnalysis;
  }

  /**
   * Batch analyze multiple expenses/bills for tax deductibility
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
    const results = new Map<string, TaxDeductionAnalysis>();
    
    // Process in batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
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
        results.set(id, analysis);
      });

      // Add delay between batches to respect rate limits
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
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
  async executeTask(task: any): Promise<any> {
    throw new Error('Method not implemented.');
  }

  async batchExecuteTasks(tasks: any[]): Promise<Map<string, any>> {
    throw new Error('Method not implemented.');
  }

  async estimateTaskCost(task: any): Promise<number> {
    throw new Error('Method not implemented.');
  }

  async optimizeForCost(tasks: any[]): Promise<any[]> {
    throw new Error('Method not implemented.');
  }

  async analyzeTransaction(): Promise<any> {
    throw new Error('Use analyzeTaxDeductibility instead');
  }

  async analyzeCSVFormat(): Promise<any> {
    throw new Error('Not implemented in TaxDeductionAIService');
  }

  async queryTransactions(): Promise<any> {
    throw new Error('Not implemented in TaxDeductionAIService');
  }

  async generateUserProfile(): Promise<any> {
    throw new Error('Not implemented in TaxDeductionAIService');
  }

  async learnFromFeedback(): Promise<void> {
    // Implementation for learning from user corrections
  }

  async getInsights(): Promise<any> {
    throw new Error('Use getTaxOptimizationSuggestions instead');
  }

  async exportAIData(): Promise<any> {
    throw new Error('Not implemented in TaxDeductionAIService');
  }
} 