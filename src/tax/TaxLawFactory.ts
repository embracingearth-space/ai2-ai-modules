export interface TaxLaw {
  analyzeTaxDeductibility(
    description: string,
    amount: number,
    businessType: string,
    category?: string
  ): Promise<{
    isTaxDeductible: boolean;
    reasoning: string;
    confidence: number;
    suggestions: string[];
    atoReference: string;
    documentationRequired: string[];
    partialDeduction: boolean;
    businessUsePercentage: number;
  }>;

  classifyIncome(
    description: string,
    amount: number
  ): Promise<{
    isIncome: boolean;
    reasoning: string;
    confidence: number;
  }>;

  getBusinessTypes(): string[];
  getDeductionRules(): any[];
  getOccupationSpecificRules(occupation: string): any[];
}

export class TaxLawFactory {
  static getTaxLaw(countryCode: string): TaxLaw {
    // Simple implementation for now
    return {
      async analyzeTaxDeductibility(description, amount, businessType, category) {
        return {
          isTaxDeductible: false,
          reasoning: 'Basic tax analysis',
          confidence: 0.5,
          suggestions: ['Consult a tax professional'],
          atoReference: '',
          documentationRequired: [],
          partialDeduction: false,
          businessUsePercentage: 0
        };
      },
      async classifyIncome(description, amount) {
        return {
          isIncome: amount > 0,
          reasoning: 'Basic income classification',
          confidence: 0.5
        };
      },
      getBusinessTypes() {
        return ['Individual', 'Sole Trader', 'Partnership', 'Company', 'Trust'];
      },
      getDeductionRules() {
        return [];
      },
      getOccupationSpecificRules(occupation: string) {
        return [];
      }
    };
  }
} 