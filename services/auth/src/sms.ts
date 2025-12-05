import { z } from 'zod';

// Validation schema for phone numbers
const PhoneSchema = z.string().regex(/^\+255[67]\d{8}$/, 'Invalid Tanzanian phone number');

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SMSConfig {
  apiKey: string;
  username: string;
  senderId: string;
  baseUrl?: string;
}

class SMSService {
  private config: SMSConfig;

  constructor() {
    this.config = {
      apiKey: process.env.AFRICASTALKING_API_KEY!,
      username: process.env.AFRICASTALKING_USERNAME!,
      senderId: process.env.AFRICASTALKING_SENDER_ID || 'THEFESTA',
      baseUrl: process.env.AFRICASTALKING_BASE_URL || 'https://api.africastalking.com',
    };
  }

  /**
   * Send OTP via SMS
   */
  async sendOTP(phone: string, otp: string): Promise<SMSResult> {
    const validatedPhone = PhoneSchema.parse(phone);
    
    const message = `Your The Festa verification code is: ${otp}. Valid for 10 minutes.`;
    return this.sendSMS(validatedPhone, message);
  }

  /**
   * Send booking confirmation SMS
   */
  async sendBookingConfirmation(
    phone: string,
    vendorName: string,
    eventName: string,
    date: string
  ): Promise<SMSResult> {
    const validatedPhone = PhoneSchema.parse(phone);
    
    const message = `Your booking with ${vendorName} for ${eventName} on ${date} has been confirmed. Thank you for choosing The Festa!`;
    return this.sendSMS(validatedPhone, message);
  }

  /**
   * Send payment confirmation SMS
   */
  async sendPaymentConfirmation(
    phone: string,
    amount: number,
    vendorName: string
  ): Promise<SMSResult> {
    const validatedPhone = PhoneSchema.parse(phone);
    
    const formattedAmount = new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency: 'TZS',
      minimumFractionDigits: 0,
    }).format(amount);
    
    const message = `Payment of ${formattedAmount} to ${vendorName} has been successfully processed. Thank you for using The Festa!`;
    return this.sendSMS(validatedPhone, message);
  }

  /**
   * Send event reminder SMS
   */
  async sendEventReminder(
    phone: string,
    eventName: string,
    date: string,
    daysUntil: number
  ): Promise<SMSResult> {
    const validatedPhone = PhoneSchema.parse(phone);
    
    let message: string;
    if (daysUntil === 1) {
      message = `Reminder: Your event "${eventName}" is tomorrow (${date}). Make sure everything is ready!`;
    } else if (daysUntil === 7) {
      message = `Reminder: Your event "${eventName}" is in 1 week (${date}). Final preparations time!`;
    } else {
      message = `Reminder: Your event "${eventName}" is in ${daysUntil} days (${date}).`;
    }
    
    return this.sendSMS(validatedPhone, message);
  }

  /**
   * Send RSVP reminder SMS
   */
  async sendRSVPReminder(
    phone: string,
    guestName: string,
    eventName: string,
    rsvpLink: string
  ): Promise<SMSResult> {
    const validatedPhone = PhoneSchema.parse(phone);
    
    const message = `Hi ${guestName}! You're invited to ${eventName}. Please RSVP: ${rsvpLink}`;
    return this.sendSMS(validatedPhone, message);
  }

  /**
   * Send vendor inquiry notification SMS
   */
  async sendVendorInquiryNotification(
    phone: string,
    clientName: string,
    eventType: string,
    eventDate: string
  ): Promise<SMSResult> {
    const validatedPhone = PhoneSchema.parse(phone);
    
    const message = `New inquiry from ${clientName} for ${eventType} on ${eventDate}. Check your The Festa dashboard for details.`;
    return this.sendSMS(validatedPhone, message);
  }

  /**
   * Send bulk SMS to multiple recipients
   */
  async sendBulkSMS(phones: string[], message: string): Promise<SMSResult[]> {
    const validatedPhones = phones.map(phone => PhoneSchema.parse(phone));
    
    const results: SMSResult[] = [];
    
    // Send SMS to each phone number
    for (const phone of validatedPhones) {
      try {
        const result = await this.sendSMS(phone, message);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: `Failed to send SMS to ${phone}: ${error}`,
        });
      }
    }
    
    return results;
  }

  /**
   * Core SMS sending method using Africa's Talking API
   */
  private async sendSMS(phone: string, message: string): Promise<SMSResult> {
    try {
      const url = `${this.config.baseUrl}/version1/messaging`;
      
      const payload = {
        username: this.config.username,
        to: phone,
        message: message,
        from: this.config.senderId,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey': this.config.apiKey,
        },
        body: new URLSearchParams(payload),
      });

      const result = await response.json();

      if (response.ok && result.SMSMessageData) {
        const messageData = result.SMSMessageData.Recipients[0];
        
        if (messageData.status === 'Success') {
          return {
            success: true,
            messageId: messageData.messageId,
          };
        } else {
          return {
            success: false,
            error: messageData.status,
          };
        }
      } else {
        return {
          success: false,
          error: result.errorMessage || 'Unknown error occurred',
        };
      }
    } catch (error) {
      console.error('SMS sending error:', error);
      return {
        success: false,
        error: `Network error: ${error}`,
      };
    }
  }

  /**
   * Generate a random OTP
   */
  generateOTP(length: number = 6): string {
    const digits = '0123456789';
    let otp = '';
    
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * digits.length)];
    }
    
    return otp;
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phone: string): boolean {
    try {
      PhoneSchema.parse(phone);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format phone number to standard format
   */
  formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Handle different formats
    if (digits.startsWith('255')) {
      return `+${digits}`;
    } else if (digits.startsWith('0')) {
      return `+255${digits.substring(1)}`;
    } else if (digits.length === 9) {
      return `+255${digits}`;
    }
    
    return phone; // Return as-is if format is unclear
  }
}

// Export singleton instance
export const smsService = new SMSService();
