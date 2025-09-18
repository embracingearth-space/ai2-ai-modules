// Test the improved psychology prompts with GPT-5
const axios = require('axios');

async function testPsychologyFix() {
  try {
    console.log('🧠 TESTING IMPROVED PSYCHOLOGY PROMPTS');
    console.log('======================================\n');

    const AI_MODULES_BASE = 'http://localhost:3002';
    
    const psychologyContext = "I consider tolls and parking 100% business deductible, but Uber is NOT business deductible.";
    
    const tests = [
      { 
        name: "LINKT Test (Should be DEDUCTIBLE)", 
        description: "PAYMENT TO LINKT MELBOURNE", 
        amount: -3.50,
        expected: true 
      },
      { 
        name: "Uber Test (Should be NOT DEDUCTIBLE)", 
        description: "UBER TRIP TO CLIENT MEETING", 
        amount: -25.00,
        expected: false 
      },
      { 
        name: "Parking Test (Should be DEDUCTIBLE)", 
        description: "WILSON PARKING MONTHLY", 
        amount: -180.00,
        expected: true 
      }
    ];

    const userProfile = {
      countryCode: 'AU',
      businessType: 'INDIVIDUAL',
      occupation: 'Technology',
      industry: 'Technology',
      aiContextInput: psychologyContext
    };

    console.log(`🎯 Testing with enhanced psychology prompts...`);
    console.log(`🧠 Context: "${psychologyContext}"`);
    console.log('='.repeat(60));

    for (const test of tests) {
      console.log(`\n💰 ${test.name}:`);
      console.log(`   Transaction: ${test.description} ($${Math.abs(test.amount)})`);
      console.log(`   Expected: ${test.expected ? 'DEDUCTIBLE' : 'NOT DEDUCTIBLE'}`);
      
      try {
        const response = await axios.post(`${AI_MODULES_BASE}/api/ai-tax/analyze-transaction`, {
          description: test.description,
          amount: test.amount,
          date: new Date().toISOString(),
          category: 'General',
          userProfile: userProfile,
          type: 'expense'
        });
        
        const analysis = response.data?.analysis;
        
        if (analysis) {
          const correct = analysis.isTaxDeductible === test.expected;
          
          console.log(`   📊 GPT-5 Result: ${analysis.isTaxDeductible ? 'DEDUCTIBLE' : 'NOT DEDUCTIBLE'} | ${analysis.businessUsePercentage}%`);
          console.log(`   🎯 Psychology Rule: ${correct ? '✅ CORRECT' : '❌ WRONG'}`);
          console.log(`   🏆 Confidence: ${analysis.confidence}`);
          console.log(`   💭 Reasoning: "${analysis.reasoning}"`);
          
          if (correct) {
            console.log(`   🎉 SUCCESS: GPT-5 followed psychology exactly!`);
          } else {
            console.log(`   ⚠️ FAILED: Psychology rule not enforced`);
          }
        } else {
          console.log(`   ❌ No analysis returned`);
        }
        
      } catch (error) {
        console.log(`   ❌ Test failed: ${error.response?.data?.error || error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n🎯 PSYCHOLOGY ENFORCEMENT SUMMARY:');
    console.log('=================================');
    console.log('✅ If all tests show CORRECT → Psychology prompts working');
    console.log('❌ If tests show WRONG → Need stronger prompt enforcement');
    console.log('🔧 Next: Fine-tune prompts based on results above');

  } catch (error) {
    console.error('❌ Psychology test failed:', error);
  }
}

testPsychologyFix();

