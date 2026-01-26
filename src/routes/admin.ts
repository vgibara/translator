import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';

declare module 'fastify' {
  interface Session {
    userEmail?: string;
  }
}

const SUPER_ADMIN = 'vgibara@gmail.com';

/**
 * Layout wrapper with Tailwind and Theme toggle logic
 */
const layout = (content: string, userEmail?: string) => `
<!DOCTYPE html>
<html lang="fr" class="">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Translator Admin 🌐</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        gray: {
                            950: '#030712',
                        }
                    }
                }
            }
        }
        
        function toggleTheme() {
            if (document.documentElement.classList.contains('dark')) {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
            } else {
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
            }
        }
        
        // Initial theme check
        if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        }
    </script>
    <style>
        .font-sans { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    </style>
</head>
<body class="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-sans min-h-screen flex flex-col transition-colors duration-200">

    <!--Navbar -->
    <nav class="bg-gray-800 dark:bg-gray-950 text-white sticky top-0 z-50 shadow-lg">
        <div class="container mx-auto px-4 py-3 flex justify-between items-center">
            <div class="flex items-center gap-6">
                <a href="/admin" class="text-xl font-bold flex items-center gap-2">
                    <span>🌐</span> Translator
                </a>
                <div class="hidden md:flex gap-4">
                    <a href="/admin" class="px-3 py-1 rounded hover:bg-gray-700 transition-colors">Clés API</a>
                    <a href="/admin/jobs" class="px-3 py-1 rounded hover:bg-gray-700 transition-colors">Archives</a>
                    <a href="/admin/queues" class="px-3 py-1 rounded hover:bg-gray-700 transition-colors">Files d'attente</a>
                </div>
            </div>
            
            <div class="flex items-center gap-4">
                <button onclick="toggleTheme()" class="p-2 rounded-full hover:bg-gray-700 transition-colors" title="Toggle Theme">
                    <span class="dark:hidden">🌙</span>
                    <span class="hidden dark:inline">☀️</span>
                </button>
                ${userEmail ? `
                    <div class="flex items-center gap-3 pl-4 border-l border-gray-700">
                        <span class="hidden sm:inline text-sm text-gray-300">${userEmail}</span>
                        <a href="/logout" class="text-sm bg-red-600 hover:bg-red-700 px-3 py-1 rounded transition-colors">Quitter</a>
                    </div>
                ` : ''}
            </div>
        </div>
    </nav>

    <!-- Main Content -->
    <main class="container mx-auto px-4 mt-8 flex-grow">
        ${content}
    </main>

    <!-- Footer -->
    <footer class="bg-gray-800 dark:bg-gray-950 text-gray-400 py-6 mt-12">
        <div class="container mx-auto text-center text-sm">
            &copy; 2026 DeepL Translator API | Design System v2.0
        </div>
    </footer>

</body>
</html>
`;

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

      const isAdmin = googleUser.email === SUPER_ADMIN || await prisma.adminUser.findUnique({
        where: { email: googleUser.email }
      });

      if (isAdmin) {
        request.session.userEmail = googleUser.email;
        reply.redirect('/admin');
      } else {
        reply.status(403).type('text/html').send(layout(`
            <div class="max-w-md mx-auto bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div class="text-red-500 text-5xl mb-4">🚫</div>
                <h1 class="text-2xl font-bold mb-2">Accès Refusé</h1>
                <p class="text-gray-500 dark:text-gray-400 mb-6">Vous n\'êtes pas autorisé à accéder à ce panel.</p>
                <a href="/" class="text-blue-500 hover:underline">Retour</a>
            </div>
        `));
      }
    } catch (err) {
      reply.status(500).send('Authentication failed');
    }
  });

  fastify.get('/logout', async (request, reply) => {
    request.session.destroy();
    reply.redirect('/');
  });

  // Security Middleware
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/login/google/callback')) return;
    if (!request.session.userEmail) {
      return reply.status(401).type('text/html').send(layout(`
        <div class="max-w-md mx-auto bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center mt-20">
            <h1 class="text-2xl font-bold mb-4">Administration</h1>
            <p class="text-gray-500 dark:text-gray-400 mb-8">Veuillez vous authentifier pour accéder à la gestion.</p>
            <a href="/login/google" class="inline-flex items-center gap-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-white px-6 py-3 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all font-medium">
                <img src="https://www.google.com/favicon.ico" class="w-5 h-5" alt="Google">
                Connexion avec Google
            </a>
        </div>
      `));
    }
  });

  // API: Get Job Details
  fastify.get('/admin/jobs/:id/data', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await prisma.translationJob.findUnique({
      where: { id },
      include: { callbackLogs: { orderBy: { createdAt: 'desc' } } }
    });
    return job;
  });

  // Dashboard Page
  fastify.get('/admin', async (request, reply) => {
    const users = await prisma.user.findMany({
      include: { _count: { select: { jobs: true } } },
      orderBy: { createdAt: 'desc' }
    });

    const admins = await prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const stats = {
      totalKeys: users.length,
      totalJobs: users.reduce((acc, u) => acc + u._count.jobs, 0),
      totalAdmins: admins.length + 1
    };

    const content = `
        <!-- Stats Bar -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <p class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Clés API Actives</p>
                <h3 class="text-3xl font-bold">${stats.totalKeys}</h3>
                <div class="w-full bg-gray-100 dark:bg-gray-700 h-1 rounded-full mt-4">
                    <div class="bg-blue-500 h-1 rounded-full" style="width: 70%"></div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <p class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Traductions</p>
                <h3 class="text-3xl font-bold">${stats.totalJobs}</h3>
                <div class="w-full bg-gray-100 dark:bg-gray-700 h-1 rounded-full mt-4">
                    <div class="bg-green-500 h-1 rounded-full" style="width: 85%"></div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <p class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Administrateurs</p>
                <h3 class="text-3xl font-bold">${stats.totalAdmins}</h3>
                <div class="w-full bg-gray-100 dark:bg-gray-700 h-1 rounded-full mt-4">
                    <div class="bg-purple-500 h-1 rounded-full" style="width: 40%"></div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Left: API Keys -->
            <div class="lg:col-span-2">
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                        <h2 class="text-lg font-bold">Gestion des Clés API</h2>
                        <button onclick="document.getElementById('keyModal').classList.remove('hidden')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all">+ Nouvelle Clé</button>
                    </div>
                    <div class="overflow-x-auto text-sm">
                        <table class="w-full">
                            <thead class="bg-gray-50 dark:bg-gray-900/50">
                                <tr>
                                    <th class="px-6 py-4 text-left font-semibold">Identification</th>
                                    <th class="px-6 py-4 text-left font-semibold">Clé API</th>
                                    <th class="px-6 py-4 text-center font-semibold">Jobs</th>
                                    <th class="px-6 py-4 text-right font-semibold">Création</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                                ${users.map(u => `
                                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td class="px-6 py-4">
                                            <div class="font-bold">${u.name || 'Sans nom'}</div>
                                            <div class="text-gray-500 text-xs">${u.email || ''}</div>
                                        </td>
                                        <td class="px-6 py-4 font-mono text-blue-500 dark:text-blue-400">${u.apiKey}</td>
                                        <td class="px-6 py-4 text-center">
                                            <span class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-bold">${u._count.jobs}</span>
                                        </td>
                                        <td class="px-6 py-4 text-right text-gray-500">${u.createdAt.toLocaleDateString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Right: Admin Access -->
            <div class="space-y-8">
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                    <h2 class="text-lg font-bold mb-4">Accès Administrateur</h2>
                    <form method="POST" action="/admin/admins/create" class="flex gap-2 mb-6">
                        <input type="email" name="email" placeholder="Email Google" class="flex-grow bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required>
                        <button type="submit" class="bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 rounded-lg text-sm font-bold">Ajouter</button>
                    </form>
                    
                    <div class="space-y-3">
                        <div class="flex justify-between items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                            <span class="text-sm font-medium">${SUPER_ADMIN}</span>
                            <span class="text-[10px] bg-gray-800 text-white px-2 py-0.5 rounded uppercase font-bold tracking-widest">Master</span>
                        </div>
                        ${admins.map(a => `
                            <div class="flex justify-between items-center p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                                <span class="text-sm">${a.email}</span>
                                <form method="POST" action="/admin/admins/delete" onsubmit="return confirm('Supprimer cet accès ?')">
                                    <input type="hidden" name="id" value="${a.id}">
                                    <button type="submit" class="text-red-500 hover:text-red-700 text-xl font-bold px-2">&times;</button>
                                </form>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal Create Key -->
        <div id="keyModal" class="hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200 dark:border-gray-700">
                <div class="p-6">
                    <h3 class="text-xl font-bold mb-4">Générer une clé API</h3>
                    <form method="POST" action="/admin/users/create">
                        <div class="space-y-4">
                            <div>
                                <label class="text-xs font-bold text-gray-400 uppercase">Nom de la clé</label>
                                <input type="text" name="name" required placeholder="ex: App iOS Client X" class="w-full mt-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="text-xs font-bold text-gray-400 uppercase">Email associé (Optionnel)</label>
                                <input type="email" name="email" placeholder="client@exemple.com" class="w-full mt-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                        </div>
                        <div class="mt-8 flex gap-3">
                            <button type="button" onclick="document.getElementById('keyModal').classList.add('hidden')" class="flex-grow bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-3 rounded-xl font-bold">Annuler</button>
                            <button type="submit" class="flex-grow bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20">Créer la clé</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    reply.type('text/html').send(layout(content, request.session.userEmail));
  });

  // Action: Create Key
  fastify.post('/admin/users/create', async (request, reply) => {
    const { email, name } = request.body as { email?: string, name: string };
    await authService.createUser(name, email);
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

  // Archives Page
  fastify.get('/admin/jobs', async (request, reply) => {
    const jobs = await prisma.translationJob.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } } }
    });

    const content = `
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-2xl font-bold text-gray-800 dark:text-white">Archives des Traductions</h1>
            <a href="/admin" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-lg text-sm transition-all hover:shadow-sm">← Retour</a>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="overflow-x-auto text-xs md:text-sm">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                            <th class="px-6 py-4 text-left font-semibold">Date</th>
                            <th class="px-6 py-4 text-left font-semibold">Source Key</th>
                            <th class="px-6 py-4 text-center font-semibold">Traductions</th>
                            <th class="px-6 py-4 text-center font-semibold">Statut</th>
                            <th class="px-6 py-4 text-right font-semibold">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                        ${jobs.map(j => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                <td class="px-6 py-4 whitespace-nowrap text-gray-500 font-mono">
                                    ${j.createdAt.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td class="px-6 py-4">
                                    <div class="font-bold">${j.user.name || 'N/A'}</div>
                                    <div class="text-[10px] text-gray-400 font-mono">${j.callbackUrl}</div>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <div class="flex items-center justify-center gap-2">
                                        <span class="bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 uppercase font-bold text-[10px]">${j.sourceLang || '??'}</span>
                                        <span class="text-gray-400">→</span>
                                        <span class="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded border border-blue-200 dark:border-blue-800 uppercase font-bold text-[10px]">${j.targetLang}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${ 
                                        j.status === 'COMPLETED' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 
                                        j.status === 'FAILED' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 
                                        'bg-yellow-100 text-yellow-600'
                                    }">
                                        ${j.status}
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <button 
                                        onclick="loadJobDetails('${j.id}')" 
                                        id="btn-${j.id}"
                                        class="text-blue-500 hover:text-blue-700 font-bold px-2 transition-all">Détails</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Modal Details -->
        <div id="detailsModal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
                <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                    <h3 class="text-xl font-bold">Détails de la Traduction</h3>
                    <button onclick="document.getElementById('detailsModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 dark:hover:text-white text-3xl">&times;</button>
                </div>
                
                <!-- Tabs Header -->
                <div class="flex border-b border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/30">
                    <button onclick="switchTab('input')" id="tab-input" class="px-6 py-3 text-sm font-bold border-b-2 border-blue-500 text-blue-600">📥 Source</button>
                    <button onclick="switchTab('output')" id="tab-output" class="px-6 py-3 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">📤 Résultat</button>
                    <button onclick="switchTab('logs')" id="tab-logs" class="px-6 py-3 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">📜 Logs Callback</button>
                    <button onclick="switchTab('meta')" id="tab-meta" class="px-6 py-3 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">ℹ️ Meta</button>
                </div>

                <!-- Tab Contents -->
                <div class="p-6 overflow-auto flex-grow bg-white dark:bg-gray-800">
                    <div id="content-input" class="tab-content">
                        <pre class="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-xs font-mono whitespace-pre-wrap"></pre>
                    </div>
                    <div id="content-output" class="tab-content hidden">
                        <pre class="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-xs font-mono whitespace-pre-wrap"></pre>
                    </div>
                    <div id="content-logs" class="tab-content hidden">
                        <div class="space-y-3"></div>
                    </div>
                    <div id="content-meta" class="tab-content hidden">
                        <pre class="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-xs font-mono whitespace-pre-wrap"></pre>
                    </div>
                </div>

                <div class="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex justify-end">
                    <button onclick="document.getElementById('detailsModal').classList.add('hidden')" class="bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 px-8 py-2 rounded-xl font-bold transition-transform hover:scale-105">Fermer</button>
                </div>
            </div>
        </div>

        <script>
            function switchTab(tab) {
                ['input', 'output', 'logs', 'meta'].forEach(t => {
                    document.getElementById('tab-' + t).classList.remove('border-blue-500', 'text-blue-600');
                    document.getElementById('tab-' + t).classList.add('border-transparent', 'text-gray-500');
                    document.getElementById('content-' + t).classList.add('hidden');
                });
                document.getElementById('tab-' + tab).classList.add('border-blue-500', 'text-blue-600');
                document.getElementById('tab-' + tab).classList.remove('border-transparent', 'text-gray-500');
                document.getElementById('content-' + tab).classList.remove('hidden');
            }

            async function loadJobDetails(id) {
                const btn = document.getElementById('btn-' + id);
                const originalText = btn.textContent;
                btn.textContent = '...';
                btn.disabled = true;

                try {
                    const response = await fetch(`/admin/jobs/${id}/data`);
                    const data = await response.json();
                    
                    document.querySelector('#content-input pre').textContent = JSON.stringify(data.inputJson, null, 2);
                    document.querySelector('#content-output pre').textContent = data.outputJson ? JSON.stringify(data.outputJson, null, 2) : "Aucun résultat disponible";
                    document.querySelector('#content-meta pre').textContent = JSON.stringify({ 
                        metadata: data.metadata, 
                        error: data.error,
                        bullJobId: data.bullJobId 
                    }, null, 2);
                    
                    const logsDiv = document.querySelector('#content-logs div');
                    logsDiv.innerHTML = '';
                    if (!data.callbackLogs || data.callbackLogs.length === 0) {
                        logsDiv.innerHTML = '<p class="text-gray-500 italic text-center py-8">Aucune tentative de rappel enregistrée.</p>';
                    } else {
                        data.callbackLogs.forEach(log => {
                            const date = new Date(log.createdAt).toLocaleString();
                            const isSuccess = log.status >= 200 && log.status < 300;
                            logsDiv.innerHTML += `
                                <div class="p-3 rounded-lg border ${isSuccess ? 'border-green-100 bg-green-50 dark:bg-green-900/20 dark:border-green-800' : 'border-red-100 bg-red-50 dark:bg-red-900/20 dark:border-red-800'}">
                                    <div class="flex justify-between font-bold text-xs mb-1">
                                        <span class="${isSuccess ? 'text-green-600' : 'text-red-600'}">Status: ${log.status}</span>
                                        <span class="text-gray-400">${date}</span>
                                    </div>
                                    <div class="text-[10px] font-mono break-all opacity-75">${log.error || log.response || 'No response body'}</div>
                                </div>
                            `;
                        });
                    }

                    switchTab('input');
                    document.getElementById('detailsModal').classList.remove('hidden');
                } catch (err) {
                    alert('Erreur lors du chargement des détails');
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            }
        </script>
    `;
    reply.type('text/html').send(layout(content, request.session.userEmail));
  });
}