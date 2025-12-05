import { Request, Response } from 'express';
import { errorHandler } from './middleware/error-handler';

export async function smsWebhookHandler(req: Request, res: Response) {
  try {
    const payload = req.body;

    console.log('Received SMS webhook:', {
      payloadKeys: Object.keys(payload),
      timestamp: new Date().toISOString(),
    });

    // Process SMS delivery status updates
    if (payload.type === 'SMSDeliveryReport') {
      await handleSMSDeliveryReport(payload);
    } else if (payload.type === 'IncomingSMS') {
      await handleIncomingSMS(payload);
    } else {
      console.log('Unknown SMS webhook type:', payload.type);
    }

    // Respond with success
    res.status(200).json({
      success: true,
      message: 'SMS webhook processed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('SMS webhook processing error:', error);
    
    res.status(200).json({
      success: false,
      error: 'SMS webhook processing failed',
      timestamp: new Date().toISOString(),
    });
  }
}

async function handleSMSDeliveryReport(payload: any): Promise<void> {
  try {
    console.log('Processing SMS delivery report:', {
      messageId: payload.messageId,
      status: payload.status,
      phoneNumber: payload.phoneNumber,
    });

    // Update SMS delivery status in your database
    // This would typically update a notifications or messages table
    
    // For now, just log the status
    if (payload.status === 'Delivered') {
      console.log(`SMS delivered successfully to ${payload.phoneNumber}`);
    } else if (payload.status === 'Failed') {
      console.error(`SMS delivery failed to ${payload.phoneNumber}: ${payload.failureReason}`);
    }
  } catch (error) {
    console.error('Error handling SMS delivery report:', error);
  }
}

async function handleIncomingSMS(payload: any): Promise<void> {
  try {
    console.log('Processing incoming SMS:', {
      from: payload.from,
      message: payload.text,
      timestamp: payload.date,
    });

    // Handle incoming SMS messages
    // This could be for RSVP responses, customer inquiries, etc.
    
    // Example: Handle RSVP via SMS
    if (payload.text.toLowerCase().includes('rsvp')) {
      await handleRSVPSMS(payload);
    }
    
    // Example: Handle customer inquiries
    if (payload.text.toLowerCase().includes('help') || payload.text.toLowerCase().includes('support')) {
      await handleSupportSMS(payload);
    }
  } catch (error) {
    console.error('Error handling incoming SMS:', error);
  }
}

async function handleRSVPSMS(payload: any): Promise<void> {
  try {
    const phoneNumber = payload.from;
    const message = payload.text.toLowerCase();
    
    // Parse RSVP response
    let rsvpStatus = 'PENDING';
    if (message.includes('yes') || message.includes('ndio') || message.includes('sawa')) {
      rsvpStatus = 'YES';
    } else if (message.includes('no') || message.includes('hapana') || message.includes('siwezi')) {
      rsvpStatus = 'NO';
    }
    
    console.log(`RSVP via SMS from ${phoneNumber}: ${rsvpStatus}`);
    
    // Update guest RSVP status in database
    // This would typically update the Guest table
    // await prisma.guest.updateMany({
    //   where: { phone: phoneNumber },
    //   data: { rsvp: rsvpStatus }
    // });
    
  } catch (error) {
    console.error('Error handling RSVP SMS:', error);
  }
}

async function handleSupportSMS(payload: any): Promise<void> {
  try {
    const phoneNumber = payload.from;
    const message = payload.text;
    
    console.log(`Support inquiry via SMS from ${phoneNumber}: ${message}`);
    
    // Send automated response
    const responseMessage = "Thank you for contacting The Festa support. We'll get back to you shortly. For urgent matters, call +255 XXX XXX XXX.";
    
    // This would send an SMS response
    // await smsService.sendSMS(phoneNumber, responseMessage);
    
  } catch (error) {
    console.error('Error handling support SMS:', error);
  }
}
