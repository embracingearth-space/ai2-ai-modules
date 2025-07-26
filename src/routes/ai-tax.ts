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

const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 📊 LOGGING UTILITIES FOR OPENAI CALLS
const logOpenAICall = async (prompt: any, response: any, metadata: any = {}) => {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      metadata,
      prompt,
      response: {
        content: response?.choices?.[0]?.message?.content || response,
        usage: response?.usage || null,
        model: response?.model || metadata.model
      }
    };
    
    const logDir = path.join(process.cwd(), '..', 'logs');
    const logFile = path.join(logDir, `openai-tax-calls-${timestamp.split('T')[0]}.json`);
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Append to log file
    const logData = JSON.stringify(logEntry, null, 2) + ',\n';
    fs.appendFileSync(logFile, logData);
    
    console.log(`📊 OpenAI call logged to: ${logFile}`);
  } catch (error) {
    console.error('❌ Failed to log OpenAI call:', error);
  }
};

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

         // 🎯 TOKEN-OPTIMIZED PROMPT FOR SINGLE ANALYSIS
     const systemPrompt = `Tax expert ${userProfile?.countryCode || 'AU'}. Business: ${userProfile?.businessType || 'INDIVIDUAL'}, ${userProfile?.occupation || 'General'}. ${userProfile?.aiPsychology ? `Context: ${userProfile.aiPsychology}. ` : ''}Format: deductible:[0/1] confidence:[0.0-1.0] reasoning:[brief reason] business_use:[0-100]`;
    
         const userPrompt = `${description}|$${Math.abs(amount)}|${category || 'General'}`;

    console.log('📤 Sending to OpenAI:', { systemPrompt, userPrompt });

         const response = await openai.chat.completions.create({
       model: 'gpt-4o-mini', // Cost-optimized GPT-4 model
       messages: [
         { role: 'system', content: systemPrompt },
         { role: 'user', content: userPrompt }
       ],
       temperature: 0,
       max_tokens: 150, // Optimized for compressed format
       stop: ['END', '---']
     });

    const analysis = response.choices[0].message?.content;
    
    // 📊 LOG THE OPENAI CALL
    await logOpenAICall(
      { systemPrompt, userPrompt },
      response,
      { 
        endpoint: '/analyze-transaction',
        transactionId: req.body.id,
                 description: description.substring(0, 50),
         amount,
         model: 'gpt-4o-mini'
      }
    );
    
    console.log('📥 OpenAI Response:', analysis);
    
    if (!analysis) {
      throw new Error('No analysis received from AI');
    }

    // Parse AI response
    const result = parseTaxAnalysisResponse(analysis, description, amount);

    console.log('✅ Tax analysis completed:', {
      isTaxDeductible: result.isTaxDeductible,
      confidence: result.confidence,
      reasoning: result.reasoning.substring(0, 100) + '...',
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
         // TOKEN-OPTIMIZED batch prompt for cost efficiency
     const systemPrompt = `Tax expert ${userProfile?.countryCode || 'AU'}. Business: ${userProfile?.businessType || 'INDIVIDUAL'}, ${userProfile?.occupation || 'General'}. ${userProfile?.aiPsychology ? `Context: ${userProfile.aiPsychology}. ` : ''}Format: {n}: d:{0/1}|c:{0.0-1.0}|r:{reason}|b:{0-100}`;
    
         // TOKEN-OPTIMIZED transaction list
     const transactionsList = transactions.map((tx, index) => 
       `${index + 1}:${tx.description}|$${Math.abs(tx.amount)}|${tx.category || 'General'}`
     ).join('\n');
     
     const userPrompt = `${transactionsList}`;

         console.log('📤 Sending OPTIMIZED BATCH to OpenAI:', { 
       systemPrompt, 
       userPrompt: userPrompt.substring(0, 200) + '...',
       transactionCount: transactions.length,
       model: 'gpt-4o-mini'
     });

         const response = await openai.chat.completions.create({
       model: 'gpt-4o-mini', // Cost-optimized GPT-4 model
       messages: [
         { role: 'system', content: systemPrompt },
         { role: 'user', content: userPrompt }
       ],
       temperature: 0,
       max_tokens: Math.min(800, transactions.length * 40), // Optimized for compressed format
       stop: ['END', '---']
     });

    const analysis = response.choices[0].message?.content;
    
    // 📊 LOG THE BATCH OPENAI CALL
    await logOpenAICall(
      { systemPrompt, userPrompt },
      response,
      { 
        endpoint: '/batch-analyze',
        transactionCount: transactions.length,
                 transactionIds: transactions.map(t => t.id),
         model: 'gpt-4o-mini'
      }
    );
    
    console.log('📥 OpenAI BATCH Response:', analysis?.substring(0, 500) + '...');
    
    if (!analysis) {
      throw new Error('No analysis received from AI');
    }

    // Parse batch response
    return parseBatchTaxAnalysisResponseOptimized(analysis, transactions);
    
  } catch (error) {
    console.error('❌ Batch AI call failed:', error);
    
    // 📊 LOG THE ERROR
    await logOpenAICall(
      { error: 'Batch AI call failed' },
      { error: error.message },
      { 
        endpoint: '/batch-analyze',
        transactionCount: transactions.length,
        failed: true
      }
    );
    
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
 * 🗺️ PARSE BATCH TAX ANALYSIS RESPONSE (TOKEN-OPTIMIZED)
 * Handles compressed format: {n}: d:{0/1}|c:{0.0-1.0}|r:{reason}|b:{0-100}
 */
function parseBatchTaxAnalysisResponseOptimized(analysis: string, transactions: any[]): any[] {
  try {
    console.log('🔍 Parsing OPTIMIZED batch response:', analysis?.substring(0, 500) + '...');
    
    const results = [];
    const lines = analysis.split('\n').filter(line => line.trim().length > 0);
    
    for (let i = 0; i < transactions.length; i++) {
      const transactionNum = i + 1;
      
      // Find the line for this transaction - more flexible matching
      let line = lines.find(l => l.startsWith(`${transactionNum}:`));
      if (!line) {
        // Try alternative formats GPT might use
        line = lines.find(l => l.includes(`${transactionNum}:`)) || 
               lines.find(l => l.match(new RegExp(`^\\s*${transactionNum}\\s*:`)));
      }
      
      if (line) {
        console.log(`🔍 Found line for transaction ${transactionNum}:`, line);
        const content = line.substring(line.indexOf(':') + 1).trim(); // Get content after ":"
        const parsed = parseOptimizedTaxLine(content);
        results.push(parsed);
      } else {
        console.log(`⚠️ No analysis found for transaction ${transactionNum}`);
        results.push(getDefaultSingleResult());
      }
    }
    
    console.log(`✅ Parsed ${results.length} results from optimized format`);
    return results;
    
  } catch (error) {
    console.error('❌ Failed to parse optimized batch response:', error);
    console.error('❌ Response content:', analysis);
    // Return default results for all transactions
    return transactions.map(() => getDefaultSingleResult());
  }
}

/**
 * 🔍 PARSE OPTIMIZED TAX LINE (TOKEN-EFFICIENT FORMAT)
 * Format: d:{0/1}|c:{0.0-1.0}|r:{reason}|b:{0-100}
 */
function parseOptimizedTaxLine(content: string): any {
  try {
    console.log('🔍 Parsing optimized tax line:', content);
    
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
    
    // Split by | to get different parts
    const parts = content.split('|');
    
    for (const part of parts) {
      const trimmedPart = part.trim();
      const colonIndex = trimmedPart.indexOf(':');
      
      if (colonIndex === -1) continue;
      
      const key = trimmedPart.substring(0, colonIndex).trim().toLowerCase();
      const value = trimmedPart.substring(colonIndex + 1).trim();
      
      console.log(`   🔑 Parsing: ${key} = ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
      
      switch (key) {
        case 'd':
        case 'deductible':
          result.isTaxDeductible = value === '1' || value?.toLowerCase() === 'true';
          break;
        case 'c':
        case 'confidence':
          const confValue = parseFloat(value);
          result.confidence = isNaN(confValue) ? 0.5 : Math.max(0, Math.min(1, confValue));
          break;
        case 'r':
        case 'reasoning':
          result.reasoning = value || 'AI analysis completed';
          break;
        case 'b':
        case 'business_use':
          const businessValue = parseInt(value);
          result.businessUsePercentage = isNaN(businessValue) ? 0 : Math.max(0, Math.min(100, businessValue));
          break;
      }
    }
    
    console.log('✅ Successfully parsed optimized tax line:', {
      isTaxDeductible: result.isTaxDeductible,
      confidence: result.confidence,
      reasoning: result.reasoning.substring(0, 100) + (result.reasoning.length > 100 ? '...' : ''),
      businessUse: result.businessUsePercentage
    });
    
    return result;
    
  } catch (error) {
    console.error('❌ Failed to parse optimized tax line:', error);
    console.error('❌ Content that failed:', content);
    return getDefaultSingleResult();
  }
}

/**
 * 🔧 GET DEFAULT SINGLE RESULT
 */
function getDefaultSingleResult(): any {
  return {
    isTaxDeductible: false,
    confidence: 0.3,
    reasoning: 'Could not parse AI response - manual review required',
    businessUsePercentage: 0,
    taxCategory: 'Personal',
    documentationRequired: [],
    warnings: [],
    suggestions: [],
    relatedRules: []
  };
}

/**
 * 🔍 PARSE SINGLE TAX LINE FROM BATCH RESPONSE
 * FIXED: Enhanced parsing to handle the actual OpenAI response format
 */
function parseSingleTaxLine(content: string): any {
  try {
    console.log('🔍 Parsing tax line content:', content);
    
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
    
    // Split by | to get different parts
    const parts = content.split('|');
    
    for (const part of parts) {
      const trimmedPart = part.trim();
      const colonIndex = trimmedPart.indexOf(':');
      
      if (colonIndex === -1) continue;
      
      const key = trimmedPart.substring(0, colonIndex).trim().toLowerCase();
      const value = trimmedPart.substring(colonIndex + 1).trim();
      
      console.log(`   🔑 Parsing: ${key} = ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
      
      switch (key) {
        case 'deductible':
          result.isTaxDeductible = value?.toLowerCase() === 'true';
          break;
        case 'confidence':
          const confValue = parseFloat(value);
          result.confidence = isNaN(confValue) ? 0.5 : Math.max(0, Math.min(1, confValue));
          break;
        case 'reasoning':
          result.reasoning = value || 'AI analysis completed';
          break;
        case 'business_use':
          const businessValue = parseInt(value);
          result.businessUsePercentage = isNaN(businessValue) ? 0 : Math.max(0, Math.min(100, businessValue));
          break;
        case 'category':
          result.taxCategory = value || 'Personal';
          break;
      }
    }
    
    console.log('✅ Successfully parsed tax line:', {
      isTaxDeductible: result.isTaxDeductible,
      confidence: result.confidence,
      reasoning: result.reasoning.substring(0, 100) + (result.reasoning.length > 100 ? '...' : ''),
      businessUse: result.businessUsePercentage,
      taxCategory: result.taxCategory
    });
    
    return result;
    
  } catch (error) {
    console.error('❌ Failed to parse single tax line:', error);
    console.error('❌ Content that failed:', content);
    return {
      isTaxDeductible: false,
      confidence: 0.3,
      reasoning: 'Failed to parse AI response - requires manual review',
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