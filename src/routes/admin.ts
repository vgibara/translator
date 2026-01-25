import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';

declare module 'fastify' {
  interface Session {
    userEmail?: string;
  }
}

// vgibara@gmail.com is the "Super Admin" who can always log in
const SUPER_ADMIN = 'vgibara@gmail.com';

export async function adminRoutes(fastify: FastifyInstance) {
  
  // Login Callback
  fastify.get('/login/google/callback', async function (request, reply) {
    try {
      const { token } = await (fastify as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` }
      });
      const googleUser = await response.json();

      if (!googleUser.email) {
        return reply.status(400).send('Google did not return an email.');
      }

      // Check if user is Super Admin or in AdminUser table
      const isAdmin = googleUser.email === SUPER_ADMIN || await prisma.adminUser.findUnique({
        where: { email: googleUser.email }
      });

      if (isAdmin) {
        request.session.userEmail = googleUser.email;
        reply.redirect('/admin');
      } else {
        reply.status(403).send('<h1>Access Denied</h1><p>You are not authorized to access this admin panel.</p><a href="/">Go back</a>');
      }
    } catch (err) {
      reply.status(500).send('Authentication failed');
    }
  });

  // Logout
  fastify.get('/logout', async (request, reply) => {
    request.session.destroy();
    reply.redirect('/');
  });

  // Middleware de sécurité
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/login/google/callback')) return;
    if (!request.session.userEmail) {
      return reply.status(401).send('<h1>Admin</h1><p>You must be logged in.</p><a href="/login/google">Login with Google</a>');
    }
  });

  // Page d'accueil Admin
  fastify.get('/admin', async (request, reply) => {
    const users = await prisma.user.findMany({
      include: { _count: { select: { jobs: true } } },
      orderBy: { createdAt: 'desc' }
    });

    const admins = await prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Translator Admin</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      </head>
      <body class="bg-light">
        <nav class="navbar navbar-dark bg-dark mb-4">
          <div class="container">
            <span class="navbar-brand mb-0 h1">Translator Admin</span>
            <span class="navbar-text">
              Logged in as ${request.session.userEmail} | <a href="/logout" class="text-light">Logout</a>
            </span>
          </div>
        </nav>
        <div class="container pb-5">
          <div class="row">
            <!-- Management Keys -->
            <div class="col-md-8">
              <div class="card shadow-sm mb-4">
                <div class="card-body">
                  <div class="d-flex justify-content-between align-items-center">
                    <h5 class="card-title">Active API Keys</h5>
                    <button class="btn btn-sm btn-primary" data-bs-toggle="collapse" data-bs-target="#createKeyForm">+ Create Key</button>
                  </div>
                  
                  <div class="collapse mt-3 mb-3" id="createKeyForm">
                    <div class="p-3 border rounded bg-light">
                      <h6>New API Key</h6>
                      <form method="POST" action="/admin/users/create">
                        <div class="row g-2">
                          <div class="col-md-5">
                            <input type="text" name="name" class="form-control" required placeholder="Key Name (e.g. Website)">
                          </div>
                          <div class="col-md-5">
                            <input type="email" name="email" class="form-control" placeholder="Email (Optional)">
                          </div>
                          <div class="col-md-2">
                            <button type="submit" class="btn btn-success w-100">Add</button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </div>

                  <table class="table table-hover mt-3">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>API Key</th>
                        <th>Jobs</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${users.map(u => `
                        <tr>
                          <td><strong>${u.name || 'Unnamed'}</strong>${u.email ? `<br><small class="text-muted">${u.email}</small>` : ''}</td>
                          <td><code>${u.apiKey}</code></td>
                          <td><span class="badge bg-info">${u._count.jobs}</span></td>
                          <td>${u.createdAt.toLocaleDateString()}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                  <a href="/admin/jobs" class="btn btn-outline-secondary">View All Translation Archives</a>
                </div>
              </div>
            </div>

            <!-- Management Admins -->
            <div class="col-md-4">
              <div class="card shadow-sm mb-4">
                <div class="card-body">
                  <h5 class="card-title">Authorized Admins</h5>
                  <p class="small text-muted">These Google accounts can access this dashboard.</p>
                  
                  <form method="POST" action="/admin/admins/create" class="mb-3">
                    <div class="input-group input-group-sm">
                      <input type="email" name="email" class="form-control" placeholder="google-email@gmail.com" required>
                      <button class="btn btn-dark" type="submit">Authorize</button>
                    </div>
                  </form>

                  <ul class="list-group list-group-flush">
                    <li class="list-group-item d-flex justify-content-between align-items-center bg-light">
                      ${SUPER_ADMIN} <span class="badge bg-dark">Super Admin</span>
                    </li>
                    ${admins.map(a => `
                      <li class="list-group-item d-flex justify-content-between align-items-center">
                        ${a.email}
                        <form method="POST" action="/admin/admins/delete" onsubmit="return confirm('Remove access?')">
                          <input type="hidden" name="id" value="${a.id}">
                          <button type="submit" class="btn btn-link text-danger p-0" style="text-decoration:none">&times;</button>
                        </form>
                      </li>
                    `).join('')}
                  </ul>
                </div>
              </div>

              <div class="card shadow-sm">
                <div class="card-body">
                   <h5 class="card-title">Monitoring</h5>
                   <a href="/admin/queues" class="btn btn-sm btn-outline-info w-100">Real-time Queues</a>
                </div>
              </div>
            </div>
          </div>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
      </body>
      </html>
    `;
    reply.type('text/html').send(html);
  });

  // Action: Create Key
  fastify.post('/admin/users/create', async (request, reply) => {
    const { email, name } = request.body as { email: string, name?: string };
    await authService.createUser(name || 'Unnamed', email);
    reply.redirect('/admin');
  });

  // Action: Add Admin
  fastify.post('/admin/admins/create', async (request, reply) => {
    const { email } = request.body as { email: string };
    try {
      await prisma.adminUser.create({ data: { email } });
    } catch (e) {}
    reply.redirect('/admin');
  });

  // Action: Remove Admin
  fastify.post('/admin/admins/delete', async (request, reply) => {
    const { id } = request.body as { id: string };
    await prisma.adminUser.delete({ where: { id } });
    reply.redirect('/admin');
  });

  // Route: History
  fastify.get('/admin/jobs', async (request, reply) => {
    const jobs = await prisma.translationJob.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } } }
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Archives</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      </head>
      <body class="bg-light">
        <div class="container mt-5 pb-5">
          <div class="d-flex justify-content-between align-items-center">
            <h2>Translation Archives (Last 50)</h2>
            <a href="/admin" class="btn btn-sm btn-outline-primary">Back</a>
          </div>
          <hr>
          <div class="card shadow-sm">
            <table class="table table-sm table-hover mb-0">
              <thead class="table-dark">
                <tr>
                  <th>Date</th>
                  <th>Key Name</th>
                  <th>Lang</th>
                  <th>Status</th>
                  <th>Meta</th>
                </tr>
              </thead>
              <tbody>
                ${jobs.map(j => `
                  <tr>
                    <td><small>${j.createdAt.toLocaleString()}</small></td>
                    <td><small>${j.user.name || j.user.email || 'N/A'}</small></td>
                    <td><span class="badge bg-secondary">${j.sourceLang || '??'} → ${j.targetLang}</span></td>
                    <td><span class="badge ${j.status === 'COMPLETED' ? 'bg-success' : j.status === 'FAILED' ? 'bg-danger' : 'bg-warning'}">${j.status}</span></td>
                    <td><button class="btn btn-xs btn-light border p-0 px-1" onclick='alert(${JSON.stringify(JSON.stringify(j.metadata, null, 2))})'>info</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
    `;
    reply.type('text/html').send(html);
  });
}
