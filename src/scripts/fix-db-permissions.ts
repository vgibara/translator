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
      rejectUnauthorized: false // Ignore self-signed certificates
    }
  });

  // Force SSL for pg client
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    await client.connect();
    console.log('Connected to database to fix permissions...');
    
    // Extract user from connection string or query it
    const res = await client.query('SELECT current_user');
    const user = res.rows[0].current_user;

    console.log(`Granting permissions to user: ${user}`);
    await client.query(`GRANT ALL ON SCHEMA public TO "${user}";`);
    await client.query(`GRANT ALL ON SCHEMA public TO public;`);
    
    console.log(`Permissions successfully granted to ${user}.`);
  } catch (err: any) {
    console.warn('Could not grant permissions (might not be an admin):', err.message);
    // We don't exit with error here because sometimes the user doesn't have 
    // permission to grant permissions, but the schema might still work.
  } finally {
    await client.end();
  }
}

main();
