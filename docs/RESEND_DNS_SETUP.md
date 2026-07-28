# Resend DNS Setup for thefestaevents.com

This document outlines the DNS records that need to be added to verify and configure the `thefestaevents.com` domain in Resend.

## Overview

To send emails from `noreply@thefestaevents.com`, you need to add DNS records to your domain provider. The setup includes three main components:

1. **Domain Verification (DKIM)** - Verifies domain ownership
2. **Enable Sending (SPF)** - Authorizes Resend to send emails on your behalf
3. **Enable Receiving (MX)** - Optional: Routes incoming emails to Resend

## DNS Records to Add

### 1. Domain Verification (DKIM)

Add this TXT record to verify domain ownership:

```
Type: TXT
Name: resend._domainkey
Content: [The full DKIM public key from Resend dashboard]
TTL: Auto (or 3600)
```

**Purpose**: Verifies that you own the domain and enables DKIM signing for email authentication.

### 2. Enable Sending (SPF)

Add these two records to enable email sending:

#### MX Record for `send` subdomain:
```
Type: MX
Name: send
Content: feedback-smtp.us-east-1.amazonses.com (or the value shown in Resend)
TTL: 3600
Priority: 10
```

#### TXT Record for `send` subdomain (SPF):
```
Type: TXT
Name: send
Content: v=spf1 include:amazonses.com ~all (or the full value from Resend)
TTL: 3600
```

**Purpose**: Authorizes Resend (via Amazon SES) to send emails from your domain.

### 3. Enable Receiving (MX) - Optional

⚠️ **Warning**: Adding MX records will route ALL incoming emails for your domain to Resend. This will disable existing email routing.

If you want to receive emails through Resend, add:

```
Type: MX
Name: @ (root domain)
Content: [The mail server address from Resend]
TTL: 3600
Priority: 0
```

**Note**: Consider using a subdomain (e.g., `mail.thefestaevents.com`) instead of the root domain to avoid disrupting existing email services.

## Steps to Configure

1. **Log in to your domain provider** (e.g., GoDaddy, Namecheap, Cloudflare, etc.)

2. **Navigate to DNS Management** for `thefestaevents.com`

3. **Add each record** as specified above:
   - Copy the exact values from your Resend dashboard
   - Ensure the record names match exactly (including subdomains)
   - Set TTL values as recommended

4. **Wait for DNS propagation** (usually 5-60 minutes, can take up to 72 hours)

5. **Verify in Resend Dashboard**:
   - Go to https://resend.com/domains
   - Check the status of `thefestaevents.com`
   - All records should show as "Verified" once DNS has propagated

## Verification Checklist

- [ ] DKIM TXT record added (`resend._domainkey`)
- [ ] SPF MX record added (`send` subdomain)
- [ ] SPF TXT record added (`send` subdomain)
- [ ] MX record added (if enabling receiving)
- [ ] All records verified in Resend dashboard
- [ ] Test email sent successfully

## Testing

Once DNS records are verified:

1. The app will automatically use `noreply@thefestaevents.com` for sending emails
2. Test the signup flow to ensure verification codes are sent successfully
3. Check email deliverability in Resend dashboard

## Troubleshooting

### Records not verifying?

- **Wait longer**: DNS propagation can take time
- **Check record names**: Ensure they match exactly (case-sensitive)
- **Check record values**: Copy the full value from Resend, including all parts
- **Use DNS checker**: Use tools like `dig` or online DNS checkers to verify records are live

### Emails not sending?

- Verify all SPF records are correctly configured
- Check Resend dashboard for any error messages
- Ensure `RESEND_API_KEY` is set in environment variables
- Check Resend logs for delivery status

## Important Notes

- **MX Records**: Adding MX records to the root domain will route ALL emails to Resend. Use a subdomain if you have existing email services.
- **SPF Records**: Only one SPF record should exist per domain/subdomain. If you have existing SPF records, you may need to merge them.
- **TTL**: Lower TTL values (300-600) can help with faster updates during setup, but higher values (3600+) are better for production.

## Current Configuration

The application is configured to use:
- **From Address**: `OpusFesta <noreply@thefestaevents.com>`
- **Domain**: `thefestaevents.com`
- **Environment Variable Override**: Set `RESEND_FROM_EMAIL` to override if needed
