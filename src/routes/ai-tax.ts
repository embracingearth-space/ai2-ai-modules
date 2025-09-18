/**
 * 💰 AI TAX ANALYSIS ROUTES
 * 
 * Intelligent tax deductibility analysis with:
 * - Cost-optimized AI calls
 * - Country-specific tax law integration
 * - Bill vs expense optimization
 * - User preference integration
 * - Compliance validation
 * 
 * // embracingearth.space - AI-powered financial intelligence
 */

import express from 'express';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import aiLogger from '../logger'; // Use local AI modules logger - embracingearth.space

const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Rate limiting for tax analysis
const taxAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: {
    error: 'Too many tax analysis requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all tax routes
router.use(taxAnalysisLimiter);

/**
 * 🎯 ANALYZE SINGLE TRANSACTION FOR TAX DEDUCTIBILITY
 */
router.post('/analyze-transaction', async (req, res) => {
  try {
    const { description, amount, date, category, userProfile, type } = req.body;

    if (!description || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Description and amount are required'
      });
    }

    console.log('💰 Analyzing transaction for tax deductibility:', {
      description,
      amount,
      category,
      type,
      country: userProfile?.countryCode || 'AU'
    });

    const systemPrompt = `You are an expert ${userProfile?.countryCode || 'AU'} business tax analyst.
USER'S BUSINESS RULES: "${userProfile?.aiContextInput || 'Standard business deduction approach'}"

🚨 CRITICAL RULES:
- If transaction contains "UBER" → isDeductible: false, businessPercent: 0
- If transaction contains "LINKT" or "toll" → isDeductible: true, businessPercent: 100
- If transaction contains "PARKING" → isDeductible: true, businessPercent: 100

Respond with JSON: {"category": "TaxCategoryName", "isDeductible": true/false, "businessPercent": 0-100, "confidence": 0.95, "reasoning": "explanation"}`;
    
    const userPrompt = `Analyze transaction: ${description} (Amount: $${Math.abs(amount)}, Category: ${category || 'General'})`;

    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use stable model
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 200,
      temperature: 0
    });

    const analysis = response.choices[0].message?.content;
    const responseTime = Date.now() - startTime;
    const tokenCount = response.usage?.total_tokens || 0;
    
    // Log to AI monitoring system
    aiLogger.info('AI Operation Completed', {
      operation: 'TaxAnalysisSingle',
      model: 'gpt-4o-mini',
      tokenCount,
      responseTime,
      success: true,
      userId: req.body.userId || 'tax-user',
      transactionCount: 1,
      transactionDescription: description,
      amount,
      category: category || 'General',
      isRealAICall: true
    });
      
    if (!analysis) {
      throw new Error('No analysis received from AI');
    }

    // Parse AI response
    const result = parseAITaxResponse(analysis, description, amount);

    console.log('✅ Tax analysis completed:', {
      isTaxDeductible: result.isTaxDeductible,
      confidence: result.confidence,
      reasoning: result.reasoning.substring(0, 100) + '...',
      source: 'ai'
    });

    res.json({
      success: true,
      analysis: {
        description,
        amount,
        date,
        category,
        type,
        ...result
      }
    });

  } catch (error) {
    console.error('❌ Tax analysis failed:', error);
    
    // Log error to AI monitoring
    aiLogger.error('AI Operation Failed', {
      operation: 'TaxAnalysisSingle',
      model: 'gpt-4o-mini',
      userId: req.body.userId || 'tax-user',
      error: (error as Error).message,
      isRealAICall: true
    });
    
    res.status(500).json({
      success: false,
      error: 'Tax analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * 🚀 BATCH TAX ANALYSIS WITH OPTIMIZED AI CALLS
 */
router.post('/batch-analyze', async (req, res) => {
  try {
    const { transactions, userProfile } = req.body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Transactions array is required'
      });
    }

    console.log('💰 Starting batch tax analysis for', transactions.length, 'transactions');

    const BATCH_SIZE = 10;
    const results: any[] = [];

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);
      
      console.log(`🤖 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(transactions.length / BATCH_SIZE)}`);

      const batchResults = await processTaxBatch(batch, userProfile);
      results.push(...batchResults);

      // Rate limiting between batches
      if (i + BATCH_SIZE < transactions.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('✅ Batch tax analysis completed:', {
      totalTransactions: transactions.length,
      resultsCount: results.length
    });

    res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('❌ Batch tax analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'Batch tax analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * 🎯 PROCESS TAX BATCH WITH CACHE-FIRST APPROACH
 */
async function processTaxBatch(transactions: any[], userProfile: any): Promise<any[]> {
  console.log(`🎯 Processing ${transactions.length} transactions with AI analysis...`);
  
  const results = [];
  
  // For now, process each transaction (cache TODO)
  for (const transaction of transactions) {
    try {
      const result = await processSingleTransaction(transaction, userProfile);
      results.push({
        id: transaction.id,
        description: transaction.description,
        amount: transaction.amount,
        date: transaction.date,
        category: transaction.category,
        type: transaction.type,
        source: 'ai',
        ...result
      });
    } catch (error) {
      results.push({
        id: transaction.id,
        description: transaction.description,
        amount: transaction.amount,
        date: transaction.date,
        category: transaction.category,
        type: transaction.type,
        source: 'uncategorised',
        ...getDefaultTaxResult(transaction)
      });
    }
  }
  
  console.log(`✅ Batch processing complete: ${results.length} results`);
  return results;
}

/**
 * 🔍 PROCESS SINGLE TRANSACTION
 */
async function processSingleTransaction(transaction: any, userProfile: any): Promise<any> {
  const systemPrompt = `You are an ${userProfile?.countryCode || 'AU'} tax analyst.
USER'S MANDATORY RULES: "${userProfile?.aiContextInput || 'Standard deduction approach'}"

🚨 CRITICAL: 
- UBER → isDeductible: false, businessPercent: 0
- LINKT/toll → isDeductible: true, businessPercent: 100
- PARKING → isDeductible: true, businessPercent: 100

Respond with JSON: {"isDeductible": true/false, "confidence": 0.95, "reasoning": "citing user rule"}`;
  
  const userPrompt = `Transaction: ${transaction.description} ($${Math.abs(transaction.amount)}) - Category: ${transaction.category || 'General'}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 150,
    temperature: 0
  });

  const analysis = response.choices[0].message?.content;
  return parseAITaxResponse(analysis || '', transaction.description, transaction.amount);
}

/**
 * 🔧 GET DEFAULT TAX RESULT FOR FAILED ANALYSIS
 */
function getDefaultTaxResult(transaction: any): any {
  return {
    isTaxDeductible: false,
    confidence: 0.3,
    reasoning: 'AI analysis unavailable - manual review required',
    businessUsePercentage: 0,
    taxCategory: 'Personal',
    documentationRequired: ['Receipt', 'Business purpose documentation'],
    warnings: ['AI analysis failed'],
    suggestions: ['Manual review recommended'],
    relatedRules: []
  };
}

/**
 * 🚀 PARSE AI JSON RESPONSE FOR TAX ANALYSIS
 */
function parseAITaxResponse(analysis: string, description: string, amount: number): any {
  try {
    console.log('🔍 Parsing AI JSON response:', analysis?.substring(0, 200) + '...');
    
    // Clean response (remove code blocks if present)
    const cleanResponse = analysis?.replace(/```json|```/g, '').trim();
    
    if (!cleanResponse) {
      throw new Error('Empty response from AI');
    }
    
    const parsed = JSON.parse(cleanResponse);
    
    // Map AI response to expected format
    const result = {
      isTaxDeductible: parsed.isDeductible || false,
      confidence: parsed.confidence || 0.7,
      reasoning: parsed.reasoning || 'AI tax analysis completed',
      businessUsePercentage: parsed.businessPercent || 0,
      taxCategory: parsed.category || 'Personal',
      documentationRequired: parsed.documentation || [],
      warnings: parsed.warnings || [],
      suggestions: parsed.suggestions || [],
      relatedRules: parsed.relatedRules || []
    };
    
    console.log('✅ Successfully parsed AI response:', {
      deductible: result.isTaxDeductible,
      confidence: result.confidence,
      businessPercent: result.businessUsePercentage,
      category: result.taxCategory
    });
    
    return result;
    
  } catch (error) {
    console.error('❌ Failed to parse AI response:', error);
    console.error('❌ Raw response:', analysis);
    
    return {
      isTaxDeductible: false,
      confidence: 0.3,
      reasoning: 'Failed to parse AI response - manual review required',
      businessUsePercentage: 0,
      taxCategory: 'Personal',
      documentationRequired: ['Receipt', 'Business purpose documentation'],
      warnings: ['AI parsing failed'],
      suggestions: ['Manual review recommended'],
      relatedRules: []
    };
  }
}

export default router;
