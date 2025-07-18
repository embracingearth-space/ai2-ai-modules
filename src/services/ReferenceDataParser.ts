import { AIConfig } from './BaseAIService';

export interface MerchantPattern {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  subcategory: string;
  confidence: number;
  isTaxDeductible: boolean;
  businessUsePercentage: number;
  taxCategory: string;
  isRecurring: boolean;
  billType?: string;
  learned: boolean; // Whether this was learned from user feedback
  lastUpdated: Date;
  frequency: number; // How often this pattern has been matched
}

export interface CategorySignature {
  keywords: string[];
  category: string;
  subcategory: string;
  confidence: number;
  businessRelevance: number;
  isTaxDeductible: boolean;
  patterns: string[];
}

export interface TransactionAnalysisResult {
  transactionId?: string;
  category: string;
  subcategory: string;
  confidence: number;
  isTaxDeductible: boolean;
  businessUsePercentage: number;
  taxCategory: string;
  isBill: boolean;
  isRecurring: boolean;
  source: 'reference' | 'ai' | 'pattern' | 'learned' | 'ai-categorization';
  reasoning: string;
  merchant?: string;
  billType?: string;
  nextDueDate?: Date;
  primaryType?: string;
  processedAt?: string;
  estimatedFrequency?: string;
}

export interface LearningData {
  transactionId: string;
  description: string;
  amount: number;
  userCorrection?: {
    category: string;
    subcategory: string;
    isTaxDeductible: boolean;
    businessUsePercentage: number;
  };
  aiPrediction: TransactionAnalysisResult;
  timestamp: Date;
}

export class ReferenceDataParser {
  private merchantPatterns: Map<string, MerchantPattern> = new Map();
  private categorySignatures: Map<string, CategorySignature> = new Map();
  private learningData: LearningData[] = [];
  private transactionCache: Map<string, TransactionAnalysisResult> = new Map();

  constructor(private config: AIConfig) {
    this.initializeBasePatterns();
  }

  /**
   * Initialize base patterns - these can be expanded over time
   */
  private initializeBasePatterns(): void {
    // Software and cloud services
    this.addMerchantPattern({
      id: 'microsoft',
      name: 'Microsoft',
      aliases: ['microsoft', 'msft', 'ms store', 'microsoft store', 'office 365', 'microsoft 365'],
      category: 'Software',
      subcategory: 'Business Software',
      confidence: 0.95,
      isTaxDeductible: true,
      businessUsePercentage: 100,
      taxCategory: 'Business Expense',
      isRecurring: true,
      billType: 'software_subscription',
      learned: false,
      lastUpdated: new Date(),
      frequency: 1
    });

    this.addMerchantPattern({
      id: 'adobe',
      name: 'Adobe',
      aliases: ['adobe', 'adobe creative', 'adobe inc'],
      category: 'Software',
      subcategory: 'Creative Software',
      confidence: 0.95,
      isTaxDeductible: true,
      businessUsePercentage: 100,
      taxCategory: 'Business Expense',
      isRecurring: true,
      billType: 'software_subscription',
      learned: false,
      lastUpdated: new Date(),
      frequency: 1
    });

    // AWS and cloud services
    this.addMerchantPattern({
      id: 'aws',
      name: 'Amazon Web Services',
      aliases: ['aws', 'amazon web services', 'amazon aws'],
      category: 'Cloud Services',
      subcategory: 'Infrastructure',
      confidence: 0.98,
      isTaxDeductible: true,
      businessUsePercentage: 100,
      taxCategory: 'Business Expense',
      isRecurring: true,
      billType: 'cloud_service',
      learned: false,
      lastUpdated: new Date(),
      frequency: 1
    });

    // Australian utilities
    this.addMerchantPattern({
      id: 'telstra',
      name: 'Telstra',
      aliases: ['telstra', 'telstra corporation'],
      category: 'Telecommunications',
      subcategory: 'Internet & Phone',
      confidence: 0.95,
      isTaxDeductible: true,
      businessUsePercentage: 80,
      taxCategory: 'Business Expense',
      isRecurring: true,
      billType: 'telecom',
      learned: false,
      lastUpdated: new Date(),
      frequency: 1
    });

    // Initialize category signatures
    this.initializeCategorySignatures();
  }

  private initializeCategorySignatures(): void {
    // Software patterns
    this.addCategorySignature({
      keywords: ['software', 'license', 'subscription', 'saas', 'cloud', 'app', 'digital'],
      category: 'Software',
      subcategory: 'Business Software',
      confidence: 0.8,
      businessRelevance: 0.9,
      isTaxDeductible: true,
      patterns: ['\\b(software|license|subscription)\\b', '\\b(saas|cloud)\\b']
    });

    // Utilities patterns
    this.addCategorySignature({
      keywords: ['electricity', 'gas', 'water', 'internet', 'phone', 'utility', 'energy'],
      category: 'Utilities',
      subcategory: 'Business Utilities',
      confidence: 0.85,
      businessRelevance: 0.7,
      isTaxDeductible: true,
      patterns: ['\\b(electricity|gas|water|internet|phone)\\b', '\\b(utility|energy)\\b']
    });

    // Office supplies
    this.addCategorySignature({
      keywords: ['office', 'supplies', 'stationery', 'paper', 'printer', 'ink', 'toner'],
      category: 'Office Supplies',
      subcategory: 'Business Supplies',
      confidence: 0.9,
      businessRelevance: 0.95,
      isTaxDeductible: true,
      patterns: ['\\b(office|supplies|stationery)\\b', '\\b(printer|ink|toner)\\b']
    });
  }

  /**
   * Analyze a transaction using reference data
   */
  analyzeTransaction(description: string, amount: number, merchant?: string): TransactionAnalysisResult | null {
    // Create cache key
    const cacheKey = `${description.toLowerCase()}_${amount}_${merchant || ''}`;
    
    // Check cache first
    if (this.transactionCache.has(cacheKey)) {
      return this.transactionCache.get(cacheKey)!;
    }

    // Try merchant pattern matching first
    const merchantResult = this.matchMerchantPattern(description, merchant);
    if (merchantResult) {
      this.transactionCache.set(cacheKey, merchantResult);
      return merchantResult;
    }

    // Try category signature matching
    const categoryResult = this.matchCategorySignature(description);
    if (categoryResult) {
      this.transactionCache.set(cacheKey, categoryResult);
      return categoryResult;
    }

    return null;
  }

  /**
   * Classify a transaction using reference data (alternative method name)
   */
  classifyTransaction(description: string, amount: number, merchant?: string): TransactionAnalysisResult | null {
    return this.analyzeTransaction(description, amount, merchant);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
    return {
      size: this.transactionCache.size,
      hits: Math.floor(this.transactionCache.size * 0.8), // Estimate
      misses: Math.floor(this.transactionCache.size * 0.2), // Estimate
      hitRate: this.transactionCache.size > 0 ? 0.8 : 0
    };
  }

  /**
   * Get classification coverage statistics
   */
  getClassificationCoverage(): {
    merchantCoverage: number;
    categoryCoverage: number;
    overallCoverage: number;
    confidenceDistribution: any;
  } {
    return {
      merchantCoverage: this.merchantPatterns.size,
      categoryCoverage: this.categorySignatures.size,
      overallCoverage: (this.merchantPatterns.size + this.categorySignatures.size) / 100,
      confidenceDistribution: {
        high: Array.from(this.merchantPatterns.values()).filter(p => p.confidence > 0.8).length,
        medium: Array.from(this.merchantPatterns.values()).filter(p => p.confidence > 0.6 && p.confidence <= 0.8).length,
        low: Array.from(this.merchantPatterns.values()).filter(p => p.confidence <= 0.6).length
      }
    };
  }

  private matchMerchantPattern(description: string, merchant?: string): TransactionAnalysisResult | null {
    const searchText = `${description} ${merchant || ''}`.toLowerCase();
    
    for (const [id, pattern] of this.merchantPatterns) {
      if (pattern.aliases.some(alias => searchText.includes(alias.toLowerCase()))) {
        // Update frequency
        pattern.frequency++;
        pattern.lastUpdated = new Date();
        
        return {
          category: pattern.category,
          subcategory: pattern.subcategory,
          confidence: pattern.confidence,
          isTaxDeductible: pattern.isTaxDeductible,
          businessUsePercentage: pattern.businessUsePercentage,
          taxCategory: pattern.taxCategory,
          isBill: pattern.isRecurring,
          isRecurring: pattern.isRecurring,
          source: pattern.learned ? 'learned' : 'reference',
          reasoning: `Matched merchant pattern: ${pattern.name}`,
          merchant: pattern.name,
          billType: pattern.billType
        };
      }
    }
    
    return null;
  }

  private matchCategorySignature(description: string): TransactionAnalysisResult | null {
    const searchText = description.toLowerCase();
    
    for (const [id, signature] of this.categorySignatures) {
      // Check keyword matches
      const keywordMatches = signature.keywords.filter(keyword => 
        searchText.includes(keyword.toLowerCase())
      ).length;
      
      // Check pattern matches
      const patternMatches = signature.patterns.filter(pattern => 
        new RegExp(pattern, 'i').test(searchText)
      ).length;
      
      const totalMatches = keywordMatches + patternMatches;
      const matchThreshold = Math.max(1, Math.floor(signature.keywords.length / 2));
      
      if (totalMatches >= matchThreshold) {
        return {
          category: signature.category,
          subcategory: signature.subcategory,
          confidence: signature.confidence * (totalMatches / signature.keywords.length),
          isTaxDeductible: signature.isTaxDeductible,
          businessUsePercentage: signature.businessRelevance * 100,
          taxCategory: signature.isTaxDeductible ? 'Business Expense' : 'Personal',
          isBill: false,
          isRecurring: false,
          source: 'pattern',
          reasoning: `Matched category signature: ${signature.category} (${totalMatches} matches)`
        };
      }
    }
    
    return null;
  }

  /**
   * Learn from user feedback - this is how we auto-build reference data
   */
  learnFromFeedback(transactionId: string, description: string, amount: number, 
                   userCorrection: TransactionAnalysisResult, aiPrediction: TransactionAnalysisResult): void {
    // Store learning data
    this.learningData.push({
      transactionId,
      description,
      amount,
      userCorrection: {
        category: userCorrection.category,
        subcategory: userCorrection.subcategory,
        isTaxDeductible: userCorrection.isTaxDeductible,
        businessUsePercentage: userCorrection.businessUsePercentage
      },
      aiPrediction,
      timestamp: new Date()
    });

    // Auto-create or update merchant patterns
    this.autoCreateMerchantPattern(description, amount, userCorrection);
    
    // Auto-create or update category signatures
    this.autoCreateCategorySignature(description, userCorrection);
  }

  private autoCreateMerchantPattern(description: string, amount: number, correction: TransactionAnalysisResult): void {
    // Extract potential merchant name from description
    const potentialMerchant = this.extractMerchantName(description);
    
    if (potentialMerchant) {
      const existingPattern = Array.from(this.merchantPatterns.values())
        .find(p => p.aliases.some(alias => alias.toLowerCase() === potentialMerchant.toLowerCase()));
      
      if (existingPattern) {
        // Update existing pattern
        existingPattern.confidence = Math.min(0.95, existingPattern.confidence + 0.05);
        existingPattern.frequency++;
        existingPattern.lastUpdated = new Date();
        existingPattern.learned = true;
      } else {
        // Create new pattern
        const newPattern: MerchantPattern = {
          id: `learned_${Date.now()}`,
          name: potentialMerchant,
          aliases: [potentialMerchant.toLowerCase()],
          category: correction.category,
          subcategory: correction.subcategory,
          confidence: 0.7, // Start with lower confidence for learned patterns
          isTaxDeductible: correction.isTaxDeductible,
          businessUsePercentage: correction.businessUsePercentage,
          taxCategory: correction.taxCategory,
          isRecurring: correction.isRecurring,
          billType: correction.billType,
          learned: true,
          lastUpdated: new Date(),
          frequency: 1
        };
        
        this.addMerchantPattern(newPattern);
      }
    }
  }

  private autoCreateCategorySignature(description: string, correction: TransactionAnalysisResult): void {
    // Extract keywords from description
    const keywords = this.extractKeywords(description);
    
    if (keywords.length > 0) {
      const signatureKey = `${correction.category}_${correction.subcategory}`.toLowerCase();
      const existingSignature = this.categorySignatures.get(signatureKey);
      
      if (existingSignature) {
        // Update existing signature
        keywords.forEach(keyword => {
          if (!existingSignature.keywords.includes(keyword)) {
            existingSignature.keywords.push(keyword);
          }
        });
        existingSignature.confidence = Math.min(0.9, existingSignature.confidence + 0.02);
      } else {
        // Create new signature
        const newSignature: CategorySignature = {
          keywords,
          category: correction.category,
          subcategory: correction.subcategory,
          confidence: 0.6,
          businessRelevance: correction.businessUsePercentage / 100,
          isTaxDeductible: correction.isTaxDeductible,
          patterns: keywords.map(k => `\\b${k}\\b`)
        };
        
        this.addCategorySignature(newSignature);
      }
    }
  }

  private extractMerchantName(description: string): string | null {
    // Simple merchant extraction - can be improved with NLP
    const words = description.split(' ').filter(word => word.length > 2);
    
    // Look for capitalized words that might be merchant names
    const potentialMerchants = words.filter(word => 
      /^[A-Z][a-z]+$/.test(word) && 
      !['THE', 'AND', 'FOR', 'WITH', 'FROM'].includes(word.toUpperCase())
    );
    
    return potentialMerchants.length > 0 ? potentialMerchants[0] : null;
  }

  private extractKeywords(description: string): string[] {
    // Extract meaningful keywords from description
    const words = description.toLowerCase()
      .split(' ')
      .filter(word => word.length > 3)
      .filter(word => !['the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'been', 'will'].includes(word));
    
    return Array.from(new Set(words)).slice(0, 5); // Max 5 keywords
  }

  /**
   * Get coverage statistics
   */
  getCoverageStats(): {
    merchantPatterns: number;
    categorySignatures: number;
    learnedPatterns: number;
    cacheHitRate: number;
    totalTransactionsAnalyzed: number;
  } {
    const learnedPatterns = Array.from(this.merchantPatterns.values())
      .filter(p => p.learned).length;
    
    return {
      merchantPatterns: this.merchantPatterns.size,
      categorySignatures: this.categorySignatures.size,
      learnedPatterns,
      cacheHitRate: this.transactionCache.size > 0 ? 0.8 : 0, // Estimate
      totalTransactionsAnalyzed: this.learningData.length
    };
  }

  /**
   * Export reference data for backup or sharing
   */
  exportReferenceData(): any {
    return {
      merchantPatterns: Object.fromEntries(this.merchantPatterns),
      categorySignatures: Object.fromEntries(this.categorySignatures),
      learningData: this.learningData.slice(-100), // Last 100 learning entries
      exportDate: new Date().toISOString()
    };
  }

  /**
   * Import reference data
   */
  importReferenceData(data: any): void {
    if (data.merchantPatterns) {
      this.merchantPatterns = new Map(Object.entries(data.merchantPatterns));
    }
    if (data.categorySignatures) {
      this.categorySignatures = new Map(Object.entries(data.categorySignatures));
    }
    if (data.learningData) {
      this.learningData = data.learningData;
    }
  }

  private addMerchantPattern(pattern: MerchantPattern): void {
    this.merchantPatterns.set(pattern.id, pattern);
  }

  private addCategorySignature(signature: CategorySignature): void {
    const key = `${signature.category}_${signature.subcategory}`.toLowerCase();
    this.categorySignatures.set(key, signature);
  }
} 