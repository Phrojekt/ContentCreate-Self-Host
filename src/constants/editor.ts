// Limites do editor de rascunho (UI-32). Compartilhados entre a validação do
// servidor (`draftEditSchema`) e os campos do editor — folgados o bastante para
// o texto que o LLM realmente gera (o template ajusta/corta na renderização).
export const EDIT_LIMITS = {
  shortTitle: 160,
  caption: 2200, // limite do Instagram
  hashtags: 30, // limite do Instagram
  hashtag: 80,
  lead: 400,
  body: 1500,
  eyebrow: 120,
  statValue: 80,
  statLabel: 300,
  statSupporting: 400,
  cmpLabel: 120,
  cmpValue: 200,
  cmpDetail: 300,
  quoteText: 800,
  quoteAuthor: 160,
  quoteRole: 200,
} as const;
