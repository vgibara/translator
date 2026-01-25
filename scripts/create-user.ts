import { authService } from '../src/services/auth.service.js';
import { prisma } from '../src/utils/prisma.js';

async function main() {
  const email = process.argv[2];
  const name = process.argv[3];

  if (!email) {
    console.error('Usage: node scripts/create-user.js <email> [name]');
    process.exit(1);
  }

  try {
    const user = await authService.createUser(email, name);
    console.log('User created successfully!');
    console.log('---------------------------');
    console.log(`Email:   ${user.email}`);
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
