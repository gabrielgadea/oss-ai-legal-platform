# Atlas Digital

> Veja onde sua atenção mora, conheça cada lugar e decida se fica ou muda de rota.
> Existem infinitos outros lugares no multiverso digital.

O Atlas Digital transforma a atividade digital de uma pessoa num **território
navegável**. Cada plataforma é um *lugar*, cada tipo de uso é um *bairro*, o
que nunca foi visitado fica sob *névoa*, e o resto do catálogo é o
*multiverso*. A pessoa vê o próprio mapa, entende a qualidade de cada lugar e
toma decisões de rota que o mapa simula na hora.

Rota no app: `/atlas` (item **Atlas Digital** na barra lateral).

---

## 1. Funcionalidades

| Aba | O que faz |
|---|---|
| **Meu mapa** | Mapa em SVG com 8 bairros. Tamanho do nó = tempo semanal; contorno = terreno (Clareira / Trilha / Labirinto, com cor **e** padrão de traço); névoa sobre bairros sem presença; pino "você está aqui" no lugar mais habitado; setas tracejadas para rotas planejadas. |
| **Detalhe do lugar** | Qualificação em 4 dimensões, atributos que pesam (+/−), confiança do dado, decisão de rota (Permanecer / Reduzir / Migrar / Explorar) e alternativas mais bem qualificadas no mesmo bairro, com o *porquê*. |
| **Multiverso** | Simulação da rota planejada (antes × depois), portais aleatórios para bairros pouco visitados e catálogo filtrável. |
| **Brasil** | Cartograma de blocos das 27 UFs, com 5 métricas. Dados reais agregados com k-anonimato, ou simulação claramente rotulada. Participação opt-in. |
| **Conquistas** | XP, 6 níveis, 13 conquistas e 6 missões. |
| **Analytics** | Indicadores pessoais (tempo, saúde, diversidade, concentração, % aberto, % com anúncios), gráficos por bairro, por hora e por dia, qualidade dos dados e funil do produto. |
| **Integrações** | Importação de exportações (Google Takeout, Chrome, Spotify, Netflix, CSV), estimativa manual e exclusão total dos dados. |

## 2. Arquitetura

```
frontend/src/app/lib/atlas/        # núcleo puro (sem React), testável
  types.ts         modelo de domínio
  catalog.ts       bairros, lugares e resolução domínio/rótulo → lugar
  scoring.ts       qualificação por fórmula aberta
  metrics.ts       uso efetivo, métricas, projeção de rota
  importers.ts     parsers das exportações (rodam no navegador)
  gamification.ts  XP, níveis, conquistas, missões
  multiverse.ts    alternativas e portais
  brazil.ts        cartograma, contribuição arredondada, simulação
  state.ts         reducers + localStorage
  analytics.ts     eventos de produto (lista fechada)
frontend/src/app/components/atlas/ # UI (React + SVG + Recharts)
backend/src/routes/atlas.ts        # API Express
backend/src/lib/atlasAggregate.ts  # validação e agregação com k-anonimato
backend/migrations/001_atlas_digital.sql
```

**Local-first.** O estado vive no `localStorage` e é sincronizado em segundo
plano com `atlas_states`. Sem backend, tudo continua funcionando no navegador.
A página é renderizada só no cliente para evitar divergência de hidratação.

### API

| Método | Rota | Descrição |
|---|---|---|
| GET/PUT/DELETE | `/atlas/state` | Estado pessoal (≤ 512 KB). DELETE também apaga eventos. |
| POST/DELETE | `/atlas/contribution` | Contribuição semanal opt-in / revogação. |
| GET | `/atlas/brazil` | Agregados por UF dos últimos 28 dias, só UFs com ≥ 10 participantes. |
| POST | `/atlas/events` | Lote de eventos de produto (lista fechada, props escalares). |
| GET | `/atlas/analytics/overview` | Contagens e funil dos últimos 30 dias, sem dados individuais. |

Todas exigem autenticação (`requireAuth`). Aplicar
`backend/migrations/001_atlas_digital.sql` após o schema base.

## 3. Metodologia de qualificação

A qualificação **não é uma nota editorial**. Cada lugar tem atributos
observáveis (`PlaceAttributes`) e as notas são derivadas por fórmula:

| Dimensão | Base | Regras |
|---|---|---|
| Privacidade | 50 | anúncios −25; misto/freemium −5; assinatura/doação/público/transação +10; E2E por padrão +30 (sem E2E −10); código aberto +15 (parcial +7,5) |
| Atenção | 75 | feed infinito −30 (sem: +10); autoplay −20 (sem: +5); opção cronológica +10 (sem: −5) |
| Autonomia | 40 | opção cronológica +15/−5; escolha de algoritmo +20/−5; federado +20 (parcial +10); código aberto +10 |
| Abertura | 0 | código aberto 50 (parcial 25) + federado 50 (parcial 25) |

**Saúde** = 0,35·Atenção + 0,30·Privacidade + 0,20·Autonomia + 0,15·Abertura.
**Terreno**: Clareira ≥ 65 · Trilha 40–64 · Labirinto < 40.

Regras de curadoria:

1. Atributo incerto = `null`. Não pontua e reduz a *confiança* exibida.
2. País-sede só quando bem estabelecido.
3. Catálogo datado (`CATALOG_REVISION`). Plataformas mudam: correções entram por PR,
   com fonte.

### Métricas pessoais

- **Uso efetivo**: por lugar vale a melhor qualidade de dado (medido > derivado >
  autodeclarado). Fontes de mesma qualidade se somam. Isso evita contar o
  mesmo tempo duas vezes.
- **Diversidade**: entropia de Shannon entre os 8 bairros, normalizada de 0 a 100.
- **Concentração**: participação dos 3 lugares mais usados e HHI entre lugares.
- **Atenção saudável**: média da saúde dos lugares, ponderada pelo tempo.
- **Rota planejada**: Reduzir = −50% do tempo; Migrar = −100%. O tempo liberado
  vai para o destino escolhido, se houver.

## 4. Integrações com as plataformas

A maioria das plataformas **não oferece API de histórico de uso**. O caminho
viável e com base legal é o **direito de portabilidade** (LGPD, art. 18, V):
a pessoa baixa o próprio pacote de dados e o Atlas o lê **no navegador**.

| Fonte | Arquivo | Qualidade |
|---|---|---|
| Google Takeout → Minha atividade / YouTube | `MyActivity.json`, `watch-history.json` | derivado |
| Google Takeout → Chrome | `History.json` (`Browser History`) | derivado |
| Spotify → Baixar seus dados | `StreamingHistory*.json` / histórico estendido | medido |
| Netflix → Baixar informações | `ViewingActivity.csv` (trailers ignorados) | medido |
| CSV genérico (ex.: tempo de tela do celular) | `plataforma,minutos[,data]` | autodeclarado |

**Dado derivado**: o tempo entre eventos consecutivos é atribuído ao evento,
com teto por bairro (vídeo 20 min, áudio 10, jogos 30, demais 10). É uma
estimativa e aparece rotulada como tal.

Roadmap de integrações diretas: Spotify Web API (faixas recentes), extensão de
navegador com medição local, importação de `.zip` do Takeout no próprio navegador.

## 5. Gamificação: princípios

- **Nunca recompensa tempo de tela.** Há teste automatizado garantindo que o XP
  não muda quando o tempo aumenta.
- Recompensa **mapear** (importar dados reais), **explorar** (novos lugares e
  bairros), **decidir** (rotas) e **diversificar** (conquistas por diversidade,
  baixa concentração, lugares abertos e serviços públicos).
- Os níveis vão de Turista a Viajante do Multiverso e descrevem autonomia, não
  consumo.

## 6. Privacidade e LGPD

| Princípio | Implementação |
|---|---|
| Minimização (art. 6º, III) | Arquivos brutos nunca saem do dispositivo; só minutos por lugar são guardados. |
| Consentimento (art. 7º, I) | O mapa do Brasil é opt-in, com finalidade explícita e revogável (DELETE `/atlas/contribution`). |
| Anonimização prática | Contribuição sem lista de plataformas, valores arredondados de 5 em 5, exibição só agregada com k ≥ 10 por UF. Os dados são **pseudonimizados**, não anônimos: o `user_id` fica guardado para permitir exclusão. |
| Eliminação (art. 18, VI) | Botão "Apagar todos os meus dados" (estado, eventos e contribuições). Exclusão da conta apaga tudo em cascata. |
| Analytics | Lista fechada de eventos, propriedades escalares sem conteúdo pessoal, retenção sugerida de 180 dias. |

> ⚠️ Antes de produção: revisão jurídica do texto de consentimento, RIPD
> (relatório de impacto, art. 38), restringir `/atlas/analytics/overview` a
> perfis administrativos e agendar a retenção de `atlas_events`.

## 7. Testes

```bash
npm test --prefix backend              # agregação, k-anonimato, sanitização
npm run test:atlas --prefix frontend   # catálogo, scoring, métricas, importadores, gamificação
```

## 8. Limitações conhecidas

- O catálogo é finito (55 lugares) e os atributos são uma curadoria datada. O
  próprio produto diz que "o multiverso é maior que qualquer catálogo", e os
  domínios que não casam aparecem na importação.
- Os pesos da fórmula de saúde são uma escolha normativa explícita e abertos a
  debate. Não são uma verdade empírica.
- O cartograma aproxima a geografia; não é um mapa em escala.
- Dados simulados do mapa do Brasil existem só para demonstração e são
  sempre rotulados.
