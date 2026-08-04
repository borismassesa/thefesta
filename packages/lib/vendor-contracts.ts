import { z } from "zod";

export const VendorCoordinatesSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});
export type VendorCoordinates = z.infer<typeof VendorCoordinatesSchema>;

export const VendorLocationSchema = z.object({
  city: z.string().optional(),
  country: z.string().optional(),
  address: z.string().optional(),
  coordinates: VendorCoordinatesSchema.optional(),
});
export type VendorLocation = z.infer<typeof VendorLocationSchema>;

export const VendorStatsSchema = z.object({
  viewCount: z.number(),
  inquiryCount: z.number(),
  saveCount: z.number(),
  averageRating: z.number(),
  reviewCount: z.number(),
});
export type VendorStats = z.infer<typeof VendorStatsSchema>;

export const VendorContactInfoSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
});
export type VendorContactInfo = z.infer<typeof VendorContactInfoSchema>;

export const VendorSocialLinksSchema = z.object({
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  twitter: z.string().optional(),
  tiktok: z.string().optional(),
});
export type VendorSocialLinks = z.infer<typeof VendorSocialLinksSchema>;

export const VendorServiceSchema = z.string().trim().min(1).max(60);
export type VendorService = z.infer<typeof VendorServiceSchema>;

export const VendorServicesOfferedSchema = z
  .array(VendorServiceSchema)
  .max(100)
  .superRefine((titles, context) => {
    const seen = new Set<string>();

    titles.forEach((title, index) => {
      const identity = title.toLowerCase();
      if (seen.has(identity)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Service titles must be unique (case-insensitive)",
          path: [index],
        });
      }
      seen.add(identity);
    });
  });

export const VendorRecordSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    user_id: z.string(),
    business_name: z.string(),
    category: z.string(),
    subcategories: z.array(z.string()),
    bio: z.string().nullable(),
    description: z.string().nullable(),
    logo: z.string().nullable(),
    cover_image: z.string().nullable(),
    location: VendorLocationSchema,
    price_range: z.string().nullable(),
    verified: z.boolean(),
    tier: z.string(),
    stats: VendorStatsSchema,
    contact_info: VendorContactInfoSchema,
    social_links: VendorSocialLinksSchema,
    years_in_business: z.number().nullable(),
    team_size: z.number().nullable(),
    services_offered: VendorServicesOfferedSchema.nullable(),
    onboarding_status: z
      .enum(["invited", "in_progress", "pending_review", "active", "suspended"])
      .optional(),
    onboarding_started_at: z.string().nullable().optional(),
    onboarding_completed_at: z.string().nullable().optional(),
    suspended_at: z.string().nullable().optional(),
    suspension_reason: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
export type VendorRecord = z.infer<typeof VendorRecordSchema>;

export const VendorPortfolioItemSchema = z.object({
  id: z.string(),
  vendor_id: z.string(),
  title: z.string(),
  images: z.array(z.string()),
  description: z.string().nullable(),
  event_type: z.string().nullable(),
  event_date: z.string().nullable(),
  featured: z.boolean(),
  display_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type VendorPortfolioItem = z.infer<typeof VendorPortfolioItemSchema>;

export const VendorReviewAuthorSchema = z.object({
  name: z.string(),
  avatar: z.string().nullable(),
});
export type VendorReviewAuthor = z.infer<typeof VendorReviewAuthorSchema>;

export const VendorReviewRecordSchema = z.object({
  id: z.string(),
  vendor_id: z.string(),
  user_id: z.string(),
  rating: z.number(),
  title: z.string().nullable(),
  content: z.string(),
  images: z.array(z.string()),
  event_type: z.string().nullable(),
  event_date: z.string().nullable(),
  verified: z.boolean(),
  helpful: z.number(),
  vendor_response: z.string().nullable(),
  vendor_responded_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  user: VendorReviewAuthorSchema,
});
export type VendorReviewRecord = z.infer<typeof VendorReviewRecordSchema>;

export const VendorPackageRecordSchema = z.object({
  id: z.string().optional(),
  vendor_id: z.string(),
  name: z.string(),
  starting_price: z.number(),
  duration: z.string(),
  features: z.array(z.string()),
  is_popular: z.boolean(),
  display_order: z.number(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type VendorPackageRecord = z.infer<typeof VendorPackageRecordSchema>;

export const VendorAwardRecordSchema = z.object({
  title: z.string(),
  year: z.string(),
  description: z.string(),
  icon: z.string(),
  image: z.string().nullable().optional(),
  display_order: z.number().optional(),
});
export type VendorAwardRecord = z.infer<typeof VendorAwardRecordSchema>;

export const VendorAvailabilityRecordSchema = z.object({
  date: z.string(),
  is_available: z.boolean(),
  reason: z.string().optional(),
});
export type VendorAvailabilityRecord = z.infer<typeof VendorAvailabilityRecordSchema>;

export const MessageParticipantSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  avatar: z.string().nullable(),
});
export type MessageParticipant = z.infer<typeof MessageParticipantSchema>;

export const MessageVendorSummarySchema = z.object({
  id: z.string(),
  business_name: z.string(),
  logo: z.string().nullable(),
});
export type MessageVendorSummary = z.infer<typeof MessageVendorSummarySchema>;

export const VendorMessageRecordSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  sender_id: z.string(),
  content: z.string(),
  read_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  sender: MessageParticipantSchema.optional(),
});
export type VendorMessageRecord = z.infer<typeof VendorMessageRecordSchema>;

export const MessageThreadRecordSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  vendor_id: z.string(),
  last_message_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  user: MessageParticipantSchema.optional(),
  vendor: MessageVendorSummarySchema.optional(),
  last_message: VendorMessageRecordSchema.nullable().optional(),
  unread_count: z.number().optional(),
});
export type MessageThreadRecord = z.infer<typeof MessageThreadRecordSchema>;

export const VendorSearchItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  business_name: z.string(),
  category: z.string(),
  location: VendorLocationSchema,
  price_range: z.string().nullable(),
  verified: z.boolean(),
  tier: z.string(),
  stats: VendorStatsSchema,
  cover_image: z.string().nullable(),
  logo: z.string().nullable(),
  created_at: z.string(),
  bio: z.string().nullable(),
  description: z.string().nullable(),
  isTeaser: z.boolean(),
});
export type VendorSearchItem = z.infer<typeof VendorSearchItemSchema>;

export const VendorSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    business_name: z.string(),
    category: z.string(),
    location: VendorLocationSchema.optional(),
    price_range: z.string().nullable().optional(),
    verified: z.boolean().optional(),
    tier: z.string().optional(),
    stats: VendorStatsSchema.optional(),
    cover_image: z.string().nullable().optional(),
    logo: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();
export type VendorSummary = z.infer<typeof VendorSummarySchema>;

export const VendorSearchResponseSchema = z.object({
  vendors: z.array(VendorSearchItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
  isAuthenticated: z.boolean(),
});
export type VendorSearchResponse = z.infer<typeof VendorSearchResponseSchema>;

export const VendorBySlugVendorSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    business_name: z.string(),
    category: z.string(),
    location: VendorLocationSchema.optional(),
    price_range: z.string().nullable().optional(),
    verified: z.boolean(),
    tier: z.string().optional(),
    stats: VendorStatsSchema.optional(),
    cover_image: z.string().nullable().optional(),
    logo: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    created_at: z.string(),
    isTeaser: z.boolean(),
  })
  .passthrough();
export type VendorBySlugVendor = z.infer<typeof VendorBySlugVendorSchema>;

export const VendorBySlugResponseSchema = z.object({
  vendor: VendorBySlugVendorSchema,
  isAuthenticated: z.boolean(),
  portfolio: z.array(VendorPortfolioItemSchema).optional(),
  reviews: z.array(VendorReviewRecordSchema).optional(),
  similarVendors: z.array(VendorSummarySchema).optional(),
  awards: z.array(VendorAwardRecordSchema).optional(),
});
export type VendorBySlugResponse = z.infer<typeof VendorBySlugResponseSchema>;

export const VendorCollectionItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  location: z.string(),
  rating: z.number(),
  reviews: z.number(),
  image: z.string().nullable(),
  slug: z.string().optional(),
});
export type VendorCollectionItem = z.infer<typeof VendorCollectionItemSchema>;

export const VendorCollectionResponseSchema = z.object({
  vendors: z.array(VendorCollectionItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});
export type VendorCollectionResponse = z.infer<typeof VendorCollectionResponseSchema>;

export const VendorSavedItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  business_name: z.string(),
  category: z.string(),
  location: VendorLocationSchema,
  price_range: z.string().nullable(),
  verified: z.boolean(),
  stats: VendorStatsSchema,
  cover_image: z.string().nullable(),
  logo: z.string().nullable(),
  created_at: z.string(),
});
export type VendorSavedItem = z.infer<typeof VendorSavedItemSchema>;

export const VendorSavedResponseSchema = z.object({
  vendors: z.array(VendorSavedItemSchema),
  count: z.number(),
});
export type VendorSavedResponse = z.infer<typeof VendorSavedResponseSchema>;

export const VendorStatisticsResponseSchema = z.object({
  totalVendors: z.number(),
  verifiedVendors: z.number(),
  totalCities: z.number(),
  averageRating: z.number(),
  categoryCounts: z.record(z.number()),
  formatted: z.object({
    vendorCount: z.string(),
    cityCount: z.string(),
    rating: z.string(),
    categoryCounts: z.record(z.string()),
  }),
});
export type VendorStatisticsResponse = z.infer<typeof VendorStatisticsResponseSchema>;
