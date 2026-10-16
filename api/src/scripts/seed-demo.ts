import crypto from 'node:crypto';
import { config } from '../config.js';
import { createDb, prepareDb, type Db } from '../db/knex.js';
import { hashPassword } from '../lib/password.js';
import { placeKey } from '../lib/text.js';

// DADOS FICTÍCIOS para demonstração. Tudo criado aqui fica marcado com is_demo = true
// e as contas usam o domínio @demo.urbantalk.local. Remova com: npm run demo:reset
const DEMO_DOMAIN = '@demo.urbantalk.local';
// contas da equipe de demonstração (não usam o domínio acima, então entram na lista à parte)
const ADMIN_EMAIL = 'administrador@gmail.com';
const STAFF_EMAIL = 'funcionario@gmail.com';
const demoUserIds = (db: Db) => db('users').where('email', 'like', `%${DEMO_DOMAIN}`).orWhereIn('email', [ADMIN_EMAIL, STAFF_EMAIL]).select('id');

// posições aproximadas, só para espalhar os pontos de forma plausível no mapa
const AREAS: { name: string; lat: number; lng: number }[] = [
  { name: 'Centro', lat: -23.5015, lng: -47.4583 },
  { name: 'Campolim', lat: -23.5338, lng: -47.4709 },
  { name: 'Parque Campolim', lat: -23.5405, lng: -47.4652 },
  { name: 'Vila Barão', lat: -23.4935, lng: -47.4706 },
  { name: 'Jardim Vergueiro', lat: -23.5168, lng: -47.4842 },
  { name: 'Vila Hortência', lat: -23.4952, lng: -47.4412 },
  { name: 'Éden', lat: -23.4142, lng: -47.4166 },
  { name: 'Wanel Ville', lat: -23.5121, lng: -47.4993 },
  { name: 'Além Ponte', lat: -23.4886, lng: -47.4481 },
  { name: 'Jardim Santa Rosália', lat: -23.5133, lng: -47.4436 },
  { name: 'Vila Carvalho', lat: -23.4979, lng: -47.4314 },
  { name: 'Jardim Guadalupe', lat: -23.4799, lng: -47.4945 },
];

// ruas conhecidas por área; nas demais a rua fica em branco, como nos registros antigos
const STREETS: Record<string, string[]> = {
  Centro: ['Rua XV de Novembro', 'Rua da Penha', 'Avenida General Carneiro'],
  Campolim: ['Avenida Antônio Carlos Comitre'],
  'Parque Campolim': ['Avenida Professora Izoraida Marques Peres'],
  'Além Ponte': ['Avenida Dom Aguirre'],
};

const OTHERS = [
  { detail: 'Árvore caída', text: 'Galho grande caiu e está bloqueando metade da calçada.' },
  { detail: 'Vazamento de água', text: 'Água limpa escorrendo pelo asfalto há dois dias, parece cano estourado.' },
  { detail: 'Fio solto no poste', text: 'Fio pendurado baixo, quase na altura das pessoas que passam.' },
  { detail: 'Bueiro sem tampa', text: 'Bueiro aberto perto da faixa de pedestre, perigoso à noite.' },
];

const NAMES = ['Ana Ribeiro', 'Carlos Mendes', 'Juliana Prado', 'Rafael Souza', 'Beatriz Lima', 'Marcos Teixeira', 'Fernanda Alves', 'Thiago Nunes'];

const POSTS = [
  'Alguém mais reparou que a iluminação da praça piorou depois da chuva? À noite fica bem difícil passar ali com criança.',
  'Fica a dica: quando registrarem um buraco, coloquem o número da casa mais próxima na referência. Ajuda muito a achar.',
  'Passei hoje e o ponto de ônibus que a gente reclamou ganhou cobertura nova. Valeu a pena insistir!',
  'O trânsito nessa avenida no horário de saída da escola está complicado. Faixa de pedestre apagada não ajuda.',
  'Vocês acham que vale a pena juntar as reclamações do bairro e levar na próxima audiência pública?',
];
const COMMENTS = ['Também reparei, principalmente perto da esquina.', 'Boa ideia, vou fazer isso.', 'Confirmei lá na reclamação também.', 'Contem comigo!', 'Que bom saber que resolveram.'];

const TEXTS: Record<string, string[]> = {
  buraco: [
    'Buraco grande na faixa da direita, carros desviando bruscamente.',
    'Asfalto cedeu perto da boca de lobo e está aumentando com a chuva.',
    'Sequência de buracos no trecho em frente à escola.',
  ],
  iluminacao: [
    'Três postes seguidos apagados, rua fica totalmente escura à noite.',
    'Lâmpada piscando há semanas no poste da esquina.',
    'Trecho da passarela sem iluminação nenhuma.',
  ],
  calcada: [
    'Calçada levantada pela raiz da árvore, difícil passar com carrinho.',
    'Falta rampa de acessibilidade na esquina.',
    'Pedaço de calçada afundado na frente do mercado.',
  ],
  lixo: [
    'Entulho e sacos de lixo acumulados no terreno ao lado da calçada.',
    'Lixo espalhado perto do ponto de ônibus desde o fim de semana.',
    'Descarte irregular de móveis velhos na via.',
  ],
  sinalizacao: [
    'Faixa de pedestre apagada em frente ao posto de saúde.',
    'Placa de pare caída na esquina.',
    'Semáforo de pedestres com a luz verde queimada.',
  ],
  'ponto-onibus': [
    'Abrigo do ponto sem cobertura, quem espera fica na chuva.',
    'Banco do ponto quebrado e vidro lateral estilhaçado.',
    'Ponto sem identificação das linhas que passam ali.',
  ],
};

// gerador determinístico para os dados saírem iguais a cada execução
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

async function reset(db: Db) {
  const demoOcc = await db('occurrences').where({ is_demo: true }).count({ c: '*' }).first();
  const demoUsers = demoUserIds(db);
  // conversas e propostas criadas pelas contas fictícias saem junto, com tudo que depende delas
  const demoForums = db('forums').whereIn('created_by', demoUsers).select('id');
  const demoTopics = db('topics').where((w) => w.whereIn('author_id', demoUsers).orWhereIn('forum_id', demoForums)).select('id');
  const demoProposals = db('proposals').whereIn('author_id', demoUsers).select('id');
  await db('discussion_comments').where({ target_type: 'topic' }).whereIn('target_id', demoTopics).delete();
  await db('discussion_comments').where({ target_type: 'proposal' }).whereIn('target_id', demoProposals).delete();
  await db('follows').where({ target_type: 'topic' }).whereIn('target_id', demoTopics).delete();
  await db('follows').where({ target_type: 'proposal' }).whereIn('target_id', demoProposals).delete();
  await db('content_reports').where({ target_type: 'topic' }).whereIn('target_id', demoTopics).delete();
  await db('content_reports').where({ target_type: 'proposal' }).whereIn('target_id', demoProposals).delete();
  await db('topics').whereIn('author_id', demoUsers).delete();
  await db('content_reports').where({ target_type: 'forum' }).whereIn('target_id', demoForums).delete();
  await db('forums').whereIn('created_by', demoUsers).delete();
  await db('proposals').whereIn('author_id', demoUsers).delete();
  await db('occurrence_notes').whereIn('author_id', demoUsers).delete();
  await db('occurrences').where({ is_demo: true }).delete();
  // reclamações feitas pelo site com as contas de demonstração também saem
  await db('occurrences').whereIn('user_id', demoUsers).delete();
  await db('users').where('email', 'like', `%${DEMO_DOMAIN}`).orWhereIn('email', [ADMIN_EMAIL, STAFF_EMAIL]).delete();
  console.log(`Dados de demonstração removidos (${demoOcc?.c ?? 0} ocorrências).`);
}

async function seed(db: Db) {
  const already = await db('occurrences').where({ is_demo: true }).first('id');
  if (already) {
    console.log('Já existem dados de demonstração. Rode "npm run demo:reset" antes para recriar.');
    return;
  }
  const rand = rng(20261014);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const now = Date.now();

  const demoPassword = 'Demo1234';
  const hash = await hashPassword(demoPassword);
  const userIds: number[] = [];
  for (let i = 1; i <= 8; i++) {
    const [id] = await db('users').insert({
      name: NAMES[i - 1],
      email: `cidadao${i}${DEMO_DOMAIN}`,
      password_hash: hash,
      role: 'user',
      created_at: new Date(now - 100 * 86_400_000).toISOString(),
    });
    userIds.push(id);
  }
  // senha fixa opcional por variável de ambiente (hospedagem na nuvem); senão é gerada na hora
  const fixed = (v?: string) => (v && v.length >= 8 && v.length <= 128 && /[A-Za-z]/.test(v) && /\d/.test(v) ? v : null);
  const adminFixed = fixed(process.env.DEMO_ADMIN_PASSWORD);
  const staffFixed = fixed(process.env.DEMO_STAFF_PASSWORD);
  const adminPassword = adminFixed ?? crypto.randomBytes(9).toString('base64url') + '7a';
  const [adminId] = await db('users').insert({
    name: 'Gustavo Garcia',
    email: ADMIN_EMAIL,
    password_hash: await hashPassword(adminPassword),
    role: 'admin',
    created_at: new Date(now - 100 * 86_400_000).toISOString(),
  });
  const staffPassword = staffFixed ?? crypto.randomBytes(9).toString('base64url') + '7a';
  const [staffId] = await db('users').insert({
    name: 'Funcionário 1',
    email: STAFF_EMAIL,
    password_hash: await hashPassword(staffPassword),
    role: 'staff',
    created_at: new Date(now - 100 * 86_400_000).toISOString(),
  });
  const occIds: number[] = [];

  const categories = await db('categories').select('id', 'slug');

  let created = 0;
  for (let i = 0; i < 64; i++) {
    const area = pick(AREAS);
    const cat = rand() < 0.1 ? categories.find((c) => c.slug === 'outros')! : pick(categories.filter((c) => c.slug !== 'outros'));
    const other = cat.slug === 'outros' ? pick(OTHERS) : null;
    const streets = STREETS[area.name];
    const author = pick(userIds);
    const ageDays = Math.floor(Math.pow(rand(), 1.4) * 85);
    const createdAt = new Date(now - ageDays * 86_400_000 - Math.floor(rand() * 40_000_000)).toISOString();
    const roll = rand();
    const status = ageDays > 20 && roll < 0.35 ? 'resolvida' : ageDays > 6 && roll < 0.65 ? 'encaminhada' : 'registrada';

    const id = await db.transaction(async (trx) => {
      const [id] = await trx('occurrences').insert({
        user_id: author,
        category_id: cat.id,
        scope: 'bairro',
        neighborhood_name: area.name,
        neighborhood_key: placeKey(area.name),
        street: streets && rand() < 0.8 ? pick(streets) : null,
        category_detail: other?.detail ?? null,
        description: other ? other.text : pick(TEXTS[cat.slug]),
        reference: null,
        latitude: area.lat + (rand() - 0.5) * 0.012,
        longitude: area.lng + (rand() - 0.5) * 0.012,
        photo_path: null,
        status,
        is_demo: true,
        created_at: createdAt,
        updated_at: createdAt,
      });
      await trx('status_history').insert({ occurrence_id: id, from_status: null, to_status: 'registrada', changed_by: author, note: null, created_at: createdAt });

      let t = Date.parse(createdAt);
      if (status !== 'registrada') {
        t += 3 * 86_400_000;
        await trx('status_history').insert({
          occurrence_id: id, from_status: 'registrada', to_status: 'encaminhada', changed_by: adminId,
          note: 'Incluída no relatório enviado à Prefeitura (demonstração).', created_at: new Date(t).toISOString(),
        });
      }
      if (status === 'resolvida') {
        t += 9 * 86_400_000;
        await trx('status_history').insert({
          occurrence_id: id, from_status: 'encaminhada', to_status: 'resolvida', changed_by: adminId,
          note: 'Conferido no local (demonstração).', created_at: new Date(t).toISOString(),
        });
        // resolução informada, sem fotos: aparece como "resolução informada", não "com evidências"
        await trx('occurrence_resolutions').insert({ occurrence_id: id, resolved_by: adminId, status: 'resolvida', description: 'Conferido no local (demonstração).', created_at: new Date(t).toISOString() });
        await trx('occurrence_events').insert({ occurrence_id: id, actor_id: adminId, kind: 'resolucao', visibility: 'publica', body: null, data: JSON.stringify({ status: 'resolvida', evidencias: 0, photos: [] }), created_at: new Date(t).toISOString() });
      }
      if (status !== 'resolvida' && rand() < 0.15) {
        await trx('occurrences').where({ id }).update({ priority: 'media', priority_reason: 'Vários moradores confirmaram e a foto mostra o problema (demonstração).' });
        await trx('occurrence_events').insert({ occurrence_id: id, actor_id: staffId, kind: 'prioridade', visibility: 'interna', body: 'Vários moradores confirmaram e a foto mostra o problema (demonstração).', data: JSON.stringify({ from: null, to: 'media' }), created_at: new Date(Date.parse(createdAt) + 86_400_000).toISOString() });
      }
      if (status !== 'registrada' && rand() < 0.5) {
        await trx('occurrence_notes').insert({
          occurrence_id: id, author_id: staffId, visibility: 'interna',
          body: 'Verificar com a regional se já existe chamado aberto (demonstração).', created_at: new Date(Date.parse(createdAt) + 2 * 86_400_000).toISOString(),
        });
      }
      if (status === 'encaminhada' && rand() < 0.5) {
        await trx('occurrence_notes').insert({
          occurrence_id: id, author_id: staffId, visibility: 'publica',
          body: 'Recebemos sua reclamação e ela entrou no relatório do mês. Avisaremos aqui quando houver novidade (demonstração).',
          created_at: new Date(Date.parse(createdAt) + 4 * 86_400_000).toISOString(),
        });
      }
      if (status !== 'registrada') await trx('occurrences').where({ id }).update({ updated_at: new Date(t).toISOString() });

      const confirmers = userIds.filter((u) => u !== author && rand() < 0.3);
      for (const u of confirmers) {
        await trx('confirmations').insert({ occurrence_id: id, user_id: u, created_at: new Date(Date.parse(createdAt) + 3_600_000).toISOString() });
      }
      return id as number;
    });
    created++;
    occIds.push(id);
  }

  // conversas na comunidade, algumas ligadas a reclamações
  for (let i = 0; i < POSTS.length; i++) {
    const at = new Date(now - (POSTS.length - i) * 9 * 3_600_000).toISOString();
    const [postId] = await db('posts').insert({
      author_id: userIds[i % userIds.length],
      occurrence_id: i % 2 === 0 ? pick(occIds) : null,
      body: POSTS[i],
      created_at: at,
    });
    for (const u of userIds.filter(() => rand() < 0.4)) {
      await db('post_likes').insert({ post_id: postId, user_id: u, created_at: at }).onConflict(['post_id', 'user_id']).ignore();
    }
    const nComments = Math.floor(rand() * 3);
    for (let c = 0; c < nComments; c++) {
      await db('post_comments').insert({
        post_id: postId,
        author_id: userIds[(i + c + 1) % userIds.length],
        body: pick(COMMENTS),
        created_at: new Date(Date.parse(at) + (c + 1) * 1_800_000).toISOString(),
      });
    }
  }

  // propostas e discussões fictícias; os autores são contas @demo e aparecem com o selo "Demonstração"
  const PROPOSALS = [
    { title: 'Faixa elevada na saída da escola da Rua da Penha', body: 'Na saída da escola os carros não reduzem a velocidade. Uma faixa elevada daria mais segurança para as crianças atravessarem.', hood: 'Centro', cat: 'sinalizacao', status: 'em-discussao' },
    { title: 'Abrigos com cobertura nos pontos da Avenida Dom Aguirre', body: 'Vários pontos da avenida não têm cobertura. Em dia de chuva quem espera o ônibus fica exposto. A proposta é priorizar abrigos nos pontos com mais movimento.', hood: 'Além Ponte', cat: 'ponto-onibus', status: 'priorizada' },
    { title: 'Mutirão mensal de limpeza nos terrenos baldios do bairro', body: 'Organizar com a associação de moradores um mutirão por mês nos terrenos onde o lixo se acumula, avisando a coleta com antecedência.', hood: 'Vila Carvalho', cat: 'lixo', status: 'nova' },
    { title: 'Mapa público de calçadas sem rampa', body: 'Usar as reclamações de acessibilidade para montar um mapa das esquinas sem rampa e entregar à Prefeitura como lista de prioridades.', hood: null, cat: 'calcada', status: 'em-analise' },
  ];
  for (const [i, p] of PROPOSALS.entries()) {
    const at = new Date(now - (20 - i * 4) * 86_400_000).toISOString();
    const author = userIds[i % userIds.length];
    const [pid] = await db('proposals').insert({
      author_id: author, title: p.title, body: p.body, category_id: categories.find((c) => c.slug === p.cat)!.id,
      neighborhood_name: p.hood ?? null, neighborhood_key: p.hood ? placeKey(p.hood) : null, status: p.status, reference_url: null, created_at: at, updated_at: at,
    });
    await db('proposal_status_history').insert({ proposal_id: pid, from_status: null, to_status: 'nova', changed_by: author, note: null, created_at: at });
    if (p.status !== 'nova') {
      await db('proposal_status_history').insert({ proposal_id: pid, from_status: 'nova', to_status: p.status, changed_by: adminId, note: 'Mudança de fase de demonstração.', created_at: new Date(Date.parse(at) + 5 * 86_400_000).toISOString() });
    }
    for (const u of userIds.filter((u) => u !== author && rand() < 0.6)) {
      await db('proposal_votes').insert({ proposal_id: pid, user_id: u, created_at: new Date(Date.parse(at) + 3_600_000).toISOString() });
    }
    await db('discussion_comments').insert({ target_type: 'proposal', target_id: pid, author_id: userIds[(i + 3) % userIds.length], body: pick(COMMENTS), created_at: new Date(Date.parse(at) + 7_200_000).toISOString() });
  }
  const TOPICS = [
    { forum: 'demo-centro', title: 'Feira de domingo e trânsito na Rua XV', body: 'Alguém sabe se a rua vai ficar fechada de novo neste domingo? Preciso passar de carro cedo.' },
    { forum: 'mobilidade-urbana', title: 'Linha 20 atrasando de manhã', body: 'A linha 20 tem atrasado bastante entre 7h e 8h. Mais alguém percebeu? Vale a pena registrar onde?' },
    { forum: 'demo-vila-carvalho', title: 'Terreno da esquina voltou a acumular entulho', body: 'Limparam mês passado, mas já tem entulho de novo. Vou registrar e confirmar as reclamações que já existem.' },
  ];
  // fóruns da comunidade criados por contas de demonstração (nenhum fórum é criado automaticamente por bairro)
  const COMMUNITY_FORUMS = [
    { slug: 'demo-centro', name: 'Melhorias para o Centro', description: 'Conversas sobre trânsito, calçadas e comércio no Centro de Sorocaba (fórum de demonstração).', theme: 'comunidade', tags: 'centro,calcadas', hood: 'Centro' },
    { slug: 'demo-vila-carvalho', name: 'Limpeza e entulho na Vila Carvalho', description: 'Pontos de descarte irregular e mutirões de limpeza na Vila Carvalho (fórum de demonstração).', theme: 'meio-ambiente', tags: 'entulho,mutirao', hood: 'Vila Carvalho' },
  ];
  for (const [i, f] of COMMUNITY_FORUMS.entries()) {
    const at = new Date(now - (12 - i) * 86_400_000).toISOString();
    const [fid] = await db('forums').insert({
      slug: f.slug, name: f.name, name_key: placeKey(f.name), description: f.description, kind: 'comunidade', theme: f.theme, tags: f.tags,
      neighborhood_name: f.hood, neighborhood_key: placeKey(f.hood), rules: 'Respeito sempre. Sem dados pessoais de vizinhos.', icon: 'chat',
      sort_order: 0, active: true, status: 'ativo', created_by: userIds[i], created_at: at, updated_at: at,
    });
    for (const u of userIds.filter((_, j) => j % 2 === i % 2)) await db('forum_follows').insert({ forum_id: fid, user_id: u, created_at: at });
  }
  // algumas reclamações da cidade toda, sem ponto no mapa
  const CITY = [
    { cat: 'ponto-onibus', text: 'Faltam horários de ônibus depois das 22h em várias linhas da cidade.' },
    { cat: 'sinalizacao', text: 'Semáforos de pedestres com tempo muito curto em diversos cruzamentos da cidade.' },
  ];
  for (const [i, c] of CITY.entries()) {
    const at = new Date(now - (8 + i * 5) * 86_400_000).toISOString();
    const author = userIds[(i + 5) % userIds.length];
    const [oid] = await db('occurrences').insert({
      user_id: author, category_id: categories.find((x) => x.slug === c.cat)!.id, scope: 'cidade', neighborhood_name: null, neighborhood_key: null,
      street: null, category_detail: null, description: c.text, reference: null, latitude: null, longitude: null, photo_path: null,
      status: 'registrada', is_demo: true, created_at: at, updated_at: at,
    });
    await db('status_history').insert({ occurrence_id: oid, from_status: null, to_status: 'registrada', changed_by: author, note: null, created_at: at });
    created++;
  }

  for (const [i, t] of TOPICS.entries()) {
    const forum = await db('forums').where({ slug: t.forum }).first('id');
    if (!forum) continue;
    const at = new Date(now - (6 - i) * 86_400_000).toISOString();
    const [tid] = await db('topics').insert({ forum_id: forum.id, author_id: userIds[(i + 2) % userIds.length], is_institutional: false, title: t.title, body: t.body, tags: '', pinned: false, locked: false, created_at: at, last_activity_at: at });
    for (const u of userIds.filter((_, j) => j !== (i + 2) % userIds.length && j % 3 === i % 3)) await db('topic_votes').insert({ topic_id: tid, user_id: u, created_at: at });
    const replies = 1 + Math.floor(rand() * 3);
    for (let r = 0; r < replies; r++) {
      const rat = new Date(Date.parse(at) + (r + 1) * 3_600_000).toISOString();
      await db('discussion_comments').insert({ target_type: 'topic', target_id: tid, author_id: userIds[(i + r + 4) % userIds.length], body: pick(COMMENTS), created_at: rat });
      await db('topics').where({ id: tid }).update({ last_activity_at: rat });
    }
  }

  console.log(`${created} ocorrências FICTÍCIAS criadas e marcadas como demonstração.`);
  console.log(`${PROPOSALS.length} propostas, 2 fóruns da comunidade e ${TOPICS.length} discussões fictícias criadas por contas de demonstração.`);
  console.log(`Contas de cidadão: cidadao1${DEMO_DOMAIN} até cidadao8${DEMO_DOMAIN}, senha ${demoPassword}`);
  console.log(adminFixed ? `Administrador: ${ADMIN_EMAIL}, senha definida em DEMO_ADMIN_PASSWORD` : `Administrador: ${ADMIN_EMAIL}, senha ${adminPassword}  (anote, não será mostrada de novo)`);
  console.log(staffFixed ? `Funcionário: ${STAFF_EMAIL}, senha definida em DEMO_STAFF_PASSWORD` : `Funcionário: ${STAFF_EMAIL}, senha ${staffPassword}  (anote, não será mostrada de novo)`);
}

const db = createDb(config.databaseFile);
await prepareDb(db);
// tudo ou nada: se algo falhar, nenhum dado de demonstração é apagado pela metade
if (process.argv.includes('--reset')) await db.transaction((trx) => reset(trx as unknown as Db));
else await seed(db);
await db.destroy();
