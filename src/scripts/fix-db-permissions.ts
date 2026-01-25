import pg from 'pg';
const { Client } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Connected to database to fix permissions...');
    
    // Extract user from connection string
    const url = new URL(connectionString);
    const user = url.username;

    await client.query(`GRANT ALL ON SCHEMA public TO ${user};`);
    await client.query(`GRANT ALL ON SCHEMA public TO public;`);
    await client.query(`ALTER SCHEMA public OWNER TO ${user};`);
    
    console.log(`Permissions granted to user ${user} on schema public.`);
  } catch (err: any) {
    console.warn('Could not grant permissions (might not be an admin):', err.message);
    // We don't exit with error here because sometimes the user doesn't have 
    // permission to grant permissions, but the schema might still work.
  } finally {
    await client.end();
  }
}

main();
