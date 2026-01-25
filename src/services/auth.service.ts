import { prisma } from '../utils/prisma.js';
import crypto from 'crypto';

export class AuthService {
  async validateApiKey(apiKey: string) {
    return await prisma.user.findUnique({
      where: { apiKey },
    });
  }

  async createUser(name: string, email?: string) {
    const apiKey = `tr_${crypto.randomBytes(24).toString('hex')}`;
    const normalizedEmail = email && email.trim() !== '' ? email.trim() : null;
    
    return await prisma.user.create({
      data: {
        email: normalizedEmail,
        name,
        apiKey,
      },
    });
  }
}

export const authService = new AuthService();
