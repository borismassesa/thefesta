'use client';

import { useState } from 'react';
import { createInquiry } from '../../lib/db/inquiries';
import { useAuth } from '../../hooks/useAuth';

interface InquiryFormProps {
  vendorId: string;
  vendorName: string;
}

export default function InquiryForm({ vendorId, vendorName }: InquiryFormProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    eventType: 'Wedding',
    eventDate: '',
    guestCount: '',
    budget: '',
    location: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await createInquiry({
        vendorId,
        userId: user?.id || null,
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        eventType: formData.eventType,
        eventDate: formData.eventDate || null,
        guestCount: formData.guestCount ? parseInt(formData.guestCount) : null,
        budget: formData.budget || null,
        location: formData.location || null,
        message: formData.message,
        status: 'pending',
        vendorResponse: null,
        respondedAt: null,
      });

      setSubmitted(true);
      setFormData({
        name: '',
        email: '',
        phone: '',
        eventType: 'Wedding',
        eventDate: '',
        guestCount: '',
        budget: '',
        location: '',
        message: '',
      });
    } catch (err) {
      setError('Failed to send inquiry. Please try again.');
      console.error('Inquiry submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-8 text-center dark:border-green-900 dark:bg-green-900/20">
        <h3 className="mb-2 text-2xl font-bold text-green-900 dark:text-green-100">
          Inquiry Sent Successfully!
        </h3>
        <p className="text-green-700 dark:text-green-300">
          {vendorName} will get back to you soon. Check your email for updates.
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="mt-6 rounded-full bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Send Another Inquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Name */}
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
            Your Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-dribbble-pink focus:outline-none focus:ring-2 focus:ring-dribbble-pink/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            placeholder="John Doe"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
            Email Address *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-dribbble-pink focus:outline-none focus:ring-2 focus:ring-dribbble-pink/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            placeholder="john@example.com"
          />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
            Phone Number
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-dribbble-pink focus:outline-none focus:ring-2 focus:ring-dribbble-pink/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            placeholder="+255 123 456 789"
          />
        </div>

        {/* Event Type */}
        <div>
          <label htmlFor="eventType" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
            Event Type *
          </label>
          <select
            id="eventType"
            name="eventType"
            value={formData.eventType}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-dribbble-pink focus:outline-none focus:ring-2 focus:ring-dribbble-pink/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="Wedding">Wedding</option>
            <option value="Engagement">Engagement</option>
            <option value="Anniversary">Anniversary</option>
            <option value="Birthday">Birthday</option>
            <option value="Corporate Event">Corporate Event</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Event Date */}
        <div>
          <label htmlFor="eventDate" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
            Event Date
          </label>
          <input
            type="date"
            id="eventDate"
            name="eventDate"
            value={formData.eventDate}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-dribbble-pink focus:outline-none focus:ring-2 focus:ring-dribbble-pink/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {/* Guest Count */}
        <div>
          <label htmlFor="guestCount" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
            Guest Count
          </label>
          <input
            type="number"
            id="guestCount"
            name="guestCount"
            value={formData.guestCount}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-dribbble-pink focus:outline-none focus:ring-2 focus:ring-dribbble-pink/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            placeholder="100"
          />
        </div>

        {/* Budget */}
        <div>
          <label htmlFor="budget" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
            Budget
          </label>
          <input
            type="text"
            id="budget"
            name="budget"
            value={formData.budget}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-dribbble-pink focus:outline-none focus:ring-2 focus:ring-dribbble-pink/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            placeholder="$5,000 - $10,000"
          />
        </div>

        {/* Location */}
        <div>
          <label htmlFor="location" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
            Event Location
          </label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-dribbble-pink focus:outline-none focus:ring-2 focus:ring-dribbble-pink/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            placeholder="Dar es Salaam, Tanzania"
          />
        </div>
      </div>

      {/* Message */}
      <div>
        <label htmlFor="message" className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
          Message *
        </label>
        <textarea
          id="message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          required
          rows={6}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-dribbble-pink focus:outline-none focus:ring-2 focus:ring-dribbble-pink/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          placeholder="Tell us about your event and what you're looking for..."
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full rounded-full bg-dribbble-pink py-4 text-lg font-semibold text-white transition-all hover:bg-dribbble-pink/90 ${
          isSubmitting ? 'cursor-not-allowed opacity-50' : ''
        }`}
      >
        {isSubmitting ? 'Sending...' : 'Send Inquiry'}
      </button>

      <p className="text-center text-xs text-gray-500 dark:text-slate-400">
        By sending this inquiry, you agree to be contacted by {vendorName}.
      </p>
    </form>
  );
}
