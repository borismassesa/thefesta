import { prisma } from '@thefesta/db';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const dynamoDocClient = DynamoDBDocumentClient.from(dynamoClient);

export interface GraphQLContext {
  prisma: typeof prisma;
  cognito: typeof cognitoClient;
  dynamo: typeof dynamoDocClient;
  user?: {
    id: string;
    phone: string;
    role: string;
    accountId: string;
  };
}

export const context = async ({ request }: { request: Request }): Promise<GraphQLContext> => {
  // Extract user from JWT token in Authorization header
  const authHeader = request.headers.get('authorization');
  let user: GraphQLContext['user'];

  if (authHeader) {
    try {
      const token = authHeader.replace('Bearer ', '');
      // TODO: Verify JWT token with Cognito
      // For now, we'll parse basic user info from token
      // In production, this should verify the JWT signature
      user = await verifyAuthToken(token);
    } catch (error) {
      console.error('Auth error:', error);
      // Continue without user for public queries
    }
  }

  return {
    prisma,
    cognito: cognitoClient,
    dynamo: dynamoDocClient,
    user,
  };
};

async function verifyAuthToken(token: string): Promise<GraphQLContext['user'] | undefined> {
  try {
    // TODO: Implement JWT verification with Cognito
    // For now, return a mock user for development
    if (process.env.NODE_ENV === 'development') {
      return {
        id: 'dev-user-id',
        phone: '+255123456789',
        role: 'COUPLE',
        accountId: 'dev-account-id',
      };
    }
    
    // In production, verify the JWT token with Cognito
    // const result = await cognitoClient.send(new GetUserCommand({
    //   AccessToken: token
    // }));
    
    return undefined;
  } catch (error) {
    console.error('Token verification failed:', error);
    return undefined;
  }
}
