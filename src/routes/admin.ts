import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';
/// <reference types="luxon" />
import { DateTime } from 'luxon';

declare module 'fastify' {
  interface Session {
    userEmail?: string;
  }
}

const SUPER_ADMIN = 'vgibara@gmail.com';
const TIMEZONE = 'America/Toronto';

/**
 * Layout wrapper with Tailwind and Theme toggle logic
 */
const layout = (content: string, userEmail?: string) => `
<!DOCTYPE html>
<html lang="fr">
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
        
        if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        }
    </script>
</head>
<body class="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-sans min-h-screen flex flex-col transition-colors duration-200">
    <nav class="bg-gray-800 dark:bg-gray-950 text-white sticky top-0 z-50 shadow-lg">
        <div class="container mx-auto px-4 py-3 flex justify-between items-center">
            <div class="flex items-center gap-6">
                <a href="/admin" class="text-xl font-bold flex items-center gap-2">
                    <span>🌐</span> Translator
                </a>
                <div class="hidden md:flex gap-4 text-sm font-medium text-gray-300">
                    <a href="/admin" class="px-3 py-1 rounded hover:bg-gray-700 hover:text-white transition-colors">Clés API</a>
                    <a href="/admin/jobs" class="px-3 py-1 rounded hover:bg-gray-700 hover:text-white transition-colors">Archives</a>
                    <a href="/admin/queues" class="px-3 py-1 rounded hover:bg-gray-700 hover:text-white transition-colors">Files d'attente</a>
                </div>
            </div>
            
            <div class="flex items-center gap-4">
                <button onclick="toggleTheme()" class="p-2 rounded-full hover:bg-gray-700 transition-colors">
                    <span class="dark:hidden">🌙</span>
                    <span class="hidden dark:inline">☀️</span>
                </button>
                ${userEmail ? `
                    <div class="flex items-center gap-3 pl-4 border-l border-gray-700">
                        <span class="hidden sm:inline text-sm text-gray-300">${userEmail}</span>
                        <a href="/logout" class="text-xs bg-red-600 hover:bg-red-700 px-3 py-1 rounded transition-colors font-bold uppercase tracking-wider">Quitter</a>
                    </div>
                ` : ''}
            </div>
        </div>
    </nav>

    <main class="container mx-auto px-4 mt-8 flex-grow">
        ${content}
    </main>

    <footer class="bg-gray-800 dark:bg-gray-950 text-gray-400 py-8 mt-12 border-t border-gray-700/50">
        <div class="container mx-auto text-center text-xs font-medium tracking-widest uppercase">
            &copy; 2026 DeepL Translator API | Intelligent Content Gateway
        </div>
    </footer>
</body>
</html>
`;

export async function adminRoutes(fastify: FastifyInstance) {
  
  // Auth Callback
  fastify.get('/login/google/callback', async function (request, reply) {
    try {
      const { token } = await (fastify as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` }
      });
      const googleUser = await response.json();

      if (!googleUser.email) return reply.status(400).send('No email returned');

      const isAdmin = googleUser.email === SUPER_ADMIN || await prisma.adminUser.findUnique({ where: { email: googleUser.email } });

      if (isAdmin) {
        request.session.userEmail = googleUser.email;
        reply.redirect('/admin');
      } else {
        reply.status(403).type('text/html').send(layout('<div class="max-w-md mx-auto text-center bg-white dark:bg-gray-800 p-12 rounded-2xl shadow-xl border border-red-100 dark:border-red-900/30 mt-20"><h1 class="text-4xl mb-4">🚫</h1><h2 class="text-2xl font-bold mb-2">Accès Refusé</h2><p class="text-gray-500 mb-8">Votre compte n\'est pas autorisé.</p><a href="/" class="text-blue-500 font-bold hover:underline">Retour</a></div>'));
      }
    } catch (err) {
      reply.status(500).send('Auth error');
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
        <div class="max-w-md mx-auto bg-white dark:bg-gray-800 p-10 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center mt-20">
            <h1 class="text-2xl font-black mb-4 uppercase tracking-tighter">Administration</h1>
            <p class="text-gray-500 dark:text-gray-400 mb-10 text-sm">Veuillez vous authentifier pour accéder à la gestion du service.</p>
            <a href="/login/google" class="inline-flex items-center gap-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-8 py-4 rounded-xl hover:scale-105 transition-all font-bold shadow-lg shadow-blue-500/10">
                <img src="https://www.google.com/favicon.ico" class="w-5 h-5" alt="G">
                Continuer avec Google
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

  // Main Admin Page
  fastify.get('/admin', async (request, reply) => {
    const [users, admins] = await Promise.all([
      prisma.user.findMany({ include: { _count: { select: { jobs: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.adminUser.findMany({ orderBy: { createdAt: 'desc' } })
    ]);

    const stats = {
      totalKeys: users.length,
      totalJobs: users.reduce((acc: number, u: any) => acc + u._count.jobs, 0),
      totalAdmins: admins.length + 1
    };

    const content = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Clés API Actives</p>
                <h3 class="text-4xl font-black">${stats.totalKeys}</h3>
                <div class="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full mt-6 overflow-hidden"><div class="bg-blue-500 h-full w-2/3"></div></div>
            </div>
            <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Total Traductions</p>
                <h3 class="text-4xl font-black">${stats.totalJobs}</h3>
                <div class="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full mt-6 overflow-hidden"><div class="bg-green-500 h-full w-4/5"></div></div>
            </div>
            <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Admins</p>
                <h3 class="text-4xl font-black">${stats.totalAdmins}</h3>
                <div class="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full mt-6 overflow-hidden"><div class="bg-purple-500 h-full w-1/3"></div></div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 space-y-6">
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/30 dark:bg-gray-900/30">
                        <h2 class="font-black uppercase tracking-tight text-sm">Gestion des Clés API</h2>
                        <button onclick="document.getElementById('keyModal').classList.remove('hidden')" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider hover:bg-blue-700 transition-all">+ Nouvelle Clé</button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50/50 dark:bg-gray-950/50 text-[10px] uppercase font-black text-gray-400 tracking-widest">
                                <tr>
                                    <th class="px-6 py-4 text-left">Identification</th>
                                    <th class="px-6 py-4 text-left">Clé API</th>
                                    <th class="px-6 py-4 text-center">Jobs</th>
                                    <th class="px-6 py-4 text-right">Date</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                                ${users.map((u: any) => `
                                    <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                                        <td class="px-6 py-4"><div class="font-bold">${u.name || 'Sans nom'}</div><div class="text-[10px] text-gray-400 font-medium italic">${u.email || ''}</div></td>
                                        <td class="px-6 py-4 font-mono text-blue-500 dark:text-blue-400 text-xs">${u.apiKey}</td>
                                        <td class="px-6 py-4 text-center"><span class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-[10px] font-black">${u._count.jobs}</span></td>
                                        <td class="px-6 py-4 text-right text-gray-400 text-[10px] font-bold uppercase">${DateTime.fromJSDate(u.createdAt).setZone(TIMEZONE).toFormat('yyyy-MM-dd')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="text-center"><a href="/admin/jobs" class="inline-block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:shadow-lg transition-all">Consulter les Archives</a></div>
            </div>

            <div class="space-y-6">
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                    <h2 class="font-black uppercase tracking-tight text-sm mb-6">Administrateurs Google</h2>
                    <form method="POST" action="/admin/admins/create" class="flex gap-2 mb-8">
                        <input type="email" name="email" placeholder="Email Google" class="flex-grow bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none" required>
                        <button type="submit" class="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-3 rounded-xl text-xs font-black uppercase">Ok</button>
                    </form>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center p-4 rounded-xl bg-gray-50/50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                            <span class="text-xs font-bold">${SUPER_ADMIN}</span>
                            <span class="text-[8px] bg-gray-900 text-white px-2 py-1 rounded uppercase font-black tracking-[0.2em]">Master</span>
                        </div>
                        ${admins.map((a: any) => `
                            <div class="flex justify-between items-center p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50/30 dark:hover:bg-gray-900/30 transition-all">
                                <span class="text-xs font-medium">${a.email}</span>
                                <form method="POST" action="/admin/admins/delete" onsubmit="return confirm('Supprimer cet accès ?')">
                                    <input type="hidden" name="id" value="${a.id}">
                                    <button type="submit" class="text-red-500 hover:scale-125 transition-transform font-black text-lg px-2">&times;</button>
                                </form>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg p-6 text-white">
                    <h2 class="font-black uppercase tracking-widest text-[10px] mb-4 opacity-80">Monitoring Live</h2>
                    <a href="/admin/queues" class="flex items-center justify-between bg-white/10 hover:bg-white/20 p-4 rounded-xl transition-all border border-white/10 group">
                        <span class="text-sm font-bold">Files d'attente</span>
                        <span class="group-hover:translate-x-1 transition-transform">→</span>
                    </a>
                </div>
            </div>
        </div>

        <div id="keyModal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200 dark:border-gray-700">
                <div class="p-8">
                    <h3 class="text-2xl font-black mb-2 tracking-tighter uppercase">Générer une clé</h3>
                    <p class="text-gray-400 text-xs font-medium mb-8 uppercase tracking-widest">Nouvel identifiant API</p>
                    <form method="POST" action="/admin/users/create">
                        <div class="space-y-6">
                            <div>
                                <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nom de la clé</label>
                                <input type="text" name="name" required placeholder="ex: Application Mobile iOS" class="w-full mt-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold">
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email (Optionnel)</label>
                                <input type="email" name="email" placeholder="client@exemple.com" class="w-full mt-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold">
                            </div>
                        </div>
                        <div class="mt-10 flex gap-4">
                            <button type="button" onclick="document.getElementById('keyModal').classList.add('hidden')" class="flex-grow bg-gray-100 dark:bg-gray-700 text-gray-500 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">Annuler</button>
                            <button type="submit" class="flex-grow bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/20">Valider</button>
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

  // Archives Page with Filters
  fastify.get('/admin/jobs', async (request, reply) => {
    const query = request.query as any;
    
    // Filters building
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.sourceLang) where.sourceLang = query.sourceLang;
    if (query.targetLang) where.targetLang = query.targetLang;
    
    if (query.dateStart || query.dateEnd) {
      where.createdAt = {};
      if (query.dateStart) {
        where.createdAt.gte = DateTime.fromISO(query.dateStart, { zone: TIMEZONE }).toJSDate();
      }
      if (query.dateEnd) {
        // Set to end of day
        where.createdAt.lte = DateTime.fromISO(query.dateEnd, { zone: TIMEZONE }).endOf('day').toJSDate();
      }
    }

    const jobs = await prisma.translationJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } } }
    });

    // Get unique langs for filter dropdowns
    const [sourceLangs, targetLangs] = await Promise.all([
      prisma.translationJob.findMany({ select: { sourceLang: true }, distinct: ['sourceLang'] }),
      prisma.translationJob.findMany({ select: { targetLang: true }, distinct: ['targetLang'] })
    ]);

    const content = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <h1 class="text-3xl font-black tracking-tighter uppercase">Archives</h1>
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-1">Historique complet (${jobs.length} résultats)</p>
            </div>
            <a href="/admin" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg transition-all">← Retour</a>
        </div>

        <!-- Filters Bar -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-8">
            <form method="GET" action="/admin/jobs" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                    <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Début</label>
                    <input type="date" name="dateStart" value="${query.dateStart || ''}" class="w-full mt-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div>
                    <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Fin</label>
                    <input type="date" name="dateEnd" value="${query.dateEnd || ''}" class="w-full mt-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div>
                    <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Source</label>
                    <select name="sourceLang" class="w-full mt-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none font-bold">
                        <option value="">Toutes</option>
                        ${sourceLangs.map(l => `<option value="${l.sourceLang || ''}" ${query.sourceLang === l.sourceLang ? 'selected' : ''}>${l.sourceLang || 'N/A'}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Cible</label>
                    <select name="targetLang" class="w-full mt-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none font-bold">
                        <option value="">Toutes</option>
                        ${targetLangs.map(l => `<option value="${l.targetLang}" ${query.targetLang === l.targetLang ? 'selected' : ''}>${l.targetLang}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Statut</label>
                    <div class="flex gap-2 mt-1">
                        <select name="status" class="flex-grow bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none font-bold">
                            <option value="">Tous</option>
                            <option value="COMPLETED" ${query.status === 'COMPLETED' ? 'selected' : ''}>Succès</option>
                            <option value="FAILED" ${query.status === 'FAILED' ? 'selected' : ''}>Échec</option>
                            <option value="PENDING" ${query.status === 'PENDING' ? 'selected' : ''}>En attente</option>
                        </select>
                        <button type="submit" class="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-xl text-xs font-black uppercase">Filtrer</button>
                    </div>
                </div>
            </form>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50/50 dark:bg-gray-950/50 text-[10px] uppercase font-black text-gray-400 tracking-widest">
                        <tr>
                            <th class="px-6 py-4 text-left">Date / Heure (Toronto)</th>
                            <th class="px-6 py-4 text-left">Titre / Source</th>
                            <th class="px-6 py-4 text-center">Langues</th>
                            <th class="px-6 py-4 text-center">Statut</th>
                            <th class="px-6 py-4 text-right">Action</th>
                        </tr>
                    </thead>
                                        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                                            ${jobs.map((j: any) => {
                                                const input = j.inputJson as any;
                                                const title = input?.title || input?.name || input?.header || 'Sans titre';
                                                return `
                                                <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                                                    <td class="px-6 py-4 whitespace-nowrap text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                                                        ${DateTime.fromJSDate(j.createdAt).setZone(TIMEZONE).toFormat('dd/MM HH:mm:ss')}
                                                    </td>
                                                    <td class="px-6 py-4">
                                                        <div class="font-bold text-xs">${title}</div>
                                                        <div class="text-[9px] text-gray-400 font-medium italic mt-0.5">${j.user.name || 'N/A'}</div>
                                                    </td>
                                                    <td class="px-6 py-4 text-center">
                                                        <div class="flex items-center justify-center gap-2">
                                                            <span class="bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">${j.sourceLang || '??'}</span>
                                                            <span class="text-gray-300">→</span>
                                                            <span class="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">${j.targetLang}</span>
                                                        </div>
                                                    </td>
                                                    <td class="px-6 py-4 text-center">
                                                        <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
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
                                                            class="text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest hover:underline">Détails</button>
                                                    </td>
                                                </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                    
                </table>
            </div>
        </div>

        <!-- Modal -->
        <div id="detailsModal" class="hidden fixed inset-0 bg-black/70 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <div class="bg-white dark:bg-gray-800 rounded-[2rem] shadow-2xl max-w-5xl w-full overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">
                <div class="p-8 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h3 class="text-2xl font-black uppercase tracking-tighter">Détails Traduction</h3>
                    <button onclick="document.getElementById('detailsModal').classList.add('hidden')" class="text-gray-400 hover:text-white text-4xl font-light">&times;</button>
                </div>
                
                <div class="flex border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-950/50">
                    <button onclick="switchTab('input')" id="tab-input" class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 border-blue-500 text-blue-600">📥 Source</button>
                    <button onclick="switchTab('output')" id="tab-output" class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 border-transparent text-gray-400">📤 Résultat</button>
                    <button onclick="switchTab('logs')" id="tab-logs" class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 border-transparent text-gray-400">📜 Callbacks & Meta</button>
                </div>

                <div class="p-8 overflow-auto flex-grow bg-white dark:bg-gray-800">
                    <div id="content-input" class="tab-content">
                        <pre class="bg-gray-50 dark:bg-gray-900 p-6 rounded-2xl text-[11px] font-mono whitespace-pre-wrap border border-gray-100 dark:border-gray-800"></pre>
                    </div>
                    <div id="content-output" class="tab-content hidden">
                        <pre class="bg-gray-50 dark:bg-gray-900 p-6 rounded-2xl text-[11px] font-mono whitespace-pre-wrap border border-gray-100 dark:border-gray-800"></pre>
                    </div>
                    <div id="content-logs" class="tab-content hidden space-y-4">
                        <div id="callback-url-display" class="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-mono break-all border border-blue-100 dark:border-blue-800 mb-4"></div>
                        <div id="logs-list" class="space-y-4"></div>
                    </div>
                </div>

                <div class="p-6 bg-gray-50 dark:bg-gray-900/50 flex justify-end">
                    <button onclick="document.getElementById('detailsModal').classList.add('hidden')" class="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-transform">Fermer</button>
                </div>
            </div>
        </div>

        <script>
            function switchTab(tab) {
                ['input', 'output', 'logs'].forEach(t => {
                    const btn = document.getElementById('tab-' + t);
                    const content = document.getElementById('content-' + t);
                    btn.classList.remove('border-blue-500', 'text-blue-600');
                    btn.classList.add('border-transparent', 'text-gray-400');
                    content.classList.add('hidden');
                });
                const activeBtn = document.getElementById('tab-' + tab);
                activeBtn.classList.add('border-blue-500', 'text-blue-600');
                activeBtn.classList.remove('border-transparent', 'text-gray-400');
                document.getElementById('content-' + tab).classList.remove('hidden');
            }

            async function loadJobDetails(id) {
                const btn = document.getElementById('btn-' + id);
                const originalText = btn.textContent;
                btn.textContent = '...';
                
                try {
                    const response = await fetch('/admin/jobs/' + id + '/data');
                    const data = await response.json();
                    
                    document.querySelector('#content-input pre').textContent = JSON.stringify(data.inputJson, null, 2);
                    document.querySelector('#content-output pre').textContent = data.outputJson ? JSON.stringify(data.outputJson, null, 2) : "En attente de traduction...";
                    
                    document.getElementById('callback-url-display').textContent = 'Callback URL: ' + data.callbackUrl;
                    
                    const logsDiv = document.getElementById('logs-list');
                    logsDiv.innerHTML = '';
                    
                    const metaEl = document.createElement('div');
                    metaEl.className = 'p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/20';
                    metaEl.innerHTML = '<div class="text-[10px] font-black uppercase mb-2 text-gray-400 tracking-widest">Metadata & Errors</div>' + 
                                      '<pre class="text-[10px] font-mono opacity-70">' + JSON.stringify({ metadata: data.metadata, error: data.error }, null, 2) + '</pre>';
                    logsDiv.appendChild(metaEl);

                    if (!data.callbackLogs || data.callbackLogs.length === 0) {
                        const empty = document.createElement('p');
                        empty.className = 'text-center py-6 text-xs font-bold text-gray-400 uppercase tracking-widest';
                        empty.textContent = 'Aucun log de callback';
                        logsDiv.appendChild(empty);
                    } else {
                        data.callbackLogs.forEach(log => {
                            const date = new Date(log.createdAt).toLocaleString('fr-FR', { timeZone: '${TIMEZONE}' });
                            const isOk = log.status >= 200 && log.status < 300;
                            const logEl = document.createElement('div');
                            logEl.className = 'p-4 rounded-2xl border ' + (isOk ? 'border-green-100 bg-green-50/50 dark:border-green-900/30 dark:bg-green-900/10' : 'border-red-100 bg-red-50/50 dark:border-red-900/30 dark:bg-red-900/10');
                            logEl.innerHTML = '<div class="flex justify-between items-center mb-2"><span class="text-[10px] font-black uppercase ' + (isOk ? 'text-green-600' : 'text-red-600') + '">Status ' + log.status + '</span><span class="text-[9px] font-bold text-gray-400">' + date + '</span></div>' + 
                                             '<div class="text-[10px] font-mono opacity-70 break-all">' + (log.error || log.response || 'No response') + '</div>';
                            logsDiv.appendChild(logEl);
                        });
                    }

                    switchTab('input');
                    document.getElementById('detailsModal').classList.remove('hidden');
                } catch (err) {
                    alert('Erreur réseau');
                } finally {
                    btn.textContent = originalText;
                }
            }
        </script>
    `;
    reply.type('text/html').send(layout(content, request.session.userEmail));
  });
}
