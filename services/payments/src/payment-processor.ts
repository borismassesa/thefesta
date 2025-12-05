import { africasTalkingPayments } from './africas-talking';
import { prisma } from '@thefesta/db';
import { z } from 'zod';

// Validation schemas
const PaymentMethodSchema = z.enum(['MPESA', 'AIRTEL_MONEY', 'TIGO_PESA', 'HALO_PESA']);
const PaymentStatusSchema = z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED']);

export interface ProcessPaymentRequest {
  invoiceId: string;
  phoneNumber: string;
  amount: number;
  method: 'MPESA' | 'AIRTEL_MONEY' | 'TIGO_PESA' | 'HALO_PESA';
  description: string;
  metadata?: Record<string, string>;
}

export interface ProcessPayoutRequest {
  vendorId: string;
  amount: number;
  description: string;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  transactionId?: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  message?: string;
  error?: string;
}

export interface PayoutResult {
  success: boolean;
  payoutId?: string;
  transactionId?: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  message?: string;
  error?: string;
}

class PaymentProcessor {
  /**
   * Process payment for an invoice
   */
  async processPayment(request: ProcessPaymentRequest): Promise<PaymentResult> {
    const validatedMethod = PaymentMethodSchema.parse(request.method);
    
    try {
      // Get invoice details
      const invoice = await prisma.invoice.findUnique({
        where: { id: request.invoiceId },
        include: {
          booking: {
            include: {
              event: true,
              vendor: true,
            },
          },
        },
      });

      if (!invoice) {
        return {
          success: false,
          status: 'FAILED',
          error: 'Invoice not found',
        };
      }

      if (invoice.status !== 'PENDING') {
        return {
          success: false,
          status: 'FAILED',
          error: 'Invoice is not pending payment',
        };
      }

      // Validate amount
      if (invoice.amount !== request.amount) {
        return {
          success: false,
          status: 'FAILED',
          error: 'Amount mismatch',
        };
      }

      // Create payment record
      const payment = await prisma.payment.create({
        data: {
          invoiceId: request.invoiceId,
          amount: request.amount,
          method: validatedMethod,
          providerRef: `pending_${Date.now()}`,
          status: 'PENDING',
          metadata: {
            description: request.description,
            ...request.metadata,
          },
        },
      });

      // Initiate payment with Africa's Talking
      const currency = 'TZS'; // Default to TZS for Tanzania
      const paymentResponse = await africasTalkingPayments.initiateSTKPush({
        phoneNumber: request.phoneNumber,
        amount: request.amount,
        currency,
        description: request.description,
        metadata: {
          paymentId: payment.id,
          invoiceId: request.invoiceId,
          bookingId: invoice.booking.id,
          ...request.metadata,
        },
      });

      if (paymentResponse.success && paymentResponse.transactionId) {
        // Update payment with transaction ID
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            providerRef: paymentResponse.transactionId,
            status: 'PENDING',
          },
        });

        return {
          success: true,
          paymentId: payment.id,
          transactionId: paymentResponse.transactionId,
          status: 'PENDING',
          message: paymentResponse.message,
        };
      } else {
        // Update payment as failed
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            metadata: {
              ...payment.metadata,
              error: paymentResponse.error,
            },
          },
        });

        return {
          success: false,
          paymentId: payment.id,
          status: 'FAILED',
          error: paymentResponse.error,
        };
      }
    } catch (error) {
      console.error('Payment processing error:', error);
      return {
        success: false,
        status: 'FAILED',
        error: `Payment processing failed: ${error}`,
      };
    }
  }

  /**
   * Process payout to vendor
   */
  async processPayout(request: ProcessPayoutRequest): Promise<PayoutResult> {
    try {
      // Get vendor details
      const vendor = await prisma.vendor.findUnique({
        where: { id: request.vendorId },
        include: { user: true },
      });

      if (!vendor) {
        return {
          success: false,
          status: 'FAILED',
          error: 'Vendor not found',
        };
      }

      if (!vendor.user.phone) {
        return {
          success: false,
          status: 'FAILED',
          error: 'Vendor phone number not found',
        };
      }

      // Create payout record (you might want to create a separate Payout model)
      const payout = await prisma.payment.create({
        data: {
          invoiceId: 'payout', // Special identifier for payouts
          amount: request.amount,
          method: 'MPESA', // Default to M-Pesa for payouts
          providerRef: `payout_${Date.now()}`,
          status: 'PENDING',
          metadata: {
            type: 'payout',
            vendorId: request.vendorId,
            description: request.description,
            ...request.metadata,
          },
        },
      });

      // Initiate payout with Africa's Talking
      const payoutResponse = await africasTalkingPayments.initiatePayout({
        phoneNumber: vendor.user.phone,
        amount: request.amount,
        currency: 'TZS',
        description: request.description,
        metadata: {
          payoutId: payout.id,
          vendorId: request.vendorId,
          ...request.metadata,
        },
      });

      if (payoutResponse.success && payoutResponse.transactionId) {
        // Update payout with transaction ID
        await prisma.payment.update({
          where: { id: payout.id },
          data: {
            providerRef: payoutResponse.transactionId,
            status: 'PENDING',
          },
        });

        return {
          success: true,
          payoutId: payout.id,
          transactionId: payoutResponse.transactionId,
          status: 'PENDING',
          message: payoutResponse.message,
        };
      } else {
        // Update payout as failed
        await prisma.payment.update({
          where: { id: payout.id },
          data: {
            status: 'FAILED',
            metadata: {
              ...payout.metadata,
              error: payoutResponse.error,
            },
          },
        });

        return {
          success: false,
          payoutId: payout.id,
          status: 'FAILED',
          error: payoutResponse.error,
        };
      }
    } catch (error) {
      console.error('Payout processing error:', error);
      return {
        success: false,
        status: 'FAILED',
        error: `Payout processing failed: ${error}`,
      };
    }
  }

  /**
   * Handle payment webhook from Africa's Talking
   */
  async handlePaymentWebhook(payload: any, signature: string): Promise<void> {
    try {
      // Process webhook
      const paymentStatus = await africasTalkingPayments.processWebhook(payload, signature);
      
      if (!paymentStatus) {
        console.error('Failed to process webhook');
        return;
      }

      // Find payment by transaction ID
      const payment = await prisma.payment.findFirst({
        where: { providerRef: paymentStatus.transactionId },
        include: {
          invoice: {
            include: {
              booking: {
                include: {
                  event: true,
                  vendor: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        console.error(`Payment not found for transaction: ${paymentStatus.transactionId}`);
        return;
      }

      // Update payment status
      const newStatus = this.mapPaymentStatus(paymentStatus.status);
      
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          metadata: {
            ...payment.metadata,
            webhookData: paymentStatus,
            processedAt: new Date().toISOString(),
          },
        },
      });

      // If payment succeeded, update invoice status
      if (newStatus === 'SUCCEEDED') {
        await prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: { status: 'PAID' },
        });

        // Update booking status if this was a deposit payment
        if (payment.invoice.type === 'deposit') {
          await prisma.booking.update({
            where: { id: payment.invoice.bookingId },
            data: { status: 'DEPOSIT_PAID' },
          });
        }

        // Send confirmation SMS
        await this.sendPaymentConfirmation(payment);
      }

      console.log(`Payment webhook processed: ${paymentStatus.transactionId} - ${newStatus}`);
    } catch (error) {
      console.error('Payment webhook processing error:', error);
      throw error;
    }
  }

  /**
   * Check payment status and update database
   */
  async checkPaymentStatus(paymentId: string): Promise<PaymentResult> {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      if (!payment) {
        return {
          success: false,
          status: 'FAILED',
          error: 'Payment not found',
        };
      }

      if (payment.status === 'SUCCEEDED' || payment.status === 'FAILED') {
        return {
          success: payment.status === 'SUCCEEDED',
          paymentId: payment.id,
          transactionId: payment.providerRef,
          status: payment.status,
        };
      }

      // Check status with Africa's Talking
      const paymentStatus = await africasTalkingPayments.checkPaymentStatus(payment.providerRef);
      
      const newStatus = this.mapPaymentStatus(paymentStatus.status);
      
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          metadata: {
            ...payment.metadata,
            lastChecked: new Date().toISOString(),
            statusData: paymentStatus,
          },
        },
      });

      return {
        success: newStatus === 'SUCCEEDED',
        paymentId: payment.id,
        transactionId: payment.providerRef,
        status: newStatus,
      };
    } catch (error) {
      console.error('Payment status check error:', error);
      return {
        success: false,
        status: 'FAILED',
        error: `Status check failed: ${error}`,
      };
    }
  }

  /**
   * Get payment history for a user or vendor
   */
  async getPaymentHistory(
    userId?: string,
    vendorId?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<any[]> {
    try {
      const where: any = {};
      
      if (userId) {
        where.invoice = {
          booking: {
            event: {
              ownerId: userId,
            },
          },
        };
      }
      
      if (vendorId) {
        where.invoice = {
          booking: {
            vendorId: vendorId,
          },
        };
      }

      const payments = await prisma.payment.findMany({
        where,
        include: {
          invoice: {
            include: {
              booking: {
                include: {
                  event: true,
                  vendor: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      return payments;
    } catch (error) {
      console.error('Payment history error:', error);
      throw new Error(`Failed to fetch payment history: ${error}`);
    }
  }

  // Private helper methods
  private mapPaymentStatus(status: string): 'PENDING' | 'SUCCEEDED' | 'FAILED' {
    const statusMap: Record<string, 'PENDING' | 'SUCCEEDED' | 'FAILED'> = {
      'pending': 'PENDING',
      'completed': 'SUCCEEDED',
      'failed': 'FAILED',
      'cancelled': 'FAILED',
    };

    return statusMap[status] || 'FAILED';
  }

  private async sendPaymentConfirmation(payment: any): Promise<void> {
    try {
      // This would integrate with your SMS service
      console.log(`Payment confirmation sent for payment: ${payment.id}`);
      
      // You could send SMS to the customer here
      // await smsService.sendPaymentConfirmation(
      //   customerPhone,
      //   payment.amount,
      //   payment.invoice.booking.vendor.name
      // );
    } catch (error) {
      console.error('Error sending payment confirmation:', error);
    }
  }
}

// Export singleton instance
export const paymentProcessor = new PaymentProcessor();
