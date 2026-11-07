# Atlas Digital

> Veja onde sua atenção mora, conheça cada lugar e decida se fica ou muda de rota.
> Existem infinitos outros lugares no multiverso digital.

O Atlas Digital transforma a atividade digital de uma pessoa num **território
navegável**. Cada plataforma é um *lugar*, cada tipo de uso é um *bairro*, o
que nunca foi visitado fica sob *névoa*, e o resto do catálogo é o
*multiverso*. A pessoa vê o próprio mapa, entende a qualidade de cada lugar e
toma decisões de rota que o mapa simula na hora.

Rota no app: `/atlas` (item **Atlas Digital** na barra lateral).

## 0. Estilos do mapa: Aventura (padrão) e Cosmos

A aba **Mundo** oferece dois estilos, alternáveis no canto do mapa (a escolha
fica salva no navegador):

**Aventura (padrão)** — `AdventureMap.tsx` + `lib/atlas/adventure.ts`. Segue a
linguagem dos mapas de estratégia de fantasia por turnos (as referências de
Heroes of Might & Magic enviadas), com arte **procedural e original** — nenhum
asset, nome ou interface de jogo existente foi copiado:

- Terreno pintado em canvas: mar com ondas, águas rasas, praias e ilhas com
  textura. Cada reino tem um **bioma** que expressa sua essência: campina
  (social), floresta de outono (vídeo), costa de palmeiras (mensagens), tundra
  de altas montanhas (conhecimento), colinas (áudio), deserto de bazares
  (comércio), planalto pedregoso (cidadania), selva (jogos e criação).
- Decorações procedurais (árvores, pinheiros nevados, palmeiras, cordilheiras,
  colinas, rochas, cactos, dunas, flores, cogumelos) e **estradas de terra**
  ligando as cidades de cada reino (árvore geradora mínima).
- **Castelos** para territórios revelados (tamanho = volume de conteúdo; casas
  em volta = população; bandeira vermelha = você habita; brilho dourado =
  lanternas), **ruínas "?"** para setores avistados mas sem nome, **baús** para
  os marcos e um **cavaleiro** com estandarte para o Cartógrafo.
- **Névoa preta estrelada** sobre o que não foi explorado (a exploração está
  sempre ativa neste estilo), **setas verdes/vermelhas** mostrando até onde as
  léguas de hoje alcançam, **minimapa** clicável e **painel lateral** com
  léguas, domínios, setores por revelar e baús restantes.
- Clicar num castelo abre o domínio; clicar no mapa move o Cartógrafo; chegar a
  uma ruína dispara a expedição real.

**Cosmos** — o estilo futurista anterior (descrito abaixo), mantido como opção.

## 0. Estética: cosmos neural de dados

O mapa não usa a linguagem de pergaminho medieval, e sim a de um **cosmos
digital futurista**, para expressar o universo de conteúdo: fundo de espaço
profundo com estrelas e **grade holográfica**; cada reino é uma
**ilha-nebulosa** com contorno **neon** na sua cor, ligada por **filamentos**
(teias de conexão entre territórios, como o k-NN do blueprint); territórios são
**nós luminosos** com sigilo neon; o desconhecido é um **setor criptografado**
(hachura escura); e os diálogos e HUD são **vidro escuro** com acentos ciano.
A tipografia de interface é sans/monoespaçada; a serifada fica só nos títulos.
Tokens no topo de `WorldMap.tsx` (`INK`, `PARCHMENT`→superfície escura, `NEON`…).
Nada disso muda a mecânica — é só pele.

## 0. O Multiverso como mapa de RPG

O mapa principal (aba **Mundo**) é uma carta de RPG desenhada em pergaminho.

**Geografia inventada.** Os reinos formam um arquipélago procedural
(`lib/atlas/world.ts`), sem relação com continentes, países ou fronteiras
reais. Ninguém chega com mapa mental prévio, nem com preconceitos, sobre
estas terras. A semente é fixa: todos os viajantes habitam o **mesmo** mundo.

| Reino | Essência |
|---|---|
| Ilhas do Burburinho | fogueiras de conversa pública (redes sociais) |
| Vale dos Espelhos | telas que contam histórias (vídeo) |
| Costa dos Pombais | mensageiros de porta em porta (mensagens) |
| Planalto das Torres | bibliotecas, mapas e escolas (conhecimento) |
| Colinas Ressonantes | sons que acompanham a vida (áudio) |
| Enseada dos Bazares | tendas de troca (comércio e finanças) |
| Terras da Ágora | direitos e decisões em comum (cidadania) |
| Bosque dos Jogos e Ofícios | arenas e oficinas (jogos e criação) |

**Hachura = desconhecido.** Cada território passa por quatro estados:

1. **Terra Incógnita**: o reino inteiro está hachurado, sem nome e sem número de territórios.
2. **Silhueta**: o reino já foi pisado; seus outros territórios aparecem hachurados, sem nome.
3. **Revelado**: nome, epíteto, qualificação e população.
4. **Habitado / verificado**: você tem tempo de uso, publicações ou laços lá (acampamento ⛺, selo de cera).

**Só se revela indo, e indo a um conteúdo real.** A expedição
(`ExpeditionDialog`) desembarca a pessoa, em outra aba, num **conteúdo
específico** do território — não na home —, sem antes mostrar o nome. Quando
há um deep link público e estável conhecido (`entryContent`), é ele que abre:
um verbete ao acaso da Wikipédia (`Especial:Aleatória`), o "em alta" do
YouTube (`/feed/trending`), o `r/popular` do Reddit, a linha Explorar do
Mastodon, a TV do Lichess, etc. Onde não há um deep link confiável, cai para
a porta de entrada — honestamente, sem inventar URL. Se a aba do Atlas ficar
oculta por pelo menos 45 segundos, a hachura se dissolve. O Atlas mede
**apenas** quanto tempo a própria aba ficou em segundo plano. Não vê o que a
pessoa faz do outro lado. Importações e conectores revelam territórios como
**verificados**.

**Sem spoilers.** O catálogo aberto foi substituído pelo **Diário** (códice
só do que foi revelado). Alternativas mais bem qualificadas ainda ocultas
aparecem apenas como contagem ("há 3 territórios mais luminosos sob
hachura"), com uma expedição às cegas.

**Expressão visual: três volumes distintos + essência por local**

Cada território do mapa expressa, em canais separados, as dimensões que o
usuário pediu — volume de conteúdo, população e engajamento/conexões — além
da essência do próprio lugar:

| Canal | Codifica | Fonte |
|---|---|---|
| **Tamanho do território** | volume de **conteúdo** produzido/hospedado (ordem de grandeza 1–5) | catálogo (`contentVolume`), cai para a população quando incerto e marca "(estimado)" |
| **Cabanas ⌂ (1–5)** | **população** / habitantes (ordem de grandeza <1 mi … >1 bi) | catálogo (`population`); `?` = incerta, nunca inventada |
| **Lanternas 🏮 + nº de viajantes** | **engajamento e conexões** no Atlas | mundo compartilhado, agregado com k ≥ 5 |
| **Sigilo central** | **essência do local** (não do reino): moeda=troca, escudo=cripto, vórtice=feed sem fim, megafone=anúncios, rede=federado, coração=doações, bússola=algoritmo à escolha, colunas=serviço público, relógio=cronológico, onda=feed infinito, ingresso=assinatura, névoa=incerto | derivado dos atributos |
| Glifo do reino | essência do bairro (fogueira, espelho, pombal, torre, ondas, tenda, coluna, estandarte) | categoria |
| Textura do solo + **bioma** | Clareira (Recife Bioluminescente) / Trilha (Planalto Temperado) / Labirinto (Bazar Cyberpunk) | qualificação |
| Acampamento ⛺ | você habita (tempo de uso ou dados de conector) | estado pessoal |
| Selo de cera | descoberta verificada por dados | estado pessoal |
| ❝ | rumor de alguém da sua caravana | caravanas |

Dois territórios do **mesmo reino** podem ter sigilos diferentes: Instagram
(vórtice) e Mastodon (rede) são ambos da Praça, mas a essência de cada um
aparece no centro. Assim o conteúdo, a quantidade de gente e o engajamento
viram três leituras independentes do território.

**Epítetos.** Cada território tem um nome de essência derivado dos
atributos, nunca da marca. Exemplos: *Praça sem Coroa* (federado), *Galeria
de Espelhos sem Fim* (feed infinito com autoplay), *Pombal dos Selos
Abertos* (criptografado e de código aberto). É o que um rumor revela antes
da expedição.

### Vocabulário próprio (no lugar de seguir, curtir e compartilhar)

| Plataformas | Atlas | Significado |
|---|---|---|
| Seguir | **Caravanar** (juntar-se à caravana) | viajar junto: os rumores das terras que a pessoa desbravou aparecem nas suas hachuras |
| Curtir | **Acender** uma lanterna | deixar uma luz num território que valeu a viagem, para guiar outros |
| Compartilhar | **Ecoar** | fazer a descoberta ressoar em outras terras |
| Participar | **Habitar** | produzir, conversar e criar laços num território |
| Check-in | **Fincar bandeira** | revelar um território indo até ele |

## 0.2 Modo Expedição (dinâmica de mapa de aventura)

Inspirado nos mapas de **Heroes of Might & Magic** (sem clonar arte, nomes ou
UI), o botão **Modo Expedição** na aba Mundo transforma o mapa num tabuleiro de
exploração. O "modus operandi" do gênero — névoa de guerra que o herói dissipa
ao andar, pontos de movimento diários que variam com terreno e estradas, e
objetos (minas, tesouros) espalhados — foi traduzido assim (`lib/atlas/expedition.ts`):

| Heroes M&M | Atlas | Implementação |
|---|---|---|
| Névoa de guerra | **a Bruma** | manto escuro com máscara SVG; dissipa num raio ao longo do caminho do Cartógrafo; o que foi dissipado fica salvo |
| Herói | **o Cartógrafo** | peão no mapa; começa no território habitado mais usado |
| Pontos de movimento/dia | **Léguas** | orçamento diário (base 60); 1 légua ≈ 24px; **labirinto custa +30%**, **trilha entre lugares conhecidos custa −50%**; zera a cada dia |
| Minas / renda diária | **Fontes** | cada território **habitado** rende +8 léguas/dia (teto 5 fontes) |
| Tesouros soltos | **Marcos** | 1 por reino; ao ser alcançado dá um **rumor** (revela o epíteto de um território hachurado próximo) ou +léguas |
| Visitar cidade | **chegar a um território** | mover até um território hachurado dispara a **expedição real**; a um descoberto, abre o painel |

**Laço de jogo:** explorar (gastar léguas para dissipar a Bruma) → coletar
(marcos → rumores; habitar → fontes) → decidir para onde ir com léguas
limitadas → reivindicar (expedição real). Ao passar o cursor, o mapa desenha a
**rota** até ele, verde dentro do orçamento e vermelha além, com o custo em léguas.

**Honestidade.** Mover e dissipar a Bruma é uma **camada de jogo**: não revela
dados nem cria métricas. A revelação real (nome, qualificação) continua exigindo
a expedição de verdade. As léguas vêm do orçamento diário, das fontes
(territórios que você comprovadamente habita) e de **ações reais** (importar
dados +20, decidir rota +10, conectar plataforma +25) — **nunca de tempo de
tela**. Tudo é determinístico (mesma Bruma/marcos para o mesmo estado) e
sincroniza pelo `/atlas/state` existente.

## 0.1 Integrações bidirecionais

| Direção | Como |
|---|---|
| ← Importar uso | arquivos de portabilidade (Takeout, Spotify, Netflix, CSV) |
| ← Importar o que se habita | **Mastodon** (`GET /api/v1/accounts/verify_credentials`) e **Bluesky** (`com.atproto.server.createSession` + `app.bsky.actor.getProfile`): publicações, seguidores e seguindo. O território fica revelado e verificado. |
| → Devolver descobertas automaticamente | com a opção ligada, cada território revelado vira publicação no **Mastodon** (`POST /api/v1/statuses`) e/ou no **Bluesky** (`com.atproto.repo.createRecord`, com facets de link em bytes UTF-8) |
| → Ecoar manualmente | intenções oficiais: WhatsApp, Telegram, Bluesky, Mastodon, Threads, X, LinkedIn, Facebook, Reddit, e-mail, além da folha nativa (Web Share API) |
| → Navegadores | favoritos por reino em formato Netscape (`.html`), importável em Chrome, Firefox, Safari e Edge |
| → Agendas | expedição agendada em `.ics` (RFC 5545) sem revelar o destino |
| ↔ O próprio Atlas | passaporte JSON (exportar e importar) |

**Credenciais**: o token do Mastodon e a senha de aplicativo do Bluesky
ficam só no navegador (sessionStorage por padrão; localStorage se a pessoa
pedir). As chamadas vão direto do navegador à plataforma e **nunca** passam
pelo servidor do Atlas. A devolução automática é opt-in por conector e tem
prévia do texto.

**Limite honesto**: Meta (Instagram, Facebook, Threads, WhatsApp), TikTok e X
não oferecem API aberta para publicar ou ler histórico em nome de pessoas
comuns. Para essas plataformas, a devolução é por intenção de
compartilhamento, que a pessoa confirma.

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
| PUT | `/atlas/discoveries` | Sincroniza os territórios revelados. |
| PUT | `/atlas/marks` | Substitui lanternas e ecos da pessoa. |
| GET | `/atlas/world` | Viajantes, verificados, lanternas e ecos por território (k ≥ 5; abaixo disso, `null` = "poucos"). |
| GET/PUT | `/atlas/profile` | Handle de viajante e se os rumores são públicos. |
| GET/PUT | `/atlas/caravan` | Caravanas que a pessoa acompanha e rumores (só de perfis públicos). |

Todas exigem autenticação (`requireAuth`). Aplicar
`backend/migrations/001_atlas_digital.sql` e depois
`002_atlas_world.sql` após o schema base.

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
| Eliminação (art. 18, VI) | Botão "Apagar todos os meus dados" (estado, eventos, contribuições, descobertas, marcas, caravanas e perfil). Exclusão da conta apaga tudo em cascata. |
| Mundo compartilhado | Viajantes, lanternas e ecos só aparecem com k ≥ 5. Rumores de caravana expõem apenas o epíteto, e só de quem tornou o perfil público. |
| Credenciais de terceiros | Nunca chegam ao servidor do Atlas; ficam no navegador da pessoa. |
| Analytics | Lista fechada de eventos, propriedades escalares sem conteúdo pessoal, retenção sugerida de 180 dias. |

> ⚠️ Antes de produção: revisão jurídica do texto de consentimento, RIPD
> (relatório de impacto, art. 38), restringir `/atlas/analytics/overview` a
> perfis administrativos e agendar a retenção de `atlas_events`.

## 7. Testes

```bash
npm test --prefix backend              # agregação, k-anonimato, sanitização
npm run test:atlas --prefix frontend   # catálogo, scoring, métricas, importadores, gamificação
```

## 7.1 Relação com o "Blueprint do Atlas Cognitivo-Digital" e fronteira ética

Este módulo adota a **visão de produto e a estética** do blueprint: mapa como
cosmologia navegável, zoom semântico contínuo, biomas (Recife Bioluminescente,
Bazar Cyberpunk, Biblioteca Ciber-Alexandrina, Ágora Clássica), altitude
epistêmica, diversidade de Rao-Stirling, divergência KL como "câmara de eco",
portais por SLERP, arquitetura local-first, privacidade diferencial e
k-anonimato. Boa parte já está implementada; os sigilos, biomas, os três
volumes e a expedição a conteúdo real vieram desta rodada.

**O que foi deliberadamente NÃO implementado.** Os Módulos 3 (Níveis 3–4,
"Terraformador") e 3.2 e 4 do blueprint descrevem agentes que, operando dentro
da sessão autenticada da pessoa, **reprogramam os algoritmos de recomendação de
terceiros** (YouTube, TikTok, Instagram, X) com **evasão ativa de detecção
anti-bot** (Cloudflare, reCAPTCHA v3), **simulação de comportamento humano**
(processos de Poisson, curvas de Bézier, ruído browniano) para não ser
detectado, e **interceptação de tráfego via túnel VPN loopback**. Isso é
automação encoberta contra as defesas das plataformas e burla de termos de uso.
Não foi construído — não é limitação técnica, é uma escolha de projeto.

**A alternativa adotada para o mesmo fim (soberania atencional).** O Atlas dá à
pessoa consciência (o mapa, a qualificação, a câmara de eco) e **ela mesma**
age, de forma transparente e reversível, pelas APIs e intents **oficiais**
(Mastodon, Bluesky, Web Share, favoritos, agenda). Soberania pela percepção e
pela escolha informada, não por um robô agindo escondido no lugar dela. Os
Níveis 0–2 do blueprint (espelho, consultor, fricção na própria interface via
extensão) são compatíveis com essa linha e podem ser retomados no futuro; os
Níveis 3–4, não.

## 8. Limitações conhecidas

- O catálogo é finito (55 lugares) e os atributos são uma curadoria datada. O
  próprio produto diz que "o multiverso é maior que qualquer catálogo", e os
  domínios que não casam aparecem na importação.
- Os pesos da fórmula de saúde são uma escolha normativa explícita e abertos a
  debate. Não são uma verdade empírica.
- O cartograma do Brasil aproxima a geografia; não é um mapa em escala.
- A expedição prova tempo **fora da aba**, não engajamento real. É um
  sinal honesto e leve, e não substitui dados verificados (importação ou conector).
- A população em ordem de grandeza só foi preenchida onde há divulgação
  ampla; o resto aparece como incerto (`?`).
- Dados simulados do mapa do Brasil existem só para demonstração e são
  sempre rotulados.
