# CLAUDE.md

Estúdio de live estilo StreamYard **sem backend**. O PC do host é o estúdio. Os convidados se conectam por
WebRTC P2P (PeerJS) e o host compõe a cena num `<canvas>`. Uma janela de Saída é capturada pelo OBS e vai
para o YouTube. Visão de produto e uso: [README.md](README.md).

## Comandos

```bash
npm start                      # ng serve → http://localhost:4200
npx ng build                   # build de produção (precisa passar sem erros/avisos)
npx ng build --base-href ./    # build para publicar em hospedagem estática
```

Não há testes unitários (o projeto foi criado com `--skip-tests`). Para validar, rode o fluxo de ponta a ponta
(seção **Verificação**).

## Stack e convenções

- **Angular 22** (framework 22.2.x, CLI/build 22.2.x) com **TypeScript 6**. Standalone, **zoneless** (sem
  zone.js), estado em **signals**. Não use `NgModule` nem RxJS para estado.
- Change detection: o padrão do v22 é OnPush. Não adicione `changeDetection: ChangeDetectionStrategy.Eager`;
  o app depende só de signals, inputs e eventos.
- Para atualizar o Angular: `npx ng update @angular/core@<v> @angular/cli@<v>`. Depois, remova o `Eager` que
  as migrações eventualmente adicionarem e rode o teste de ponta a ponta.
- Componentes com **template inline** e **sem `styles` por componente**: todo o CSS fica em
  `src/styles.scss` (tema escuro, variáveis em `:root`). Isso mantém os budgets do Angular folgados.
- Controle de fluxo novo (`@if`, `@for`, `@switch`, `@let`). Inputs com `input()`, outputs com `output()`.
- Formulários: `FormsModule` + `[(ngModel)]` ligado direto em signals.
- **Hash routing** (`withHashLocation`), para funcionar em qualquer host estático sem fallback.
  Rotas: `''`, `studio`, `join/:hostId` (via `withComponentInputBinding`) e `output`.
- Textos de UI e comentários em **português (pt-BR)**.
- Persistência só em `localStorage`, via `core/storage.ts` (`load`/`save`, prefixo `cp2p.`).

## Ícones

Use **Google Material Symbols Rounded**, nunca emoji:

```html
<span class="icon">mic</span>
<span class="icon fill">star</span>   <!-- versão preenchida -->
```

- A fonte é carregada em `src/index.html` com o parâmetro `icon_names=` (subset). **Ao usar um ícone novo,
  adicione o nome nessa lista em ordem alfabética.** Sem isso, ele aparece como texto.
- No canvas (`compositor.service.ts`), os ícones são desenhados com `ICON_FONT` e só depois que
  `document.fonts.load` confirma que a fonte carregou (`iconsReady`).

## Arquitetura

```text
src/app/core/
  models.ts               Source, Branding, Banner, ChatMsg e o protocolo do DataChannel (GuestMsg/HostMsg)
  studio.service.ts       HOST: aceita conexões PeerJS, estado de convidados/live/layout/banners/chat
  compositor.service.ts   desenha o programa 1920x1080 no canvas; canvas.captureStream(30)
  audio-mixer.service.ts  WebAudio: programa (com limitador), mix-minus por convidado e retorno do host
  guest.service.ts        CONVIDADO: câmera/mic, conexão, chat e comandos recebidos do host
  peer.util.ts            openPeer() + STUN/TURN (TURN opcional vem do localStorage)
  media.util.ts           getUserMedia, devices, uid(), readImage()
src/app/pages/
  home/   studio/ (studio, stage-preview, source-card, banners-panel, brand-panel, settings-panel)
  join/   output/
src/app/shared/           chat.ts e src-object.directive.ts ([appSrcObject] liga MediaStream a <video>)
```

### Fluxo de conexão

1. O host registra `cp2p-<id>` no broker público do PeerJS. O ID fica salvo em `cp2p.hostId`, então o link
   é estável entre sessões.
2. O convidado abre um `DataConnection` (`serialization: 'json'`) e envia `hello {name}`.
3. O host cria a `Source` em `backstage` e responde `welcome`, `status` e `chat-history`.
4. Depois do `welcome`, o convidado faz `peer.call()` com a câmera. O host responde (`answer`) com o
   **vídeo do canvas + o áudio mix-minus daquele convidado**, então ele vê o programa e não ouve a própria voz.
5. Comandos host → convidado vão pelo DataChannel (`status`, `mute`, `kick`, `chat`).
   Para mudar o protocolo, altere `GuestMsg`/`HostMsg` em `models.ts` e trate os dois lados.

### Pontos não óbvios (não quebre)

- **Janela de Saída** (`/output`): pega o stream de `window.opener.__studioProgram` (definido no construtor do
  `StudioService`). Ela só funciona quando aberta pelo botão do estúdio (mesma origem).
- **Timer do compositor roda num Web Worker** (blob inline): `requestAnimationFrame`/`setInterval` são
  estrangulados quando a aba fica em segundo plano.
- Os `<video>` das fontes ficam num container **anexado ao DOM e quase invisível** (`opacity: 0.01`), não em
  `display: none`. Sem isso, o Chrome para de decodificar quadros e o WebAudio de streams remotos fica mudo.
- `AudioMixerService.sync()` é chamado por um `effect` sempre que `sources` muda. Os ganhos usam
  `setTargetAtTime` (sem cliques). O mute "no programa" (`muteAudio`/`muteVideo`) é local do host. O mute do
  próprio convidado chega como `camOn`/`micOn`.
- No `GuestService`, `cleanup()` limpa as referências **antes** de fechar, e os handlers conferem
  `this.conn === conn`. O evento `close` do PeerJS pode disparar de forma síncrona.
- Ações destrutivas ao vivo (expulsar, gerar novo ID) exigem **dois cliques** com estado "armado" visível.
  Não use `confirm()`.
- `peerjs` traz `sdp` em CommonJS, liberado em `allowedCommonJsDependencies` no `angular.json`.

## Verificação

Teste ponta a ponta com Chrome headless e dispositivos falsos (`puppeteer-core` + Chrome instalado):

- flags: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --autoplay-policy=no-user-gesture-required`;
- host e convidado em **browser contexts separados** (localStorage isolado);
- roteiro: abrir estúdio → status `on` → convidado entra pelo link → card com vídeo no host → "Adicionar à
  live" → convidado vê "AO VIVO" e recebe o programa → chat nos dois sentidos → layouts → janela de Saída
  com vídeo 1920x1080 e 1 trilha de áudio → expulsar (dois cliques).
- Com Angular zoneless, a UI atualiza de forma assíncrona: nos testes, espere/repita antes de clicar em
  elementos recém-renderizados.

Precisa de internet (broker `0.peerjs.com`). Câmera em outro dispositivo exige HTTPS (ou `localhost`).
