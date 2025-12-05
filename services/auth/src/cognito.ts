import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminConfirmSignUpCommand,
  AdminDeleteUserCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ChangePasswordCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminGetUserCommand,
  ListUsersCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  CreateGroupCommand,
  ListGroupsCommand,
  DeleteGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { z } from 'zod';

// Validation schemas
const PhoneSchema = z.string().regex(/^\+255[67]\d{8}$/, 'Invalid Tanzanian phone number');
const EmailSchema = z.string().email('Invalid email address').optional();
const RoleSchema = z.enum(['COUPLE', 'VENDOR', 'ADMIN']);

export interface CreateUserInput {
  phone: string;
  email?: string;
  role: 'COUPLE' | 'VENDOR' | 'ADMIN';
  temporaryPassword?: string;
}

export interface AuthResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserInfo {
  sub: string;
  phone: string;
  email?: string;
  role: string;
  accountId: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

class CognitoAuthService {
  private client: CognitoIdentityProviderClient;
  private userPoolId: string;
  private clientId: string;

  constructor() {
    this.userPoolId = process.env.COGNITO_USER_POOL_ID!;
    this.clientId = process.env.COGNITO_CLIENT_ID!;
    
    this.client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Create a new user in Cognito
   */
  async createUser(input: CreateUserInput): Promise<UserInfo> {
    const { phone, email, role, temporaryPassword } = input;

    // Validate input
    const validatedPhone = PhoneSchema.parse(phone);
    const validatedEmail = email ? EmailSchema.parse(email) : undefined;
    const validatedRole = RoleSchema.parse(role);

    try {
      // Create user in Cognito
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: validatedPhone,
        UserAttributes: [
          { Name: 'phone_number', Value: validatedPhone },
          { Name: 'phone_number_verified', Value: 'true' },
          ...(validatedEmail ? [{ Name: 'email', Value: validatedEmail }] : []),
          { Name: 'custom:role', Value: validatedRole },
          { Name: 'custom:account_id', Value: `acc_${Date.now()}` },
        ],
        TemporaryPassword: temporaryPassword || this.generateTemporaryPassword(),
        MessageAction: 'SUPPRESS', // Don't send welcome email
      });

      const result = await this.client.send(createUserCommand);
      
      if (!result.User) {
        throw new Error('Failed to create user');
      }

      // Set permanent password if temporary password was provided
      if (temporaryPassword) {
        await this.setUserPassword(validatedPhone, temporaryPassword);
        await this.confirmUser(validatedPhone);
      }

      return this.mapCognitoUserToUserInfo(result.User);
    } catch (error) {
      console.error('Error creating user:', error);
      throw new Error(`Failed to create user: ${error}`);
    }
  }

  /**
   * Authenticate user with phone number and password
   */
  async authenticateUser(phone: string, password: string): Promise<AuthResult> {
    const validatedPhone = PhoneSchema.parse(phone);

    try {
      const command = new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: this.clientId,
        AuthParameters: {
          USERNAME: validatedPhone,
          PASSWORD: password,
        },
      });

      const result = await this.client.send(command);

      if (!result.AuthenticationResult) {
        throw new Error('Authentication failed');
      }

      return {
        accessToken: result.AuthenticationResult.AccessToken!,
        idToken: result.AuthenticationResult.IdToken!,
        refreshToken: result.AuthenticationResult.RefreshToken!,
        expiresIn: result.AuthenticationResult.ExpiresIn!,
      };
    } catch (error) {
      console.error('Authentication error:', error);
      throw new Error('Invalid credentials');
    }
  }

  /**
   * Send OTP for phone number verification
   */
  async sendOTP(phone: string): Promise<void> {
    const validatedPhone = PhoneSchema.parse(phone);

    try {
      // Check if user exists
      const user = await this.getUser(validatedPhone);
      
      if (!user) {
        throw new Error('User not found');
      }

      // In a real implementation, you would integrate with SMS service here
      // For now, we'll simulate the OTP sending
      console.log(`Sending OTP to ${validatedPhone}`);
      
      // You would integrate with Africa's Talking SMS API here
      // await this.sendSMS(validatedPhone, `Your The Festa verification code is: ${otp}`);
    } catch (error) {
      console.error('Error sending OTP:', error);
      throw new Error('Failed to send OTP');
    }
  }

  /**
   * Verify OTP and complete authentication
   */
  async verifyOTP(phone: string, otp: string): Promise<AuthResult> {
    const validatedPhone = PhoneSchema.parse(phone);

    try {
      // In a real implementation, you would verify the OTP with your SMS service
      // For now, we'll simulate OTP verification
      if (otp !== '123456') {
        throw new Error('Invalid OTP');
      }

      // For OTP-based login, you might need to implement a custom flow
      // This is a simplified version
      const command = new InitiateAuthCommand({
        AuthFlow: 'CUSTOM_AUTH',
        ClientId: this.clientId,
        AuthParameters: {
          USERNAME: validatedPhone,
          ANSWER: otp,
        },
      });

      const result = await this.client.send(command);

      if (!result.AuthenticationResult) {
        throw new Error('OTP verification failed');
      }

      return {
        accessToken: result.AuthenticationResult.AccessToken!,
        idToken: result.AuthenticationResult.IdToken!,
        refreshToken: result.AuthenticationResult.RefreshToken!,
        expiresIn: result.AuthenticationResult.ExpiresIn!,
      };
    } catch (error) {
      console.error('OTP verification error:', error);
      throw new Error('Invalid OTP');
    }
  }

  /**
   * Get user information
   */
  async getUser(phone: string): Promise<UserInfo | null> {
    const validatedPhone = PhoneSchema.parse(phone);

    try {
      const command = new AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: validatedPhone,
      });

      const result = await this.client.send(command);
      return this.mapCognitoUserToUserInfo(result);
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  /**
   * Update user attributes
   */
  async updateUser(phone: string, attributes: Record<string, string>): Promise<void> {
    const validatedPhone = PhoneSchema.parse(phone);

    try {
      const userAttributes = Object.entries(attributes).map(([name, value]) => ({
        Name: name,
        Value: value,
      }));

      const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: this.userPoolId,
        Username: validatedPhone,
        UserAttributes: userAttributes,
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Error updating user:', error);
      throw new Error('Failed to update user');
    }
  }

  /**
   * Delete user
   */
  async deleteUser(phone: string): Promise<void> {
    const validatedPhone = PhoneSchema.parse(phone);

    try {
      const command = new AdminDeleteUserCommand({
        UserPoolId: this.userPoolId,
        Username: validatedPhone,
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Error deleting user:', error);
      throw new Error('Failed to delete user');
    }
  }

  /**
   * Change user password
   */
  async changePassword(accessToken: string, oldPassword: string, newPassword: string): Promise<void> {
    try {
      const command = new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: oldPassword,
        ProposedPassword: newPassword,
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Error changing password:', error);
      throw new Error('Failed to change password');
    }
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(phone: string): Promise<void> {
    const validatedPhone = PhoneSchema.parse(phone);

    try {
      const command = new ForgotPasswordCommand({
        ClientId: this.clientId,
        Username: validatedPhone,
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Error initiating forgot password:', error);
      throw new Error('Failed to initiate password reset');
    }
  }

  /**
   * Confirm forgot password
   */
  async confirmForgotPassword(
    phone: string,
    confirmationCode: string,
    newPassword: string
  ): Promise<void> {
    const validatedPhone = PhoneSchema.parse(phone);

    try {
      const command = new ConfirmForgotPasswordCommand({
        ClientId: this.clientId,
        Username: validatedPhone,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Error confirming forgot password:', error);
      throw new Error('Failed to reset password');
    }
  }

  /**
   * Add user to group (role management)
   */
  async addUserToGroup(phone: string, groupName: string): Promise<void> {
    const validatedPhone = PhoneSchema.parse(phone);

    try {
      const command = new AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: validatedPhone,
        GroupName: groupName,
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Error adding user to group:', error);
      throw new Error('Failed to assign role');
    }
  }

  /**
   * Remove user from group
   */
  async removeUserFromGroup(phone: string, groupName: string): Promise<void> {
    const validatedPhone = PhoneSchema.parse(phone);

    try {
      const command = new AdminRemoveUserFromGroupCommand({
        UserPoolId: this.userPoolId,
        Username: validatedPhone,
        GroupName: groupName,
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Error removing user from group:', error);
      throw new Error('Failed to remove role');
    }
  }

  /**
   * Create a new group (role)
   */
  async createGroup(groupName: string, description?: string): Promise<void> {
    try {
      const command = new CreateGroupCommand({
        UserPoolId: this.userPoolId,
        GroupName: groupName,
        Description: description,
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Error creating group:', error);
      throw new Error('Failed to create group');
    }
  }

  /**
   * List all groups
   */
  async listGroups(): Promise<Array<{ name: string; description?: string }>> {
    try {
      const command = new ListGroupsCommand({
        UserPoolId: this.userPoolId,
      });

      const result = await this.client.send(command);
      
      return result.Groups?.map(group => ({
        name: group.GroupName!,
        description: group.Description,
      })) || [];
    } catch (error) {
      console.error('Error listing groups:', error);
      throw new Error('Failed to list groups');
    }
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<UserInfo> {
    try {
      // In a real implementation, you would verify the JWT token
      // This is a simplified version
      const decoded = JSON.parse(atob(token.split('.')[1]));
      
      return {
        sub: decoded.sub,
        phone: decoded.phone_number,
        email: decoded.email,
        role: decoded['custom:role'],
        accountId: decoded['custom:account_id'],
        isVerified: decoded.phone_number_verified === 'true',
        createdAt: new Date(decoded.auth_time * 1000),
        updatedAt: new Date(decoded.iat * 1000),
      };
    } catch (error) {
      console.error('Error verifying token:', error);
      throw new Error('Invalid token');
    }
  }

  // Private helper methods
  private async setUserPassword(phone: string, password: string): Promise<void> {
    const command = new AdminSetUserPasswordCommand({
      UserPoolId: this.userPoolId,
      Username: phone,
      Password: password,
      Permanent: true,
    });

    await this.client.send(command);
  }

  private async confirmUser(phone: string): Promise<void> {
    const command = new AdminConfirmSignUpCommand({
      UserPoolId: this.userPoolId,
      Username: phone,
    });

    await this.client.send(command);
  }

  private generateTemporaryPassword(): string {
    // Generate a secure temporary password
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private mapCognitoUserToUserInfo(cognitoUser: any): UserInfo {
    const attributes = cognitoUser.Attributes || [];
    const attributeMap = attributes.reduce((acc: any, attr: any) => {
      acc[attr.Name] = attr.Value;
      return acc;
    }, {});

    return {
      sub: cognitoUser.Username,
      phone: attributeMap.phone_number,
      email: attributeMap.email,
      role: attributeMap['custom:role'] || 'COUPLE',
      accountId: attributeMap['custom:account_id'] || `acc_${Date.now()}`,
      isVerified: attributeMap.phone_number_verified === 'true',
      createdAt: cognitoUser.UserCreateDate,
      updatedAt: cognitoUser.UserLastModifiedDate,
    };
  }
}

// Export singleton instance
export const cognitoAuth = new CognitoAuthService();
