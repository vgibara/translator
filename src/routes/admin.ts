import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';

declare module 'fastify' {
  interface Session {
    userEmail?: string;
  }
}

const AUTHORIZED_ADMINS = ['vgibara@gmail.com'];

export async function adminRoutes(fastify: FastifyInstance) {
  
  // Login Callback
  fastify.get('/login/google/callback', async function (request, reply) {
    try {
      const { token } = await (fastify as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      
      // Fetch user info from Google
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` }
      });
      const user = await response.json();

      if (user.email && AUTHORIZED_ADMINS.includes(user.email)) {
        request.session.userEmail = user.email;
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

  // Middleware de sécurité pour l'admin
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip protection for callback
    if (request.url.startsWith('/login/google/callback')) return;

    if (!request.session.userEmail) {
      return reply.status(401).send('<h1>Admin</h1><p>You must be logged in.</p><a href="/login/google" class="btn btn-primary">Login with Google</a>');
    }
  });

  // Page d'accueil Admin : Liste des utilisateurs et création
  fastify.get('/admin', async (request, reply) => {
    const users = await prisma.user.findMany({
      include: { _count: { select: { jobs: true } } },
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
        <div class="container">
          <div class="row">
            <div class="col-md-4">
              <div class="card shadow-sm mb-4">
                <div class="card-body">
                  <h5 class="card-title">Create New API Key</h5>
                  <form method="POST" action="/admin/users/create">
                    <div class="mb-3">
                      <label class="form-label">Key Name (Identification)</label>
                      <input type="text" name="name" class="form-control" required placeholder="e.g. Mobile App, Client X">
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Email (Optional)</label>
                      <input type="email" name="email" class="form-control">
                    </div>
                    <button type="submit" class="btn btn-primary w-100">Generate Key</button>
                  </form>
                </div>
              </div>
            </div>
            
            <div class="col-md-8">
              <div class="card shadow-sm">
                <div class="card-body">
                  <h5 class="card-title">Active API Keys</h5>
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
                  <div class="mt-3">
                    <a href="/admin/jobs" class="btn btn-outline-secondary">View All Translation Archives</a>
                    <a href="/admin/queues" class="btn btn-outline-info">View Real-time Queues</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    reply.type('text/html').send(html);
  });

  // Route pour créer un utilisateur
  fastify.post('/admin/users/create', async (request, reply) => {
    const { email, name } = request.body as { email: string, name?: string };
    await authService.createUser(name || 'Unnamed', email);
    reply.redirect('/admin');
  });

  // Route pour voir les archives des jobs
  fastify.get('/admin/jobs', async (request, reply) => {
    const jobs = await prisma.translationJob.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } }
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Translation Archives</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      </head>
      <body class="bg-light">
        <div class="container mt-5">
          <div class="d-flex justify-content-between align-items-center">
            <h2>Translation Archives (Last 50)</h2>
            <a href="/admin" class="btn btn-sm btn-outline-primary">Back to Management</a>
          </div>
          <hr>
          
          <div class="card shadow-sm">
            <div class="table-responsive">
              <table class="table table-sm table-hover mb-0">
                <thead class="table-dark">
                  <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Lang</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${jobs.map(j => `
                    <tr>
                      <td><small>${j.createdAt.toLocaleString()}</small></td>
                      <td><small>${j.user.email || 'N/A'}</small></td>
                      <td><span class="badge bg-secondary">${j.sourceLang || '??'} → ${j.targetLang}</span></td>
                      <td>
                        <span class="badge ${j.status === 'COMPLETED' ? 'bg-success' : j.status === 'FAILED' ? 'bg-danger' : 'bg-warning'}">
                          ${j.status}
                        </span>
                      </td>
                      <td>
                         <button class="btn btn-xs btn-light border py-0 px-1" onclick='alert(${JSON.stringify(JSON.stringify(j.metadata, null, 2))})'>Meta</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    reply.type('text/html').send(html);
  });
}