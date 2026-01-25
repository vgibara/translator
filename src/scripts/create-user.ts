import { authService } from '../services/auth.service.js';
import { prisma } from '../utils/prisma.js';

async function main() {
  const name = process.argv[2];
  const email = process.argv[3];

  if (!name) {
    console.error('Usage: node scripts/create-user.js <name> [email]');
    process.exit(1);
  }

  try {
    const user = await authService.createUser(name, email);
    console.log('API Key created successfully!');
    console.log('---------------------------');
    console.log(`Name:    ${user.name}`);
    if (user.email) console.log(`Email:   ${user.email}`);
    console.log(`API Key: ${user.apiKey}`);
    console.log('---------------------------');
    console.log('KEEP THIS KEY SECRET!');
  } catch (error: any) {
    console.error('Error creating user:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
