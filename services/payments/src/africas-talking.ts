import axios from 'axios';
import crypto from 'crypto';
import { z } from 'zod';

// Validation schemas
const PhoneSchema = z.string().regex(/^\+255[67]\d{8}$/, 'Invalid Tanzanian phone number');
const AmountSchema = z.number().positive('Amount must be positive');
const CurrencySchema = z.enum(['TZS', 'KES', 'UGX']);

export interface PaymentConfig {
  apiKey: string;
  username: string;
  environment: 'sandbox' | 'production';
  baseUrl?: string;
}

export interface PaymentRequest {
  phoneNumber: string;
  amount: number;
  currency: 'TZS' | 'KES' | 'UGX';
  description: string;
  metadata?: Record<string, string>;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  status: 'pending' | 'completed' | 'failed';
  message?: string;
  error?: string;
}

export interface PaymentStatus {
  transactionId: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  phoneNumber: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, string>;
}

export interface PayoutRequest {
  phoneNumber: string;
  amount: number;
  currency: 'TZS' | 'KES' | 'UGX';
  description: string;
  metadata?: Record<string, string>;
}

export interface PayoutResponse {
  success: boolean;
  transactionId?: string;
  status: 'pending' | 'completed' | 'failed';
  message?: string;
  error?: string;
}

class AfricasTalkingPaymentService {
  private config: PaymentConfig;
  private baseUrl: string;

  constructor() {
    this.config = {
      apiKey: process.env.AFRICASTALKING_API_KEY!,
      username: process.env.AFRICASTALKING_USERNAME!,
      environment: (process.env.AFRICASTALKING_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
      baseUrl: process.env.AFRICASTALKING_BASE_URL,
    };

    // Set base URL based on environment
    if (this.config.baseUrl) {
      this.baseUrl = this.config.baseUrl;
    } else {
      this.baseUrl = this.config.environment === 'production' 
        ? 'https://payments.africastalking.com'
        : 'https://payments.sandbox.africastalking.com';
    }
  }

  /**
   * Initiate STK Push payment (M-Pesa, Airtel Money, Tigo Pesa)
   */
  async initiateSTKPush(request: PaymentRequest): Promise<PaymentResponse> {
    const validatedPhone = PhoneSchema.parse(request.phoneNumber);
    const validatedAmount = AmountSchema.parse(request.amount);
    const validatedCurrency = CurrencySchema.parse(request.currency);

    try {
      const payload = {
        username: this.config.username,
        productName: this.getProductName(validatedCurrency),
        phoneNumber: validatedPhone,
        amount: validatedAmount,
        currencyCode: validatedCurrency,
        metadata: {
          description: request.description,
          ...request.metadata,
        },
      };

      const response = await this.makeRequest('/mobile/checkout/request', payload);

      if (response.status === 'PendingConfirmation') {
        return {
          success: true,
          transactionId: response.transactionId,
          status: 'pending',
          message: 'Payment request sent successfully. Please check your phone.',
        };
      } else {
        return {
          success: false,
          status: 'failed',
          error: response.description || 'Payment request failed',
        };
      }
    } catch (error) {
      console.error('STK Push error:', error);
      return {
        success: false,
        status: 'failed',
        error: `Payment request failed: ${error}`,
      };
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentStatus> {
    try {
      const payload = {
        username: this.config.username,
        transactionId: transactionId,
      };

      const response = await this.makeRequest('/query/transaction/find', payload);

      return {
        transactionId: response.transactionId,
        status: this.mapStatus(response.status),
        amount: parseFloat(response.amount),
        currency: response.currencyCode,
        phoneNumber: response.phoneNumber,
        description: response.description,
        timestamp: new Date(response.updatedAt),
        metadata: response.metadata,
      };
    } catch (error) {
      console.error('Payment status check error:', error);
      throw new Error(`Failed to check payment status: ${error}`);
    }
  }

  /**
   * Initiate mobile money payout to vendor
   */
  async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
    const validatedPhone = PhoneSchema.parse(request.phoneNumber);
    const validatedAmount = AmountSchema.parse(request.amount);
    const validatedCurrency = CurrencySchema.parse(request.currency);

    try {
      const payload = {
        username: this.config.username,
        productName: this.getProductName(validatedCurrency),
        recipients: [
          {
            phoneNumber: validatedPhone,
            amount: validatedAmount,
            currencyCode: validatedCurrency,
            metadata: {
              description: request.description,
              ...request.metadata,
            },
          },
        ],
      };

      const response = await this.makeRequest('/mobile/b2c/request', payload);

      if (response.entries && response.entries.length > 0) {
        const entry = response.entries[0];
        
        return {
          success: entry.status === 'Queued',
          transactionId: entry.transactionId,
          status: entry.status === 'Queued' ? 'pending' : 'failed',
          message: entry.status === 'Queued' 
            ? 'Payout initiated successfully'
            : entry.errorMessage || 'Payout failed',
        };
      } else {
        return {
          success: false,
          status: 'failed',
          error: 'No payout response received',
        };
      }
    } catch (error) {
      console.error('Payout error:', error);
      return {
        success: false,
        status: 'failed',
        error: `Payout failed: ${error}`,
      };
    }
  }

  /**
   * Check payout status
   */
  async checkPayoutStatus(transactionId: string): Promise<PaymentStatus> {
    try {
      const payload = {
        username: this.config.username,
        transactionId: transactionId,
      };

      const response = await this.makeRequest('/query/transaction/find', payload);

      return {
        transactionId: response.transactionId,
        status: this.mapStatus(response.status),
        amount: parseFloat(response.amount),
        currency: response.currencyCode,
        phoneNumber: response.phoneNumber,
        description: response.description,
        timestamp: new Date(response.updatedAt),
        metadata: response.metadata,
      };
    } catch (error) {
      console.error('Payout status check error:', error);
      throw new Error(`Failed to check payout status: ${error}`);
    }
  }

  /**
   * Process webhook from Africa's Talking
   */
  async processWebhook(payload: any, signature: string): Promise<PaymentStatus | null> {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload, signature)) {
        throw new Error('Invalid webhook signature');
      }

      // Extract transaction details from webhook
      const transaction = payload.transaction;
      
      return {
        transactionId: transaction.transactionId,
        status: this.mapStatus(transaction.status),
        amount: parseFloat(transaction.amount),
        currency: transaction.currencyCode,
        phoneNumber: transaction.phoneNumber,
        description: transaction.description,
        timestamp: new Date(transaction.updatedAt),
        metadata: transaction.metadata,
      };
    } catch (error) {
      console.error('Webhook processing error:', error);
      throw new Error(`Webhook processing failed: ${error}`);
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    phoneNumber?: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 50
  ): Promise<PaymentStatus[]> {
    try {
      const payload: any = {
        username: this.config.username,
        limit: limit,
      };

      if (phoneNumber) {
        payload.phoneNumber = PhoneSchema.parse(phoneNumber);
      }
      
      if (startDate) {
        payload.startDate = startDate.toISOString().split('T')[0];
      }
      
      if (endDate) {
        payload.endDate = endDate.toISOString().split('T')[0];
      }

      const response = await this.makeRequest('/query/transaction/fetch', payload);

      return response.transactions.map((tx: any) => ({
        transactionId: tx.transactionId,
        status: this.mapStatus(tx.status),
        amount: parseFloat(tx.amount),
        currency: tx.currencyCode,
        phoneNumber: tx.phoneNumber,
        description: tx.description,
        timestamp: new Date(tx.updatedAt),
        metadata: tx.metadata,
      }));
    } catch (error) {
      console.error('Transaction history error:', error);
      throw new Error(`Failed to fetch transaction history: ${error}`);
    }
  }

  /**
   * Validate payment amount for different currencies
   */
  validateAmount(amount: number, currency: string): boolean {
    const limits = {
      TZS: { min: 100, max: 10000000 }, // 100 TZS to 10M TZS
      KES: { min: 1, max: 100000 },    // 1 KES to 100K KES
      UGX: { min: 100, max: 10000000 }, // 100 UGX to 10M UGX
    };

    const limit = limits[currency as keyof typeof limits];
    if (!limit) return false;

    return amount >= limit.min && amount <= limit.max;
  }

  /**
   * Get supported payment methods for a phone number
   */
  async getSupportedPaymentMethods(phoneNumber: string): Promise<string[]> {
    const validatedPhone = PhoneSchema.parse(phoneNumber);
    
    // Extract provider from phone number
    const provider = this.getProviderFromPhoneNumber(validatedPhone);
    
    switch (provider) {
      case 'VODACOM':
        return ['MPESA'];
      case 'AIRTEL':
        return ['AIRTEL_MONEY'];
      case 'TIGO':
        return ['TIGO_PESA'];
      case 'HALOTEL':
        return ['HALO_PESA'];
      default:
        return ['MPESA', 'AIRTEL_MONEY', 'TIGO_PESA'];
    }
  }

  // Private helper methods
  private async makeRequest(endpoint: string, payload: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': this.config.apiKey,
        'Accept': 'application/json',
      },
      timeout: 30000, // 30 seconds timeout
    });

    if (response.status !== 200) {
      throw new Error(`API request failed with status: ${response.status}`);
    }

    return response.data;
  }

  private getProductName(currency: string): string {
    // Map currency to Africa's Talking product name
    const products = {
      TZS: process.env.AFRICASTALKING_PRODUCT_NAME_TZS || 'TheFestaTZ',
      KES: process.env.AFRICASTALKING_PRODUCT_NAME_KES || 'TheFestaKE',
      UGX: process.env.AFRICASTALKING_PRODUCT_NAME_UGX || 'TheFestaUG',
    };

    return products[currency as keyof typeof products] || products.TZS;
  }

  private mapStatus(status: string): 'pending' | 'completed' | 'failed' | 'cancelled' {
    const statusMap: Record<string, 'pending' | 'completed' | 'failed' | 'cancelled'> = {
      'PendingConfirmation': 'pending',
      'PendingValidation': 'pending',
      'Queued': 'pending',
      'Sent': 'pending',
      'Success': 'completed',
      'Completed': 'completed',
      'Failed': 'failed',
      'Cancelled': 'cancelled',
      'Reversed': 'failed',
    };

    return statusMap[status] || 'failed';
  }

  private verifyWebhookSignature(payload: any, signature: string): boolean {
    // In production, implement proper webhook signature verification
    // This is a simplified version
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.config.apiKey)
        .update(JSON.stringify(payload))
        .digest('hex');

      return signature === expectedSignature;
    } catch {
      return false;
    }
  }

  private getProviderFromPhoneNumber(phoneNumber: string): string {
    // Extract provider based on phone number prefix
    const prefixes = {
      '+25574': 'VODACOM',
      '+25575': 'VODACOM',
      '+25576': 'VODACOM',
      '+25578': 'AIRTEL',
      '+25568': 'AIRTEL',
      '+25569': 'AIRTEL',
      '+25571': 'TIGO',
      '+25572': 'TIGO',
      '+25573': 'TIGO',
      '+25562': 'HALOTEL',
      '+25563': 'HALOTEL',
      '+25564': 'HALOTEL',
      '+25565': 'HALOTEL',
    };

    for (const [prefix, provider] of Object.entries(prefixes)) {
      if (phoneNumber.startsWith(prefix)) {
        return provider;
      }
    }

    return 'UNKNOWN';
  }
}

// Export singleton instance
export const africasTalkingPayments = new AfricasTalkingPaymentService();
