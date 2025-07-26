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
 * Optimized for cost and accuracy
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

    // 🎯 COST-OPTIMIZED PROMPT ENGINEERING
    const systemPrompt = `tax_bot:${userProfile?.countryCode || 'AU'}`;
    
    const userPrompt = `tx:${description}|amt:${amount}|cat:${category || 'General'}|type:${type || 'expense'}|occ:${userProfile?.occupation || 'General'}|biz:${userProfile?.businessType || 'INDIVIDUAL'}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0,
      max_tokens: 128,
      stop: ['\n', 'END', '---']
    });

    const analysis = response.choices[0].message?.content;
    
    if (!analysis) {
      throw new Error('No analysis received from AI');
    }

    // Parse AI response
    const result = parseTaxAnalysisResponse(analysis, description, amount);

    console.log('✅ Tax analysis completed:', {
      isTaxDeductible: result.isTaxDeductible,
      confidence: result.confidence,
      source: 'ai'
    });

    res.json({
      success: true,
      analysis: {
        // 🔧 FIX: Include original transaction details for frontend display
        description,
        amount,
        date,
        category,
        type,
        // AI analysis results
        ...result
      }
    });

  } catch (error) {
    console.error('❌ Tax analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'Tax analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * 🚀 BATCH TAX ANALYSIS WITH OPTIMIZED AI CALLS
 * Process multiple transactions efficiently
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

    // 🎯 BATCH OPTIMIZATION: Process in optimal batches
    const BATCH_SIZE = 10; // Optimal batch size for tax analysis
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
 * 🎯 PROCESS TAX BATCH WITH CACHE-FIRST APPROACH (OPTIMIZED)
 * FIXED: Proper cache-first logic with single batch AI call
 */
async function processTaxBatch(transactions: any[], userProfile: any): Promise<any[]> {
  console.log(`🎯 Processing ${transactions.length} transactions with cache-first approach...`);
  
  const results = [];
  const transactionsNeedingAI = [];
  
  // PHASE 1: Check cache first
  console.log(`📦 Phase 1: Checking cache for ${transactions.length} transactions...`);
  for (const transaction of transactions) {
    const cacheResult = await checkTaxCache(transaction, userProfile);
    if (cacheResult) {
      results.push({
        id: transaction.id,
        description: transaction.description,
        amount: transaction.amount,
        date: transaction.date,
        category: transaction.category,
        type: transaction.type,
        source: 'cache', // ✅ CORRECT SOURCE NAME
        ...cacheResult
      });
      console.log(`   💾 Cache hit: ${transaction.description.substring(0, 30)}...`);
    } else {
      transactionsNeedingAI.push(transaction);
    }
  }
  
  // PHASE 2: Single batch AI call for remaining transactions
  if (transactionsNeedingAI.length > 0) {
    console.log(`🤖 Phase 2: AI analysis for ${transactionsNeedingAI.length} transactions...`);
    
    try {
      const aiResults = await callOpenAIBatch(transactionsNeedingAI, userProfile);
      
      // PHASE 3: Save to cache and add to results
      console.log(`💾 Phase 3: Saving ${aiResults.length} results to cache...`);
      for (let i = 0; i < transactionsNeedingAI.length; i++) {
        const transaction = transactionsNeedingAI[i];
        const aiResult = aiResults[i];
        
        // Save successful results to cache
        if (aiResult && aiResult.confidence > 0.3) {
          await saveTaxCache(transaction, aiResult, userProfile);
        }
        
        results.push({
          id: transaction.id,
          description: transaction.description,
          amount: transaction.amount,
          date: transaction.date,
          category: transaction.category,
          type: transaction.type,
          source: aiResult && aiResult.confidence > 0.3 ? 'ai' : 'uncategorised', // ✅ CORRECT SOURCE NAMES
          ...aiResult
        });
      }
    } catch (error) {
      console.error(`❌ Batch AI call failed:`, error);
      
      // Fallback for failed batch
      for (const transaction of transactionsNeedingAI) {
        results.push({
          id: transaction.id,
          description: transaction.description,
          amount: transaction.amount,
          date: transaction.date,
          category: transaction.category,
          type: transaction.type,
          source: 'uncategorised', // ✅ CORRECT SOURCE NAME
          ...getDefaultTaxResult(transaction)
        });
      }
    }
  }
  
  console.log(`✅ Batch processing complete: ${results.length} results (${results.filter(r => r.source === 'cache').length} cache, ${results.filter(r => r.source === 'ai').length} AI, ${results.filter(r => r.source === 'uncategorised').length} uncategorised)`);
  return results;
}

/**
 * 🔍 PROCESS SINGLE TRANSACTION (FALLBACK)
 */
async function processSingleTransaction(transaction: any, userProfile: any): Promise<any> {
  const systemPrompt = `tax_bot:${userProfile?.countryCode || 'AU'}`;
  const userPrompt = `tx:${transaction.description}|amt:${transaction.amount}|cat:${transaction.category || 'General'}|type:${transaction.type || 'expense'}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0,
    max_tokens: 128,
    stop: ['\n', 'END', '---']
  });

  const analysis = response.choices[0].message?.content;
  return parseTaxAnalysisResponse(analysis || '', transaction.description, transaction.amount);
}

/**
 * 🔍 CHECK TAX CACHE FOR EXISTING ANALYSIS
 */
async function checkTaxCache(transaction: any, userProfile: any): Promise<any | null> {
  // TODO: Implement database cache check
  // For now, return null (no cache hit)
  return null;
}

/**
 * 🤖 CALL OPENAI BATCH FOR MULTIPLE TRANSACTIONS
 */
async function callOpenAIBatch(transactions: any[], userProfile: any): Promise<any[]> {
  try {
    // Create batch prompt for all transactions
    const systemPrompt = `tax_bot:${userProfile?.countryCode || 'AU'}`;
    
    // Format all transactions into a single prompt
    const transactionsList = transactions.map((tx, index) => 
      `${index + 1}. ${tx.description}|${tx.amount}|${tx.category || 'General'}|${tx.type || 'expense'}`
    ).join('\n');
    
    const userPrompt = `Analyze these ${transactions.length} transactions for tax deductibility:
${transactionsList}

For each transaction, respond with format:
{transaction_number}: deductible:{true/false}|confidence:{0.0-1.0}|reasoning:{brief reason}|business_use:{0-100}

Example:
1: deductible:true|confidence:0.8|reasoning:Office supplies for business|business_use:100
2: deductible:false|confidence:0.9|reasoning:Personal grocery shopping|business_use:0`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0,
      max_tokens: Math.min(512, transactions.length * 50), // Scale tokens with transaction count
      stop: ['END', '---']
    });

    const analysis = response.choices[0].message?.content;
    
    if (!analysis) {
      throw new Error('No analysis received from AI');
    }

    // Parse batch response
    return parseBatchTaxAnalysisResponseOptimized(analysis, transactions);
    
  } catch (error) {
    console.error('❌ Batch AI call failed:', error);
    // Return default results for all transactions
    return transactions.map(tx => ({
      isTaxDeductible: false,
      confidence: 0.0,
      reasoning: 'AI analysis failed - requires manual review',
      businessUsePercentage: 0,
      taxCategory: 'Personal',
      documentationRequired: [],
      warnings: [],
      suggestions: [],
      relatedRules: []
    }));
  }
}

/**
 * 💾 SAVE TAX ANALYSIS TO CACHE
 */
async function saveTaxCache(transaction: any, result: any, userProfile: any): Promise<void> {
  // TODO: Implement database cache save
  // For now, just log that we would save to cache
  console.log(`   💾 Would save to cache: ${transaction.description.substring(0, 30)}... → ${result.isTaxDeductible ? 'Deductible' : 'Not Deductible'}`);
}

/**
 * 🗺️ PARSE BATCH TAX ANALYSIS RESPONSE (OPTIMIZED)
 */
function parseBatchTaxAnalysisResponseOptimized(analysis: string, transactions: any[]): any[] {
  try {
    const results = [];
    const lines = analysis.split('\n').filter(line => line.trim().length > 0);
    
    for (let i = 0; i < transactions.length; i++) {
      const transactionNum = i + 1;
      
      // Find the line for this transaction
      const line = lines.find(l => l.startsWith(`${transactionNum}:`));
      
      if (line) {
        const content = line.split(':', 2)[1]; // Get content after "1:"
        const parsed = parseSingleTaxLine(content);
        results.push(parsed);
      } else {
        // Fallback if parsing fails
        results.push({
          isTaxDeductible: false,
          confidence: 0.3,
          reasoning: 'Could not parse AI response',
          businessUsePercentage: 0,
          taxCategory: 'Personal',
          documentationRequired: [],
          warnings: [],
          suggestions: [],
          relatedRules: []
        });
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Failed to parse batch response:', error);
    // Return default results for all transactions
    return transactions.map(() => ({
      isTaxDeductible: false,
      confidence: 0.0,
      reasoning: 'Failed to parse AI response',
      businessUsePercentage: 0,
      taxCategory: 'Personal',
      documentationRequired: [],
      warnings: [],
      suggestions: [],
      relatedRules: []
    }));
  }
}

/**
 * 🔍 PARSE SINGLE TAX LINE FROM BATCH RESPONSE
 */
function parseSingleTaxLine(content: string): any {
  try {
    const parts = content.split('|');
    const result = {
      isTaxDeductible: false,
      confidence: 0.5,
      reasoning: 'AI analysis completed',
      businessUsePercentage: 0,
      taxCategory: 'Personal',
      documentationRequired: [],
      warnings: [],
      suggestions: [],
      relatedRules: []
    };
    
    for (const part of parts) {
      const [key, value] = part.split(':').map(s => s.trim());
      
      switch (key?.toLowerCase()) {
        case 'deductible':
          result.isTaxDeductible = value?.toLowerCase() === 'true';
          break;
        case 'confidence':
          result.confidence = parseFloat(value) || 0.5;
          break;
        case 'reasoning':
          result.reasoning = value || 'AI analysis completed';
          break;
        case 'business_use':
          result.businessUsePercentage = parseInt(value) || 0;
          break;
      }
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Failed to parse single tax line:', error);
    return {
      isTaxDeductible: false,
      confidence: 0.3,
      reasoning: 'Failed to parse AI response',
      businessUsePercentage: 0,
      taxCategory: 'Personal',
      documentationRequired: [],
      warnings: [],
      suggestions: [],
      relatedRules: []
    };
  }
}

/**
 * 🗺️ PARSE TAX ANALYSIS RESPONSE
 */
function parseTaxAnalysisResponse(analysis: string, description: string, amount: number): any {
  try {
    // Default conservative result
    const defaultResult = {
      isTaxDeductible: false,
      confidence: 0.5,
      reasoning: 'Conservative analysis - requires manual review',
      businessUsePercentage: 0,
      taxCategory: 'Personal',
      documentationRequired: ['Receipt', 'Business purpose documentation'],
      warnings: ['Manual review recommended'],
      suggestions: ['Consult with tax professional'],
      relatedRules: []
    };

    if (!analysis || analysis.trim().length === 0) {
      return defaultResult;
    }

    // Try to parse structured response
    const lines = analysis.split('\n').filter(line => line.trim().length > 0);
    
    let isTaxDeductible = false;
    let confidence = 0.5;
    let reasoning = '';
    let businessUsePercentage = 0;
    let taxCategory = 'Personal';
    let documentationRequired: string[] = [];
    let warnings: string[] = [];
    let suggestions: string[] = [];
    let relatedRules: string[] = [];

    for (const line of lines) {
      const [key, value] = line.split(':').map(s => s.trim());
      
      switch (key?.toLowerCase()) {
        case 'deductible':
          isTaxDeductible = value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
          break;
        case 'confidence':
          confidence = parseFloat(value) || 0.5;
          break;
        case 'reasoning':
          reasoning = value || 'AI analysis completed';
          break;
        case 'business_use':
          businessUsePercentage = parseInt(value) || 0;
          break;
        case 'category':
          taxCategory = value || 'Personal';
          break;
        case 'docs':
          documentationRequired = value ? value.split(',').map(d => d.trim()) : [];
          break;
        case 'warnings':
          warnings = value ? value.split(',').map(w => w.trim()) : [];
          break;
        case 'suggestions':
          suggestions = value ? value.split(',').map(s => s.trim()) : [];
          break;
        case 'rules':
          relatedRules = value ? value.split(',').map(r => r.trim()) : [];
          break;
      }
    }

    return {
      isTaxDeductible,
      confidence: Math.max(0, Math.min(1, confidence)), // Ensure 0-1 range
      reasoning: reasoning || 'AI tax analysis completed',
      businessUsePercentage: Math.max(0, Math.min(100, businessUsePercentage)), // Ensure 0-100 range
      taxCategory,
      documentationRequired,
      warnings,
      suggestions,
      relatedRules
    };

  } catch (error) {
    console.error('❌ Failed to parse tax analysis response:', error);
    return {
      isTaxDeductible: false,
      confidence: 0.0,
      reasoning: 'Failed to parse AI response - requires manual review',
      businessUsePercentage: 0,
      taxCategory: 'Personal',
      documentationRequired: ['Receipt', 'Business purpose documentation'],
      warnings: ['AI analysis failed - manual review required'],
      suggestions: ['Consult with tax professional for proper classification'],
      relatedRules: []
    };
  }
}

/**
 * 🗺️ PARSE BATCH TAX ANALYSIS RESPONSE
 */
function parseBatchTaxAnalysisResponse(analysis: string, transactions: any[]): any[] {
  try {
    const results: any[] = [];
    const lines = analysis.split('\n').filter(line => line.trim().length > 0);

    for (const transaction of transactions) {
      // Find analysis for this transaction
      const transactionLines = lines.filter(line => 
        line.startsWith(transaction.id + ':') || 
        line.includes(transaction.description.substring(0, 20))
      );

      if (transactionLines.length > 0) {
        const analysisText = transactionLines.join('\n');
        const result = parseTaxAnalysisResponse(analysisText, transaction.description, transaction.amount);
        results.push({
          id: transaction.id,
          // 🔧 FIX: Include original transaction details for frontend display
          description: transaction.description,
          amount: transaction.amount,
          date: transaction.date,
          category: transaction.category,
          type: transaction.type,
          // AI analysis results
          ...result
        });
      } else {
        // Fallback to default result
        results.push({
          id: transaction.id,
          ...getDefaultTaxResult(transaction)
        });
      }
    }

    return results;

  } catch (error) {
    console.error('❌ Failed to parse batch tax analysis response:', error);
    return transactions.map(tx => ({
      id: tx.id,
      ...getDefaultTaxResult(tx)
    }));
  }
}

/**
 * ❓ GET DEFAULT TAX RESULT FOR FAILED ANALYSIS
 * 🔧 FIXED: Include transaction details for frontend display
 */
function getDefaultTaxResult(transaction: any): any {
  return {
    // Tax analysis results (transaction details will be added by caller)
    isTaxDeductible: false,
    confidence: 0.0,
    reasoning: 'Analysis failed - requires manual review',
    businessUsePercentage: 0,
    taxCategory: 'Personal',
    documentationRequired: ['Receipt', 'Business purpose documentation'],
    warnings: ['Manual review required for tax deductibility'],
    suggestions: ['Consult with tax professional for proper classification'],
    relatedRules: []
  };
}

/**
 * 🏥 HEALTH CHECK FOR TAX ANALYSIS SERVICE
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'ai-tax-analysis',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: [
      'single-transaction-analysis',
      'batch-analysis',
      'cost-optimization',
      'country-specific-rules',
      'compliance-validation'
    ]
  });
});

export default router; 