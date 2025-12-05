import { GraphQLContext } from '../context';
import { NotFoundError, UnauthorizedError } from '@thefesta/lib';

export const Query = {
  // User queries
  me: async (_: any, __: any, context: GraphQLContext) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }
    
    return context.prisma.user.findUnique({
      where: { id: context.user.id },
    });
  },

  user: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
    const user = await context.prisma.user.findUnique({
      where: { id },
    });
    
    if (!user) {
      throw new NotFoundError('User');
    }
    
    return user;
  },

  // Vendor queries
  vendor: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
    const vendor = await context.prisma.vendor.findUnique({
      where: { id },
      include: {
        user: true,
        bookings: true,
        reviews: true,
      },
    });
    
    if (!vendor) {
      throw new NotFoundError('Vendor');
    }
    
    return vendor;
  },

  vendors: async (
    _: any,
    {
      input = {
        page: 1,
        limit: 20,
      },
    }: {
      input?: {
        q?: string;
        city?: string;
        category?: string;
        minRating?: number;
        priceRange?: { min?: number; max?: number };
        page?: number;
        limit?: number;
      };
    },
    context: GraphQLContext
  ) => {
    const { page = 1, limit = 20, q, city, category, minRating } = input;
    const skip = (page - 1) * limit;

    const where: any = {
      isActive: true,
    };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (category) {
      where.category = category;
    }

    if (minRating) {
      where.ratingAvg = { gte: minRating };
    }

    const [vendors, total] = await Promise.all([
      context.prisma.vendor.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: true,
          reviews: true,
        },
        orderBy: { ratingAvg: 'desc' },
      }),
      context.prisma.vendor.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: vendors,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  },

  vendorCategories: async (_: any, __: any, context: GraphQLContext) => {
    return context.prisma.vendorCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  },

  // Event queries
  event: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
    const event = await context.prisma.event.findUnique({
      where: { id },
      include: {
        owner: true,
        bookings: {
          include: {
            vendor: true,
            invoices: true,
          },
        },
        guests: true,
      },
    });
    
    if (!event) {
      throw new NotFoundError('Event');
    }
    
    return event;
  },

  events: async (
    _: any,
    { page = 1, limit = 20 }: { page?: number; limit?: number },
    context: GraphQLContext
  ) => {
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      context.prisma.event.findMany({
        skip,
        take: limit,
        include: {
          owner: true,
          bookings: true,
          guests: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      context.prisma.event.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  },

  myEvents: async (_: any, __: any, context: GraphQLContext) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    return context.prisma.event.findMany({
      where: { ownerId: context.user.id },
      include: {
        bookings: {
          include: {
            vendor: true,
          },
        },
        guests: true,
      },
      orderBy: { date: 'asc' },
    });
  },

  // Booking queries
  booking: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
    const booking = await context.prisma.booking.findUnique({
      where: { id },
      include: {
        event: true,
        vendor: true,
        invoices: true,
        reviews: true,
        disputes: true,
      },
    });
    
    if (!booking) {
      throw new NotFoundError('Booking');
    }
    
    return booking;
  },

  bookings: async (
    _: any,
    {
      eventId,
      vendorId,
      page = 1,
      limit = 20,
    }: {
      eventId?: string;
      vendorId?: string;
      page?: number;
      limit?: number;
    },
    context: GraphQLContext
  ) => {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (eventId) where.eventId = eventId;
    if (vendorId) where.vendorId = vendorId;

    const [bookings, total] = await Promise.all([
      context.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        include: {
          event: true,
          vendor: true,
          invoices: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      context.prisma.booking.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  },

  // Guest queries
  guests: async (_: any, { eventId }: { eventId: string }, context: GraphQLContext) => {
    return context.prisma.guest.findMany({
      where: { eventId },
      orderBy: { name: 'asc' },
    });
  },

  guest: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
    const guest = await context.prisma.guest.findUnique({
      where: { id },
      include: { event: true },
    });
    
    if (!guest) {
      throw new NotFoundError('Guest');
    }
    
    return guest;
  },

  // Template queries
  eventTemplates: async (
    _: any,
    { type }: { type?: string },
    context: GraphQLContext
  ) => {
    const where: any = { isActive: true };
    if (type) where.type = type;

    return context.prisma.eventTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  },

  // Payment queries
  paymentIntent: async (_: any, { invoiceId }: { invoiceId: string }, context: GraphQLContext) => {
    const invoice = await context.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { booking: true },
    });
    
    if (!invoice) {
      throw new NotFoundError('Invoice');
    }

    // TODO: Create payment intent with payment provider
    return {
      id: `pi_${invoiceId}`,
      invoiceId,
      amount: invoice.amount,
      method: 'MPESA',
      providerRef: null,
      checkoutUrl: null,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    };
  },
};
