import PDFDocument from 'pdfkit';
import { formatDateTimeBr, formatDayBr, localDay, nowIso } from '../lib/dates.js';
import type { Indicators, otherDetails, topOpen } from './indicators.service.js';
import type { ExtraIndicators } from './insights.service.js';

const INK = '#262D2C';
const INK_2 = '#4F5A61';
const MUTED = '#7A858C';
const LINE = '#D3D8D4';
// placa azul da identidade do UrbanTalk
const BRAND = '#1B4F8F';
// mesmas cores semânticas do site
export const PALETTE: Record<string, string> = {
  ambar: '#C2780A',
  azul: '#2F62B8',
  verde: '#1F6F5C',
  violeta: '#6B4FA3',
  petroleo: '#1D6A7A',
  laranja: '#C2541C',
  cinza: '#5F6B66',
  vermelho: '#B42318',
};

export interface ReportCriteria {
  neighborhood: string | null;
  scope?: 'cidade' | 'bairro' | null;
  category: string | null;
  status: string | null;
  situation?: 'abertas' | 'encerradas' | null;
  street?: string | null;
  q?: string | null;
}

const pct = (n: number, total: number) => (total === 0 ? '0%' : `${((n / total) * 100).toFixed(1).replace('.', ',')}%`);
const fmt = (n: number) => n.toLocaleString('pt-BR');

export function buildReportPdf(
  ind: Indicators,
  criteria: ReportCriteria,
  priorities: Awaited<ReturnType<typeof topOpen>>,
  others: Awaited<ReturnType<typeof otherDetails>> = [],
  extra?: ExtraIndicators,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 56, bottom: 70, left: 56, right: 56 },
    bufferPages: true,
    info: {
      Title: 'Relatório consolidado de ocorrências urbanas - UrbanTalk',
      Author: 'UrbanTalk',
      Subject: `Ocorrências de ${formatDayBr(ind.period.from)} a ${formatDayBr(ind.period.to)}`,
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom;
  // corta o texto com reticências para caber na coluna, sem quebrar linha
  const fit = (text: string, w: number) => {
    if (doc.widthOfString(text) <= w) return text;
    let t = text;
    while (t.length > 1 && doc.widthOfString(t + '…') > w) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  };
  const ensure = (h: number) => {
    if (doc.y + h > bottomLimit()) doc.addPage();
  };

  // cabeçalho com a placa da marca
  doc.save().roundedRect(left, 48, 92, 30, 3).fill(BRAND);
  doc.roundedRect(left + 3, 51, 86, 24, 2).lineWidth(1).stroke('#FFFFFF').restore();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text('UrbanTalk', left, 57, { width: 92, align: 'center' });
  doc.fillColor(INK_2).font('Helvetica').fontSize(9).text('Sorocaba, SP', left + 104, 58);
  doc.y = 100;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text('Relatório consolidado de ocorrências urbanas', left, doc.y, { width });
  doc.moveDown(0.6);

  const metaRow = (label: string, value: string) => {
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(label, left, y, { width: 110 });
    doc.fillColor(INK).text(value, left + 110, y, { width: width - 110 });
    doc.moveDown(0.25);
  };
  metaRow('Período', `${formatDayBr(ind.period.from)} a ${formatDayBr(ind.period.to)}`);
  metaRow('Abrangência', criteria.scope === 'cidade' ? 'Somente cidade toda' : criteria.scope === 'bairro' ? 'Somente por bairro' : 'Cidade toda e bairros');
  metaRow('Bairro', criteria.neighborhood ? `"${criteria.neighborhood}" (sem diferenciar acentos e maiúsculas)` : 'Todos os bairros');
  metaRow('Categoria', criteria.category ?? 'Todas as categorias');
  metaRow('Status', criteria.status ?? (criteria.situation === 'abertas' ? 'Somente em aberto' : criteria.situation === 'encerradas' ? 'Somente encerradas' : 'Todos os status'));
  if (criteria.street) metaRow('Rua contém', `"${criteria.street}"`);
  if (criteria.q) metaRow('Busca no texto', `"${criteria.q}"`);
  metaRow('Gerado em', formatDateTimeBr(nowIso()));
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.5).stroke(LINE);
  doc.moveDown(0.8);

  if (ind.total === 0) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text('Nenhuma ocorrência encontrada para os critérios selecionados.', left, doc.y, { width });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(10).fillColor(INK_2).text(
      'Não há registros no período e nos filtros escolhidos. Nenhum número foi estimado ou preenchido artificialmente.',
      { width },
    );
  } else {
    // números principais
    const stats: [string, string][] = [
      ['Ocorrências', fmt(ind.total)],
      ['Em aberto', fmt(ind.open)],
      ['Encerradas', fmt(ind.closed)],
      ['Confirmações de cidadãos', fmt(ind.confirmations)],
    ];
    const colW = width / stats.length;
    const y0 = doc.y;
    stats.forEach(([label, value], i) => {
      doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(value, left + i * colW, y0, { width: colW - 10 });
      doc.font('Helvetica').fontSize(9).fillColor(INK_2).text(label, left + i * colW, y0 + 26, { width: colW - 10 });
    });
    doc.y = y0 + 52;

    if (ind.demoCount > 0) {
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#8A3B00').text(
        `Atenção: ${fmt(ind.demoCount)} das ocorrências deste relatório são dados fictícios de demonstração e não representam registros reais.`,
        left,
        doc.y,
        { width },
      );
    }

    const section = (title: string) => {
      ensure(60);
      doc.moveDown(1.1);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(title, left, doc.y, { width });
      doc.moveDown(0.4);
    };

    const barTable = (rows: { label: string; count: number; color?: string }[], total: number) => {
      const labelW = 210;
      const countW = 46;
      const pctW = 50;
      const barX = left + labelW + countW + pctW + 10;
      const barMax = width - (barX - left);
      const max = Math.max(...rows.map((r) => r.count), 1);
      for (const r of rows) {
        ensure(18);
        const y = doc.y;
        doc.font('Helvetica').fontSize(9.5).fillColor(INK);
        doc.text(fit(r.label, labelW - 8), left, y, { width: labelW - 8, lineBreak: false });
        doc.text(fmt(r.count), left + labelW, y, { width: countW, align: 'right' });
        doc.fillColor(INK_2).text(pct(r.count, total), left + labelW + countW, y, { width: pctW, align: 'right' });
        const w = (r.count / max) * barMax;
        if (w > 0) doc.save().rect(barX, y + 1.5, Math.max(w, 1.5), 8).fill(r.color ?? BRAND).restore();
        doc.y = y + 16;
      }
    };

    if (extra) {
      const c = extra.comparison;
      const sign = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
      const pctTxt = (p: number | null) => (p === null ? 'sem base de comparação' : `${p > 0 ? '+' : ''}${String(p).replace('.', ',')}%`);
      section('Comparação com o período anterior de mesmo tamanho');
      doc.font('Helvetica').fontSize(9).fillColor(INK_2).text(
        `Período anterior: ${formatDayBr(c.previous.from)} a ${formatDayBr(c.previous.to)}. Mais registros pode indicar mais participação dos moradores, e não necessariamente mais problemas na cidade.`,
        left,
        doc.y,
        { width },
      );
      doc.moveDown(0.4);
      for (const [label, d] of [['Registradas', c.total], ['Resolvidas (status atual)', c.resolved], ['Em aberto (status atual)', c.open]] as const) {
        ensure(16);
        const y = doc.y;
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(label, left, y, { width: 200 });
        doc.text(`${fmt(d.current)} agora · ${fmt(d.previous)} antes · ${sign(d.diff)} (${pctTxt(d.pct)})`, left + 200, y, { width: width - 200 });
        doc.y = y + 15;
      }
      section('Tempo até a resolução e reaberturas');
      const t = extra.resolutionTime;
      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(
        t.enough
          ? `Média de ${String(t.meanDays).replace('.', ',')} dias e mediana de ${String(t.medianDays).replace('.', ',')} dias entre o registro e a resolução informada (amostra: ${fmt(t.sample)} ocorrências resolvidas).`
          : `Dados insuficientes para calcular o tempo de resolução: ${fmt(t.sample)} ocorrência(s) resolvida(s), mínimo de ${t.minSample}.`,
        left,
        doc.y,
        { width },
      );
      doc.moveDown(0.3);
      doc.text(`${fmt(extra.reopened)} ocorrência(s) reaberta(s) e ${fmt(extra.reportedUnresolved)} informada(s) por moradores como ainda não resolvida(s).`, left, doc.y, { width });
      if (extra.topProposals.length) {
        section('Propostas com mais apoio da comunidade');
        doc.font('Helvetica').fontSize(9).fillColor(INK_2).text('Apoio de moradores não equivale a aprovação oficial.', left, doc.y, { width });
        doc.moveDown(0.3);
        for (const p of extra.topProposals) {
          ensure(15);
          const y = doc.y;
          doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(fit(p.title, width - 190), left, y, { width: width - 190, lineBreak: false });
          doc.fillColor(INK_2).text(`${fmt(p.votes)} apoios · ${p.statusName}`, left + width - 180, y, { width: 180, align: 'right' });
          doc.y = y + 15;
        }
      }
    }

    section('Distribuição por status');
    barTable(ind.byStatus.map((s) => ({ label: s.closed ? `${s.name} (encerramento)` : s.name, count: s.count, color: PALETTE[s.color] ?? BRAND })), ind.total);

    section('Distribuição por categoria');
    barTable(ind.byCategory.map((c) => ({ label: c.name, count: c.count })), ind.total);

    if (others.length) {
      section('O que foi informado em "Outros"');
      doc.font('Helvetica').fontSize(9).fillColor(INK_2).text('Textos digitados por quem escolheu a categoria Outros, agrupados quando iguais.', left, doc.y, { width });
      doc.moveDown(0.4);
      barTable(others.map((o) => ({ label: o.label, count: o.count, color: PALETTE['cinza'] })), ind.byCategory.find((c) => c.slug === 'outros')?.count || ind.total);
    }

    section('Distribuição por bairro');
    const topHoods = ind.byNeighborhood.slice(0, 15);
    const rest = ind.byNeighborhood.slice(15);
    const hoodRows = topHoods.map((h) => ({ label: h.name, count: h.count }));
    if (rest.length) hoodRows.push({ label: `Outros ${rest.length} bairros`, count: rest.reduce((a, h) => a + h.count, 0) });
    barTable(hoodRows, ind.total);

    const unit = ind.granularity === 'day' ? 'dia' : ind.granularity === 'week' ? 'semana (a partir de segunda)' : 'mês';
    section(`Evolução dos registros por ${unit}`);
    const series = ind.timeline;
    const chartH = 90;
    ensure(chartH + 46);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`Maior valor em um período: ${fmt(Math.max(...series.map((s) => s.count), 0))}`, left, doc.y, { width });
    doc.moveDown(0.6);
    const cy = doc.y;
    const max = Math.max(...series.map((s) => s.count), 1);
    const gap = series.length > 40 ? 0.5 : 1.5;
    const bw = width / series.length;
    doc.save().moveTo(left, cy + chartH).lineTo(left + width, cy + chartH).lineWidth(0.6).stroke(MUTED).restore();
    series.forEach((s, i) => {
      const h = (s.count / max) * (chartH - 4);
      if (h > 0) doc.save().rect(left + i * bw + gap / 2, cy + chartH - h, Math.max(bw - gap, 0.5), h).fill(BRAND).restore();
    });
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(formatDayBr(series[0].start), left, cy + chartH + 4);
    doc.text(formatDayBr(series[series.length - 1].start), left, cy + chartH + 4, { width, align: 'right' });
    doc.y = cy + chartH + 20;

    section('Ocorrências em aberto com mais confirmações');
    doc.font('Helvetica').fontSize(9).fillColor(INK_2).text(
      'Lista de apoio à priorização: ocorrências ainda não resolvidas, ordenadas pelo número de cidadãos que confirmaram o problema e, em seguida, pela data mais antiga.',
      left,
      doc.y,
      { width },
    );
    doc.moveDown(0.5);
    if (priorities.length === 0) {
      doc.fillColor(INK).text('Todas as ocorrências do período estão resolvidas.', { width });
    } else {
      const cols = [
        { label: 'Código', w: 54 },
        { label: 'Categoria', w: 104 },
        { label: 'Endereço', w: 140 },
        { label: 'Status', w: 72 },
        { label: 'Registro', w: 54 },
        { label: 'Conf.', w: width - 424, align: 'right' as const },
      ];
      const row = (values: string[], bold = false) => {
        ensure(18);
        const y = doc.y;
        let x = left;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.8).fillColor(bold ? INK_2 : INK);
        values.forEach((v, i) => {
          doc.text(fit(v, cols[i].w - 6), x, y, { width: cols[i].w - 6, align: cols[i].align ?? 'left', lineBreak: false });
          x += cols[i].w;
        });
        doc.y = y + 15;
        doc.save().moveTo(left, doc.y - 3).lineTo(left + width, doc.y - 3).lineWidth(0.4).stroke(LINE).restore();
      };
      row(cols.map((c) => c.label), true);
      for (const p of priorities) {
        row([p.code, p.category, p.street ? `${p.street}, ${p.neighborhood}` : p.neighborhood, p.statusName, formatDayBr(localDay(p.createdAt)), fmt(p.confirmations)]);
      }
    }
  }

  // rodapé em todas as páginas
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 50;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(
      'Gerado pelo UrbanTalk para encaminhamento manual. O sistema não possui integração automática com a Prefeitura de Sorocaba e este documento não comprova recebimento por nenhum órgão.',
      left,
      y,
      { width: width - 60 },
    );
    doc.text(`Página ${i + 1} de ${range.count}`, left + width - 60, y, { width: 60, align: 'right' });
  }

  doc.end();
  return done;
}
