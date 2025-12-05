import { Request, Response } from 'express';
import { paymentProcessor } from '@thefesta/payments';
import { errorHandler } from './middleware/error-handler';

export async function paymentWebhookHandler(req: Request, res: Response) {
  try {
    const signature = req.headers['x-africas-talking-signature'] as string;
    const payload = req.body;

    console.log('Received payment webhook:', {
      signature: signature ? 'present' : 'missing',
      payloadKeys: Object.keys(payload),
      timestamp: new Date().toISOString(),
    });

    // Verify webhook signature
    if (!signature) {
      console.error('Missing webhook signature');
      return res.status(400).json({
        error: 'Missing webhook signature',
      });
    }

    // Process the payment webhook
    await paymentProcessor.handlePaymentWebhook(payload, signature);

    // Respond with success
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Payment webhook processing error:', error);
    
    // Still return 200 to prevent webhook retries for permanent failures
    res.status(200).json({
      success: false,
      error: 'Webhook processing failed',
      timestamp: new Date().toISOString(),
    });
  }
}
