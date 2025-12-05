import { GraphQLContext } from '../context';
import { NotFoundError, UnauthorizedError, ValidationError } from '@thefesta/lib';
import { generateRandomString } from '@thefesta/lib';

export const Mutation = {
  // Event mutations
  createEvent: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    const event = await context.prisma.event.create({
      data: {
        ...input,
        accountId: context.user.accountId,
        ownerId: context.user.id,
      },
      include: {
        owner: true,
        bookings: true,
        guests: true,
      },
    });

    return event;
  },

  updateEvent: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    const existingEvent = await context.prisma.event.findUnique({
      where: { id: input.id },
    });

    if (!existingEvent) {
      throw new NotFoundError('Event');
    }

    if (existingEvent.ownerId !== context.user.id) {
      throw new UnauthorizedError('You can only update your own events');
    }

    const { id, ...updateData } = input;
    const event = await context.prisma.event.update({
      where: { id },
      data: updateData,
      include: {
        owner: true,
        bookings: true,
        guests: true,
      },
    });

    return event;
  },

  deleteEvent: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    const existingEvent = await context.prisma.event.findUnique({
      where: { id },
    });

    if (!existingEvent) {
      throw new NotFoundError('Event');
    }

    if (existingEvent.ownerId !== context.user.id) {
      throw new UnauthorizedError('You can only delete your own events');
    }

    await context.prisma.event.update({
      where: { id },
      data: { isActive: false },
    });

    return true;
  },

  // Vendor mutations
  createVendor: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    if (context.user.role !== 'VENDOR') {
      throw new UnauthorizedError('Only vendors can create vendor profiles');
    }

    const vendor = await context.prisma.vendor.create({
      data: {
        ...input,
        accountId: context.user.accountId,
      },
      include: {
        user: true,
        bookings: true,
        reviews: true,
      },
    });

    return vendor;
  },

  updateVendor: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    const existingVendor = await context.prisma.vendor.findUnique({
      where: { id: input.id },
    });

    if (!existingVendor) {
      throw new NotFoundError('Vendor');
    }

    if (existingVendor.accountId !== context.user.accountId) {
      throw new UnauthorizedError('You can only update your own vendor profile');
    }

    const { id, ...updateData } = input;
    const vendor = await context.prisma.vendor.update({
      where: { id },
      data: updateData,
      include: {
        user: true,
        bookings: true,
        reviews: true,
      },
    });

    return vendor;
  },

  // Booking mutations
  createBooking: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    const booking = await context.prisma.booking.create({
      data: {
        ...input,
        status: 'INQUIRY',
      },
      include: {
        event: true,
        vendor: true,
        invoices: true,
      },
    });

    return booking;
  },

  updateBooking: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    const existingBooking = await context.prisma.booking.findUnique({
      where: { id: input.id },
      include: { event: true, vendor: true },
    });

    if (!existingBooking) {
      throw new NotFoundError('Booking');
    }

    // Check if user has permission to update this booking
    const canUpdate = 
      existingBooking.event.ownerId === context.user.id || // Event owner
      existingBooking.vendor.accountId === context.user.accountId; // Vendor

    if (!canUpdate) {
      throw new UnauthorizedError('You can only update your own bookings');
    }

    const { id, ...updateData } = input;
    const booking = await context.prisma.booking.update({
      where: { id },
      data: updateData,
      include: {
        event: true,
        vendor: true,
        invoices: true,
        reviews: true,
        disputes: true,
      },
    });

    return booking;
  },

  // Invoice mutations
  createInvoice: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    const booking = await context.prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { vendor: true },
    });

    if (!booking) {
      throw new NotFoundError('Booking');
    }

    // Only the vendor can create invoices
    if (booking.vendor.accountId !== context.user.accountId) {
      throw new UnauthorizedError('Only the vendor can create invoices');
    }

    const invoice = await context.prisma.invoice.create({
      data: {
        ...input,
        status: 'PENDING',
      },
      include: {
        booking: true,
        payments: true,
      },
    });

    return invoice;
  },

  // Payment mutations
  createPaymentIntent: async (
    _: any,
    { invoiceId, method }: { invoiceId: string; method: string },
    context: GraphQLContext
  ) => {
    const invoice = await context.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { booking: true },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice');
    }

    // TODO: Integrate with payment provider (Africa's Talking)
    const paymentIntent = {
      id: `pi_${invoiceId}_${Date.now()}`,
      invoiceId,
      amount: invoice.amount,
      method,
      providerRef: null,
      checkoutUrl: null,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    };

    return paymentIntent;
  },

  acknowledgePayment: async (
    _: any,
    { providerRef }: { providerRef: string },
    context: GraphQLContext
  ) => {
    // TODO: Verify payment with provider and create payment record
    const payment = await context.prisma.payment.create({
      data: {
        invoiceId: 'temp-invoice-id', // This should come from the provider response
        amount: 0, // This should come from the provider response
        method: 'MPESA',
        providerRef,
        status: 'SUCCEEDED',
      },
      include: {
        invoice: true,
      },
    });

    return payment;
  },

  // Guest mutations
  createGuest: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    const event = await context.prisma.event.findUnique({
      where: { id: input.eventId },
    });

    if (!event) {
      throw new NotFoundError('Event');
    }

    if (event.ownerId !== context.user.id) {
      throw new UnauthorizedError('You can only add guests to your own events');
    }

    const guest = await context.prisma.guest.create({
      data: {
        ...input,
        rsvp: 'PENDING',
        qrCode: generateRandomString(16),
      },
      include: {
        event: true,
      },
    });

    return guest;
  },

  updateGuest: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    const existingGuest = await context.prisma.guest.findUnique({
      where: { id: input.id },
      include: { event: true },
    });

    if (!existingGuest) {
      throw new NotFoundError('Guest');
    }

    if (existingGuest.event.ownerId !== context.user.id) {
      throw new UnauthorizedError('You can only update guests for your own events');
    }

    const { id, ...updateData } = input;
    const guest = await context.prisma.guest.update({
      where: { id },
      data: updateData,
      include: {
        event: true,
      },
    });

    return guest;
  },

  deleteGuest: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    const existingGuest = await context.prisma.guest.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!existingGuest) {
      throw new NotFoundError('Guest');
    }

    if (existingGuest.event.ownerId !== context.user.id) {
      throw new UnauthorizedError('You can only delete guests from your own events');
    }

    await context.prisma.guest.delete({
      where: { id },
    });

    return true;
  },

  // Message mutations
  sendMessage: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    // TODO: Implement message creation in DynamoDB
    const message = {
      id: `msg_${Date.now()}`,
      threadId: input.threadId,
      senderId: context.user.id,
      text: input.text,
      attachments: input.attachments || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return message;
  },

  // Review mutations
  createReview: async (
    _: any,
    { bookingId, rating, comment }: { bookingId: string; rating: number; comment?: string },
    context: GraphQLContext
  ) => {
    if (!context.user) {
      throw new UnauthorizedError();
    }

    if (rating < 1 || rating > 5) {
      throw new ValidationError('Rating must be between 1 and 5');
    }

    const booking = await context.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { event: true },
    });

    if (!booking) {
      throw new NotFoundError('Booking');
    }

    if (booking.event.ownerId !== context.user.id) {
      throw new UnauthorizedError('You can only review your own bookings');
    }

    if (booking.status !== 'COMPLETED') {
      throw new ValidationError('You can only review completed bookings');
    }

    const review = await context.prisma.review.create({
      data: {
        bookingId,
        userId: context.user.id,
        rating,
        comment,
      },
      include: {
        booking: true,
        user: true,
      },
    });

    // Update vendor rating
    const vendor = await context.prisma.vendor.findUnique({
      where: { id: booking.vendorId },
      include: { reviews: true },
    });

    if (vendor) {
      const totalRating = vendor.reviews.reduce((sum, r) => sum + r.rating, 0) + rating;
      const reviewCount = vendor.reviews.length + 1;
      const newAverage = totalRating / reviewCount;

      await context.prisma.vendor.update({
        where: { id: vendor.id },
        data: {
          ratingAvg: newAverage,
          ratingCount: reviewCount,
        },
      });
    }

    return review;
  },
};
