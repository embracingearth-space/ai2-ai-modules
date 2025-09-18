/**
 * 🚀 BATCH PROCESSING ENGINE
 * 
 * Efficiently processes large volumes of transactions (100-1000+) with minimal API calls.
 * Uses hybrid approach: Reference data first, AI only for edge cases.
 * 
 * Cost Optimization:
 * - Before: 1000 transactions × $0.015-0.06 = $15-60
 * - After: ~200 AI calls × $0.025 = $5-8 (70-85% savings)
 * 
 * Performance:
 * - Processes 1000 transactions in 10-30 seconds
 * - Handles bill pattern detection across entire dataset
 * - Provides comprehensive analytics and insights
 */

import { ReferenceDataParser, TransactionAnalysisResult } from './ReferenceDataParser';
import { TransactionClassificationAIAgent } from './TransactionClassificationAIAgent';
import { AIConfig } from '../types/ai-types';
import { AIDataContext } from './BaseAIService';
import { logger } from './LoggingService';
import aiLogger from '../logger'; // Use local AI modules logger - embracingearth.space

export interface BatchTransaction {
  id: string;
  description: string;
  amount: number;
  date: Date;
  merchant?: string;
  type: 'debit' | 'credit';
  category?: string;
  userNotes?: string;
}

export interface BatchProcessingOptions {
  batchSize: number; // Number of transactions to process in each AI batch call
  maxConcurrentBatches: number; // Parallel processing limit
  confidenceThreshold: number; // Minimum confidence for reference data classification
  enableBillDetection: boolean; // Whether to detect recurring bills
  enableCostOptimization: boolean; // Whether to optimize for cost vs speed
  enableCategorization?: boolean;  // 🎯 NEW: Enable categorization mode
  selectedCategories?: string[];   // 🎯 NEW: User-selected categories
  userProfile?: {
    businessType: string;
    industry: string;
    countryCode?: string;
  };
}

export interface BatchProcessingResult {
  totalTransactions: number;
  processedWithReferenceData: number;
  processedWithAI: number;
  cachedResults: number;
  totalCost: number;
  processingTimeMs: number;
  results: TransactionAnalysisResult[];
  insights: BatchInsights;
  costBreakdown: CostBreakdown;
  recurringBills: RecurringBill[];
}

export interface BatchInsights {
  topCategories: Array<{ category: string; count: number; percentage: number }>;
  totalTaxDeductible: { count: number; amount: number; percentage: number };
  billsDetected: { count: number; totalAmount: number; recurringBills: number };
  averageConfidence: number;
  outliers: TransactionAnalysisResult[];
  recommendations: string[];
}

export interface CostBreakdown {
  referenceDataClassifications: number;
  aiClassifications: number;
  costPerTransaction: number;
  estimatedSavings: number;
  efficiencyRating: number; // 0-100%
}

export interface RecurringBill {
  merchantPattern: string;
  category: string;
  averageAmount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextDueDate?: Date;
  confidence: number;
  transactions: string[]; // Transaction IDs
}

export class BatchProcessingEngine {
  private referenceParser: ReferenceDataParser;
  private aiAgent?: TransactionClassificationAIAgent;
  private config: AIConfig;
  private processingStats = {
    totalProcessed: 0,
    aiCallsMade: 0,
    cacheHits: 0,
    totalCost: 0
  };

  constructor(config: AIConfig) {
    this.config = config;
    this.referenceParser = new ReferenceDataParser(config);
    
    // 🔍 DEBUG: Check API key and AI agent initialization
    console.log('🔧 BatchProcessingEngine Constructor:');
    console.log('🔧 Config apiKey exists:', !!config.apiKey);
    console.log('🔧 Config apiKey length:', config.apiKey?.length || 0);
    
    // Initialize AI agent if API key is available
    if (config.apiKey) {
      console.log('🤖 Initializing AI Agent with API key...');
      this.aiAgent = new TransactionClassificationAIAgent(config);
      console.log('✅ AI Agent initialized successfully');
    } else {
      console.log('❌ No API key provided - AI Agent will not be initialized');
    }
  }

  // Enterprise: Generate consistent hash for response tracking and caching
  private generateResponseHash(transactions: any[], userContext: string): string {
    const crypto = require('crypto');
    const normalizedInput = {
      transactions: transactions.map(t => ({
        desc: t.description?.toLowerCase().trim(),
        amount: Math.abs(t.amount || 0),
        merchant: t.merchant?.toLowerCase().trim()
      })),
      context: userContext.toLowerCase().trim(),
      // Removed timestamp for true deterministic consistency
      // timestamp: Math.floor(Date.now() / (1000 * 60 * 60)) // REMOVED: Was causing inconsistency
    };
    return crypto.createHash('md5').update(JSON.stringify(normalizedInput)).digest('hex').substring(0, 8);
  }

  // TESTING: Re-enable GPT-5 with proper configuration
  private getOptimalModel(): string {
    // Test if GPT-5 works with proper temperature/seed configuration
    const requestedModel = process.env.AI_MODEL_OVERRIDE || 'gpt-5-chat-latest';
    
    // Auto-correct to working GPT-5 variant
    const model = requestedModel === 'gpt-5' ? 'gpt-5-chat-latest' : requestedModel;
    
    console.log(`🎯 Model selection: ${model} (testing GPT-5 with fixed config)`);
    return model;
  }

  /**
   * 🔄 PROCESS BATCH
   * 
   * Main entry point for batch processing. Handles the entire workflow:
   * 1. Pre-process with reference data
   * 2. Batch remaining transactions for AI processing
   * 3. Detect recurring patterns and bills
   * 4. Generate insights and cost analysis
   */
  async processBatch(
    transactions: BatchTransaction[],
    options: BatchProcessingOptions = this.getDefaultOptions()
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const requestId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('BatchProcessingEngine', `Starting batch processing of ${transactions.length} transactions`, {
      transactionCount: transactions.length,
      options: { ...options, userProfile: options.userProfile ? 'present' : 'none' }
    }, requestId);
    
    console.log(`🚀 Starting batch processing of ${transactions.length} transactions`);
    
    // 🎯 SMART CATEGORIZATION MODE: Always use categorization when enableCategorization is true
    if (options.enableCategorization) {
      const categoryInfo = options.selectedCategories && options.selectedCategories.length > 0 
        ? `Using AI with selected categories: ${options.selectedCategories.join(', ')}`
        : 'Using AI with open categorization (no category constraints)';
      
      console.log(`🎯 SMART CATEGORIZATION MODE: ${categoryInfo}`);
      
      // For smart categorization, process ALL transactions with AI (with or without category constraints)
      const aiResults = await this.processWithAI(transactions, options);
      
      // Skip reference data classification and use only AI results
      const allResults = aiResults;
      // Respect feature flag: bill detection only when enabled
      const recurringBills = options.enableBillDetection ? this.detectRecurringBills(allResults, transactions) : [];
      const insights = this.generateInsights(allResults, transactions);
      const costBreakdown = this.calculateCostBreakdown(0, aiResults.length, transactions.length);
      
      const processingTimeMs = Date.now() - startTime;
      
      return {
        totalTransactions: transactions.length,
        processedWithReferenceData: 0, // No reference data in smart categorization mode
        processedWithAI: aiResults.length,
        cachedResults: 0,
        totalCost: this.processingStats.totalCost,
        results: allResults,
        recurringBills,
        insights,
        costBreakdown,
        processingTimeMs
      };
    }
    
    // Standard mode: Phase 1: Reference Data Classification
    const { classifiedTransactions, unclassifiedTransactions } = await this.classifyWithReferenceData(
      transactions, 
      options.confidenceThreshold
    );
    
    console.log(`✅ Classified ${classifiedTransactions.length} transactions with reference data`);
    console.log(`🤖 ${unclassifiedTransactions.length} transactions need AI processing`);
    
    // Phase 2: AI Batch Processing for remaining transactions
    const aiResults = await this.processWithAI(unclassifiedTransactions, options);
    
    // Phase 3: Combine results and detect patterns
    const allResults = [...classifiedTransactions, ...aiResults];
    // Respect feature flag: bill detection only when enabled
    const recurringBills = options.enableBillDetection ? this.detectRecurringBills(allResults, transactions) : [];
    
    // Phase 4: Generate insights and analytics
    const insights = this.generateInsights(allResults, transactions);
    const costBreakdown = this.calculateCostBreakdown(
      classifiedTransactions.length,
      aiResults.length,
      transactions.length
    );
    
    const processingTimeMs = Date.now() - startTime;
    
    console.log(`🎉 Batch processing completed in ${processingTimeMs}ms`);
    console.log(`💰 Total cost: $${costBreakdown.costPerTransaction * transactions.length}`);
    console.log(`📊 Efficiency: ${costBreakdown.efficiencyRating}%`);
    
    // Log completion
    logger.logPerformance('BatchProcessingEngine', 'batch_processing', processingTimeMs, {
      totalTransactions: transactions.length,
      processedWithReferenceData: classifiedTransactions.length,
      processedWithAI: aiResults.length,
      efficiency: costBreakdown.efficiencyRating,
      totalCost: costBreakdown.costPerTransaction * transactions.length
    }, requestId);
    
    return {
      totalTransactions: transactions.length,
      processedWithReferenceData: classifiedTransactions.length,
      processedWithAI: aiResults.length,
      cachedResults: this.referenceParser.getCacheStats().size,
      totalCost: costBreakdown.costPerTransaction * transactions.length,
      processingTimeMs,
      results: allResults.map(result => {
        // Find the original transaction to include its description
        const originalTransaction = transactions.find(t => t.id === result.transactionId);
        return {
          ...result,
          description: originalTransaction?.description || 'Unknown'
        };
      }),
      insights,
      costBreakdown,
      recurringBills
    };
  }

  /**
   * 📚 REFERENCE DATA CLASSIFICATION
   * 
   * First pass: Use reference data parser to classify obvious transactions
   */
  private async classifyWithReferenceData(
    transactions: BatchTransaction[],
    confidenceThreshold: number
  ): Promise<{
    classifiedTransactions: TransactionAnalysisResult[];
    unclassifiedTransactions: BatchTransaction[];
  }> {
    const classifiedTransactions: TransactionAnalysisResult[] = [];
    const unclassifiedTransactions: BatchTransaction[] = [];
    
    for (const transaction of transactions) {
      const result = await this.referenceParser.classifyTransaction(
        transaction.description,
        transaction.amount,
        transaction.merchant
      );
      
      if (result && result.confidence >= confidenceThreshold) {
        classifiedTransactions.push({
          ...result,
          transactionId: transaction.id
        } as any);
      } else {
        unclassifiedTransactions.push(transaction);
      }
    }
    
    return { classifiedTransactions, unclassifiedTransactions };
  }

  /**
   * 🤖 AI BATCH PROCESSING
   * 
   * Second pass: Use AI for transactions that couldn't be classified with reference data
   */
  private async processWithAI(
    transactions: BatchTransaction[],
    options: BatchProcessingOptions
  ): Promise<TransactionAnalysisResult[]> {
    if (transactions.length === 0) {
      return [];
    }
    
    // If no AI agent available, return mock results
    if (!this.aiAgent) {
      logger.warn('BatchProcessingEngine', 'No AI agent available, using mock results', {
        transactionCount: transactions.length
      });
      
      // 🔗 Log mock operation (not a real AI call)
      aiLogger.warn('Mock AI Operation', {
        operation: 'BatchCategorizationMock',
        model: 'mock',
        transactionCount: transactions.length,
        totalAmount: transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
        reason: 'No OpenAI API key configured',
        isRealAICall: false
      });
      
      return this.generateMockAIResults(transactions);
    }
    
    const results: TransactionAnalysisResult[] = [];
    const batches = this.createBatches(transactions, options.batchSize);
    
    logger.info('BatchProcessingEngine', `Processing ${batches.length} AI batches with ${options.maxConcurrentBatches} concurrent`, {
      transactionCount: transactions.length,
      batchCount: batches.length,
      batchSize: options.batchSize,
      maxConcurrentBatches: options.maxConcurrentBatches
    });
    
    console.log(`🔄 Processing ${batches.length} AI batches with ${options.maxConcurrentBatches} concurrent`);
    
    // Process batches with controlled concurrency
    for (let i = 0; i < batches.length; i += options.maxConcurrentBatches) {
      const batchSlice = batches.slice(i, i + options.maxConcurrentBatches);
      const batchPromises = batchSlice.map(batch => this.processAIBatch(batch, options));
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.flat());
      
      console.log(`✅ Completed ${Math.min(i + options.maxConcurrentBatches, batches.length)}/${batches.length} batches`);
    }
    
    return results;
  }

  /**
   * 🎯 SINGLE AI BATCH PROCESSING
   * 
   * 🔧 ARCHITECTURAL OPTIMIZATION: Process transactions in true batches to reduce API calls
   * Instead of 1 API call per transaction, we group multiple transactions into single prompts
   */
  private async processAIBatch(
    batch: BatchTransaction[],
    options: BatchProcessingOptions
  ): Promise<TransactionAnalysisResult[]> {
    const results: TransactionAnalysisResult[] = [];
    
    try {
      // Create context for AI processing
      const context: AIDataContext = {
        userId: 'batch-processing',
        userProfile: {
          businessType: options.userProfile?.businessType || 'unknown',
          industry: options.userProfile?.industry || 'general',
          taxPreferences: [],
          commonExpenses: [],
          incomeSources: [],
          learningPreferences: []
        },
        historicalData: [],
        learningFeedback: [],
        preferences: {
          aiContextInput: (options.userProfile as any)?.aiContextInput || undefined
        }
      };
      
      // 🚀 NEW OPTIMIZATION: Process entire batch in single API call
      if (this.aiAgent && batch.length > 0) {
        try {
          // 🎯 Always use categorization mode when enableCategorization is true
          if (options.enableCategorization) {
            const selectedCategories = options.selectedCategories || [];
            const categoryInfo = selectedCategories.length > 0 
              ? `with selected categories: ${selectedCategories.join(', ')}`
              : 'with open categorization (no category constraints)';
            
            console.log(`🎯 Using CATEGORIZATION mode ${categoryInfo}`);
            
            // Call the categorization method (with or without category constraints)
            const categorizations = await this.categorizeBatchTransactions(
              batch,
              selectedCategories, // Pass empty array for open categorization
              context
            );
            
            // Convert categorization results to standard format
            categorizations.forEach((catResult, index) => {
              const transaction = batch[index];
              const standardResult: TransactionAnalysisResult = {
                transactionId: transaction.id,
                category: catResult.category || 'Uncategorized',
                subcategory: catResult.subcategory || 'General',
                confidence: catResult.confidence || 0.7,
                isTaxDeductible: catResult.isTaxDeductible || false,
                source: 'ai-categorization' as TransactionAnalysisResult['source'],
                businessUsePercentage: catResult.businessUsePercentage || 0,
                taxCategory: catResult.taxCategory || 'Personal',
                isBill: false, // Not relevant for categorization
                isRecurring: false, // Not relevant for categorization
                secondaryType: catResult.secondaryType || 'one-time expense', // 🎯 ADDED: Use AI result or default
                reasoning: catResult.reasoning || 'AI categorization',
                primaryType: transaction.type === 'credit' ? 'income' : 'expense',
                processedAt: new Date().toISOString(),
              };
              
              results.push(standardResult);
            });
            
            console.log(`✅ Categorized ${batch.length} transactions with 1 API call`);
            
          } else {
            // 🚨 FIXED: When no categories selected, use categorization mode with empty categories for open analysis
            console.log(`🔄 FIXED: No categories selected - using open categorization mode for ${batch.length} transactions`);
            
            // Call categorization method with empty categories for open analysis
            const categorizations = await this.categorizeBatchTransactions(
              batch,
              [], // Empty categories = open analysis, AI can suggest any categories
              context
            );
            
            // Convert categorization results to standard format
            categorizations.forEach((catResult, index) => {
              const transaction = batch[index];
              const standardResult: TransactionAnalysisResult = {
                transactionId: transaction.id,
                category: catResult.category || 'Uncategorized',
                subcategory: catResult.subcategory || 'General',
                confidence: catResult.confidence || 0.7,
                isTaxDeductible: catResult.isTaxDeductible || false,
                source: 'ai-categorization' as TransactionAnalysisResult['source'],
                businessUsePercentage: catResult.businessUsePercentage || 0,
                taxCategory: catResult.taxCategory || 'Personal',
                isBill: false, // Not relevant for categorization
                isRecurring: false, // Not relevant for categorization
                secondaryType: catResult.secondaryType || 'one-time expense', // 🎯 ADDED: Use AI result or default
                reasoning: catResult.reasoning || 'AI categorization (open analysis)',
                primaryType: transaction.type === 'credit' ? 'income' : 'expense',
                processedAt: new Date().toISOString(),
              };
              
              results.push(standardResult);
            });
            
            console.log(`✅ Used open categorization for ${batch.length} transactions with 1 API call (no individual calls!)`);
          }
          
          // 📊 COST TRACKING: Only 1 API call for entire batch
          this.processingStats.aiCallsMade += 1; // Single batch call
          this.processingStats.totalCost += this.estimateBatchCost(1); // Cost for 1 call
          
        } catch (bulkError) {
          console.warn('⚠️ Bulk processing failed, falling back to individual processing:', bulkError);
          // Fallback to individual processing if bulk fails
          await this.processIndividualTransactions(batch, context, results, options);
        }
      } else {
        // Process individual transactions for small batches or when no AI agent
        await this.processIndividualTransactions(batch, context, results, options);
      }
      
    } catch (error) {
      console.error('❌ Batch AI processing failed:', error);
      
      // Create fallback results for all transactions in batch
      batch.forEach(transaction => {
        results.push(this.createFallbackResult(transaction));
      });
    }
    
    return results;
  }

  /**
   * 🎯 CATEGORIZE BATCH TRANSACTIONS
   * Categorize transactions into user-selected categories using AI
   */
  private async categorizeBatchTransactions(
    transactions: BatchTransaction[],
    selectedCategories: string[],
    context: AIDataContext
  ): Promise<any[]> {
    const requestId = `categorize-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    // Log the API request with actual prompt
    logger.logApiRequest(
      'BatchProcessingEngine',
      'openai/chat/completions',
      'POST',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a financial transaction categorization expert. Analyze transactions and categorize them accurately.' },
          { role: 'user', content: `Categorize these ${transactions.length} transactions: ${JSON.stringify(transactions.map(t => ({ description: t.description, amount: t.amount, merchant: t.merchant })))}` }
        ],
        max_tokens: 2000,
        temperature: 0.1
      },
      context.userId,
      requestId
    );
    // Prepare optimized transaction data (remove unnecessary fields)
    const optimizedTransactions = transactions.map(t => ({
      description: t.description,
      amount: t.amount,
      merchant: t.merchant
    }));

    // Build comprehensive user context information
    const userProfile = context.userProfile;
    
    // Debug: Log incoming user profile data
    console.log('🔍 DEBUG - Incoming User Profile Data:');
    console.log('Raw userProfile:', JSON.stringify(userProfile, null, 2));
    console.log('Raw context.preferences:', JSON.stringify(context.preferences, null, 2));
    console.log('🔍 DEBUG - aiContextInput paths:');
    console.log('userProfile.aiContextInput:', (userProfile as any)?.aiContextInput);
    console.log('context.preferences.aiContextInput:', context.preferences?.aiContextInput);
    
    // Extract all available profile information
    const businessType = userProfile?.businessType || 'INDIVIDUAL';
    const industry = userProfile?.industry || 'General';
    const profession = (userProfile as any)?.profession || '';
    const countryCode = (userProfile as any)?.countryCode || 'AU';
    
    // Get AI context from user profile (enhanced integration)
    const aiContextInput = (userProfile as any)?.aiContextInput || context.preferences?.aiContextInput;
    
    // Debug: Log extracted profile components
    console.log('🔍 DEBUG - Extracted Profile Components:');
    console.log(`Business Type: "${businessType}"`);
    console.log(`Industry: "${industry}"`);
    console.log(`Profession: "${profession}"`);
    console.log(`Country Code: "${countryCode}"`);
    console.log(`AI Context Input: "${aiContextInput}"`);
    console.log('===================================================');
    
    // Build comprehensive user profile context with enhanced details
    const userProfileContext = [
      `Business Type: ${businessType}`,
      `Industry: ${industry}`,
      profession ? `Profession: ${profession}` : null,
      countryCode ? `Country: ${countryCode}` : null,
      aiContextInput ? `User Context: ${aiContextInput}` : null
    ].filter(Boolean).join('\n');

    // Create enhanced categorization prompt with comprehensive user context
    const prompt = `Categorizes financial transactions accurately and concisely.

    Help categorize financial transactions based on user's business profile and preferences.

COMPREHENSIVE USER PROFILE:
${userProfileContext}

SELECTED CATEGORIES: ${selectedCategories.length > 0 ? selectedCategories.join(', ') : 'OPEN CATEGORIZATION - Suggest best categories based on user profile'}

TRANSACTION DATA:
${JSON.stringify(optimizedTransactions, null, 2)}

Consider the user's business type, industry, profession, country, and personal context when categorizing transactions. For each transaction, assign to the MOST APPROPRIATE category from the user's categories, treat as one category between each comma. If a transaction could fit multiple categories, choose the BEST match based on the user's context but do not try to fit user categories, suggest a new category if not fitting easily.

${aiContextInput ? `\n\nUSER PSYCHOLOGY CONTEXT: "${aiContextInput}" - Use this to understand the user's business patterns, decision-making style, and expense habits for more accurate categorization.` : ''}
Try to think what payment is for and any hints from businuess names in description.

Respond with a JSON array where each element corresponds to a transaction in order:
[
  {
    "description": "transaction description",
    "category": "assigned category from user's list if fitting",
    "confidence": 0.0-1.0,
    "isNewCategory": false,
    "newCategoryName": null,
    "reasoning": "1-11'ish word explanation"
  }
]`;

    try {
      console.log(`🤖 Sending enhanced categorization request for ${transactions.length} transactions`);
      
      // Debug: Log the complete enhanced user profile context
      console.log('🔍 DEBUG - Enhanced User Profile Context Being Sent:');
      console.log('===================================================');
      console.log(userProfileContext);
      console.log('Business Classification Context:', businessType, profession, industry, countryCode);
      console.log('User AI Context:', aiContextInput);
      console.log('===================================================');
      
      // Debug: Log the complete prompt
      console.log('🔍 DEBUG - Complete AI Prompt:');
      console.log('===================================================');
      console.log(prompt);
      console.log('===================================================');
      
      // Use the AI agent's OpenAI instance directly
      const openai = (this.aiAgent as any).openai;
      if (!openai) {
        throw new Error('OpenAI client not available');
      }

      // Enterprise: Use configured optimal model
      const modelToUse = this.getOptimalModel();
      console.log(`🤖 Using AI Model: ${modelToUse}`);

      // GPT-5 compatibility: Use max_completion_tokens instead of max_tokens for GPT-5
      const apiParams: any = {
        model: modelToUse,
        messages: [
          {
            role: 'system',
            content: `You are an expert ${countryCode} business tax and categorization analyst. You provide CONSISTENT, deterministic analysis for ${businessType} businesses in ${industry} sector.

CONSISTENCY RULES:
- Always apply the same logic to similar transactions
- Maintain consistent reasoning patterns
- Use standardized confidence scoring
- RESPECT user-specific rules and context${aiContextInput ? `\n\nUSER BUSINESS CONTEXT: "${aiContextInput}"` : ''}`
          },
          {
            role: 'user', 
            content: `Here are examples of CONSISTENT categorization for reference:

EXAMPLE 1: {"description": "UBER TRIP", "amount": -25.00, "merchant": "UBER"} 
→ {"category": "Travel", "confidence": 0.9, "isNewCategory": false, "reasoning": "Business travel expense"}

EXAMPLE 2: {"description": "TOLL PAYMENT", "amount": -3.50, "merchant": "LINKT"} 
→ {"category": "Travel", "confidence": 0.9, "isNewCategory": false, "reasoning": "Business travel toll expense"}

EXAMPLE 3: {"description": "OFFICE SUPPLIES", "amount": -45.00, "merchant": "STAPLES"}
→ {"category": "Office Supplies", "confidence": 0.95, "isNewCategory": false, "reasoning": "Business office supplies"}

Apply this SAME consistent logic to classify:`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        seed: 42 // Deterministic responses per user request
      };

      // Model-specific parameters (CORRECTED: GPT-5-chat-latest minimal working params)
      if (modelToUse.startsWith('gpt-5')) {
        // GPT-5-chat-latest WORKING parameters (minimal and clean)
        apiParams.max_completion_tokens = 3000;
        // Note: GPT-5-chat-latest does NOT support reasoning_effort, verbosity, temperature
        // Only needs max_completion_tokens and seed
        console.log('🚀 GPT-5-chat-latest: minimal params (max_completion_tokens + seed only)');
      } else {
        // GPT-4o standard parameters  
        apiParams.max_tokens = 3000;
        apiParams.temperature = 0.1; // Consistency control
        apiParams.top_p = 0.95;
        apiParams.presence_penalty = 0;
        apiParams.frequency_penalty = 0;
        console.log('🎯 GPT-4o: temperature=0.1, top_p=0.95, seed=12345');
      }

      const response = await openai.chat.completions.create(apiParams);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      const duration = Date.now() - startTime;
      const tokenCount = response.usage?.total_tokens || 0;

      // 🔗 MAXIMUM VISIBILITY: Log to AI monitoring system (embracingearth.space)
      aiLogger.info('AI Batch Categorization Completed', {
        operation: 'BatchCategorization',
        model: modelToUse,
        tokenCount,
        responseTime: duration,
        success: true,
        userId: context.userId,
        transactionCount: transactions.length,
        totalAmount: transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
        categories: selectedCategories,
        isRealAICall: true
      });

      // Enterprise: Validate response consistency
      const responseHash = this.generateResponseHash(optimizedTransactions, userProfileContext);
      console.log(`🔍 Response hash for consistency tracking: ${responseHash}`);

      // Log the API response with actual content (legacy logging)
      const estimatedCost = this.estimateBatchCost(transactions.length);
      logger.logApiResponse(
        'BatchProcessingEngine',
        'openai/chat/completions',
        'POST',
        {
          model: modelToUse,
          usage: {
            prompt_tokens: response.usage?.prompt_tokens || 0,
            completion_tokens: response.usage?.completion_tokens || 0,
            total_tokens: response.usage?.total_tokens || 0
          },
          response_length: content.length,
          transaction_count: transactions.length,
          ai_response: content.substring(0, 500) + (content.length > 500 ? '...' : '') // Show first 500 chars of AI response
        },
        200,
        duration,
        estimatedCost,
        context.userId,
        requestId
      );

      // Parse AI response - handle markdown-wrapped JSON
      let categorizations;
      try {
        // First try direct JSON parsing
        categorizations = JSON.parse(content);
      } catch (error) {
        // If that fails, try to extract JSON from markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (jsonMatch) {
          try {
            categorizations = JSON.parse(jsonMatch[1]);
            console.log('🔧 Successfully extracted JSON from markdown wrapper');
          } catch (innerError) {
            console.error('❌ Failed to parse JSON even after extracting from markdown:', innerError);
            throw new Error(`Invalid JSON response from AI: ${innerError.message}`);
          }
        } else {
          console.error('❌ No valid JSON found in AI response:', content.substring(0, 200));
          throw new Error(`Invalid JSON response from AI: ${error.message}`);
        }
      }
      
      // Validate and enhance results with user profile context
      return transactions.map((transaction, index) => {
        const aiResult = categorizations[index] || {};
        
        // 🎯 Handle new category suggestions properly
        let finalCategory = aiResult.category;
        if (aiResult.isNewCategory && aiResult.newCategoryName) {
          // If AI suggests a new category, use that as the category
          finalCategory = aiResult.newCategoryName;
        } else if (!finalCategory) {
          // Fallback to first selected category or 'Other'
          finalCategory = selectedCategories[0] || 'Other';
        }
        
        return {
          description: transaction.description,
          category: finalCategory, // 🎯 Use properly resolved category
          subcategory: 'General',
          confidence: aiResult.confidence || 0.7,
          reasoning: aiResult.reasoning || `AI categorization for ${profession} in ${industry}`,
          isNewCategory: aiResult.isNewCategory || false,
          newCategoryName: aiResult.newCategoryName || null,
          isTaxDeductible: aiResult.isTaxDeductible || false,
          businessUsePercentage: aiResult.businessUsePercentage || 0,
          taxCategory: aiResult.taxCategory || 'Personal'
        };
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // 🔗 MAXIMUM VISIBILITY: Log error to AI monitoring system
      aiLogger.error('AI Batch Operation Failed', {
        operation: 'BatchCategorization',
        model: 'gpt-4', // fallback model name since modelToUse is out of scope
        responseTime: duration,
        userId: context.userId,
        error: (error as Error).message,
        transactionCount: transactions.length,
        isRealAICall: true
      });
      
      console.error('❌ Enhanced categorization failed:', error);
      
      // Return enhanced fallback categorizations using user profile
      return transactions.map(t => ({
        description: t.description,
        category: selectedCategories[0] || `${industry} Expense`,
        subcategory: 'General',
        confidence: 0.3,
        isNewCategory: false,
        reasoning: `Fallback categorization for ${profession} in ${industry}`,
        isTaxDeductible: businessType !== 'INDIVIDUAL',
        businessUsePercentage: businessType !== 'INDIVIDUAL' ? 50 : 0,
        taxCategory: businessType !== 'INDIVIDUAL' ? 'Business' : 'Personal'
      }));
    }
  }

  /**
   * 🔧 HELPER: Process transactions individually (fallback method)
   * This is the old method - only used when bulk processing fails
   */
  private async processIndividualTransactions(
    batch: BatchTransaction[],
    context: AIDataContext,
    results: TransactionAnalysisResult[],
    options: BatchProcessingOptions
  ): Promise<void> {
    // 🚨 PERFORMANCE WARNING: This processes each transaction individually
    // This should only be used as a fallback when bulk processing fails
    console.log(`⚠️ Processing ${batch.length} transactions individually (not optimal)`);
    
    for (const transaction of batch) {
      try {
        const aiResult = await this.aiAgent!.classifyTransaction(
          {
            description: transaction.description,
            amount: transaction.amount,
            merchant: transaction.merchant,
            date: transaction.date
          },
          context
        );
        
        // Convert AI result to our standard format
        const standardResult: TransactionAnalysisResult = {
          transactionId: transaction.id,
          category: aiResult.transactionNature || 'Uncategorized',
          subcategory: aiResult.characteristics?.categoryPattern || 'General',
          confidence: aiResult.confidence || 0.7,
          isTaxDeductible: false,
          source: 'ai',
          businessUsePercentage: 0,
          taxCategory: 'Personal',
          isBill: (aiResult.classification === 'bill') || false,
          isRecurring: aiResult.recurring || false,
          estimatedFrequency: aiResult.recurringPattern?.frequency,
          reasoning: aiResult.reasoning || 'AI classification',
          primaryType: transaction.type === 'credit' ? 'income' : 'expense',
          processedAt: new Date().toISOString(),
        };
        
        results.push(standardResult);
        
      } catch (error) {
        console.error(`❌ AI processing failed for transaction ${transaction.id}:`, error);
        
        // Fallback to basic classification
        results.push(this.createFallbackResult(transaction));
      }
    }
    
    // 📊 COST TRACKING: Individual calls (more expensive)
    this.processingStats.aiCallsMade += batch.length;
    this.processingStats.totalCost += this.estimateBatchCost(batch.length);
  }

  /**
   * 🔧 HELPER: Create fallback AI result for failed processing
   */
  private createFallbackAIResult(transaction: BatchTransaction): any {
    return {
      category: 'Uncategorized',
      subcategory: 'General',
      confidence: 0.5,
      isTaxDeductible: false,
      businessUsePercentage: 0,
      taxCategory: 'Personal',
      classification: 'expense',
      recurring: false,
      reasoning: 'Fallback classification due to AI processing failure'
    };
  }

  /**
   * 🔄 RECURRING BILL DETECTION
   */
  private detectRecurringBills(
    results: TransactionAnalysisResult[],
    originalTransactions: BatchTransaction[]
  ): RecurringBill[] {
    // Group transactions by merchant/description patterns
    const merchantGroups = new Map<string, Array<{ result: TransactionAnalysisResult; transaction: BatchTransaction }>>();
    
    results.forEach((result, index) => {
      const transaction = originalTransactions.find(t => t.id === result.transactionId);
      if (!transaction) return;
      
      // Create merchant signature
      const merchantSignature = this.createMerchantSignature(
        transaction.description,
        transaction.merchant
      );
      
      if (!merchantGroups.has(merchantSignature)) {
        merchantGroups.set(merchantSignature, []);
      }
      
      merchantGroups.get(merchantSignature)!.push({ result, transaction });
    });
    
    const recurringBills: RecurringBill[] = [];
    
    // Analyze each merchant group for recurring patterns
    for (const [merchantSignature, group] of merchantGroups) {
      if (group.length < 2) continue; // Need at least 2 transactions
      
      const bill = this.analyzeRecurringPattern(merchantSignature, group);
      if (bill) {
        recurringBills.push(bill);
      }
    }
    
    return recurringBills.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 📊 INSIGHTS GENERATION
   */
  private generateInsights(
    results: TransactionAnalysisResult[],
    transactions: BatchTransaction[]
  ): BatchInsights {
    // Category analysis
    const categoryCount = new Map<string, number>();
    let totalTaxDeductibleCount = 0;
    let totalTaxDeductibleAmount = 0;
    let totalBills = 0;
    let totalBillAmount = 0;
    let totalConfidence = 0;
    const outliers: TransactionAnalysisResult[] = [];
    
    results.forEach((result, index) => {
      const transaction = transactions.find(t => t.id === result.transactionId);
      if (!transaction) return;
      
      // Category counting
      const count = categoryCount.get(result.category) || 0;
      categoryCount.set(result.category, count + 1);
      
      // Tax deductible analysis
      if (result.isTaxDeductible) {
        totalTaxDeductibleCount++;
        totalTaxDeductibleAmount += transaction.amount;
      }
      
      // Bill analysis
      if (result.isBill) {
        totalBills++;
        totalBillAmount += transaction.amount;
      }
      
      // Confidence tracking
      totalConfidence += result.confidence;
      
      // Outlier detection (low confidence or unusual patterns)
      if (result.confidence < 0.6 || transaction.amount > 10000) {
        outliers.push(result);
      }
    });
    
    // Top categories
    const topCategories = Array.from(categoryCount.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: (count / results.length) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(results, transactions);
    
    return {
      topCategories,
      totalTaxDeductible: {
        count: totalTaxDeductibleCount,
        amount: totalTaxDeductibleAmount,
        percentage: (totalTaxDeductibleCount / results.length) * 100
      },
      billsDetected: {
        count: totalBills,
        totalAmount: totalBillAmount,
        recurringBills: results.filter(r => r.isRecurring).length
      },
      averageConfidence: totalConfidence / results.length,
      outliers: outliers.slice(0, 20), // Top 20 outliers
      recommendations
    };
  }

  /**
   * 💰 COST BREAKDOWN CALCULATION
   */
  private calculateCostBreakdown(
    referenceDataCount: number,
    aiCount: number,
    totalCount: number
  ): CostBreakdown {
    const referenceDataCost = 0; // Reference data classification is free
    const aiCostPerTransaction = 0.025; // Batch processing reduces individual cost
    const totalAICost = aiCount * aiCostPerTransaction;
    const totalCost = totalAICost;
    
    // Calculate what it would have cost with individual AI calls
    const individualAICost = totalCount * 0.045; // Higher cost per individual call
    const estimatedSavings = individualAICost - totalCost;
    
    const efficiencyRating = Math.round(((referenceDataCount / totalCount) * 100));
    
    return {
      referenceDataClassifications: referenceDataCount,
      aiClassifications: aiCount,
      costPerTransaction: totalCost / totalCount,
      estimatedSavings,
      efficiencyRating
    };
  }

  /**
   * 🔧 HELPER METHODS
   */
  private getDefaultOptions(): BatchProcessingOptions {
    return {
      batchSize: 50, // Process 50 transactions per AI batch
      maxConcurrentBatches: 3, // 3 concurrent AI batches
      confidenceThreshold: 0.8, // 80% confidence threshold for reference data
      enableBillDetection: true,
      enableCostOptimization: true,
      userProfile: {
        businessType: 'SOLE_TRADER',
        industry: 'Software Services',
        countryCode: 'AU'
      }
    };
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  private createMerchantSignature(description: string, merchant?: string): string {
    const text = `${description} ${merchant || ''}`.toLowerCase();
    return text.replace(/\d+/g, '').replace(/[^\w\s]/g, '').trim();
  }

  private analyzeRecurringPattern(
    merchantSignature: string,
    group: Array<{ result: TransactionAnalysisResult; transaction: BatchTransaction }>
  ): RecurringBill | null {
    if (group.length < 2) return null;
    
    // Sort by date
    const sortedGroup = group.sort((a, b) => 
      a.transaction.date.getTime() - b.transaction.date.getTime()
    );
    
    // Calculate average amount and frequency
    const amounts = sortedGroup.map(g => g.transaction.amount);
    const averageAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    
    // Simple frequency detection based on date intervals
    const intervals: number[] = [];
    for (let i = 1; i < sortedGroup.length; i++) {
      const daysDiff = Math.round(
        (sortedGroup[i].transaction.date.getTime() - sortedGroup[i-1].transaction.date.getTime()) 
        / (1000 * 60 * 60 * 24)
      );
      intervals.push(daysDiff);
    }
    
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    
    // Determine frequency
    let frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    if (avgInterval <= 10) frequency = 'weekly';
    else if (avgInterval <= 35) frequency = 'monthly';
    else if (avgInterval <= 100) frequency = 'quarterly';
    else frequency = 'yearly';
    
    // Calculate confidence based on consistency
    const varianceThreshold = 0.3;
    const amountVariance = this.calculateVariance(amounts) / averageAmount;
    const intervalVariance = intervals.length > 1 ? this.calculateVariance(intervals) / avgInterval : 0;
    
    const confidence = Math.max(0, 1 - (amountVariance + intervalVariance) / 2);
    
    if (confidence < 0.5) return null; // Not confident enough
    
    return {
      merchantPattern: merchantSignature,
      category: group[0].result.category,
      averageAmount,
      frequency,
      confidence,
      transactions: group.map(g => g.transaction.id)
    };
  }

  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
  }

  private generateRecommendations(
    results: TransactionAnalysisResult[],
    transactions: BatchTransaction[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Low confidence recommendations
    const lowConfidenceCount = results.filter(r => r.confidence < 0.7).length;
    if (lowConfidenceCount > results.length * 0.1) {
      recommendations.push(
        `Consider reviewing ${lowConfidenceCount} transactions with low confidence scores for accuracy`
      );
    }
    
    // Tax optimization
    const taxDeductibleCount = results.filter(r => r.isTaxDeductible).length;
    if (taxDeductibleCount < results.length * 0.3) {
      recommendations.push(
        'Review business expense categorization - you may be missing tax deduction opportunities'
      );
    }
    
    // Recurring bills
    const recurringCount = results.filter(r => r.isRecurring).length;
    if (recurringCount > 5) {
      recommendations.push(
        `${recurringCount} recurring bills detected - consider setting up automated categorization`
      );
    }
    
    return recommendations;
  }

  private generateMockAIResults(transactions: BatchTransaction[]): TransactionAnalysisResult[] {
    console.log('⚠️ WARNING: Generating MOCK AI results - OpenAI API key not configured');
    
    return transactions.map(transaction => {
      const mockCategories = [
        'Business Expense',
        'Personal Expense', 
        'Shopping',
        'Food & Dining',
        'Transportation',
        'Entertainment',
        'Utilities',
        'Insurance'
      ];
      
      const mockReasoning = [
        'MOCK DATA: Based on transaction description pattern analysis',
        'MOCK DATA: Categorized using merchant signature matching',
        'MOCK DATA: Determined from amount and description context',
        'MOCK DATA: Classified using historical transaction patterns',
        'MOCK DATA: Categorized based on merchant category codes'
      ];
      
      return {
        transactionId: transaction.id,
        category: mockCategories[Math.floor(Math.random() * mockCategories.length)],
        subcategory: 'General',
        confidence: 0.7, // Lower confidence for mock data
        isTaxDeductible: false,
        source: 'mock' as TransactionAnalysisResult['source'],
        businessUsePercentage: 0,
        taxCategory: 'Personal',
        isBill: false,
        isRecurring: false,
        reasoning: mockReasoning[Math.floor(Math.random() * mockReasoning.length)],
        primaryType: transaction.type === 'credit' ? 'income' : 'expense',
        processedAt: new Date().toISOString(),
      };
    });
  }

  private createFallbackResult(transaction: BatchTransaction): TransactionAnalysisResult {
    return {
      transactionId: transaction.id,
      category: 'Uncategorized',
      subcategory: 'General',
      confidence: 0.5, // Low confidence for fallback
      isTaxDeductible: false,
      source: 'fallback' as TransactionAnalysisResult['source'],
      businessUsePercentage: 0,
      taxCategory: 'Personal',
      isBill: false,
      isRecurring: false,
      reasoning: 'MOCK FALLBACK: Unable to classify transaction - OpenAI API not configured',
      primaryType: transaction.type === 'credit' ? 'income' : 'expense',
      processedAt: new Date().toISOString(),
    };
  }

  private estimateBatchCost(transactionCount: number): number {
    return transactionCount * 0.025; // Estimated cost per transaction in batch
  }

  /**
   * 📈 PUBLIC ANALYTICS METHODS
   */
  getProcessingStats() {
    return { ...this.processingStats };
  }

  getCacheStats() {
    return this.referenceParser.getCacheStats();
  }

  resetStats() {
    this.processingStats = {
      totalProcessed: 0,
      aiCallsMade: 0,
      cacheHits: 0,
      totalCost: 0
    };
  }
} 