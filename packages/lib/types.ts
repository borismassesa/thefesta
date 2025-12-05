import { z } from 'zod';

// User schemas
export const UserRoleSchema = z.enum(['COUPLE', 'VENDOR', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  email: z.string().optional(),
  role: UserRoleSchema,
  accountId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

// Vendor schemas
export const VendorCategorySchema = z.enum([
  'photographers',
  'venues',
  'caterers',
  'salons-makeup',
  'decor',
  'djs-mcs',
  'rentals',
  'designers',
  'transport',
]);
export type VendorCategory = z.infer<typeof VendorCategorySchema>;

export const VendorSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  category: z.string(),
  city: z.string(),
  phone: z.string(),
  email: z.string().optional(),
  description: z.string().optional(),
  ratingAvg: z.number(),
  ratingCount: z.number(),
  kycStatus: z.string(),
  isVerified: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Vendor = z.infer<typeof VendorSchema>;

// Event schemas
export const EventTypeSchema = z.enum([
  'wedding',
  'sendoff',
  'kitchen_party',
  'corporate',
  'graduation',
  'other',
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  ownerId: z.string(),
  name: z.string(),
  type: z.string(),
  date: z.date(),
  budgetTotal: z.number().optional(),
  guestCount: z.number().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Event = z.infer<typeof EventSchema>;

// Booking schemas
export const BookingStatusSchema = z.enum([
  'INQUIRY',
  'QUOTED',
  'ACCEPTED',
  'DEPOSIT_PAID',
  'COMPLETED',
  'DISPUTED',
  'CANCELLED',
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const BookingSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  vendorId: z.string(),
  status: BookingStatusSchema,
  quoteTotal: z.number().optional(),
  depositDue: z.number().optional(),
  notes: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Booking = z.infer<typeof BookingSchema>;

// Payment schemas
export const PaymentMethodSchema = z.enum(['MPESA', 'AIRTEL', 'TIGO', 'CARD']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const PaymentStatusSchema = z.enum(['PENDING', 'SUCCEEDED', 'FAILED']);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  amount: z.number(),
  method: PaymentMethodSchema,
  providerRef: z.string(),
  status: PaymentStatusSchema,
  metadata: z.record(z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Payment = z.infer<typeof PaymentSchema>;

// Guest schemas
export const RSVPStatusSchema = z.enum(['PENDING', 'YES', 'NO']);
export type RSVPStatus = z.infer<typeof RSVPStatusSchema>;

export const GuestSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
  rsvp: RSVPStatusSchema,
  dietary: z.string().optional(),
  qrCode: z.string().optional(),
  isPlusOne: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Guest = z.infer<typeof GuestSchema>;

// API Response schemas
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});
export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

// Search and filter schemas
export const VendorSearchSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  category: VendorCategorySchema.optional(),
  minRating: z.number().min(0).max(5).optional(),
  priceRange: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});
export type VendorSearch = z.infer<typeof VendorSearchSchema>;

// Form validation schemas
export const CreateEventSchema = z.object({
  name: z.string().min(1, 'Event name is required'),
  type: EventTypeSchema,
  date: z.date(),
  budgetTotal: z.number().positive().optional(),
  guestCount: z.number().positive().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
});
export type CreateEvent = z.infer<typeof CreateEventSchema>;

export const CreateVendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required'),
  category: z.string().min(1, 'Category is required'),
  city: z.string().min(1, 'City is required'),
  phone: z.string().min(1, 'Phone number is required'),
  email: z.string().email().optional(),
  description: z.string().optional(),
});
export type CreateVendor = z.infer<typeof CreateVendorSchema>;

export const CreateGuestSchema = z.object({
  name: z.string().min(1, 'Guest name is required'),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  dietary: z.string().optional(),
  isPlusOne: z.boolean().default(false),
});
export type CreateGuest = z.infer<typeof CreateGuestSchema>;

// Utility types
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface Location {
  lat: number;
  lng: number;
  address?: string;
}

export interface FileUpload {
  id: string;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadedAt: Date;
}

// Error types
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public field?: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}
