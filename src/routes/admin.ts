import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';
import { DateTime } from 'luxon';

declare module 'fastify' {
  interface Session {
    userEmail?: string;
  }
}

const SUPER_ADMIN = 'vgibara@gmail.com';
const TIMEZONE = 'America/Toronto';

/**
 * Layout wrapper inspired by GateKeeper
 */
const layout = (content: string, userEmail?: string, page: string = '') => `
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
        } else {
            document.documentElement.classList.remove('dark');
        }
    </script>
</head>
<body class="bg-gray-100 dark:bg-gray-900 font-sans leading-normal tracking-normal flex flex-col min-h-screen text-gray-800 dark:text-gray-100 transition-colors duration-200">
    <!-- Navbar -->
    <nav class="bg-gray-800 dark:bg-gray-950 p-4 text-white shadow-lg transition-colors duration-200 sticky top-0 z-50">
        <div class="container mx-auto flex justify-between items-center">
            <div class="flex items-center space-x-6">
                <a href="/admin" class="text-xl font-bold flex items-center gap-2">
                    <span>🌐</span> <span class="hidden sm:inline text-white">Translator</span>
                </a>
                ${userEmail ? `
                <div class="flex space-x-1 md:space-x-4">
                    <a href="/admin" class="${page === 'dashboard' ? 'bg-gray-900 dark:bg-gray-800 text-white' : 'text-gray-300 hover:text-white'} px-2 md:px-3 py-2 rounded-md text-xs md:text-sm font-medium transition-colors">Tableau de bord</a>
                    <a href="/admin/jobs" class="${page === 'jobs' ? 'bg-gray-900 dark:bg-gray-800 text-white' : 'text-gray-300 hover:text-white'} px-2 md:px-3 py-2 rounded-md text-xs md:text-sm font-medium transition-colors">Archives</a>
                    <a href="/admin/queues" class="text-gray-300 hover:text-white px-2 md:px-3 py-2 rounded-md text-xs md:text-sm font-medium transition-colors">Files d'attente</a>
                </div>
                ` : ''}
            </div>
            <div class="flex items-center gap-4">
                <button onclick="toggleTheme()" class="text-gray-300 hover:text-white focus:outline-none p-2 rounded-full hover:bg-gray-700/50 transition-all">
                    <!-- Sun Icon -->
                    <svg class="hidden dark:block w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                    <!-- Moon Icon -->
                    <svg class="block dark:hidden w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                </button>
                ${userEmail ? `
                <div class="flex items-center space-x-2 md:space-x-4 pl-4 border-l border-gray-700">
                    <span class="hidden lg:inline text-xs text-gray-400 font-medium">${userEmail}</span>
                    <a href="/logout" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-[10px] md:text-xs font-black uppercase tracking-wider transition-colors">Quitter</a>
                </div>
                ` : ''}
            </div>
        </div>
    </nav>

    <div class="container mx-auto mt-8 p-4 flex-grow">
        ${content}
    </div>
    
    <footer class="bg-gray-800 dark:bg-gray-950 text-gray-400 text-center py-6 text-[10px] font-bold uppercase tracking-widest mt-12 transition-colors duration-200 border-t border-gray-700/50">
        &copy; 2026 DeepL Translator API | Design inspired by GateKeeper
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
        reply.status(403).type('text/html').send(layout(`
            <div class="max-w-md mx-auto text-center bg-white dark:bg-gray-800 p-12 rounded-2xl shadow-xl border border-red-100 dark:border-red-900/30 mt-20">
                <h1 class="text-4xl mb-4">🚫</h1>
                <h2 class="text-2xl font-black mb-2 uppercase tracking-tighter">Accès Refusé</h2>
                <p class="text-gray-500 mb-8 font-medium">Votre compte n'est pas autorisé.</p>
                <a href="/" class="inline-block bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-transform hover:scale-105">Retour</a>
            </div>
        `));
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
        <div class="max-w-md mx-auto bg-white dark:bg-gray-800 p-10 rounded-[2rem] shadow-2xl border border-gray-100 dark:border-gray-700 text-center mt-20">
            <div class="text-5xl mb-6">🌐</div>
            <h1 class="text-2xl font-black mb-4 uppercase tracking-tighter">Administration</h1>
            <p class="text-gray-500 dark:text-gray-400 mb-10 text-sm font-medium">Veuillez vous authentifier pour accéder à la gestion du service.</p>
            <a href="/login/google" class="inline-flex items-center gap-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-8 py-4 rounded-2xl hover:scale-105 transition-all font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/10">
                <img src="https://www.google.com/favicon.ico" class="w-5 h-5" alt="G">
                Continuer avec Google
            </a>
        </div>
      `, undefined, 'login'));
    }
  });

  // API: Get Job Details
  fastify.get('/admin/jobs/:id/data', async (request, reply) => {
    const { id } = request.params as { id: string };
    return await prisma.translationJob.findUnique({
      where: { id },
      include: { callbackLogs: { orderBy: { createdAt: 'desc' } } }
    });
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
        <h2 class="text-2xl font-black mb-8 uppercase tracking-tighter">Tableau de bord</h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between transition-colors">
                <div>
                    <p class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-2">Clés API Actives</p>
                    <h3 class="text-4xl font-black text-gray-800 dark:text-white">${stats.totalKeys}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Identifiants de service</p>
                </div>
                <div class="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full mt-6 overflow-hidden">
                    <div class="bg-blue-500 h-full rounded-full" style="width: 70%"></div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between transition-colors">
                <div>
                    <p class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-2">Total Traductions</p>
                    <h3 class="text-4xl font-black text-gray-800 dark:text-white">${stats.totalJobs}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Nombre total de requêtes</p>
                </div>
                <div class="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full mt-6 overflow-hidden">
                    <div class="bg-green-500 h-full rounded-full" style="width: 85%"></div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between transition-colors">
                <div>
                    <p class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-2">Administrateurs</p>
                    <h3 class="text-4xl font-black text-gray-800 dark:text-white">${stats.totalAdmins}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Comptes Google autorisés</p>
                </div>
                <div class="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full mt-6 overflow-hidden">
                    <div class="bg-purple-500 h-full rounded-full" style="width: 40%"></div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 space-y-6">
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/30 dark:bg-gray-900/30 transition-colors">
                        <h2 class="font-black uppercase tracking-tight text-sm">Gestion des Clés API</h2>
                        <button onclick="document.getElementById('keyModal').classList.remove('hidden')" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider hover:bg-blue-700 shadow-sm transition-all">+ Nouvelle Clé</button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50/50 dark:bg-gray-950/50 text-[10px] uppercase font-black text-gray-400 tracking-widest border-b border-gray-100 dark:border-gray-700">
                                <tr>
                                    <th class="px-6 py-4 text-left">Identification</th>
                                    <th class="px-6 py-4 text-left">Clé API</th>
                                    <th class="px-6 py-4 text-center">Jobs</th>
                                    <th class="px-6 py-4 text-right">Date</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                                ${users.map((u: any) => `
                                    <tr class="hover:bg-blue-50/50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td class="px-6 py-4"><div class="font-bold text-gray-800 dark:text-gray-200">${u.name || 'Sans nom'}</div><div class="text-[10px] text-gray-400 font-medium italic">${u.email || ''}</div></td>
                                        <td class="px-6 py-4 font-mono text-blue-500 dark:text-blue-400 text-xs font-bold">${u.apiKey}</td>
                                        <td class="px-6 py-4 text-center"><span class="bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-md text-[10px] font-black">${u._count.jobs}</span></td>
                                        <td class="px-6 py-4 text-right text-gray-400 text-[10px] font-bold uppercase tracking-tighter">${DateTime.fromJSDate(u.createdAt).setZone(TIMEZONE).toFormat('yyyy-MM-dd')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="text-center"><a href="/admin/jobs" class="inline-block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:shadow-lg transition-all">Consulter les Archives →</a></div>
            </div>

            <div class="space-y-6">
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 transition-colors">
                    <h2 class="font-black uppercase tracking-tight text-sm mb-6">Administrateurs Google</h2>
                    <form method="POST" action="/admin/admins/create" class="flex gap-2 mb-8">
                        <input type="email" name="email" placeholder="Email Google" class="flex-grow bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none font-medium dark:text-white" required>
                        <button type="submit" class="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-3 rounded-xl text-xs font-black uppercase transition-transform active:scale-95">Ok</button>
                    </form>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center p-4 rounded-xl bg-gray-50/50 dark:bg-gray-950/50 border border-gray-100 dark:border-gray-800">
                            <span class="text-xs font-bold text-gray-700 dark:text-gray-300">${SUPER_ADMIN}</span>
                            <span class="text-[8px] bg-gray-900 text-white px-2.5 py-1 rounded uppercase font-black tracking-[0.2em]">Master</span>
                        </div>
                        ${admins.map((a: any) => `
                            <div class="flex justify-between items-center p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50/30 dark:hover:bg-gray-900/30 transition-all group">
                                <span class="text-xs font-medium text-gray-600 dark:text-gray-400">${a.email}</span>
                                <form method="POST" action="/admin/admins/delete" onsubmit="return confirm('Supprimer cet accès ?')">
                                    <input type="hidden" name="id" value="${a.id}">
                                    <button type="submit" class="text-gray-300 hover:text-red-500 group-hover:scale-125 transition-all font-black text-xl px-2">&times;</button>
                                </form>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2rem] shadow-xl p-8 text-white">
                    <h2 class="font-black uppercase tracking-widest text-[10px] mb-6 opacity-80">Monitoring Live</h2>
                    <a href="/admin/queues" class="flex items-center justify-between bg-white/10 hover:bg-white/20 p-5 rounded-2xl transition-all border border-white/10 group shadow-sm">
                        <span class="text-sm font-bold uppercase tracking-tight">Files d'attente</span>
                        <span class="group-hover:translate-x-2 transition-transform text-xl">→</span>
                    </a>
                </div>
            </div>
        </div>

        <!-- Modal Create Key -->
        <div id="keyModal" class="hidden fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <div class="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden border border-gray-200 dark:border-gray-700 animate-in zoom-in duration-300 transition-colors">
                <div class="p-10 text-center">
                    <div class="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">🔑</div>
                    <h3 class="text-3xl font-black mb-2 tracking-tighter uppercase dark:text-white">Générer une clé</h3>
                    <p class="text-gray-400 text-[10px] font-black mb-10 uppercase tracking-[0.2em]">Identifiant de service API</p>
                    <form method="POST" action="/admin/users/create">
                        <div class="space-y-6 text-left">
                            <div>
                                <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Nom de la clé</label>
                                <input type="text" name="name" required placeholder="ex: Application Mobile iOS" class="w-full mt-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold dark:text-white">
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Email (Optionnel)</label>
                                <input type="email" name="email" placeholder="client@exemple.com" class="w-full mt-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold dark:text-white">
                            </div>
                        </div>
                        <div class="mt-12 flex gap-4">
                            <button type="button" onclick="document.getElementById('keyModal').classList.add('hidden')" class="flex-grow bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-transform active:scale-95">Annuler</button>
                            <button type="submit" class="flex-grow bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-500/30 transition-transform active:scale-95">Valider</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    reply.type('text/html').send(layout(content, request.session.userEmail, 'dashboard'));
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

  // Archives Page with Filters & Pagination
  fastify.get('/admin/jobs', async (request, reply) => {
    const query = request.query as any;
    const page = parseInt(query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;
    
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
        where.createdAt.lte = DateTime.fromISO(query.dateEnd, { zone: TIMEZONE }).endOf('day').toJSDate();
      }
    }

    const [jobs, totalJobsCount] = await Promise.all([
      prisma.translationJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { email: true, name: true } } }
      }),
      prisma.translationJob.count({ where })
    ]);

    const totalPages = Math.ceil(totalJobsCount / limit);

    const [sourceLangs, targetLangs] = await Promise.all([
      prisma.translationJob.findMany({ select: { sourceLang: true }, distinct: ['sourceLang'] }),
      prisma.translationJob.findMany({ select: { targetLang: true }, distinct: ['targetLang'] })
    ]);

    const getQueryString = (newPage: number) => {
      const p = new URLSearchParams();
      if (query.status) p.set('status', query.status);
      if (query.sourceLang) p.set('sourceLang', query.sourceLang);
      if (query.targetLang) p.set('targetLang', query.targetLang);
      if (query.dateStart) p.set('dateStart', query.dateStart);
      if (query.dateEnd) p.set('dateEnd', query.dateEnd);
      p.set('page', newPage.toString());
      return p.toString();
    };

    const content = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <h2 class="text-2xl font-black uppercase tracking-tighter">Journal des Traductions</h2>
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-1">Page ${page} / ${totalPages || 1} — ${totalJobsCount} jobs</p>
            </div>
            <a href="/admin" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg transition-all">← Retour</a>
        </div>

        <!-- Filters Bar -->
        <form method="GET" action="/admin/jobs" class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap gap-4 items-end mb-8 transition-colors">
            <div class="flex-grow min-w-[140px]">
                <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Début</label>
                <input type="date" name="dateStart" value="${query.dateStart || ''}" class="w-full border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs bg-gray-50 dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-bold">
            </div>
            <div class="flex-grow min-w-[140px]">
                <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Fin</label>
                <input type="date" name="dateEnd" value="${query.dateEnd || ''}" class="w-full border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs bg-gray-50 dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-bold">
            </div>
            <div class="min-w-[120px]">
                <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Source</label>
                <select name="sourceLang" class="w-full border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs bg-gray-50 dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-black uppercase tracking-wider outline-none">
                    <option value="">Tous</option>
                    ${sourceLangs.map(l => `<option value="${l.sourceLang || ''}" ${query.sourceLang === l.sourceLang ? 'selected' : ''}>${l.sourceLang || '??'}</option>`).join('')}
                </select>
            </div>
            <div class="min-w-[120px]">
                <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Cible</label>
                <select name="targetLang" class="w-full border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs bg-gray-50 dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-black uppercase tracking-wider outline-none">
                    <option value="">Toutes</option>
                    ${targetLangs.map(l => `<option value="${l.targetLang}" ${query.targetLang === l.targetLang ? 'selected' : ''}>${l.targetLang}</option>`).join('')}
                </select>
            </div>
            <div class="flex gap-2">
                <button type="submit" class="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-sm transition-all">Filtrer</button>
                <a href="/admin/jobs" class="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">R.A.Z</a>
            </div>
        </form>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-8 transition-colors">
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50/50 dark:bg-gray-950/50 text-[10px] uppercase font-black text-gray-400 tracking-widest border-b border-gray-100 dark:border-gray-700">
                        <tr>
                            <th class="py-4 px-6 text-left">Heure (Toronto)</th>
                            <th class="py-4 px-6 text-left">Titre / Client</th>
                            <th class="py-4 px-6 text-center">Langues</th>
                            <th class="py-4 px-6 text-center">Résultat</th>
                            <th class="py-4 px-6 text-right">Détails</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50 dark:divide-gray-700 transition-colors">
                        ${jobs.map((j: any) => {
                            const input = j.inputJson as any;
                            const title = input?.title || input?.name || input?.header || 'Sans titre';
                            return `
                            <tr class="hover:bg-blue-50/50 dark:hover:bg-gray-700/20 transition-colors group">
                                <td class="py-4 px-6 text-left whitespace-nowrap">
                                    <div class="font-black text-gray-700 dark:text-gray-200 text-[11px] leading-tight">${DateTime.fromJSDate(j.createdAt).setZone(TIMEZONE).toFormat('HH:mm:ss')}</div>
                                    <div class="text-[9px] text-gray-400 font-bold uppercase mt-0.5 tracking-tighter">${DateTime.fromJSDate(j.createdAt).setZone(TIMEZONE).toFormat('dd MMM yyyy')}</div>
                                </td>
                                <td class="py-4 px-6 text-left">
                                    <div class="font-black text-gray-800 dark:text-gray-100 text-xs truncate max-w-[250px]">${title}</div>
                                    <div class="text-[9px] text-gray-400 font-bold uppercase mt-0.5 tracking-widest">${j.user.name || 'API KEY'}</div>
                                </td>
                                <td class="py-4 px-6 text-center">
                                    <div class="flex items-center justify-center gap-2">
                                        <span class="bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 uppercase font-black text-[9px] tracking-widest">${j.sourceLang || '??'}</span>
                                        <span class="text-gray-300">→</span>
                                        <span class="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-md border border-blue-100 dark:border-blue-800 uppercase font-black text-[9px] tracking-widest">${j.targetLang}</span>
                                    </div>
                                </td>
                                <td class="py-4 px-6 text-center">
                                    <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] ${
                                        j.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 
                                        j.status === 'FAILED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 
                                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30'
                                    }">
                                        ${j.status === 'COMPLETED' ? 'OK' : j.status === 'FAILED' ? 'ERREUR' : 'WAITING'}
                                    </span>
                                </td>
                                <td class="py-4 px-6 text-right">
                                    <button 
                                        onclick="loadJobDetails('${j.id}')" 
                                        id="btn-${j.id}"
                                        class="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">Voir</button>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Pagination -->
        <div class="flex flex-col sm:flex-row justify-between items-center bg-white dark:bg-gray-800 px-8 py-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 gap-4 transition-colors">
            <div class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                Total : <span class="text-gray-800 dark:text-white font-black text-xs">${totalJobsCount}</span> requêtes
            </div>
            <div class="flex items-center gap-4">
                ${page > 1 ? `<a href="/admin/jobs?${getQueryString(page - 1)}" class="p-2 text-gray-400 hover:text-blue-600 transition-colors">← Précédent</a>` : ''}
                <span class="text-xs font-black bg-gray-50 dark:bg-gray-900 px-6 py-2 rounded-xl border border-gray-100 dark:border-gray-700 uppercase tracking-widest">Page ${page} / ${totalPages || 1}</span>
                ${page < totalPages ? `<a href="/admin/jobs?${getQueryString(page + 1)}" class="p-2 text-gray-400 hover:text-blue-600 transition-colors">Suivant →</a>` : ''}
            </div>
        </div>

        <!-- Modal Details -->
        <div id="detailsModal" class="hidden fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <div class="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl max-w-5xl w-full overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh] transition-colors">
                <div class="p-8 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/30 dark:bg-gray-900/30">
                    <h3 class="text-2xl font-black uppercase tracking-tighter">Détails Traduction</h3>
                    <button onclick="document.getElementById('detailsModal').classList.add('hidden')" class="text-gray-300 hover:text-red-500 text-4xl font-light transition-colors">&times;</button>
                </div>
                
                <div class="flex border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-950/50">
                    <button onclick="switchTab('input')" id="tab-input" class="px-8 py-5 text-[10px] font-black uppercase tracking-widest border-b-4 border-blue-500 text-blue-600 transition-all">📥 Source</button>
                    <button onclick="switchTab('output')" id="tab-output" class="px-8 py-5 text-[10px] font-black uppercase tracking-widest border-b-4 border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-white transition-all">📤 Résultat</button>
                    <button onclick="switchTab('logs')" id="tab-logs" class="px-8 py-5 text-[10px] font-black uppercase tracking-widest border-b-4 border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-white transition-all">📜 Callbacks & Meta</button>
                </div>

                <div class="p-8 overflow-auto flex-grow bg-white dark:bg-gray-800 transition-colors">
                    <div id="content-input" class="tab-content">
                        <pre class="bg-gray-50 dark:bg-gray-950 p-6 rounded-2xl text-[11px] font-mono whitespace-pre-wrap border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300"></pre>
                    </div>
                    <div id="content-output" class="tab-content hidden">
                        <pre class="bg-gray-50 dark:bg-gray-950 p-6 rounded-2xl text-[11px] font-mono whitespace-pre-wrap border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300"></pre>
                    </div>
                    <div id="content-logs" class="tab-content hidden space-y-6">
                        <div id="callback-url-display" class="p-5 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-mono font-bold break-all border border-blue-100 dark:border-blue-800/50 shadow-sm"></div>
                        <div id="logs-list" class="space-y-4"></div>
                    </div>
                </div>

                <div class="p-6 bg-gray-50 dark:bg-gray-950/50 flex justify-end">
                    <button onclick="document.getElementById('detailsModal').classList.add('hidden')" class="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-12 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl transition-transform active:scale-95">Fermer</button>
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
                    
                    document.getElementById('callback-url-display').textContent = '🔗 CALLBACK URL: ' + data.callbackUrl;
                    
                    const logsDiv = document.getElementById('logs-list');
                    logsDiv.innerHTML = '';
                    
                    const metaEl = document.createElement('div');
                    metaEl.className = 'p-6 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/30';
                    metaEl.innerHTML = '<div class="text-[10px] font-black uppercase mb-4 text-gray-400 tracking-[0.2em]">Metadata & System Errors</div>' +
                                      '<pre class="text-[10px] font-mono text-gray-500 dark:text-gray-400">' + JSON.stringify({ metadata: data.metadata, error: data.error, bullId: data.bullJobId }, null, 2) + '</pre>';
                    logsDiv.appendChild(metaEl);

                    if (!data.callbackLogs || data.callbackLogs.length === 0) {
                        const empty = document.createElement('p');
                        empty.className = 'text-center py-10 text-xs font-black text-gray-400 uppercase tracking-widest';
                        empty.textContent = 'Aucun log de callback disponible';
                        logsDiv.appendChild(empty);
                    } else {
                        data.callbackLogs.forEach(log => {
                            const date = new Date(log.createdAt).toLocaleString('fr-FR', { timeZone: 'America/Toronto' });
                            const isOk = log.status >= 200 && log.status < 300;
                            const logEl = document.createElement('div');
                            logEl.className = 'p-5 rounded-2xl border ' + (isOk ? 'border-green-100 bg-green-50/30 dark:border-green-900/20' : 'border-red-100 bg-red-50/30 dark:border-red-900/20');
                            logEl.innerHTML = '<div class="flex justify-between items-center mb-3"><span class="text-[10px] font-black uppercase tracking-widest ' + (isOk ? 'text-green-600' : 'text-red-600') + '">Status ' + log.status + '</span><span class="text-[9px] font-black text-gray-400 uppercase">' + date + '</span></div>' + 
                                             '<div class="text-[10px] font-mono text-gray-600 dark:text-gray-400 break-all leading-relaxed">' + (log.error || log.response || 'Empty response') + '</div>';
                            logsDiv.appendChild(logEl);
                        });
                    }

                    switchTab('input');
                    document.getElementById('detailsModal').classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                } catch (err) {
                    alert('Erreur réseau');
                } finally {
                    btn.textContent = originalText;
                }
            }
            
            // Close modal click outside
            window.onclick = function(event) {
                const modal = document.getElementById('detailsModal');
                if (event.target == modal) {
                    modal.classList.add('hidden');
                    document.body.style.overflow = 'auto';
                }
            }
        </script>
    `;
    reply.type('text/html').send(layout(content, request.session.userEmail, 'jobs'));
  });
}