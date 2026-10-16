import type { Knex } from 'knex';
import { placeKey } from '../lib/text.js';

// categorias oficiais; o front lê daqui via API, nada fixo nos componentes
export const BASE_CATEGORIES = [
  { slug: 'buraco', name: 'Buraco na via', description: 'Buracos, afundamentos e asfalto quebrado.', icon: 'pothole', sort_order: 1 },
  { slug: 'iluminacao', name: 'Falta de iluminação pública', description: 'Postes apagados, lâmpadas queimadas ou trechos escuros.', icon: 'streetlight', sort_order: 2 },
  { slug: 'calcada', name: 'Calçada danificada', description: 'Calçadas quebradas, sem rampa ou com obstáculos.', icon: 'sidewalk', sort_order: 3 },
  { slug: 'lixo', name: 'Acúmulo de lixo', description: 'Lixo e entulho descartados em via pública.', icon: 'trash', sort_order: 4 },
  { slug: 'sinalizacao', name: 'Sinalização apagada ou danificada', description: 'Placas, faixas e semáforos com problema.', icon: 'sign', sort_order: 5 },
  { slug: 'ponto-onibus', name: 'Ponto de ônibus em más condições', description: 'Abrigos quebrados, sem cobertura ou sem identificação.', icon: 'bus', sort_order: 6 },
  // categoria aberta: quem escolhe precisa dizer qual é o problema
  { slug: 'outros', name: 'Outros', description: 'Não achou o tipo certo? Escolha aqui e diga qual é o problema.', icon: 'other', sort_order: 99, requires_detail: true },
];

export async function seedBase(db: Knex) {
  for (const c of BASE_CATEGORIES) {
    const row = { requires_detail: false, ...c };
    await db('categories').insert(row).onConflict('slug').ignore(); // não sobrescreve edições feitas pelo administrador
  }
}

// fóruns temáticos prontos; os tópicos iniciais são conteúdo de apoio do UrbanTalk (sem autor cidadão)
export const BASE_FORUMS = [
  { slug: 'mobilidade-urbana', name: 'Mobilidade urbana', icon: 'bus', description: 'Ônibus, ciclovias, trânsito, caminhabilidade e como as pessoas se deslocam pela cidade.' },
  { slug: 'infraestrutura-ruas', name: 'Infraestrutura e manutenção de ruas', icon: 'pothole', description: 'Asfalto, buracos, drenagem, calçadas e conservação das vias.' },
  { slug: 'iluminacao-publica', name: 'Iluminação pública', icon: 'streetlight', description: 'Postes apagados, trechos escuros e manutenção da iluminação.' },
  { slug: 'meio-ambiente-limpeza', name: 'Meio ambiente e limpeza urbana', icon: 'trash', description: 'Descarte de lixo, entulho, coleta, áreas verdes e limpeza das vias.' },
  { slug: 'acessibilidade', name: 'Acessibilidade', icon: 'sidewalk', description: 'Rampas, calçadas acessíveis, pisos táteis e barreiras para quem tem mobilidade reduzida.' },
  { slug: 'seguranca-viaria', name: 'Segurança viária', icon: 'sign', description: 'Sinalização, travessias, velocidade e pontos de risco para pedestres, ciclistas e motoristas.' },
  { slug: 'ideias-propostas', name: 'Ideias e propostas', icon: 'sparkle', description: 'Espaço para amadurecer ideias antes de virar uma proposta formal.' },
  { slug: 'duvidas-orientacoes', name: 'Dúvidas e orientações', icon: 'info', description: 'Como usar o UrbanTalk, o que significa cada status e como registrar bem um problema.' },
  { slug: 'comunidade-bairros', name: 'Comunidade e bairros', icon: 'users', description: 'Conversas gerais entre moradores sobre a vida nos bairros de Sorocaba.' },
];

const T = (forum: string, key: string, title: string, body: string, pinned = false) => ({ forum, key, title, body, pinned });

export const BASE_TOPICS = [
  T('duvidas-orientacoes', 'guia-registro', 'Como registrar um problema de forma útil', 'Uma boa ocorrência tem o ponto exato no mapa, o nome da rua, uma referência fácil (ex.: "em frente à padaria") e, se possível, uma foto tirada de longe e outra de perto. Evite colocar dados pessoais na descrição. Se o problema já estiver no mapa, confirme a ocorrência existente em vez de criar outra.', true),
  T('duvidas-orientacoes', 'guia-status', 'O que significa cada status e o que é "resolução com evidências"', 'Os status mostram em que etapa está o acompanhamento feito pela equipe do UrbanTalk. "Resolução informada" quer dizer que um responsável declarou que o problema foi resolvido. "Resolução com evidências" quer dizer que foram anexadas fotos ou registros da intervenção, o que não é uma verificação independente. "Confirmação da comunidade" aparece quando moradores indicam que o problema parece solucionado. O UrbanTalk não é um canal oficial da Prefeitura.', true),
  T('duvidas-orientacoes', 'guia-votos', 'Votar em uma proposta aprova a proposta?', 'Não. O voto mostra o apoio da comunidade e ajuda a organizar prioridades, mas a decisão de executar qualquer obra ou serviço é do órgão público responsável. Uma proposta só aparece como "Aceita" quando houver resposta desse órgão.'),
  T('mobilidade-urbana', 'pergunta-onibus', 'Quais pontos de ônibus do seu bairro precisam de atenção?', 'Pergunta para iniciar a conversa: falta abrigo, iluminação ou identificação da linha em algum ponto que você usa? Se o problema for concreto, registre também uma ocorrência na categoria "Ponto de ônibus em más condições" para ele aparecer no mapa.'),
  T('mobilidade-urbana', 'pergunta-ciclovia', 'Onde faltam ligações seguras para quem anda de bicicleta?', 'Pergunta para iniciar a conversa: quais trechos você evita de bicicleta por falta de ciclofaixa ou por insegurança? Descreva o trecho e, se tiver uma ideia de solução, transforme em proposta.'),
  T('infraestrutura-ruas', 'guia-buraco', 'Buraco que volta depois do conserto: como relatar', 'Dica de apoio: quando um buraco reaparece, use a opção "o problema continua" na ocorrência antiga, se ela foi encerrada. Assim o histórico fica junto e a equipe consegue reavaliar sem perder o que já foi feito.'),
  T('iluminacao-publica', 'pergunta-trechos-escuros', 'Trechos escuros no caminho a pé: onde estão?', 'Pergunta para iniciar a conversa: há algum caminho que você faz a pé à noite e que fica escuro? Registre cada poste apagado como ocorrência separada, com a referência mais próxima.'),
  T('meio-ambiente-limpeza', 'pergunta-descarte', 'Pontos de descarte irregular que se repetem', 'Pergunta para iniciar a conversa: existe algum lugar onde o lixo ou entulho volta a aparecer mesmo depois da limpeza? Repetição é uma informação importante para quem planeja a coleta.'),
  T('acessibilidade', 'pergunta-rampas', 'Calçadas e travessias sem rampa', 'Pergunta para iniciar a conversa: em quais cruzamentos falta rampa ou o piso está quebrado? Fotos ajudam muito a entender a barreira.'),
  T('seguranca-viaria', 'pergunta-travessias', 'Travessias perigosas para pedestres', 'Pergunta para iniciar a conversa: há alguma travessia onde a faixa está apagada ou o tempo do semáforo é curto? Descreva o que você observa, sem expor pessoas envolvidas em acidentes.'),
  T('ideias-propostas', 'guia-proposta', 'Como transformar uma ideia em proposta', 'Dica de apoio: comece pelo problema que a ideia resolve, diga onde ela se aplica (bairro ou cidade toda) e, se houver, relacione ocorrências que mostram o problema. Propostas claras recebem comentários mais úteis.'),
  T('comunidade-bairros', 'guia-convivencia', 'Combinados de convivência', 'Conteúdo de apoio: trate as outras pessoas com respeito, não publique endereços, telefones ou fotos que identifiquem moradores, e use a opção "Denunciar" para conteúdos abusivos. Publicações que violam esses combinados podem ser ocultadas pela moderação.', true),
];

// temas usados para classificar fóruns (oficiais e da comunidade)
export const FORUM_THEMES = [
  { id: 'mobilidade', name: 'Mobilidade urbana', icon: 'bus' },
  { id: 'infraestrutura', name: 'Infraestrutura e ruas', icon: 'pothole' },
  { id: 'iluminacao', name: 'Iluminação pública', icon: 'streetlight' },
  { id: 'meio-ambiente', name: 'Meio ambiente e limpeza', icon: 'trash' },
  { id: 'acessibilidade', name: 'Acessibilidade', icon: 'sidewalk' },
  { id: 'seguranca-viaria', name: 'Segurança viária', icon: 'sign' },
  { id: 'ideias', name: 'Ideias e propostas', icon: 'sparkle' },
  { id: 'duvidas', name: 'Dúvidas e orientações', icon: 'info' },
  { id: 'comunidade', name: 'Comunidade e bairros', icon: 'users' },
] as const;

const THEME_OF: Record<string, string> = {
  'mobilidade-urbana': 'mobilidade',
  'infraestrutura-ruas': 'infraestrutura',
  'iluminacao-publica': 'iluminacao',
  'meio-ambiente-limpeza': 'meio-ambiente',
  acessibilidade: 'acessibilidade',
  'seguranca-viaria': 'seguranca-viaria',
  'ideias-propostas': 'ideias',
  'duvidas-orientacoes': 'duvidas',
  'comunidade-bairros': 'comunidade',
};

// só os fóruns oficiais e seus tópicos de apoio; nenhum fórum é criado por bairro
export async function seedForums(db: Knex) {
  const ts = new Date().toISOString();
  for (const [i, f] of BASE_FORUMS.entries()) {
    await db('forums')
      .insert({ ...f, name_key: placeKey(f.name), kind: 'oficial', theme: THEME_OF[f.slug] ?? 'comunidade', sort_order: (i + 1) * 10, active: true, status: 'ativo', created_at: ts, updated_at: ts })
      .onConflict('slug')
      .ignore();
  }
  const forums = (await db('forums').where({ kind: 'oficial' }).select('id', 'slug')) as { id: number; slug: string }[];
  for (const t of BASE_TOPICS) {
    const forum = forums.find((f) => f.slug === t.forum);
    if (!forum) continue;
    await db('topics')
      .insert({ forum_id: forum.id, author_id: null, is_institutional: true, seed_key: t.key, title: t.title, body: t.body, pinned: t.pinned, locked: false, created_at: ts, last_activity_at: ts })
      .onConflict('seed_key')
      .ignore();
  }
}
