/**
 * 🚀 ENHANCED AI CLASSIFICATION ENDPOINT
 * 
 * Provides intelligent classification with user preferences integration
 * Called by: IntelligentCategorizationService when cache misses occur
 * Features:
 * - User preference-aware classification
 * - Tax deductibility analysis
 * - Bill pattern recognition
 * - Enhanced reasoning and confidence scoring
 */

import { Router } from 'express';
import { TransactionClassificationAIAgent } from '../services/TransactionClassificationAIAgent';
import { TaxDeductionAIService } from '../services/TaxDeductionAIService';
import { CategoriesAIAgent } from '../services/CategoriesAIAgent';
import { getAIConfig } from '../config/ai-config';

const router = Router();

interface EnhancedClassificationRequest {
  transaction: {
    description: string;
    amount: number;
    merchant?: string;
    date: string | Date;
    type: 'debit' | 'credit';
  };
  userContext: {
    preferredCategories: string[];
    customCategories: string[];
    businessType: string;
    profession: string;
    industry: string;
    countryCode: string;
  };
  classificationRequest: {
    includeTaxAnalysis: boolean;
    preferUserCategories: boolean;
    requireReasoning: boolean;
  };
}

interface EnhancedClassificationResponse {
  success: boolean;
  result: {
    primaryType: 'expense' | 'income' | 'transfer';
    secondaryType: 'bill' | 'one-time expense' | 'capital expense';
    category: string;
    categoryId?: string;
    isTaxDeductible: boolean;
    taxCategory?: string;
    businessUsePercentage: number;
    taxReasoning?: string;
    confidence: number;
    reasoning: string;
    
    // Enhanced features
    alternativeCategories?: string[];
    userCategoryMatch?: boolean;
    billLikelihood?: number;
    recurringLikelihood?: number;
  };
  costOptimization: {
    tokensUsed: number;
    cost: number;
    processingTime: string;
  };
  timestamp: string;
}

/**
 * 🎯 ENHANCED CLASSIFICATION ENDPOINT
 * Intelligent classification with user context awareness
 */
router.post('/classify-enhanced', async (req: any, res: any) => {
  const startTime = Date.now();
  
  try {
    const {
      transaction,
      userContext,
      classificationRequest
    }: EnhancedClassificationRequest = req.body;

    // Validate required fields
    if (!transaction?.description || !transaction?.amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required transaction fields: description, amount',
        timestamp: new Date().toISOString()
      });
    }

    // ✅ FIX: Transform userContext to AIDataContext format that AI services expect
    const safeUserContext = {
      userId: 'api-user',
      userProfile: {
        businessType: userContext?.businessType || 'SOLE_TRADER',
        industry: userContext?.industry || 'General',
        commonExpenses: [],
        incomeSources: [],
        taxPreferences: [],
        learningPreferences: []
      },
      historicalData: [],
      learningFeedback: [],
      preferences: {
        countryCode: userContext?.countryCode || 'AU',
        profession: userContext?.profession || 'General'
      },
      preferredCategories: userContext?.preferredCategories || [],
      customCategories: userContext?.customCategories || []
    };

    console.log('🔍 Enhanced Classification - User Context:', {
      businessType: safeUserContext.userProfile.businessType,
      industry: safeUserContext.userProfile.industry
    });

    const config = getAIConfig();
    
    // If no OpenAI API key, return enhanced mock response
    if (!config.apiKey) {
      const mockResponse = generateEnhancedMockResponse(transaction, userContext);
      return res.json({
        success: true,
        result: mockResponse,
        costOptimization: {
          tokensUsed: 0,
          cost: 0,
          processingTime: `${Date.now() - startTime}ms`
        },
        mock: true,
        message: '🚨 MOCK RESPONSE: Configure OPENAI_API_KEY for real AI classification',
        timestamp: new Date().toISOString()
      });
    }

    // Initialize AI services
    const classificationAgent = new TransactionClassificationAIAgent(config);
    const taxService = new TaxDeductionAIService(config);
    const categoriesAgent = new CategoriesAIAgent(config);

    // Step 1: Enhanced Transaction Classification
    const classification = await classificationAgent.classifyTransaction(
      transaction,
      safeUserContext
    );

    // Step 2: Tax Deductibility Analysis (if requested)
    let taxAnalysis = null;
    if (classificationRequest.includeTaxAnalysis) {
      taxAnalysis = await taxService.analyzeTaxDeductibility(
        transaction.description,
        transaction.amount,
        new Date(transaction.date),
        classification.transactionNature,
        {
          countryCode: userContext?.countryCode || 'AU',
          occupation: userContext?.profession || 'General',
          businessType: userContext?.businessType || 'SOLE_TRADER',
          industry: userContext?.industry || 'General',
          taxResidency: userContext?.countryCode || 'AU',
          commonDeductions: [],
          excludedCategories: []
        }
      );
    }

    // Step 3: Category Optimization with User Preferences
    const categoryAnalysis = await categoriesAgent.categorizeTransaction({
      description: transaction.description,
      amount: transaction.amount,
      merchant: transaction.merchant,
      classification: classification.transactionNature
    });

    // Step 4: Build Enhanced Response
    const enhancedResult = buildEnhancedResponse(
      classification,
      taxAnalysis,
      categoryAnalysis,
      userContext
    );

    // Step 5: Calculate costs and metrics
    const processingTime = Date.now() - startTime;
    const tokensUsed = estimateTokenUsage(transaction, userContext);
    const cost = estimateCost(tokensUsed);

    res.json({
      success: true,
      result: enhancedResult,
      costOptimization: {
        tokensUsed,
        cost,
        processingTime: `${processingTime}ms`
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Enhanced classification failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Enhanced classification failed',
      message: error?.message || 'Unknown error occurred',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 🧠 ENHANCED MOCK RESPONSE GENERATOR
 * Intelligent mock that considers user context
 */
function generateEnhancedMockResponse(
  transaction: any,
  userContext: any
): any {
  const { description, amount, merchant, type } = transaction;
  const { preferredCategories, businessType, profession, countryCode } = userContext;
  
  // Mock intelligent classification based on patterns
  let category = 'General';
  let isTaxDeductible = false;
  let businessUsePercentage = 0;
  let confidence = 0.75;
  let userCategoryMatch = false;
  
  const descLower = description.toLowerCase();
  const merchantLower = (merchant || '').toLowerCase();
  
  // Check user preferred categories first (simulate preference matching)
  if (preferredCategories.length > 0) {
    const possibleMatch = preferredCategories.find(cat => 
      descLower.includes(cat.toLowerCase()) || 
      merchantLower.includes(cat.toLowerCase())
    );
    
    if (possibleMatch) {
      category = possibleMatch;
      userCategoryMatch = true;
      confidence = 0.95;
    }
  }
  
  // Business context awareness
  if (businessType !== 'INDIVIDUAL') {
    // Enhanced business logic
    if (descLower.includes('software') || descLower.includes('subscription')) {
      category = 'Software & Technology';
      isTaxDeductible = true;
      businessUsePercentage = 100;
    } else if (descLower.includes('fuel') || descLower.includes('transport')) {
      category = 'Vehicle & Transport';
      isTaxDeductible = true;
      businessUsePercentage = profession.includes('Sales') ? 90 : 75;
    } else if (descLower.includes('office') || descLower.includes('supplies')) {
      category = 'Office Supplies';
      isTaxDeductible = true;
      businessUsePercentage = 100;
    }
  }
  
  // Amount-based intelligence
  const absAmount = Math.abs(amount);
  let secondaryType: 'bill' | 'one-time expense' | 'capital expense' = 'one-time expense';
  let billLikelihood = 0.1;
  
  if (absAmount > 1000) {
    secondaryType = 'capital expense';
  } else if (merchantLower.includes('electric') || merchantLower.includes('gas') || 
             merchantLower.includes('water') || merchantLower.includes('internet')) {
    secondaryType = 'bill';
    billLikelihood = 0.9;
  }

  return {
    primaryType: type === 'credit' ? 'income' : 'expense',
    secondaryType,
    category,
    isTaxDeductible,
    taxCategory: isTaxDeductible ? category : undefined,
    businessUsePercentage,
    taxReasoning: isTaxDeductible ? 
      `Business expense for ${profession} in ${businessType} context` : 
      'Personal expense - not tax deductible',
    confidence,
    reasoning: userCategoryMatch ?
      `Matched user preference category: ${category}` :
      `Classified based on merchant pattern and business context`,
    alternativeCategories: ['Office Supplies', 'Software & Technology', 'Vehicle & Transport'],
    userCategoryMatch,
    billLikelihood,
    recurringLikelihood: billLikelihood * 0.8
  };
}

/**
 * 🔧 BUILD ENHANCED RESPONSE
 * Combines all AI analysis results
 */
function buildEnhancedResponse(
  classification: any,
  taxAnalysis: any,
  categoryAnalysis: any,
  userContext: any
): any {
  return {
    primaryType: classification.primaryType || 'expense',
    secondaryType: classification.secondaryType || 'one-time expense',
    category: categoryAnalysis.optimizedCategory || classification.category,
    categoryId: categoryAnalysis.categoryId,
    isTaxDeductible: taxAnalysis?.isTaxDeductible || false,
    taxCategory: taxAnalysis?.taxCategory,
    businessUsePercentage: taxAnalysis?.businessUsePercentage || 0,
    taxReasoning: taxAnalysis?.reasoning,
    confidence: Math.min(
      classification.confidence || 0.5,
      taxAnalysis?.confidence || 0.5,
      categoryAnalysis.confidence || 0.5
    ),
    reasoning: buildCombinedReasoning(classification, taxAnalysis, categoryAnalysis),
    alternativeCategories: categoryAnalysis.alternatives || [],
    userCategoryMatch: categoryAnalysis.userMatch || false,
    billLikelihood: classification.billLikelihood || 0.1,
    recurringLikelihood: classification.recurringLikelihood || 0.1
  };
}

function buildCombinedReasoning(classification: any, taxAnalysis: any, categoryAnalysis: any): string {
  const parts = [
    `Category: ${categoryAnalysis.reasoning || classification.reasoning}`,
    taxAnalysis?.reasoning ? `Tax: ${taxAnalysis.reasoning}` : null,
    classification.additionalReasoning || null
  ].filter(Boolean);
  
  return parts.join(' | ');
}

function estimateTokenUsage(transaction: any, userContext: any): number {
  // Rough estimation based on content length
  const contentLength = JSON.stringify({ transaction, userContext }).length;
  return Math.ceil(contentLength / 4); // Approximate tokens
}

function estimateCost(tokens: number): number {
  // GPT-3.5-turbo pricing (approximate)
  return tokens * 0.000002; // $0.002 per 1K tokens
}

export default router; 