import { GraphQLScalarType, Kind } from 'graphql';
import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
import { Query } from './Query';
import { Mutation } from './Mutation';
import { Subscription } from './Subscription';
import { User } from './User';
import { Vendor } from './Vendor';
import { Event } from './Event';
import { Booking } from './Booking';
import { Invoice } from './Invoice';
import { Payment } from './Payment';
import { Guest } from './Guest';
import { Review } from './Review';
import { Dispute } from './Dispute';
import { Message } from './Message';
import { Notification } from './Notification';

export const resolvers = {
  DateTime: DateTimeResolver,
  JSON: JSONResolver,
  
  Query,
  Mutation,
  Subscription,
  
  User,
  Vendor,
  Event,
  Booking,
  Invoice,
  Payment,
  Guest,
  Review,
  Dispute,
  Message,
  Notification,
};
