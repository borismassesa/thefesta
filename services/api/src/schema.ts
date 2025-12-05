import { readFileSync } from 'fs';
import { join } from 'path';

export const typeDefs = readFileSync(
  join(process.cwd(), 'schema.graphql'),
  'utf-8'
);
